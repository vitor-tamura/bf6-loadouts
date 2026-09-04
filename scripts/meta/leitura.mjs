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
 *
 * O eixo das duas listas mudou depois disso: picks é força depois do patch,
 * trending é conversa e uso. As travas continuam valendo — elas medem se a
 * resposta tem lastro, não de que lado do eixo ela está —, e o eixo acrescentou
 * a sua: quem afirma força tem de citar quem mede. Fórum e Reddit sustentam a
 * tendência e não o topo, e é a mesma página valendo para uma pergunta e não
 * para a outra, não uma página sendo boa ou ruim.
 */

import { WEAPONS } from '../../src/data/weapons.ts';
import { SEASONS } from '../../src/data/season.ts';
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

/** Uma arma pode ser das mais fortes e das mais faladas. Seis não podem — isso é a mesma lista duas vezes. */
const MAX_REPETIDAS_NO_TRENDING = 2;

/** Motivo mais curto que isto não cabe um fato. */
const MOTIVO_MINIMO = 25;

/**
 * Elogio que serve para qualquer arma boa, e por isso não prova nenhuma.
 *
 * Saiu assim a leitura de 19/08: "Reconhecida por seu desempenho superior em
 * dano e controle, tornando-se uma escolha dominante no meta atual." São dezoito
 * palavras que não dizem um número, um teste, uma posição nem o que o patch
 * mexeu — e que caberiam igualmente em qualquer outra arma da lista.
 *
 * O tamanho mínimo não pega isso: a frase é longa. O que a denuncia é ser
 * intercambiável, e é isso que estes padrões procuram.
 */
const MOTIVO_SEM_FATO = [
  /desempenho superior/,
  /escolha dominante/,
  /domina(ndo)? o meta/,
  /uma das melhores armas/,
  /(altamente|extremamente|muito) (eficaz|eficiente|versatil|forte)/,
  /eficaz em (diversas|varias|muitas|todas)( as)? situacoes/,
  /excelente desempenho/,
  /(melhor|otima) opcao (do|no) meta/,
];

/**
 * Rótulos que não dizem nada.
 *
 * "Popularidade crescente" e "aumento de uso" descrevem a seção inteira: todo
 * card do trending está sendo falado ou usado, é para isso que a seção existe. O
 * rótulo só paga o espaço que ocupa se disser *do que se fala* naquela arma — a
 * build, a reclamação, a migração, a chegada no patch.
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

/**
 * Frases que afirmam que a arma é nova.
 *
 * Não é rótulo vazio — é o contrário: diz algo concreto, verificável, e por isso
 * mesmo pode estar errado. A leitura de 31/08 saiu com a **M2010 ESR** marcada
 * `chegou no patch`, com o motivo "Introduzida na atualização mais recente". A
 * M2010 é arma de lançamento, `season: 0`, está no jogo desde o primeiro dia.
 *
 * O modelo não tinha como saber, e o catálogo tinha: novidade é a única coisa
 * que este dataset prova sozinho, sem depender de fonte nenhuma. Toda trava
 * daqui até agora media a *forma* da resposta — motivo curto, rótulo genérico,
 * fonte que não resolve. Esta mede o **conteúdo**, contra o que o site sabe.
 */
const NOVIDADE = [
  /cheg(ou|ando|a) (n[oa]|com|junto)/,
  /introduzid[ao]/,
  /adicionad[ao]/,
  /lancad[ao] (n[oa]|recent|agora)/,
  /rec(em|ente)[- ]?(lancad|chegad|adicionad|introduzid)/,
  /nov[ao] (arma|adicao|entrada|no jogo|do patch|da temporada|no arsenal)/,
  /arma nov[ao]/,
  /estrei(a|ou)/,
  /(entrou|entra) (n[oa]|com) (patch|atualizacao|temporada)/,
  /acab(ou|a) de (chegar|sair|entrar)/,
];

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

/**
 * Rastreadores que publicam os dois modos, cada um no seu endereço.
 *
 * Neles o caminho é a declaração de modo — e é a única que existe, porque o
 * conteúdo das duas páginas é igualzinho: uma tabela de armas ordenadas. Sem
 * `multiplayer` no caminho, o que a página descreve é o battle royale.
 */
const TRACKERS_POR_MODO = new Set([
  'wzstats.gg',
  'battlefieldmeta.gg',
  'bfhub.gg',
  'battlefinity.gg',
  'nolagvpn.com',
]);

