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
import {
  LIMITES,
  confiabilidade,
  dominiosQueSustentamPicks,
  extrairJson,
  montarLeitura,
} from './meta/leitura.mjs';
import { briefingDoPatch, patchAtual } from './meta/patch-atual.mjs';

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
 * Um modelo só, e é o `gpt-5.6-luna`.
 *
 * A fila existia porque nem todo modelo aceita a ferramenta de busca, e porque
 * modelo pequeno demais para uma leitura como esta responde clichê. A execução
 * de 11/08 mostrou os dois problemas de uma vez: quem gravou foi o último da
 * fila, o `gpt-4.1-mini`, e o que ele gravou foi o trending genérico que
 * motivou as travas de `meta/leitura.mjs`.
 *
 * O `luna` é o degrau nano da geração atual, e é onde a conta fecha: US$ 0,20
 * por milhão de entrada e US$ 1,25 de saída — mesma entrada do `gpt-5.4-nano`
 * com saída mais barata, e a diferença para o `gpt-5-nano`, quatro vezes menor,
 * é fração de centavo numa chamada por dia. Não vale: o `gpt-5-nano` saiu desta
 * fila justamente por nunca ter respondido, e chamada recusada custa o dia
 * inteiro de leitura, não tokens.
 *
 * A fila continua sendo uma lista para `OPENAI_META_MODELS` poder trocar o
 * modelo sem publicar versão — o que ela não tem mais é reserva por padrão.
 */
const MODELOS = (process.env.OPENAI_META_MODELS ?? 'gpt-5.6-luna')
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

/*
 * Os domínios que podem pôr uma arma no topo, ditos por quem decide.
 *
 * Estavam escritos duas vezes — uma no prompt, outra no classificador de
 * `meta/leitura.mjs` — e as duas listas já tinham divergido: o prompt nomeava
 * cinco sites de análise e o código aceita oito. Três fontes boas eram
 * recusadas antes de existir, porque o modelo não sabia que podia abri-las.
 */
const DOMINIOS_DE_PICKS = dominiosQueSustentamPicks()
  .map((dominio) => `\`${dominio}\``)
  .join(', ');

/*
 * As páginas que medem, com endereço, tiradas da curadoria do próprio site.
 *
 * A rodada de 04/09 é o motivo: o modelo fez quatro buscas, voltou com oito
 * armas sustentadas em fórum e Reddit e perdeu as oito na trava — nunca chegou
 * a abrir uma página que mede. Procurar por elas é gasto e é sorte; o endereço
 * está em `src/data/meta.ts` desde sempre.
 *
 * Sai de `SOURCES` filtrado pelo mesmo classificador que julga a resposta, e
 * não de uma lista à parte: assim, o dia em que alguém curar uma fonte de
 * análise nova, ela entra aqui sozinha — e o dia em que uma sair, ela some
 * daqui junto.
 */
const PAGINAS_QUE_MEDEM = SOURCES.filter((fonte) => confiabilidade(fonte.url) === 'analise')
  .map((fonte) => `- ${fonte.url}\n  ${fonte.scope}`)
  .join('\n');

/*
 * A atualização em vigor vem do catálogo, e não da busca.
 *
 * Antes, a primeira coisa que o prompt mandava fazer era descobrir na busca
 * qual é o patch mais recente — uma pergunta cuja resposta está em disco, num
 * arquivo que o pipeline do catálogo escreve a cada versão nova. Sair
 * perguntando custava chamadas de busca e o contexto das páginas abertas, e
 * ainda errava: índice de busca alcança patch novo devagar, e a leitura de
 * 02/09 saiu apontando a 1.4.1.5, de 04/08, com a 1.4.2.5 no ar desde 31/08.
 *
 * Com o fato dado, a busca inteira desta rodada vai para o que só a comunidade
 * sabe: que armas estão fortes e do que se fala.
 */
const PATCH = patchAtual();

/*
 * Sem catálogo em disco, a pergunta antiga volta — é pior e mais cara, mas o
 * silêncio seria a tela anunciar um jogo sem dizer de que versão fala.
 */
