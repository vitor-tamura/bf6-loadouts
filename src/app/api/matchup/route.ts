import { WEAPONS_BY_ID } from '@/data/weapons';
import { SHORT_CATEGORY_NAMES } from '@/data/classes';
import {
  damagePerSecond,
  damagePerShot,
  effectiveRange,
  shotsToKill,
  timeToKill,
} from '@/lib/ballistics';
import { baseStats } from '@/lib/stats';
import { GEMINI_MODELS, generate, geminiKey } from '@/lib/gemini';
import { GAME_MODES, type GameMode } from '@/lib/matchup';
import { chat, modelsFrom, openRouterKey, type OpenRouterError } from '@/lib/openrouter';

/**
 * A leitura do confronto escrita por um modelo de linguagem.
 *
 * A rota existe porque a chave não pode chegar ao navegador. Ela recebe dois
 * ids de arma e o modo, recalcula as estatísticas aqui — o cliente não manda
 * número nenhum, então não há o que forjar — e pede ao modelo duas ou três
 * frases sobre o confronto.
 *
 * Quando isto falha, e vai falhar às vezes, quem responde é a análise por
 * regras de `src/lib/matchup.ts`, que já está na tela desde o primeiro quadro.
 * É por isso que aqui não há tratamento elaborado de erro: um 502 basta, e o
 * cliente segue com o texto que já tinha.
 */

/** Um texto curto não justifica esperar mais do que isto. */
export const maxDuration = 15;

/**
 * A fila paga, pelo OpenRouter.
 *
 * Modelo pequeno de propósito. A tarefa é redigir três frases a partir de
 * números já mastigados — não há raciocínio a fazer, e um modelo grande
 * gastaria crédito em pouca coisa. Com a resposta guardada por um dia na
 * borda, o custo desta rota fica perto de zero de qualquer forma.
 *
 * `OPENROUTER_MATCHUP_MODELS` aceita mais de um nome do catálogo do
 * OpenRouter, separados por vírgula, para o dia em que o primeiro sair do ar.
 */
const MODELS = modelsFrom(process.env.OPENROUTER_MATCHUP_MODELS);

/** Quanto uma ida ao modelo pode durar. Abaixo do `maxDuration`, com folga para responder. */
const REQUEST_TIMEOUT_MS = 12_000;

interface Candidate {
  provider: 'openrouter' | 'google';
  model: string;
}

/**
 * De onde vem o modelo, na ordem em que se tenta.
 *
 * Generativa é coisa de produção: preview e dev renderizam a mesma tela com a
 * análise por regras, sem gastar crédito nenhum em teste.
 *
 * Em produção, o OpenRouter abre a fila e o Gemini gratuito, direto no Google,
 * fecha. A reserva não é fila de modelo, é fila de provedor: existe para o dia
 * em que o crédito do OpenRouter acabar ou a chave sair do ar, e um nome do
 * mesmo catálogo atrás de outro não resolveria nenhuma das duas coisas.
 *
 * Sem nenhuma das duas chaves, a rota falha e a tela fica com a análise por
 * regras — que é o que acontece em qualquer cópia recém-clonada do repositório.
 */
function candidates(): Candidate[] {
  if (process.env.VERCEL_ENV !== 'production') return [];

  return [
    ...(openRouterKey() ? MODELS.map((model) => ({ provider: 'openrouter' as const, model })) : []),
    ...(geminiKey() ? GEMINI_MODELS.map((model) => ({ provider: 'google' as const, model })) : []),
  ];
}

const statusOf = (error: unknown) => (error as OpenRouterError | null)?.status;

/** Nome de modelo errado ou fora da conta — vale tentar o próximo da fila. */
const isModelProblem = (error: unknown) => statusOf(error) === 404 || statusOf(error) === 400;

/** Crédito esgotado num provedor não esgota o outro — a fila continua. */
const isOutOfCredit = (error: unknown) => statusOf(error) === 402;

