/**
 * O que a resposta da busca precisa provar antes de virar `meta-live.json`.
 *
 * Aqui não há rede: entra o texto que o modelo devolveu, junto das páginas que
 * a busca abriu, e sai a leitura pronta — ou um erro, quando a resposta não
 * passa das travas e o certo é perguntar ao próximo modelo. Estar separado de
 * `meta-search.mjs` é o que permite testar as travas sem gastar chamada paga.
 *
 * ## Por que as travas existem
 *
 * A primeira leitura que esta rotina publicou saiu com o trending sendo o meta
 * outra vez: seis das oito armas eram as mesmas, na mesma ordem, com rótulos
 * que só repetiam o nome da seção — "popularidade crescente", "aumento de uso",
 * "tendência crescente" — e frases de motivo repetidas palavra por palavra em
 * duas armas diferentes. Três das cinco fontes eram a mesma página em idiomas
 * diferentes.
 *
 * Nada disso é detectável pelo nome da arma, que era a única trava que existia:
 * o dataset aceitou tudo, porque as armas existiam mesmo. O que separa leitura
 * de enchimento é o resto — rótulo que diz o que mudou, motivo que não se
 * repete, trending que não ecoa o meta e fonte que é uma página só.
 */

import { WEAPONS } from '../../src/data/weapons.ts';
import { pageKey } from '../../src/lib/sources.ts';

/** No máximo, o que a tela mostra. */
const MAX_PICKS = 8;
const MAX_TRENDING = 8;
const MAX_FONTES = 8;

/**
 * Abaixo disto a resposta é enchimento, não leitura magra.
 *
 * O piso vale contra o que o modelo mandou, não em absoluto: se ele devolveu
 * três armas e as três se sustentam, a leitura entra com três. O que a trava
 * pega é a resposta que veio com oito e chegou aqui com uma.
 */
const MIN_PICKS = 4;
const MIN_TRENDING = 3;

/** Uma arma pode ser meta e estar subindo. Seis não podem — isso é a mesma lista duas vezes. */
const MAX_REPETIDAS_NO_TRENDING = 2;

/** Motivo mais curto que isto não cabe um fato. */
const MOTIVO_MINIMO = 25;

/**
 * Rótulos que não dizem nada.
 *
 * "Popularidade crescente" e "aumento de uso" descrevem a seção inteira: todo
 * card do trending está subindo, é para isso que a seção existe. O rótulo só
 * paga o espaço que ocupa se disser *o que* mudou naquela arma — o buff, a
 * build, a chegada no patch.
 */
const TREND_VAZIO = new Set([
  'em alta',
  'alta',
  'em ascensao',
  'ascensao',
  'subindo',
  'crescendo',
  'crescimento',
  'crescimento na popularidade',
  'crescimento de popularidade',
  'popular',
  'popularidade',
  'popularidade crescente',
  'popularidade em alta',
  'aumento de uso',
  'aumento no uso',
  'uso crescente',
  'uso em alta',
  'mais usada',
  'tendencia',
  'tendencia crescente',
  'tendencia de alta',
  'tendencia em alta',
  'trending',
  'trending up',
  'rising',
]);

/** Sem acentos e sem pontuação: "SG 553R" e "sg553r" viram a mesma coisa. */
export const chave = (nome) =>
  String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const PORCHAVE = new Map(WEAPONS.map((w) => [chave(w.name), w]));

/** A arma do jogo com esse nome, ou `undefined` — que é como nome inventado sai. */
export const armaPorNome = (nome) => (nome ? PORCHAVE.get(chave(nome)) : undefined);