const SECAO_DO_PATCH =
  briefingDoPatch(PATCH) ||
  `## 1. Antes de classificar qualquer arma

Descubra na busca:
- qual é a atualização mais recente do jogo e em que dia ela saiu;
- que armas ela mexeu — dano, TTK, recuo, cadência, alcance, munição, acessórios;
- se ela mudou o equilíbrio ou não encostou em arma.

Essa data manda no resto da leitura. Guia ou tier list publicado antes dela só vale se alguma coisa posterior o confirmar.`;

const PROMPT = `Hoje é ${HOJE}. Monte a leitura de hoje do meta de armas do Battlefield 6, considerando SOMENTE o multiplayer tradicional. REDSEC, battle royale e modos derivados ficam de fora, inclusive quando a fonte só fala deles.

O jogo está na Temporada ${TEMPORADA.number} — ${TEMPORADA.name}, começada em ${TEMPORADA.startsOn}, fase "${FASE.name}" desde ${FASE.startsOn}.

${SECAO_DO_PATCH}

## 2. Janela de tempo

- Últimas 24 h: mudança quente, prioridade máxima.
- Últimos 7 dias: é o que sustenta trending.
- Últimos 30 dias: contexto.

Informação mais recente pesa mais. Não repita tier list antiga.

## 3. Onde procurar

As duas listas não se abastecem no mesmo lugar, e a ordem importa: **os picks primeiro**, porque são eles que dependem de uma página específica. Tendência se acha em qualquer lugar, e por isso pode esperar.

### 3.0. Abra estas páginas antes de qualquer busca

São as que medem arma por arma no multiplayer, e o endereço delas já está apurado. Não procure por elas — abra:

${PAGINAS_QUE_MEDEM}

Isto não é sugestão. A rodada de 04/09 gastou quatro buscas e voltou com oito armas sustentadas em fórum e Reddit: as oito foram descartadas pelo código e o dia ficou sem leitura nenhuma. Fórum e Reddit provam que se **fala** da arma — nunca que ela é forte, e força é o que o topo afirma.

**Não tente abrir \`ea.com\`.** As páginas de Battlefield no site da EA ficam atrás de um portão de verificação de idade, e o que volta de lá é o formulário de data de nascimento, não o patch note — gastar busca ali é gastar duas vezes, porque depois falta a que resolveria. As palavras oficiais você já tem: estão na seção 1, transcritas da página. Cite o endereço da EA quando a evidência for o changelog, e leia o changelog na seção 1 ou no \`bf6balancelog.com\`, que existe justamente para publicar cada linha da EA sem esse portão.

Se, depois de abertas, essas páginas sustentarem menos de oito armas, entregue as que elas sustentarem. Quatro armas com número valem mais que oito com conversa, e a lista curta o código aceita. A lista inteira apoiada em thread, não.

**Para picks**, procure quem testa e argumenta desempenho depois do patch: análise de balanceamento, tier list ou ranking de meta que explique **por que** a arma é forte, tabela de TTK, dano, recuo ou alcance, discussão técnica em fórum e comunidade especializada. Termos que costumam achar: "meta", "best weapons", "tier list", "weapon ranking", "TTK chart", "after patch", com o número da temporada junto. Posição em ranking de meta vale como julgamento de força da fonte. Uso alto sozinho não põe arma em picks — isso é trending.

**Para trending**, procure volume de conversa e de uso — de que a comunidade está falando e o que ela está levando para a partida:
- fórum oficial da EA — forums.ea.com e answers.ea.com, seções de Battlefield 6, tanto discussão geral quanto relato de bug;
- Reddit recente — r/Battlefield6, r/Battlefield, r/BF6 —, por "everyone is using", "why is everyone using", "most used", "broken", "new build", "meta right now";
- comentários e relatos de quem joga sobre o que anda aparecendo em toda partida;
- tracker ou comparador que publique uso, quando houver — é a única coisa parecida com medição que existe aqui.

O que a atualização mexeu você já tem na seção 1 e não precisa procurar. Se ainda assim faltar o histórico de uma arma específica — que patches mexeram nela e o que cada um fez —, \`bf6balancelog.com\` transcreve o changelog oficial arma por arma e tem página por arma e por peça. É uma consulta dirigida, não uma varredura: só vale a pena quando uma arma que você já escolheu precisa da frase exata do patch.

**Quem pode sustentar cada lista.** Isto é verificado no código, e arma que não passar é descartada antes de a leitura ser gravada:

- **picks** só aceitam estes domínios: ${DOMINIOS_DE_PICKS} — mais análise equivalente que publique número. Em \`wzstats.gg\`, só caminho de multiplayer;
- **trending** aceita qualquer uma dessas mais fórum, Reddit, Steam, vídeo e comentário — é onde a conversa está, e conversa é o que essa lista mede.

Fórum e Reddit **não** põem arma em picks, por mais convincente que seja a thread: eles provam que se fala da arma, não que ela é forte. Se a única evidência que você achou para uma arma forte é conversa, ponha a arma em trending e diga isso no motivo. Material de marketing — site de VPN, loja, guia patrocinado — não sustenta nenhuma das duas.

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

## 4. Uma lista é força, a outra é conversa

META: as armas **mais fortes depois da atualização mais recente**, segundo quem testa e analisa — TTK, dano, controle, alcance, versatilidade, consistência, desempenho no jogo de nível alto. Uso alto sozinho não põe arma aqui; força que só apareceu antes do patch, também não.

TRENDING: as armas **mais comentadas e/ou mais usadas** pela comunidade e pelas fontes especializadas nesta semana — do que se fala, o que aparece em toda partida, que build viralizou, para onde as pessoas migraram. Não precisa ser forte, e a arma não precisa ter mudado: basta que a conversa ou o uso estejam ali, com onde isso foi visto.

As duas se cruzam de vez em quando — arma forte costuma ser usada —, mas uma não é a outra em outra ordem. Prefira em trending armas que não estão em picks. Uma arma pode aparecer nas duas listas, no máximo duas ao todo, e só quando a evidência da conversa ou do uso estiver dita.

## 5. Como escrever cada arma

- "reason": uma frase em português do Brasil com o fato concreto. Em picks, o que sustenta a força: o número, o teste, a análise, a posição no ranking, o que o patch fez com ela. Em trending, onde a conversa ou o uso foi visto: a thread, o vídeo, o relato, a build que apareceu. Duas armas nunca com a mesma frase.
- Elogio sem fato é recusado pelo código, e a frase inteira cai junto com a arma: "desempenho superior", "escolha dominante", "domina o meta", "uma das melhores armas", "altamente versátil", "muito eficaz", "eficaz em diversas situações", "excelente desempenho". Se a sua frase caberia igual em outra arma da lista, ela não é evidência.
- "trend": rótulo curto do assunto daquela arma, do que mudou nela e etc — "build full-auto", "todo mundo usando", "reclamação de recuo", "chegou no patch", "migração da X". Não use "popularidade crescente", "aumento de uso", "tendência crescente" nem qualquer sinônimo de "está subindo": isso vale para a seção inteira e não informa nada.
- "source": a URL, entre as que você listar em "sources", que sustenta aquela arma.

## 6. Limites

- No máximo ${LIMITES.picks} armas em picks, da mais forte para a menos forte.
- No máximo ${LIMITES.trending} armas em trending, da mais comentada ou usada para a menos.
- No máximo ${LIMITES.fontes} fontes, e nenhuma publicada antes de ${TEMPORADA.startsOn} — data anterior ao começo da temporada é descartada, e a arma que dependia dela cai junto.
- **Toda página que você citar em \`source\` tem de estar em \`sources\`.** O código resolve o \`source\` de cada arma contra essa lista, e arma que aponta endereço de fora é descartada — foi assim que a rodada de 04/09 perdeu duas de quatro armas em trending. Se uma thread sustenta uma arma, liste a thread. Use as ${LIMITES.fontes} vagas: as páginas que medem ocupam as primeiras, e o trending precisa das outras para citar onde a conversa aconteceu.
- Repetir a mesma fonte em duas armas é permitido quando é verdade. Inventar uma segunda fonte para não repetir, não.
- Use exatamente estes nomes de arma, sem apelido e sem acessório junto: ${ARMAS_PERMITIDAS}.
- Não invente pick rate, TTK, tendência nem fala de comunidade. Sem evidência, a arma fica de fora: quatro armas sustentadas valem mais que oito preenchidas.

## 7. Resposta

Responda SOMENTE com este JSON, sem cercas de código e sem texto antes ou depois:

{"picks":[{"weapon":"NOME EXATO DA ARMA","reason":"o que mostra que ela está forte depois do patch e por que esta forte agora","source":"https://..."}],"trending":[{"weapon":"NOME EXATO DA ARMA","trend":"do que se fala nela","reason":"onde a conversa ou o uso recente foi visto","source":"https://..."}],"sources":[{"name":"nome curto da fonte","url":"https://...","date":"YYYY-MM-DD","scope":"por que essa fonte vale para o multiplayer"}]}`;

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

