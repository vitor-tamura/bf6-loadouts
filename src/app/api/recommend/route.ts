import { WEAPONS_BY_ID } from '@/data/weapons';
import { budgetFor, CATEGORY_NAMES, CLASSES } from '@/data/classes';
import live from '@/data/meta-live.json';
import type { MetaPatch } from '@/data/meta';
import { SEASONS, phaseOn, seasonOn } from '@/data/season';
import type { Weapon } from '@/data/types';
import {
  attachmentMenu,
  buildAdvice,
  COMBAT_RANGES,
  isCombatRange,
  type LoadoutAdvice,
  type RawAdvice,
} from '@/lib/recommend';
import { dedupeCitations, type CitedSource } from '@/lib/sources';

/**
 * O loadout recomendado de uma arma, escolhido por um modelo com busca na web.
 *
 * A rota recebe a arma e o alcance de combate (`curta`, `media` ou `longa`) e
 * pergunta ao modelo o que a comunidade — Reddit e guias recentes — está
 * montando nela para esse alcance. A resposta só cita peças do cardápio que a
 * rota mesma envia, e ainda assim passa pelo funil de `validateRecommendation`:
 * nome que não existe na arma cai fora, peça que estoura o orçamento também. As
 * páginas que a busca abriu voltam junto, em `sources`: a montagem chega à tela
 * com o de onde saiu, não só com o quê.
 *
 * É GET de propósito: as combinações são finitas — 63 armas × 3 alcances — e a
 * resposta não depende de quem perguntou, então a borda guarda cada uma por uma
 * semana. O custo de IA fica limitado a uma busca por combinação por semana,
 * não por visitante.
 */

/*
 * A busca leva o tempo dela, e agora pode haver duas rodadas.
 *
 * Uma resposta com busca e painel inteiro já mediu quase um minuto sozinha; com
 * a rodada de correção, o teto de 60 s estourava no meio e a sugestão se perdia
 * depois de paga. Quem espera é uma combinação por semana — as demais visitas
 * são servidas pela borda.
 */
export const maxDuration = 300;

/**
 * Uma rodada só.
 *
 * A rodada de correção dobrava o tempo de espera para salvar a resposta em que
 * o modelo citou uma peça inexistente. Com a resposta curta — só as peças — o
 * erro ficou raro, e quando acontece o botão já entregou a montagem local no
 * clique. Esperar o dobro para talvez melhorar não vale a espera.
 */
const ROUNDS = 1;

const API_KEY = process.env.OPENAI_API_KEY;

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/*
 * O `gpt-5-nano` saiu da fila.
 *
 * Ele abria as duas rotinas por ser o mais barato do catálogo, mas o guia da
 * ferramenta de busca nunca o citou, e a execução do meta de 11/08 confirmou a
 * suspeita: quem acabou respondendo foi o último da fila, ou seja, o nano e o
 * mini recusaram. Modelo que só sabe recusar não é barato — é uma chamada
 * perdida antes de cada resposta.
 *
 * A fila daqui é mais curta que a do meta de propósito. O meta paga um modelo
 * maior porque é uma pergunta por dia; esta rota é pública, e mesmo com a borda
 * guardando cada combinação por uma semana ela se mantém nos baratos.
 */
const MODELS = (process.env.OPENAI_RECOMMEND_MODELS ?? 'gpt-5-mini,gpt-4.1-mini')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
/*
 * A resposta deixou de ser uma frase.
 *
 * Além da montagem, ela traz uma linha por peça, o porquê da build, o modo de
 * jogar, o alcance, o consenso da comunidade, o que o patch mudou e uma build
 * alternativa inteira. E, nos modelos gpt-5, este teto conta junto o raciocínio
 * — foi ele que engoliu os 2500 do `gpt-5-mini`, que respondia com a mensagem
 * vazia depois de pensar e buscar. Só se paga o que for gerado, e a combinação
 * fica uma semana na borda: apertar aqui é economizar fração de centavo para
 * perder a sugestão inteira.
 */
/*
 * A resposta encolheu, e o teto com ela.
 *
 * Antes o modelo escrevia o painel inteiro — porquê, modo de jogar, consenso,
 * o que o patch mudou e uma build alternativa —, e isso levava perto de um
 * minuto. Agora ele devolve só as peças, que é o que o botão promete. O teto
 * conta o raciocínio junto nos modelos gpt-5, então sobra folga para ele
 * pensar e ainda assim caber no orçamento de vinte segundos.
 */