/**
 * Sites da EA e da DICE: é onde o que mudou no jogo é afirmado, não deduzido.
 *
 * `forums.ea.com` não entra inteiro. O mesmo domínio hospeda o comunicado do
 * estúdio, em `/blog/`, e a discussão de quem joga em todo o resto — a primeira
 * é fonte oficial, a segunda é conversa, e a diferença está no caminho.
 */
const FONTES_OFICIAIS = new Set(['ea.com', 'battlefield.com', 'answers.ea.com']);

/**
 * Quem mede ou analisa arma por arma, com número.
 *
 * A lista é curta de propósito: sustentar "esta é a arma mais forte depois do
 * patch" exige método publicado — ranking arma a arma, transcrição do
 * changelog, tabela de dano ou de TTK. Site que não faz isso não vira fonte
 * fraca, vira fonte de conversa: continua valendo para a tendência.
 *
 * `nolagvpn.com` está fora e é o exemplo do porquê. Ele aparece em busca de meta
 * e ranqueia armas, mas é material de marketing de um serviço de VPN, não
 * medição — e ranking assim sustenta o quanto se fala de uma arma, não o quanto
 * ela rende. (Ele segue em [TRACKERS_POR_MODO], que é outra pergunta: aquela
 * lista existe para saber se a página fala de multiplayer ou de REDSEC.)
 */
const FONTES_DE_ANALISE = new Set([
  'wzstats.gg',
  'battlefieldmeta.gg',
  'bfhub.gg',
  'battlefinity.gg',
  'bf6balancelog.com',
  'symthic.com',
  'sym.gg',
  'truegamedata.com',
]);

/**
 * Os domínios que podem pôr uma arma no topo.
 *
 * Existe para o prompt poder dizê-los sem repeti-los. As duas listas já
 * discordavam: o prompt nomeava cinco sites de análise e o classificador aceita
 * oito, então três fontes boas eram recusadas na origem — o modelo nem tentava
 * abri-las. Uma lista que o prompt copia à mão envelhece contra a que decide, e
 * quem paga é a leitura do dia, que cai por falta de fonte que existia.
 */
export function dominiosQueSustentamPicks() {
  return [...FONTES_OFICIAIS, 'forums.ea.com/blog', ...FONTES_DE_ANALISE];
}

/**
 * O que esta página pode sustentar.
 *
 * A tela pergunta duas coisas diferentes, e elas não se provam no mesmo lugar. O
 * topo afirma força depois do patch: isso é teste, medição ou changelog, e sai
 * de fonte oficial ou de quem analisa arma por arma. A tendência afirma que se
 * fala de uma arma e que ela está sendo levada para a partida: isso é fórum,
 * Reddit e comentário, que são a evidência certa para essa pergunta e a errada
 * para a outra.
 *
 * O padrão é `comunidade`. Site que ninguém reconheceu não é acusado de nada —
 * ele só não pode, sozinho, pôr uma arma no topo.
 */
export function confiabilidade(url) {
  let endereco;
  try {
    endereco = new URL(String(url));
  } catch {
    return 'comunidade';
  }

  const host = endereco.hostname.replace(/^www./, '');
  if (host === 'forums.ea.com') {
    return endereco.pathname.toLowerCase().startsWith('/blog') ? 'oficial' : 'comunidade';
  }
  if (FONTES_OFICIAIS.has(host)) return 'oficial';
  if (FONTES_DE_ANALISE.has(host)) return 'analise';
  return 'comunidade';
}

/** Só fonte que mede ou que é oficial põe arma no topo. */
const sustentaForca = (url) => confiabilidade(url) !== 'comunidade';

/** Um segmento do endereço que só existe em página de battle royale. */
const MARCAS_DE_BATTLE_ROYALE = /redsec|battle-?royale|battle_royale/i;

