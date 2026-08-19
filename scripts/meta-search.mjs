#!/usr/bin/env node
/**
 * Relê o meta a partir de uma busca, uma vez por dia.
 *
 *   OPENAI_API_KEY=... node --experimental-strip-types scripts/meta-search.mjs
 *
 * Pergunta a um modelo da OpenAI, com a busca na web ligada, o que a comunidade
 * está dizendo agora sobre as armas do multiplayer — dando peso ao Reddit, que
 * é onde a discussão acontece e onde as ferramentas de busca comuns não chegam
 * para robôs. O resultado vai para `src/data/meta-live.json`, que a tela lê.
 *
 * ## Por que OpenAI e não Gemini
 *
 * A versão anterior perguntava ao Gemini com a busca do Google ligada, numa
 * chave do free tier. Nunca publicou uma leitura: todas as execuções do
 * workflow falharam na chamada. Esta versão usa uma chave paga da OpenAI, e o
 * custo é de centavos: uma chamada por dia, com uma busca (~US$ 0,01) e um
 * punhado de tokens.
 *
 * ## O que impede bobagem de entrar
 *
 * Ninguém revisa antes de publicar. A primeira leitura que saiu daqui mostrou
 * que conferir o nome da arma não basta: as oito armas existiam, e mesmo assim
 * o trending era o meta repetido, com rótulos que só diziam "está subindo" e
 * motivos copiados entre armas. As travas de hoje estão em `meta/leitura.mjs`,
 * separadas justamente para poderem ser testadas, e o prompt daqui é a outra
 * metade: ele diz que dia é hoje, manda descobrir o patch em vigor antes de
 * classificar qualquer coisa e cobra o fato concreto por trás de cada arma.
 *
 * Resposta que não passa nas travas não vira arquivo — vai para o próximo
 * modelo da fila, e se nenhum passar o dia fica com a leitura anterior.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { HIGHLIGHTS, SOURCES, TRENDING } from '../src/data/meta.ts';
import { SEASONS, phaseOn, seasonOn } from '../src/data/season.ts';
import { WEAPONS } from '../src/data/weapons.ts';
import { extrairJson, montarLeitura } from './meta/leitura.mjs';

const API_KEY = process.env.OPENAI_API_KEY;
const DESTINO = new URL('../src/data/meta-live.json', import.meta.url);

function numeroConfig(valor, padrao) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : padrao;
}

/*
 * Folga de sobra no tamanho da resposta: dezesseis armas com motivo, mais cinco
 * fontes com data e escopo, passam de mil tokens, e resposta cortada no meio é
 * JSON inválido — a leitura do dia se perde por economia de fração de centavo.
 */
/*
 * O teto cobre raciocínio, chamadas de busca **e** o texto final.
 *
 * Com 2500 o gpt-5-mini gastava tudo antes de escrever a mensagem e devolvia
 * uma resposta vazia; com 8000 ainda cortava. Buscar em várias páginas e depois
 * resumir 8 armas não cabe num orçamento apertado.
 *
 * É teto, não reserva: quem responde em 3 mil tokens paga 3 mil. O número alto
 * não encarece a rodada boa — evita a rodada perdida, que custa a chamada
 * inteira e não entrega nada.
 */
const MAX_OUTPUT_TOKENS = numeroConfig(process.env.OPENAI_META_MAX_OUTPUT_TOKENS, 12_000);
const MAX_TENTATIVAS = numeroConfig(process.env.OPENAI_META_RETRIES, 3);
const FALHAR_SEM_ATUALIZAR = process.env.OPENAI_META_STRICT === '1';

/*
 * A chave é paga por uso, então a fila não existe por causa de cota — ela
 * existe porque nem todo modelo aceita a ferramenta de busca, e porque modelo
 * pequeno demais para uma leitura como esta responde clichê.
 *
 * A execução de 11/08 mostrou os dois problemas de uma vez: quem gravou foi o
 * último da fila, o `gpt-4.1-mini` — ou seja, os dois primeiros recusaram —, e
 * o que ele gravou foi o trending genérico que motivou as travas. O `gpt-5-nano`
 * saiu da fila por nunca ter respondido, e o `gpt-4.1` entrou antes do mini:
 * uma chamada por dia com um modelo maior continua custando centavos, e é ele
 * quem tem de sustentar oito armas com evidência datada.
 */