const MAX_OUTPUT_TOKENS = positiveInt(process.env.OPENAI_RECOMMEND_MAX_OUTPUT_TOKENS, 1200);
const MAX_RETRIES = positiveInt(process.env.OPENAI_RECOMMEND_RETRIES, 3);

/*
 * O relógio da rota.
 *
 * `maxDuration` é o teto da plataforma, não um plano: chegar nele é a função
 * ser cortada no meio de uma chamada já paga, e quem pediu fica com a tela
 * girando até o navegador desistir. Estes dois números são o plano.
 *
 * `REQUEST_TIMEOUT_MS` é quanto uma única ida ao modelo pode durar — sem ele,
 * uma conexão pendurada segura a rota inteira sem nunca responder.
 *
 * `TIME_BUDGET_MS` é o tempo total: a espera do limite de taxa e o próximo
 * modelo da fila só começam se couberem nele. O alvo é dez segundos, e ele é
 * curto de propósito — do outro lado a arma já está montada pelas estatísticas
 * desde o clique, e o que falta é só a leitura da comunidade. Estourar o
 * relógio custa a leitura, não a build.
 */
const REQUEST_TIMEOUT_MS = positiveInt(process.env.OPENAI_RECOMMEND_REQUEST_TIMEOUT_MS, 9_000);
const TIME_BUDGET_MS = positiveInt(process.env.OPENAI_RECOMMEND_TIME_BUDGET_MS, 10_000);

/** O erro de quem ficou sem tempo — reconhecível no log e no fim da fila. */
const timeout = (message: string) => Object.assign(new Error(message), { timedOut: true });

/*
 * O freio de gasto por visitante, idêntico ao do confronto.
 *
 * A borda absorve as repetições — combinação já vista nem chega aqui —, então
 * o contador só conta o que custaria busca nova. Dez por dia por IP dá para
 * montar um arsenal e não dá para drenar o crédito.
 */
const RECOMMENDATIONS_PER_DAY = 10;
const ONE_DAY_MS = 86_400_000;
const usageByIp = new Map<string, { used: number; resetsAt: number }>();