/**
 * A página fala do modo errado?
 *
 * Esta é a trava que faltava, e a que custou mais caro. As outras pegam
 * preguiça — motivo repetido, rótulo vazio, fonte contada duas vezes. Esta pega
 * o erro que **parece** certo: uma lista de armas reais, bem escrita, datada de
 * ontem, e que descreve o REDSEC. Foi assim que a KTS100 MK8 apareceu na tela
 * como "melhor metralhadora do multiplayer" — ela é a primeira colocada geral
 * do battle royale e não chega ao pódio da própria classe no multiplayer.
 *
 * Nada no texto da página denuncia isso. O endereço, sim: quem ranqueia os dois
 * modos os separa por caminho, e `wzstats.gg/battlefield-6/meta` é o battle
 * royale enquanto `wzstats.gg/battlefield-6/multiplayer/meta` é o que esta tela
 * quer. `ranked` também é REDSEC — o ranqueado do BF6 é battle royale.
 *
 * A regra vale só para os rastreadores conhecidos. Fórum, Reddit e notícia
 * passam: o que eles trazem entra como percepção, não como posição.
 */
export function ehPaginaDeOutroModo(url) {
  let endereco;
  try {
    endereco = new URL(String(url));
  } catch {
    return false;
  }

  const host = endereco.hostname.replace(/^www\./, '');
  const caminho = endereco.pathname.toLowerCase();

  if (MARCAS_DE_BATTLE_ROYALE.test(caminho) || MARCAS_DE_BATTLE_ROYALE.test(host)) return true;
  if (!TRACKERS_POR_MODO.has(host)) return false;

  // Raiz do rastreador não declara modo nenhum, e o padrão dessas páginas é o
  // battle royale — foi o que a leitura de agosto provou ao trazer a lista do
  // REDSEC inteira de uma página que só dizia "Battlefield 6 Meta".
  return !/(^|\/)multiplayer(\/|$)/.test(caminho);
}

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
    if (ehPaginaDeOutroModo(fonte.url)) {
      opcoes.descartes?.push({ nome: fonte.name, motivo: 'página de REDSEC, não de multiplayer' });
      return;
    }
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

  /*
    Data velha cai por último, e não na entrada, porque quem sabe a data é a
    fonte declarada: a página que a busca abriu chega aqui datada de hoje, e só
    depois o modelo diz de quando ela é. Guia publicado antes do começo da
    temporada descreve outro jogo — entre ele e agora vieram um patch de armas e
    uma temporada inteira.
  */
  return [...porPagina.values()].filter((fonte) => {
    if (!opcoes.desde || !ehData(fonte.date) || fonte.date >= opcoes.desde) return true;
    opcoes.descartes?.push({
      nome: fonte.name,
      motivo: `publicada em ${fonte.date}, antes do começo da temporada`,
    });
    return false;
  });
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
  {
    max,
    rotulo = false,
    resolverFonte,
    exigirForca = false,
    fonteForte = () => true,
    jaNoMeta = new Set(),
    maxRepetidas = Infinity,
    /**
     * A temporada que a leitura declara ter olhado, para conferir quem é novo.
     *
     * `null` desliga a conferência — é o caso de quem chama sem declarar
     * temporada, e aí não há com o que comparar.
     */
    temporada = null,
  },
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
    if (MOTIVO_SEM_FATO.some((padrao) => padrao.test(texto(reason)))) {
      descartar(arma.name, 'motivo é elogio sem fato: serve para qualquer arma');
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

    /*
      Novidade é conferida contra o catálogo, não aceita como dita.

      Quem afirma que a arma chegou agora está afirmando um fato que este
      repositório conhece: `arma.season` diz em que temporada ela entrou no
      arsenal, e `0` é lançamento. Quando a afirmação não bate, o cartão inteiro
      cai — não só o rótulo. O motivo repetiria a mesma coisa em prosa
      ("Introduzida na atualização mais recente"), e um cartão que erra o fato
      mais fácil de conferir não tem crédito no resto do que diz.

      Cai o cartão e não a leitura: o bloco se completa pelo catálogo, que sabe
      de verdade quem chegou na temporada. Ver `completarTendencia`.
    */
    if (temporada !== null && arma.season !== temporada) {
      const afirma = [trend, reason].some((frase) =>
        NOVIDADE.some((padrao) => padrao.test(texto(frase))),
      );
      if (afirma) {
        descartar(
          arma.name,
          arma.season === 0
            ? 'diz que chegou agora, e é arma de lançamento'
            : `diz que chegou agora, e entrou na Temporada ${arma.season}`,
        );
        continue;
      }
    }

    if (jaNoMeta.has(arma.id)) {
      if (repetidas === maxRepetidas) {
        descartar(arma.name, 'trending repetindo o meta em vez de mostrar do que se fala');
        continue;
      }
      repetidas += 1;
    }

    /*
      Arma sem citação que resolva não entra.

      A leitura de 19/08 saiu com cinco cartões e nenhum colchete: o modelo
      apontou páginas que o saneamento de fontes tinha recusado — modo errado ou
      data anterior à temporada —, e o que ficou na tela foi "desempenho superior
      em dano e controle", sem nada atrás. Um cartão assim é indistinguível de um
      bem citado para quem lê, e é pior que a ausência dele: a tela promete, logo
      acima, que os colchetes dizem de onde saiu cada indicação.

      O bloco não fica menor por isso — a tela completa o topo pela curadoria e a
      tendência pelo catálogo, e os dois dizem de onde vieram.
    */
    const sources = resolverFonte(pick.source ?? pick.sources?.[0]);
    if (!sources.length) {
      descartar(arma.name, 'sem fonte que resolva entre as que sobraram');
      continue;
    }
    /*
      Quem afirma força precisa de quem mede. Uma thread dizendo que a arma está
      absurda é evidência de conversa — legítima, e é ela que sustenta a
      tendência —, mas não é medição, e o topo da tela diz que é.
    */
    if (exigirForca && !sources.some(fonteForte)) {
      descartar(arma.name, 'sustentada só por conversa: fórum e Reddit não medem força');
      continue;
    }

    armasVistas.add(arma.id);
    motivosVistos.add(texto(reason));

    const item = {
      weapon: arma.id,
      reason,
      sources,
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

/** A temporada que a leitura declara ter olhado, como número. */
function numeroDaTemporada(timeframe) {
  const numero = Number(String(timeframe ?? '').replace('season-', ''));
  return SEASONS.some((temporada) => temporada.number === numero) ? numero : null;
}

/** O começo da temporada que a leitura declara — o piso do que ela pode citar. */
function inicioDaTemporada(timeframe) {
  const numero = numeroDaTemporada(timeframe);
  return SEASONS.find((temporada) => temporada.number === numero)?.startsOn ?? null;
}

/**
 * A atualização do jogo que a leitura diz ter olhado.
 *
 * É o que ancora a lista no tempo: sem ela, "meta atual" quer dizer o que o
 * índice de busca tiver à mão, que foi como a primeira leitura publicada saiu
 * apoiada em tier lists de duas semanas antes. Data no futuro é alucinação — o
 * patch de amanhã ainda não mexeu em arma nenhuma.
 */
/**
 * A atualização apurada pelo catálogo, pronta para a tela.
 *
 * Não passa pela trava de temporada que `normalizarPatch` aplica, e não deve
 * passar: aquela trava existe para pegar patch que o modelo foi buscar no
 * índice e trouxe de dois meses atrás. Este número veio do pipeline que lê a
 * página oficial da EA — se ele estiver errado, o problema é o catálogo, e
 * escondê-lo aqui só faria a tela mentir com mais um passo no meio.
 *
 * Data no futuro continua sendo recusada. Ela só apareceria por relógio torto
 * ou por patch anunciado antes de sair, e nos dois casos "revisado hoje sobre
 * um patch de amanhã" é uma frase que não se sustenta.
 */
export function normalizarPatchConhecido(patch, hoje) {
  if (!patch || typeof patch !== 'object') return null;

  const name = String(patch.name ?? '').trim().slice(0, 80) || null;
  const date = ehData(patch.date) && patch.date <= hoje ? patch.date : null;

  return name || date ? { name, date } : null;
}

export function normalizarPatch(bruto, hoje, inicioDaTemporada = null) {
  const patch = bruto?.patch;
  if (!patch || typeof patch !== 'object') return null;

  const name = String(patch.name ?? '').trim().slice(0, 80) || null;
  const date = ehData(patch.date) && patch.date <= hoje ? patch.date : null;

  /*
   * Patch de outra temporada não ancora leitura de hoje.
   *
   * A leitura de 17/08 saiu apontando o Blastpoint 1.3.2.0, de junho, com a
   * Temporada 4 no ar desde 21/07: a tela anunciava "revisado em 17/08" e
   * descrevia o jogo de duas temporadas atrás. Quando a data não alcança o
   * começo da temporada, o par inteiro cai — o nome sozinho seria a mesma
   * afirmação errada, só que sem data para o leitor conferir.
   */
  if (inicioDaTemporada && (!date || date < inicioDaTemporada)) return null;

  return name || date ? { name, date } : null;
}

/**
 * A resposta do modelo virada leitura publicável.
 *
 * Lança quando a resposta não se sustenta — é o sinal para `meta-search.mjs`
 * tentar o próximo modelo da fila em vez de gravar.
 */
export function montarLeitura({
  bruto,
  anotacoes = [],
  buscou = null,
  modelo,
  hoje,
  timeframe,
  patchConhecido = null,
}) {
  const listas = listasBrutas(bruto);
  const enviadosPicks = Array.isArray(listas.picks) ? listas.picks.length : 0;
  const enviadosTrending = Array.isArray(listas.trending) ? listas.trending.length : 0;

  if (!enviadosPicks) throw new Error('resposta sem lista de armas');

  /*
   * A pergunta é "pesquisou?", e não "citou?".
   *
   * A trava antiga exigia anotação `url_citation` e rejeitava a resposta sem
   * ela. Só que citar é hábito do modelo, não garantia da API: gpt-4.1 abria
   * páginas e respondia sem marcar nenhuma, e a leitura caía como se fosse
   * memória. Quem responde de verdade é `buscou` — a presença de um
   * `web_search_call` na resposta.
   *
   * `buscou = null` significa que quem chamou não sabe (é o caso dos testes,
   * que montam a leitura direto); aí a anotação volta a ser a prova.
   */
  if (buscou === false) throw new Error('o modelo não chamou a busca');
  if (buscou === null && !anotacoes.length) throw new Error('a busca não abriu página nenhuma');

  const fontesDescartadas = [];
  const desde = inicioDaTemporada(timeframe);
  const sources = normalizarFontes(anotacoes, bruto, {
    hoje,
    timeframe,
    desde,
    descartes: fontesDescartadas,
  });
  // Sem anotação, valem as fontes que o modelo declarou no JSON. Sem nenhuma
  // das duas, não há o que mostrar embaixo do card — e aí a leitura não serve.
  //
  // Quando a lista esvaziou porque tudo caiu por modo, o erro diz isso: leitura
  // que só achou página de REDSEC não é leitura sem fonte, é leitura do modo
  // errado, e quem for ler o log precisa saber a diferença.
  if (!sources.length) {
    throw new Error(
      fontesDescartadas.length
        ? `nenhuma fonte passou — ${fontesDescartadas.map((d) => `${d.nome}: ${d.motivo}`).join('; ')}`
        : 'busca não devolveu fonte nenhuma',
    );
  }

  const resolverFonte = resolvedorDeFonte(sources);
  const fonteForte = (indice) => sustentaForca(sources[indice]?.url);

  // A conferência de novidade vale para as duas listas: o meta também já disse
  // "arma nova" de arma velha, e ali o erro é pior — aquele bloco promete medição.
  const temporada = numeroDaTemporada(timeframe);

  const meta = normalizarLista(listas.picks, {
    max: MAX_PICKS,
    resolverFonte,
    exigirForca: true,
    fonteForte,
    temporada,
  });
  exigirMinimo(meta, enviadosPicks, MIN_PICKS, 'armas do meta');

  const trends = normalizarLista(listas.trending, {
    max: MAX_TRENDING,
    rotulo: true,
    resolverFonte,
    jaNoMeta: new Set(meta.items.map((item) => item.weapon)),
    maxRepetidas: MAX_REPETIDAS_NO_TRENDING,
    temporada,
  });
  exigirMinimo(trends, enviadosTrending, MIN_TRENDING, 'armas em trending');

  return {
    conteudo: {
      readAt: hoje,
      model: modelo,
      /*
       * O catálogo tem precedência sobre a resposta.
       *
       * `patchConhecido` vem de `data/versions`, escrito pelo pipeline que lê a
       * página oficial da EA — é apuração, não leitura de índice de busca. A
       * resposta do modelo só entra quando ele não veio: repositório sem
       * catálogo em disco, e os testes, que montam a leitura direto.
       *
       * A diferença não é acadêmica. A leitura de 02/09 anunciou na tela a
       * 1.4.1.5, de 04/08, com a 1.4.2.5 no ar desde 31/08 e já processada aqui.
       */
      patch: normalizarPatchConhecido(patchConhecido, hoje) ??
        normalizarPatch(bruto, hoje, inicioDaTemporada(timeframe)),
      picks: meta.items,
      trending: trends.items,
      sources,
    },
    descartes: [...fontesDescartadas, ...meta.descartes, ...trends.descartes],
  };
}