const MODELOS = (process.env.OPENAI_META_MODELS ?? 'gpt-5-mini,gpt-4.1,gpt-4.1-mini')
  .split(',')
  .map((modelo) => modelo.trim())
  .filter(Boolean);

const HOJE = new Date().toISOString().slice(0, 10);

/*
 * A temporada em curso, tirada do calendário do próprio site. É o que dá ao
 * modelo o "quando" da pergunta: sem isso, "temporada atual" é o que o índice
 * de busca tiver à mão, e a leitura sai apoiada em guia de antes do patch.
 */
const TEMPORADA = seasonOn(new Date(`${HOJE}T12:00:00Z`)) ?? SEASONS.at(-1);
const FASE = phaseOn(new Date(`${HOJE}T12:00:00Z`), TEMPORADA);
const TIMEFRAME = `season-${TEMPORADA.number}`;

const ARMAS_PERMITIDAS = WEAPONS.map((w) => w.name).join(', ');

const PROMPT = `Hoje é ${HOJE}. Monte a leitura de hoje do meta de armas do Battlefield 6, considerando SOMENTE o multiplayer tradicional. REDSEC, battle royale e modos derivados ficam de fora, inclusive quando a fonte só fala deles.

O jogo está na Temporada ${TEMPORADA.number} — ${TEMPORADA.name}, começada em ${TEMPORADA.startsOn}, fase "${FASE.name}" desde ${FASE.startsOn}.

## 1. Antes de classificar qualquer arma

Descubra na busca:
- qual é a atualização mais recente do jogo e em que dia ela saiu;
- que armas ela mexeu — dano, TTK, recuo, cadência, alcance, munição, acessórios;
- se ela mudou o equilíbrio ou não encostou em arma.

Essa data manda no resto da leitura. Guia ou tier list publicado antes dela só vale se alguma coisa posterior o confirmar.

## 2. Janela de tempo

- Últimas 24 h: mudança quente, prioridade máxima.
- Últimos 7 dias: é o que sustenta trending.
- Últimos 30 dias: contexto.

Informação mais recente pesa mais. Não repita tier list antiga.

## 3. Onde procurar

As duas listas não se abastecem no mesmo lugar.

**Para picks**, procure quem mostra o que está sendo usado depois do patch: ranking, tier list ou guia que use a palavra "meta" e diga de que modo está falando. Termos que costumam achar: "meta", "best weapons", "tier list", "weapon ranking", "most used", "pick rate", com o número da temporada junto. Tracker ou comparador vale mais que opinião, e dentro dele pick rate e uso pesam mais que K/D, KPM ou TTK — é popularidade que decide esta lista.

**Para trending**, procure onde a conversa acontece:
- fórum oficial da EA — forums.ea.com e answers.ea.com, seções de Battlefield 6, tanto discussão geral quanto relato de bug;
- Reddit recente — r/Battlefield6, r/Battlefield, r/BF6 —, por "broken", "nerf", "buff", "why is everyone using", "new build";
- comentários e relatos de quem joga, sobre acessório, montagem ou comportamento que mudou.

Patch notes oficiais da EA/DICE ancoram as duas: é de lá que sai o que a atualização mexeu.

Nenhum site sozinho decide. O mesmo site em idiomas diferentes (/pt, /es) conta como uma fonte só. Fórum e Reddit mostram percepção, não medição: quando eles disserem que uma arma é absurda e os números não confirmarem, diga isso no motivo em vez de tratar como fato.

## 3.1. O modo está no endereço, não no texto

Este é o erro que mais estraga esta leitura, e ele **não parece** erro: uma lista de armas que existem, bem escrita, publicada ontem — descrevendo o battle royale.

Os rastreadores que ranqueiam os dois modos separam por caminho, e só o caminho declara o modo:

- \`wzstats.gg/battlefield-6/multiplayer/...\` → **serve**;
- \`wzstats.gg/battlefield-6/meta\` e \`wzstats.gg/battlefield-6/ranked/meta\` → REDSEC, **não serve** (o Ranqueado do BF6 é battle royale);
- endereço com \`redsec\` ou \`battle-royale\` em qualquer parte → não serve;
- raiz de site de meta, sem \`multiplayer\` no caminho → assuma battle royale.

O teste de sanidade é a KTS100 MK8: ela é a primeira colocada **geral** do REDSEC e não chega ao pódio das metralhadoras do multiplayer. Se ela aparecer no topo da sua lista, você está lendo o modo errado — recomece.

Guia editorial que não diz de que modo fala está no mesmo caso: por padrão essas matérias descrevem o battle royale, porque é dele que vêm os vídeos. Sem uma frase que prove o modo, a fonte não entra.

Fonte publicada antes de ${TEMPORADA.startsOn} — o começo da temporada — não sustenta posição nenhuma. Ela pode aparecer como contexto no motivo, nunca como a evidência que põe a arma na lista. E o campo "patch" precisa ser uma atualização desta temporada: apontar um patch anterior a ${TEMPORADA.startsOn} anula a leitura inteira, porque a tela passa a anunciar hoje o jogo de dois meses atrás.

## 4. Meta é nível, trending é variação

META: o quanto a arma está sendo **escolhida e recomendada agora** — posição no ranking de multiplayer, pick rate e uso quando houver, quantas fontes independentes repetem o nome, presença no jogo de nível alto. Desempenho (TTK, dano, controle, alcance) explica a posição dentro do motivo, mas não é o que põe a arma aqui: arma que os números favorecem e ninguém escolhe fica de fora, e o que o último patch fez com ela é contexto, não credencial.

TRENDING: o que **mudou** nela por um motivo datável — buff ou nerf no último patch, acessório que o estúdio mexeu, build nova, arma recém-chegada já sendo adotada, gente migrando de outra arma. Ser nova não é tendência; é preciso sinal de adoção. Aqui a arma não precisa estar entre as mais usadas: precisa estar mudando de patamar.

A lista de trending não pode ser a de meta em outra ordem. Prefira armas que não estão em picks. Uma arma pode aparecer nas duas listas, no máximo duas ao todo, e só quando o motivo dela ter subido nesta semana estiver dito.

## 5. Como escrever cada arma

- "reason": uma frase em português do Brasil com o fato concreto — o que o patch fez, que build apareceu, o que a comunidade passou a dizer, que número mudou. Nada de "está em alta", "muito comentada" ou "eficaz em diversas situações". Duas armas nunca com a mesma frase.
- "trend": rótulo curto do que mudou naquela arma — "buff de recuo", "build full-auto", "chegou no patch", "migração da X". Não use "popularidade crescente", "aumento de uso", "tendência crescente" nem qualquer sinônimo de "está subindo": isso vale para a seção inteira e não informa nada.
- "source": a URL, entre as que você listar em "sources", que sustenta aquela arma.

## 6. Limites

- No máximo 8 armas em picks, da mais forte para a menos forte.
- Pelo menos 4 e no máximo 8 armas em trending, da mais quente para a menos quente. Abaixo de 4 a leitura do dia inteira é descartada e a tela fica com a de ontem — o que é melhor do que completar a lista com arma sem evidência.
- No máximo 5 fontes.
- Use exatamente estes nomes de arma, sem apelido e sem acessório junto: ${ARMAS_PERMITIDAS}.
- Não invente pick rate, TTK, tendência nem fala de comunidade. Sem evidência, a arma fica de fora: quatro armas sustentadas valem mais que oito preenchidas.

## 7. Resposta

Responda SOMENTE com este JSON, sem cercas de código e sem texto antes ou depois:

{"patch":{"name":"nome ou número da atualização","date":"YYYY-MM-DD"},"picks":[{"weapon":"NOME EXATO DA ARMA","reason":"por que ela está forte agora","source":"https://..."}],"trending":[{"weapon":"NOME EXATO DA ARMA","trend":"o que mudou nela","reason":"que evidência recente mostra o crescimento","source":"https://..."}],"sources":[{"name":"nome curto da fonte","url":"https://...","date":"YYYY-MM-DD","scope":"por que essa fonte vale para o multiplayer"}]}`;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDepoisMs(resposta, mensagem, tentativa) {
  const header = resposta.headers.get('retry-after');
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;

  const match = mensagem.match(/try again in ([0-9.]+)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);

  return Math.min(30_000, 1500 * 2 ** (tentativa - 1));
}