/*
 * O freio de gasto por visitante.
 *
 * A chave é paga por uso, e um script martelando a rota drenaria o crédito em
 * uma tarde. Cada IP tem direito a dez leituras generativas por dia; daí em
 * diante a resposta é 429 e a tela segue com a análise por regras, que o
 * visitante já estava vendo.
 *
 * O contador vive na memória da instância, sem armazenamento externo: a
 * instância é reaproveitada entre requisições, o que basta para segurar o uso
 * real. Reinício zera a conta — aceitável, porque o objetivo é teto de gasto,
 * não cota exata.
 */
const LEITURAS_POR_DIA = 10;
const UM_DIA_MS = 86_400_000;
const usoPorIp = new Map<string, { usadas: number; zeraEm: number }>();

function estourouLimite(request: Request) {
  const ip =
    request.headers.get('x-real-ip') ??
    (request.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim();

  const agora = Date.now();

  // Tira da mesa quem já pode voltar, para o mapa não crescer para sempre.
  if (usoPorIp.size > 1000) {
    for (const [dono, uso] of usoPorIp) if (agora >= uso.zeraEm) usoPorIp.delete(dono);
  }

  let uso = usoPorIp.get(ip);
  if (!uso || agora >= uso.zeraEm) {
    uso = { usadas: 0, zeraEm: agora + UM_DIA_MS };
    usoPorIp.set(ip, uso);
  }
  if (uso.usadas >= LEITURAS_POR_DIA) return true;
  uso.usadas += 1;
  return false;
}

/** O que o modelo pode escrever, e o que ele não pode inventar. */
const SYSTEM = `Você escreve para um site brasileiro de loadouts de Battlefield 6.

Regras:
- Português do Brasil, tom direto e seco, sem gíria de marketing e sem emoji.
- No máximo três frases curtas, em texto corrido, sem lista e sem título.
- Só use os números que receber. Não invente estatística, acessório, mapa nem
  nome de arma, e não cite tudo: escolha o que decide o confronto.
- Diga qual das duas leva vantagem no modo indicado, e por quê. Se a diferença
  for pequena, diga que é pequena.
- Nunca fale de acessórios: os números são da arma de fábrica.`;

interface Body {
  a?: unknown;
  b?: unknown;
  mode?: unknown;
}

/** As estatísticas de uma arma, no formato que entra no prompt. */
function describe(id: string) {
  const weapon = WEAPONS_BY_ID.get(id);
  if (!weapon) return null;

  const stats = baseStats(weapon);
  const range = effectiveRange(stats);

  return {
    nome: weapon.name,
    categoria: SHORT_CATEGORY_NAMES[weapon.category],
    dano_de_perto: Math.round(damagePerShot(stats, 0)),
    tiros_para_abater: shotsToKill(stats, 0),
    tiros_para_abater_a_50m: shotsToKill(stats, 50),
    tempo_para_abater_ms: Math.round(timeToKill(stats, 0)),
    tempo_de_mira_ms: Math.round(stats.adsMs),
    dano_por_segundo: Math.round(damagePerSecond(stats)),
    cadencia_rpm: stats.rpm,
    alcance_sem_perder_dano_m: range === 0 ? 'toda distância' : Math.round(range),
    carregador: stats.magazine,
    recarga_s: Number(stats.reload.toFixed(2)),
    mobilidade: Math.round(stats.mobility),
    controle: Math.round(stats.control),
    recuo_vertical: stats.verticalRecoil,
    recuo_horizontal: stats.horizontalRecoil,
  };
}

const MODE_BRIEF: Record<GameMode, string> = {
  multiplayer:
    'Multiplayer: partidas por objetivo, respawn rápido, mapas médios. Vale quem mata primeiro, ' +
    'quem se move e quem volta rápido para a briga.',
  redsec:
    'REDSEC, o battle royale: sem respawn, mapa grande, munição contada e combate em esquadra. ' +
    'Valem alcance, o que o pente aguenta e o custo de errar.',
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'corpo inválido' }, { status: 400 });
  }

  const { a, b, mode } = body;
  if (typeof a !== 'string' || typeof b !== 'string') {
    return Response.json({ error: 'armas ausentes' }, { status: 400 });
  }
  if (!GAME_MODES.some((m) => m.value === mode)) {
    return Response.json({ error: 'modo desconhecido' }, { status: 400 });
  }

  const weaponA = describe(a);
  const weaponB = describe(b);
  if (!weaponA || !weaponB) {
    return Response.json({ error: 'arma desconhecida' }, { status: 404 });
  }

  // Só conta a leitura que chegaria ao modelo: pedido inválido não gasta cota.
  if (estourouLimite(request)) {
    return Response.json({ error: 'limite diário de leituras atingido' }, { status: 429 });
  }

  /*
   * Tenta os modelos em ordem e para no primeiro que responder.
   *
   * Só vale insistir quando a recusa é local ao candidato — 404 de modelo que
   * saiu do ar, 400 de nome que a conta não conhece, 402 de crédito que acabou
   * no OpenRouter (que não diz nada sobre a chave gratuita do Google). Chave
   * inválida ou rede fora valem para a fila inteira, e repetir só gastaria o
   * tempo de quem está esperando na tela.
   */
  let lastError: unknown = new Error('nenhum modelo configurado');
  let openRouterOutOfCredit = false;

  const prompt = [
    `Modo: ${MODE_BRIEF[mode as GameMode]}`,
    `Arma A: ${JSON.stringify(weaponA)}`,
    `Arma B: ${JSON.stringify(weaponB)}`,
    'Escreva a leitura do confronto entre as duas neste modo.',
  ].join('\n\n');

  /*
   * Teto alto para três frases, e por um motivo.
   *
   * Modelo que raciocina gasta parte do orçamento de saída pensando antes de
   * escrever, e esses tokens contam aqui: com 220 a resposta chegava cortada
   * no meio da primeira frase. Cada provedor desliga o raciocínio do próprio
   * jeito — `reasoning.effort` no OpenRouter, `thinkingBudget` no Google —,
   * porque ele não tem o que fazer numa tarefa de redigir a partir de números
   * já comparados, e o teto folgado cobre o resto.
   *
   * Dizer o esforço não é opcional: o padrão do `gpt-5.6-luna` é `medium`.
   * Modelo que não raciocina ignora o parâmetro.
   */
  const maxTokens = 800;

  for (const { provider, model } of candidates()) {
    // O crédito é da conta: sem ele, os outros nomes do OpenRouter dariam o mesmo 402.
    if (provider === 'openrouter' && openRouterOutOfCredit) continue;

    try {
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const text =
        provider === 'google'
          ? await generate({ model, system: SYSTEM, prompt, maxTokens, signal })
          : (await chat({ model, system: SYSTEM, prompt, maxTokens, reasoningEffort: 'none', signal })).text;

      const answer = text.trim();
      if (!answer) throw new Error('resposta vazia');

      // Uma linha por resposta: é o que diz, no log, de qual bolso saiu.
      console.log('[matchup] respondeu', { provider, model });

      return Response.json(
        { text: answer },
        // O mesmo motivo do cache acima, agora na borda da Vercel.
        { headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
      );
    } catch (error) {
      lastError = error;
      if (isOutOfCredit(error)) openRouterOutOfCredit = true;
      else if (!isModelProblem(error)) break;
      console.warn('[matchup] modelo recusado, tentando o próximo', { provider, model });
    }
  }

  const status = statusOf(lastError);

  /*
   * O motivo fica no log da função, não na resposta.
   *
   * Quem chama não tem o que fazer com "sem crédito" ou "chave inválida" — a
   * tela cai para a análise por regras de qualquer jeito. Mas sem isto aqui, um
   * 502 na produção não diz se a chave está ausente, se o crédito acabou ou se
   * o nome do modelo mudou de novo.
   */
  console.error('[matchup] falha no modelo', {
    status,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });

  // 402 é crédito esgotado: a tela já tem o que mostrar, então a rota só avisa
  // que não veio nada.
  return Response.json({ error: 'modelo indisponível' }, { status: status === 402 ? 402 : 502 });
}