/** Texto comparável: dois motivos só são diferentes se diferirem em palavra. */
const texto = (valor) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Tira as cercas de código e o texto solto que o modelo às vezes põe em volta. */
export function extrairJson(bruto) {
  const inicio = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return null;
  try {
    return JSON.parse(bruto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

/**
 * Duas URLs que abrem a mesma página têm a mesma chave.
 *
 * A leitura ruim gastou três das cinco fontes em `battlefieldmeta.gg`, `/es` e
 * `/pt`: a mesma tier list em três idiomas, contada como três leituras
 * independentes. Uma lista sustentada por "cinco fontes" que são três é pior
 * que uma sustentada por três, porque mente sobre o próprio lastro.
 *
 * A regra vive em `src/lib/sources.ts` porque a sugestão de montagem cita
 * páginas pelo mesmo critério — e duas cópias divergem no primeiro idioma que
 * alguém acrescentar de um lado só.
 */
export const chavePagina = pageKey;

const ehData = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''));

function fonteBase(url, { hoje, timeframe }) {
  const endereco = new URL(String(url));
  return {
    name: endereco.hostname,
    url: endereco.toString(),
    date: hoje,
    country: endereco.hostname.endsWith('.br') ? 'BR' : 'INT',
    mode: 'multiplayer',
    scope: 'Página aberta pela busca que montou esta lista.',
    timeframe,
  };
}

/** Página que a busca abriu de fato — o link existe, seja qual for o que o modelo diga dele. */
function fonteAberta(anotacao, opcoes) {
  if (!anotacao?.url) return null;
  try {
    const fonte = fonteBase(anotacao.url, opcoes);
    if (anotacao.title) fonte.name = String(anotacao.title).slice(0, 80);
    return fonte;
  } catch {
    return null;
  }
}

/** Fonte que o modelo declarou: traz data e escopo, e por isso enriquece a que a busca abriu. */
function fonteDeclarada(bruto, opcoes) {
  if (!bruto || typeof bruto !== 'object' || !bruto.url) return null;
  try {
    const fonte = fonteBase(bruto.url, opcoes);
    if (bruto.name) fonte.name = String(bruto.name).slice(0, 80);
    if (ehData(bruto.date)) fonte.date = bruto.date;
    if (bruto.scope) fonte.scope = String(bruto.scope).slice(0, 220);
    return fonte;
  } catch {
    return null;
  }
}

/**
 * A lista de fontes, uma por página.
 *
 * As páginas que a busca abriu vêm primeiro porque são as que provadamente
 * existem; o que o modelo declara sobre cada uma — nome, data de publicação,
 * a que modo se refere — entra por cima, quando fala da mesma página.
 */
export function normalizarFontes(anotacoes, bruto, opcoes) {
  const porPagina = new Map();

  const incluir = (fonte) => {
    if (!fonte) return;
    const pagina = chavePagina(fonte.url);
    const jaVista = porPagina.get(pagina);

    if (!jaVista) {
      if (porPagina.size < MAX_FONTES) porPagina.set(pagina, fonte);
      return;
    }

    if (fonte.name.length > jaVista.name.length) jaVista.name = fonte.name;
    if (fonte.scope.length > jaVista.scope.length) jaVista.scope = fonte.scope;
    if (jaVista.date === opcoes.hoje) jaVista.date = fonte.date;
  };

  for (const anotacao of anotacoes ?? []) incluir(fonteAberta(anotacao, opcoes));
  for (const declarada of bruto?.sources ?? []) incluir(fonteDeclarada(declarada, opcoes));

  return [...porPagina.values()];
}

/**
 * Qual fonte sustenta cada arma.
 *
 * A versão anterior pendurava a fonte pela posição na lista — a quinta arma
 * citava a quinta fonte, e a nona voltava para a primeira. O número embaixo do
 * card parecia referência e era ordem de chegada. Agora vale o link que o
 * modelo apontou para aquela arma; sem link que bata com uma das fontes, o card
 * fica sem citação, que é o que ele merece.
 */
function resolvedorDeFonte(sources) {
  const porPagina = new Map(sources.map((fonte, i) => [chavePagina(fonte.url), i]));

  return (url) => {
    if (!url) return [];
    try {
      const indice = porPagina.get(chavePagina(url));
      return indice === undefined ? [] : [indice];
    } catch {
      return [];
    }
  };
}

/**
 * As armas de uma lista, já filtradas.
 *
 * `descartes` guarda quem caiu e por quê: é o que aparece no log do workflow
 * quando a leitura do dia não sai, e é por ele que se descobre se o problema
 * foi o modelo ou a trava.
 */
export function normalizarLista(
  lista,
  { max, rotulo = false, resolverFonte, jaNoMeta = new Set(), maxRepetidas = Infinity },
) {
  const armasVistas = new Set();
  const motivosVistos = new Set();
  const items = [];
  const descartes = [];
  let repetidas = 0;

  const descartar = (nome, motivo) => descartes.push({ nome, motivo });

  for (const pick of Array.isArray(lista) ? lista : []) {
    if (items.length === max) break;
    if (!pick || typeof pick !== 'object') continue;

    const arma = armaPorNome(pick.weapon);
    if (!arma) {
      descartar(pick.weapon ?? '(sem nome)', 'não existe no jogo');
      continue;
    }
    if (armasVistas.has(arma.id)) continue;

    const reason = String(pick.reason ?? '').trim();
    if (texto(reason).length < MOTIVO_MINIMO) {
      descartar(arma.name, 'motivo curto demais para ser evidência');
      continue;
    }
    if (motivosVistos.has(texto(reason))) {
      descartar(arma.name, 'repete o motivo de outra arma palavra por palavra');
      continue;
    }

    const trend = String(pick.trend ?? '').trim();
    if (rotulo) {
      if (!trend) {
        descartar(arma.name, 'sem rótulo de tendência');
        continue;
      }
      if (TREND_VAZIO.has(texto(trend))) {
        descartar(arma.name, `rótulo "${trend}" não diz o que mudou`);
        continue;
      }
    }

    if (jaNoMeta.has(arma.id)) {
      if (repetidas === maxRepetidas) {
        descartar(arma.name, 'trending repetindo o meta em vez de mostrar o que subiu');
        continue;
      }
      repetidas += 1;
    }

    armasVistas.add(arma.id);
    motivosVistos.add(texto(reason));

    const item = {
      weapon: arma.id,
      reason,
      sources: resolverFonte(pick.source ?? pick.sources?.[0]),
    };
    if (rotulo) item.trend = trend;
    items.push(item);
  }

  return { items, descartes };
}

/**
 * Quando o saneamento derruba quase tudo, o que sobra não é uma leitura curta —
 * é o resto de uma resposta preguiçosa. Melhor perguntar ao próximo modelo.
 */
function exigirMinimo({ items, descartes }, enviados, minimo, nome) {
  if (items.length >= Math.min(minimo, enviados)) return;

  const porque = descartes.map((d) => `${d.nome}: ${d.motivo}`).join('; ');
  throw new Error(`sobraram ${items.length} de ${enviados} ${nome}${porque ? ` — ${porque}` : ''}`);
}

/** O nome das listas muda conforme o humor do modelo; o conteúdo, não. */
function listasBrutas(bruto) {
  return {
    picks: bruto?.picks ?? bruto?.meta ?? bruto?.weapons ?? bruto?.armas ?? [],
    trending: bruto?.trending ?? bruto?.trends ?? bruto?.emAlta ?? [],
  };
}

/**
 * A atualização do jogo que a leitura diz ter olhado.
 *
 * É o que ancora a lista no tempo: sem ela, "meta atual" quer dizer o que o
 * índice de busca tiver à mão, que foi como a primeira leitura publicada saiu
 * apoiada em tier lists de duas semanas antes. Data no futuro é alucinação — o
 * patch de amanhã ainda não mexeu em arma nenhuma.
 */
export function normalizarPatch(bruto, hoje) {
  const patch = bruto?.patch;
  if (!patch || typeof patch !== 'object') return null;

  const name = String(patch.name ?? '').trim().slice(0, 80) || null;
  const date = ehData(patch.date) && patch.date <= hoje ? patch.date : null;

  return name || date ? { name, date } : null;
}

/**
 * A resposta do modelo virada leitura publicável.
 *
 * Lança quando a resposta não se sustenta — é o sinal para `meta-search.mjs`
 * tentar o próximo modelo da fila em vez de gravar.
 */
export function montarLeitura({ bruto, anotacoes = [], modelo, hoje, timeframe }) {
  const listas = listasBrutas(bruto);
  const enviadosPicks = Array.isArray(listas.picks) ? listas.picks.length : 0;
  const enviadosTrending = Array.isArray(listas.trending) ? listas.trending.length : 0;

  if (!enviadosPicks) throw new Error('resposta sem lista de armas');

  /*
   * Sem página aberta não houve busca, e sem busca a resposta é memória do
   * modelo — exatamente o que esta rotina existe para não publicar.
   */
  if (!anotacoes.length) throw new Error('a busca não abriu página nenhuma');

  const sources = normalizarFontes(anotacoes, bruto, { hoje, timeframe });
  if (!sources.length) throw new Error('busca não devolveu fonte nenhuma');

  const resolverFonte = resolvedorDeFonte(sources);

  const meta = normalizarLista(listas.picks, { max: MAX_PICKS, resolverFonte });
  exigirMinimo(meta, enviadosPicks, MIN_PICKS, 'armas do meta');

  const trends = normalizarLista(listas.trending, {
    max: MAX_TRENDING,
    rotulo: true,
    resolverFonte,
    jaNoMeta: new Set(meta.items.map((item) => item.weapon)),
    maxRepetidas: MAX_REPETIDAS_NO_TRENDING,
  });
  exigirMinimo(trends, enviadosTrending, MIN_TRENDING, 'armas em trending');

  return {
    conteudo: {
      readAt: hoje,
      model: modelo,
      patch: normalizarPatch(bruto, hoje),
      picks: meta.items,
      trending: trends.items,
      sources,
    },
    descartes: [...meta.descartes, ...trends.descartes],
  };
}