/*
 * Nada de modo JSON aqui.
 *
 * A API recusa o modo JSON junto com a busca — "Web Search cannot be used with
 * JSON mode" é o 400 que vinha derrubando esta rotina. Como a busca é o ponto
 * do script, quem sai é o modo JSON: o objeto vem em texto corrido e
 * `extrairJson` o recorta, que é para isso que ele existe.
 *
 * Raciocínio, esse convive com a busca — o comentário anterior dizia o
 * contrário e estava velho. Ele volta no ajuste mais baixo, e por economia:
 * `max_output_tokens` cobre raciocínio, busca e texto no mesmo bolo, e era o
 * raciocínio solto que consumia o orçamento do gpt-5-mini antes de sobrar
 * linha para a resposta.
 */

/**
 * A ferramenta de busca tem dois nomes, e o certo depende da geração.
 *
 * `web_search` é o atual; os modelos gpt-4.1 conhecem a versão anterior,
 * `web_search_preview`, e diante do nome novo não chamavam ferramenta nenhuma
 * — respondiam de memória, que é como os dois caíam na trava do outro lado
 * mesmo com a busca marcada como obrigatória.
 */
const ferramentaDeBusca = (modelo) =>
  modelo.startsWith('gpt-5') || modelo.startsWith('o')
    ? { type: 'web_search' }
    : { type: 'web_search_preview' };