/**
 * O esforço de raciocínio, dito em voz alta.
 *
 * Passou a ser obrigatório em vez de conveniente: o `gpt-5.6-luna` tem
 * `medium` como padrão, e `max_output_tokens` cobre raciocínio, busca e texto
 * no mesmo bolo. Deixar no padrão é reviver o erro que já derrubou esta rotina
 * — o modelo pensa até o teto e a mensagem chega vazia, que sobe daqui como
 * "resposta cortada" e custa a rodada inteira.
 *
 * `low` e não `none` porque conciliar oito armas com o que a busca trouxe é
 * onde um pouco de deliberação paga; o que não cabe é deliberação solta.
 */
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

  /*
   * O que a rodada custou, em números, no log.
   *
   * Sem isto, "está caro" é impressão e "ficou mais barato" é fé. As três
   * parcelas não se comportam igual: a entrada cresce com o prompt e com o que
   * a busca traz das páginas, o raciocínio some dentro da saída e é onde o
   * orçamento evaporava, e as buscas são cobradas por chamada. Quem for
   * apertar o custo depois precisa saber qual das três apertar.
   */
  const uso = corpo.usage ?? null;
  const buscas = itens.filter((item) => item.type === 'web_search_call').length;

  return {
    texto,
    anotacoes,
    buscou,
    tipos: [...new Set(itens.map((i) => i.type))],
    custo: uso && {
      entrada: uso.input_tokens ?? 0,
      saida: uso.output_tokens ?? 0,
      raciocinio: uso.output_tokens_details?.reasoning_tokens ?? 0,
      buscas,
    },
  };
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
      const { texto, anotacoes, buscou, tipos, custo } = await perguntar(modelo);
      console.log(`  ${modelo}: ${tipos.join(', ') || 'resposta vazia'}${buscou ? '' : ' — sem busca'}`);
      if (custo) {
        console.log(
          `  ${modelo}: ${custo.entrada} tokens de entrada, ${custo.saida} de saída ` +
            `(${custo.raciocinio} de raciocínio), ${custo.buscas} busca(s).`,
        );
      }

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
        /*
         * A atualização que a tela anuncia sai do catálogo, e não da resposta.
         *
         * O modelo não é mais perguntado sobre isso — o prompt já lhe deu o
         * número —, e pedir de volta o que se acabou de informar seria pagar
         * tokens para receber ou a mesma coisa, ou uma pior. Quando o catálogo
         * não tem a versão em disco, `patchConhecido` vem nulo e a resposta do
         * modelo volta a valer, que é o caminho antigo.
         */
        // O rótulo da EA vem em caixa alta — "BATTLEFIELD 6 GAME UPDATE
        // 1.4.2.5" —, e quem lê a tela quer o número, não o grito.
        patchConhecido: PATCH && { name: `Atualização ${PATCH.version}`, date: PATCH.releasedAt },
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