function overDailyLimit(request: Request) {
  const ip =
    request.headers.get('x-real-ip') ??
    (request.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim();

  const now = Date.now();
  if (usageByIp.size > 1000) {
    for (const [owner, usage] of usageByIp) if (now >= usage.resetsAt) usageByIp.delete(owner);
  }

  let usage = usageByIp.get(ip);
  if (!usage || now >= usage.resetsAt) {
    usage = { used: 0, resetsAt: now + ONE_DAY_MS };
    usageByIp.set(ip, usage);
  }
  if (usage.used >= RECOMMENDATIONS_PER_DAY) return true;
  usage.used += 1;
  return false;
}

interface ResponsePart {
  type?: string;
  text?: string;
  /** Os links que a busca abriu, pendurados no texto que ela sustentou. */
  annotations?: { type?: string; url?: string; title?: string }[];
}

interface ResponseBody {
  error?: { message?: string };
  output?: { type?: string; content?: ResponsePart[] }[];
  status?: string;
  incomplete_details?: { reason?: string };
}

type ApiError = Error & { status?: number; retryAfterMs?: number };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Quanto esperar antes de insistir: o que o servidor mandou, ou recuo exponencial. */
function retryDelayMs(response: Response, message: string, attempt: number) {
  const header = response.headers.get('retry-after');
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;

  const match = message.match(/try again in ([0-9.]+)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);

  return Math.min(30_000, 1500 * 2 ** (attempt - 1));
}

/*
 * Nada de modo JSON aqui, e nada de raciocínio.
 *
 * A API recusa os dois junto com a busca na web — "Web Search cannot be used
 * with JSON mode" foi o 400 que derrubou a rota inteira em produção, e o
 * `reasoning: minimal` tem a mesma incompatibilidade nos modelos gpt-5. Como a
 * busca é o ponto desta rota, quem sai é o resto: o JSON vem em texto corrido
 * e `extractJson` o recorta, que é para isso que ele existe.
 */
/*
 * A busca na web é o que custa o tempo.
 *
 * Ela é o ponto do botão — "sugestão da comunidade" quer dizer que alguém foi
 * ler o que a comunidade monta —, e também o passo que sozinho leva mais tempo
 * que o orçamento inteiro de dez segundos. Manter ligada é apostar que a busca
 * cabe; desligar troca a leitura de hoje pelo que o modelo já sabe.
 *
 * A escolha fica em variável de ambiente porque ela é de operação, não de
 * código: dá para medir com ela ligada, ver quantas respostas estouram o
 * relógio, e desligar sem publicar versão nova. Com a busca desligada, o painel
 * avisa — `unsourced` continua sendo verdade quando não há página citada.
 */
const WEB_SEARCH = process.env.OPENAI_RECOMMEND_WEB_SEARCH !== 'off';

function requestBody(model: string, prompt: string) {
  return {
    model,
    ...(WEB_SEARCH ? { tools: [{ type: 'web_search' }] } : {}),
    input: prompt,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  };
}

async function callOpenAI(
  model: string,
  prompt: string,
  attempt: number,
  deadline: number,
): Promise<{ text: string; sources: CitedSource[] }> {
  /*
   * Cada chamada tem o menor entre o teto dela e o que sobrou do total: perto
   * do fim do orçamento não adianta dar noventa segundos a uma busca que só
   * pode usar dez.
   */
  const allowance = Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now());
  if (allowance <= 0) throw timeout('tempo esgotado antes da chamada');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), allowance);

  let response: Response;
  let body: ResponseBody;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody(model, prompt)),
      signal: controller.signal,
    });

    body = (await response.json()) as ResponseBody;
  } catch (error) {
    if (controller.signal.aborted) {
      throw timeout(`sem resposta em ${Math.round(allowance / 1000)} s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok || body.error) {
    const error: ApiError = new Error(
      body.error?.message
        ? `${response.status} ${body.error.message}`
        : `${response.status} ${response.statusText}`,
    );
    error.status = response.status;
    error.retryAfterMs = retryDelayMs(response, error.message, attempt);
    throw error;
  }

  const message = (body.output ?? []).find((item) => item.type === 'message');
  const parts = (message?.content ?? []).filter((part) => part.type === 'output_text');

  /*
   * Resposta cortada não é resposta.
   *
   * Nos modelos gpt-5 o teto de saída conta também os tokens de raciocínio, e o
   * `gpt-5-mini` vinha estourando o teto durante a busca: chegava aqui uma
   * mensagem vazia, que o extrator reportava como "resposta sem JSON" — erro
   * que manda procurar no lugar errado. Agora ele se identifica.
   */
  if (body.status === 'incomplete') {
    throw new Error(`resposta cortada (${body.incomplete_details?.reason ?? 'motivo não informado'})`);
  }

  return {
    text: parts.map((part) => part.text ?? '').join(''),
    sources: dedupeCitations(
      parts
        .flatMap((part) => part.annotations ?? [])
        .filter((annotation) => annotation.type === 'url_citation'),
    ),
  };
}

/**
 * Pergunta ao modelo, insistindo só onde insistir resolve.
 *
 * Limite de taxa é temporário e pede espera. Qualquer outra recusa é do
 * modelo, e quem cuida dela é a fila de `MODELS` — repetir o mesmo pedido ao
 * mesmo modelo daria o mesmo 400.
 */
async function ask(model: string, prompt: string, deadline: number) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await callOpenAI(model, prompt, attempt, deadline);
    } catch (error) {
      lastError = error;
      const apiError = error as ApiError;

      if (apiError.status === 429 && attempt < MAX_RETRIES) {
        const delay = apiError.retryAfterMs ?? 1000;

        // Esperar o limite de taxa só compensa se ainda sobrar tempo para a
        // resposta depois da espera. Senão é gastar o orçamento parado.
        if (Date.now() + delay >= deadline) {
          throw timeout(`limite de taxa e tempo esgotado (${model})`);
        }

        console.warn('[recommend] rate limit, aguardando retry', {
          model,
          seconds: Math.ceil(delay / 1000),
        });
        await wait(delay);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

/** Tira as cercas de código que o modelo às vezes põe em volta do JSON. */
function extractJson(text: string): RawAdvice | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as RawAdvice;
  } catch {
    return null;
  }
}

/** A classe que a arma representa, para o modelo saber de que papel se fala. */
function weaponClass(weapon: Weapon): string {
  const owner = CLASSES.find((item) => item.id === weapon.signatureClass);
  return owner ? `classe ${owner.name}` : 'sem classe assinada';
}

/**
 * Quando é "agora", para quem vai pesquisar.
 *
 * Sem data e sem patch, "melhor build atual" quer dizer o que o índice de busca
 * tiver à mão — foi assim que a leitura do meta saiu apoiada em guias de duas
 * semanas antes. A temporada vem do calendário do site; o patch, da leitura
 * diária do meta, que já pergunta isso todo dia. Quando ela ainda não achou o
 * patch, o modelo é mandado descobrir em vez de fingir que sabe.
 */
function gameState(): string {
  const today = new Date().toISOString().slice(0, 10);
  const season = seasonOn(new Date(`${today}T12:00:00Z`)) ?? SEASONS.at(-1)!;
  const phase = phaseOn(new Date(`${today}T12:00:00Z`), season);
  const patch = ('patch' in live ? live.patch : null) as MetaPatch | null;

  const patchLine =
    patch?.date || patch?.name
      ? `Último patch conhecido: ${patch.name ?? 'atualização sem nome registrado'}${patch.date ? `, de ${patch.date}` : ''} — confirme na busca se veio outro depois dele.`
      : 'O último patch não está registrado aqui: descubra na busca qual é o mais recente e de quando é, antes de julgar qualquer build.';

  return `Hoje é ${today}. O jogo está na Temporada ${season.number} — ${season.name}, fase "${phase.name}" desde ${phase.startsOn}. ${patchLine}`;
}

/** Sete dias na borda, um mês servindo o antigo enquanto revalida. */
const CACHE = 'public, s-maxage=604800, stale-while-revalidate=2592000';

/**
 * A montagem que o modelo entrega tem de ser montável no jogo, inteira.
 *
 * O funil sabe recusar peça que não existe na arma e peça que estoura o
 * orçamento, mas entregar o que sobrou seria pior que não entregar: a lista
 * ficaria com três peças e o texto ao lado continuaria explicando o supressor e
 * o carregador rápido que o funil tirou. Build pela metade com legenda de build
 * inteira não é sugestão, é ruído.
 *
 * Então o erro volta para quem o cometeu, com o nome de cada peça recusada e o
 * motivo. Um modelo que leu a lista errado costuma acertar quando a lista é
 * relida com o erro apontado; o que insiste perde a vez para o próximo da fila.
 */
async function adviceFrom(
  model: string,
  prompt: string,
  weapon: Weapon,
  deadline: number,
): Promise<LoadoutAdvice> {
  let critique = '';

  for (let round = 1; round <= ROUNDS; round += 1) {
    const { text, sources } = await ask(
      model,
      critique ? `${prompt}\n\n${critique}` : prompt,
      deadline,
    );
    const parsed = extractJson(text);
    if (!parsed) {
      const sample = text.replace(/\s+/g, ' ').slice(0, 180);
      throw new Error(`resposta sem JSON${sample ? `: ${sample}` : ''}`);
    }

    const { advice, discarded, alternativeDiscarded } = buildAdvice(weapon, parsed, sources);

    /*
     * A alternativa não custa uma rodada nem derruba a resposta.
     *
     * Foi o que aconteceu com a TR-7: a build principal veio impecável duas
     * vezes seguidas e a resposta foi recusada nas duas porque a alternativa
     * pedia a "Mini Reflex 1.00x", que na TR-7 se chama "Mini Flex 1.00x". Ela
     * é um extra do painel; quando não se sustenta, sai de cena e o visitante
     * fica com o que veio pedir.
     */
    if (alternativeDiscarded.length) {
      console.warn('[recommend] alternativa fora', {
        weapon: weapon.id,
        model,
        discarded: alternativeDiscarded,
      });
    }

    if (!discarded.length) return advice;

    if (round === ROUNDS) {
      throw new Error(`peças recusadas até o fim: ${discarded.join('; ')}`);
    }

    // A rodada de correção é outra busca inteira: começar uma sem tempo para
    // terminá-la é pagar por uma resposta que ninguém vai receber.
    if (Date.now() + REQUEST_TIMEOUT_MS / 2 >= deadline) {
      throw timeout('sem tempo para a rodada de correção');
    }

    console.warn('[recommend] pedindo correção', { weapon: weapon.id, model, discarded });
    critique = `A resposta anterior não pôde ser usada. Estas escolhas foram recusadas:
${discarded.map((item) => `- ${item}`).join('\n')}

Refaça o JSON inteiro. Só valem peças copiadas exatamente da lista de slots acima, e a soma dos custos das peças escolhidas — na build principal e na alternativa, cada uma por si — não pode passar de ${budgetFor(weapon.category)} pontos. Some antes de responder; se passar do teto, tire a peça menos importante em vez de trocar o teto. Os textos têm de descrever as peças que ficaram.`;
  }

  throw new Error('sem resposta utilizável');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const weaponId = url.searchParams.get('weapon');
  const range = url.searchParams.get('range');

  if (!weaponId || !isCombatRange(range)) {
    return Response.json({ error: 'parâmetros inválidos' }, { status: 400 });
  }
  const weapon = WEAPONS_BY_ID.get(weaponId);
  if (!weapon || !weapon.slots.length) {
    return Response.json({ error: 'arma desconhecida' }, { status: 404 });
  }

  // A mesma regra do confronto: IA generativa é coisa de produção.
  if (!API_KEY || process.env.VERCEL_ENV !== 'production') {
    return Response.json({ error: 'modelo indisponível' }, { status: 502 });
  }

  if (overDailyLimit(request)) {
    return Response.json({ error: 'limite diário de recomendações atingido' }, { status: 429 });
  }

  const profile = COMBAT_RANGES.find((item) => item.value === range)!;
  const prompt = `Você é especialista em Battlefield 6 MULTIPLAYER. Monte o loadout que a comunidade recomenda hoje para a ${weapon.name} — ${weaponClass(weapon)}, ${CATEGORY_NAMES[weapon.category]} —, para combate a ${profile.label.toLowerCase()} distância: ${profile.hint}

${gameState()}

## 1. Pesquise rápido

Uma busca só, curta: "${weapon.name} best attachments" ou "${weapon.name} loadout". Prefira Reddit recente (r/Battlefield6, r/Battlefield) e patch notes da EA. Priorize os últimos 30 dias. Não abra dezenas de páginas — duas ou três bastam para saber o que a comunidade monta.

## 2. Escolha os acessórios

Use SOMENTE os desta lista. Cada linha é um slot, no formato "id do slot (nome): peças com o custo em pontos":

${attachmentMenu(weapon)}

Prioridade: corrigir a fraqueza crítica da arma; melhorar o desempenho na distância pedida; controle e consistência. Não preencha um slot só porque ele existe — peça sem benefício claro fica de fora.

Uma peça por slot. O orçamento é de ${budgetFor(weapon.category)} pontos, com os custos que estão na lista. Some antes de responder: se passou do teto, tire a peça menos importante. Nome diferente do da lista, ou soma acima do teto, faz a resposta ser recusada.

Só multiplayer: montagem que só faz sentido no REDSEC fica de fora.

## 3. Não invente

Nada de acessório fora da lista. Sem evidência clara, escolha o que a lista oferece de mais sólido para a distância pedida.

## 4. Resposta

Responda SOMENTE com este JSON, sem cercas de código e sem texto antes ou depois:

{"picks":{"id do slot":"NOME EXATO DA PEÇA"}}

Regras:
- Só peças copiadas exatamente da lista acima, uma por slot.
- Use o id do slot exatamente como aparece antes do parêntese.
- Nada além de "picks": nem explicação, nem alternativa, nem comentário. Quem
  clicou quer a arma montada, e cada frase a mais é um segundo a mais de espera.`;

  let lastError: unknown = null;
  const deadline = Date.now() + TIME_BUDGET_MS;

  for (const model of MODELS) {
    // O próximo da fila é outra busca do zero. Sem tempo para ela, a fila
    // acaba aqui: melhor devolver agora do que ser cortado no meio.
    if (Date.now() + REQUEST_TIMEOUT_MS / 2 >= deadline) {
      console.warn('[recommend] fila interrompida por tempo', { weaponId, range, model });
      break;
    }

    try {
      const advice = await adviceFrom(model, prompt, weapon, deadline);
      console.log('[recommend] respondeu', { weaponId, range, model, unsourced: advice.unsourced });

      /*
       * Os links vão junto da montagem.
       *
       * A tela do meta sempre disse de onde a leitura saiu; esta rota lia as
       * mesmas anotações da busca e as jogava fora, então a sugestão chegava
       * como palavra de honra — e, depois do fato, não havia como saber em que
       * página ela se apoiou. Agora o painel mostra as páginas abertas, e quem
       * quiser conferir a montagem tem por onde começar.
       */
      // Cada combinação paga uma busca por semana, não por visitante.
      return Response.json(advice, { headers: { 'cache-control': CACHE } });
    } catch (error) {
      lastError = error;
      console.warn('[recommend] modelo recusado, tentando o próximo', {
        model,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.error('[recommend] falha no modelo', {
    weaponId,
    range,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return Response.json({ error: 'modelo indisponível' }, { status: 502 });
}