const raciocinio = (modelo) =>
  modelo.startsWith('gpt-5') ? { reasoning: { effort: 'low' } } : {};

function payload(modelo) {
  return {
    model: modelo,
    tools: [ferramentaDeBusca(modelo)],
    ...raciocinio(modelo),
    /*
     * A busca é obrigatória, não uma opção.
     *
     * Com o padrão `auto`, o modelo decide se pesquisa — e decidia que não:
     * respondia de memória, com a mesma cara segura. Uma leitura do meta sem
     * página aberta não é leitura do meta.
     *
     * `'required'` e não `{ type: 'web_search' }`: a forma nomeada precisa
     * bater com o nome da ferramenta na lista, e como esse nome muda conforme
     * o modelo, ela erraria em metade da fila.
     */
    tool_choice: 'required',
    input: PROMPT,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  };
}

async function chamarOpenAI(modelo, opcoes) {
  const resposta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload(modelo)),
  });

  const corpo = await resposta.json();
  if (!resposta.ok || corpo.error) {
    const erro = new Error(corpo.error?.message ? `${resposta.status} ${corpo.error.message}` : `${resposta.status} ${resposta.statusText}`);
    erro.status = resposta.status;
    erro.retryAfterMs = retryDepoisMs(resposta, erro.message, opcoes.tentativa);
    throw erro;
  }

  // A resposta vem como uma lista de itens — raciocínio, chamadas de busca,
  // mensagem. O texto está na mensagem, e os links que a busca abriu vêm como
  // anotações `url_citation` penduradas nele.
  // Resposta cortada tem diagnóstico próprio: o texto vem vazio ou pela metade,
  // e sem esta checagem o erro que sobe é "resposta sem JSON" — que manda
  // procurar defeito no prompt quando o que faltou foi orçamento.
  if (corpo.status === 'incomplete') {
    throw new Error(
      `resposta cortada (${corpo.incomplete_details?.reason ?? 'motivo não informado'}) — ` +
        `o teto é ${MAX_OUTPUT_TOKENS} tokens`,
    );
  }

  const itens = corpo.output ?? [];
  const mensagem = itens.find((item) => item.type === 'message');
  const partes = (mensagem?.content ?? []).filter((p) => p.type === 'output_text');
  const texto = partes.map((p) => p.text ?? '').join('');
  const anotacoes = partes
    .flatMap((p) => p.annotations ?? [])
    .filter((a) => a.type === 'url_citation');

  // A prova de que a busca rodou é o item `web_search_call` na resposta, e não
  // a citação no texto. Os tipos vão junto: quando algo falha, é por eles que
  // se vê o que o modelo fez em vez de adivinhar pelo texto que não veio.
  const buscou = itens.some((item) => item.type === 'web_search_call');
  return { texto, anotacoes, buscou, tipos: [...new Set(itens.map((i) => i.type))] };
}

/**
 * Pergunta ao modelo, insistindo só onde insistir resolve.
 *
 * Limite de taxa é temporário e pede espera. Qualquer outra recusa é do
 * modelo, e quem cuida dela é a fila de `MODELOS` — repetir o mesmo pedido ao
 * mesmo modelo daria o mesmo 400.
 */
async function perguntar(modelo) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
    try {
      return await chamarOpenAI(modelo, { tentativa });
    } catch (erro) {
      ultimoErro = erro;

      if (erro.status === 429 && tentativa < MAX_TENTATIVAS) {
        console.warn(
          `${modelo}: rate limit, aguardando ${Math.ceil(erro.retryAfterMs / 1000)}s antes de tentar de novo.`,
        );
        await esperar(erro.retryAfterMs);
        continue;
      }
      throw erro;
    }
  }

  throw ultimoErro;
}

function temMetaLiveValida() {
  try {
    const atual = JSON.parse(readFileSync(DESTINO, 'utf8'));
    return Boolean(atual?.picks?.length || atual?.trending?.length || SOURCES.length);
  } catch {
    return SOURCES.length > 0;
  }
}

async function main() {
  // O prompt muda sozinho todo dia — data, temporada, fase, arsenal. Ver o que
  // vai ser perguntado hoje não deveria custar uma chamada paga.
  if (process.argv.includes('--prompt')) {
    console.log(PROMPT);
    return;
  }

  if (!API_KEY) {
    console.error('Falta OPENAI_API_KEY.');
    process.exit(1);
  }

  let ultimoErro = null;

  for (const modelo of MODELOS) {
    try {
      console.log(`Perguntando ao ${modelo}…`);
      const { texto, anotacoes, buscou, tipos } = await perguntar(modelo);
      console.log(`  ${modelo}: ${tipos.join(', ') || 'resposta vazia'}${buscou ? '' : ' — sem busca'}`);

      const bruto = extrairJson(texto);
      if (!bruto) {
        const amostra = texto.replace(/\s+/g, ' ').slice(0, 220);
        throw new Error(`resposta sem JSON${amostra ? `: ${amostra}` : ''}`);
      }

      const { conteudo, descartes } = montarLeitura({
        bruto,
        anotacoes,
        buscou,
        modelo,
        hoje: HOJE,
        timeframe: TIMEFRAME,
      });

      for (const { nome, motivo } of descartes) console.warn(`Descartada — ${nome}: ${motivo}`);

      const anterior = (() => {
        try {
          return readFileSync(DESTINO, 'utf8');
        } catch {
          return null;
        }
      })();

      const novo = `${JSON.stringify(conteudo, null, 2)}\n`;
      if (anterior === novo) {
        console.log('Nada mudou.');
        return;
      }

      writeFileSync(DESTINO, novo);
      const patch = conteudo.patch ? `${conteudo.patch.name ?? 'patch'} de ${conteudo.patch.date ?? 'data desconhecida'}` : 'patch não identificado';
      console.log(
        `Gravado: ${conteudo.picks.length} armas, ${conteudo.trending.length} trending, ${conteudo.sources.length} fontes (${patch}).`,
      );
      return;
    } catch (erro) {
      ultimoErro = erro;
      console.warn(`${modelo}: ${erro.message}`);
    }
  }

  console.error(`Nenhum modelo respondeu. Último erro: ${ultimoErro?.message}`);

  if (!FALHAR_SEM_ATUALIZAR && temMetaLiveValida()) {
    console.warn(
      `Mantendo a meta atual/fallback estático: ${HIGHLIGHTS.length} armas meta, ${TRENDING.length} trending, ${SOURCES.length} fontes.`,
    );
    return;
  }

  process.exit(1);
}

await main();
