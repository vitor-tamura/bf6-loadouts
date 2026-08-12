import type { WeaponCategory } from './types';

/**
 * O meta da temporada **no multiplayer**, por curadoria.
 *
 * O escopo é o multiplayer tradicional — Conquista, Avanço e companhia. O
 * REDSEC, o battle royale, tem meta próprio e não entra aqui: o loot no chão, a
 * vida maior e o combate em esquadra premiam outra coisa. A KTS100 MK8 é o
 * exemplo que mais engana — nº 1 geral do REDSEC e apenas a sexta metralhadora
 * do multiplayer. Ver [NAO_E_MULTIPLAYER].
 *
 * Não existe fonte pública de uso real: a API do gametools só serve estatística
 * por jogador, e os endpoints agregados de arma existem para BF1, BF3, BF4 e
 * BFV, não para o 6. O tracker.gg tem os números, mas não publica API.
 *
 * Então isto aqui é o que a comunidade escreve, não o que alguém mediu — e a
 * tela precisa dizer isso com todas as letras. Cada indicação cita de onde veio
 * e quando, para o leitor julgar a idade da opinião.
 *
 * Duas regras filtram o que entra:
 *
 * - **Modo declarado.** A fonte precisa dizer de que modo está falando, e o
 *   campo `escopo` guarda o indício. Foi assim que o Nerdschalk saiu da lista:
 *   ele mede "public matches and Ranked REDSEC play" no mesmo texto, e era ele
 *   que sustentava sozinho a RPK-74M no topo.
 * - **Data.** Só leitura publicada depois do patch da temporada. Guia de
 *   lançamento fica de fora por mais completo que seja: entre ele e hoje vieram
 *   quatro temporadas e um patch que mexeu em velocidade e recuo. É o que o
 *   campo `janela` marca.
 *
 * Para atualizar: troque `ATUALIZADO_EM`, revise as listas e acrescente a fonte
 * nova em [FONTES]. Arma que ninguém mais cita sai; não há mérito em manter
 * indicação velha só para a lista parecer cheia.
 */

export interface MetaSource {
  name: string;
  url: string;
  /** Data de publicação ou última atualização declarada pela fonte, ISO. */
  date: string;
  /** País da publicação — as brasileiras vêm primeiro na tela. */
  country: 'BR' | 'INT';
  /**
   * A que modo a leitura se refere.
   *
   * O tipo tem um valor só de propósito: fonte de REDSEC não entra por
   * distração, e quem tentar acrescentar uma esbarra no compilador.
   */
  mode: 'multiplayer';
  /** O indício que prova o modo. Fonte que não deixa claro do que fala não entra. */
  scope: string;
  /**
   * A que momento do jogo a leitura se refere.
   *
   * Fonte do lançamento não descreve o meta de hoje: entre uma coisa e outra
   * vieram quatro temporadas e o patch que mexeu em velocidade e recuo. Ela
   * entra pelo histórico, não para decidir posição.
   */
  timeframe: `season-${number}` | 'launch';
}

/**
 * A atualização do jogo em que a leitura se apoia.
 *
 * Quem lê a busca diária precisa saber contra o que ela leu: lista relida hoje
 * sobre guias anteriores ao último patch descreve o jogo de antes dele. A
 * curadoria escrita à mão não preenche isto — ela já diz a data de cada fonte,
 * uma por uma.
 */
export interface MetaPatch {
  /** Nome ou número da atualização, quando a busca identifica. */
  name: string | null;
  /** Dia em que ela saiu, ISO. Nulo quando a busca não achou a data. */
  date: string | null;
}

export interface MetaPick {
  /** Id da arma em [WEAPONS]. */
  weapon: string;
  /** Por que ela aparece, na leitura da fonte. */
  reason: string;
  /** Índices em [FONTES] que citam esta arma. */
  sources: number[];
}

export interface TrendingPick extends MetaPick {
  /** Rótulo curto da tendência: "subindo", "muito usada", "build nova"... */
  trend: string;
}

export interface CategoryHighlight {
  category: WeaponCategory;
  /** A arma que a fonte aponta como melhor da categoria. */
  best: MetaPick;
  /** Quem mais foi citado, sem ser o primeiro nome. */
  mentions: MetaPick[];
}

/** Uma arma que o battle royale valoriza e o multiplayer, não. */
export interface RedsecContrast {
  /** Id da arma em [WEAPONS]. */
  weapon: string;
  /** Onde ela está no ranking do REDSEC. */
  redsec: string;
  /** Onde a mesma fonte a coloca no multiplayer. */
  multiplayer: string;
  /** O que explica a diferença. */
  note: string;
}

export const SOURCES: MetaSource[] = [
  {
    name: 'wzstats.gg — ranking do multiplayer',
    url: 'https://wzstats.gg/battlefield-6/multiplayer/meta',
    date: '2026-08-07',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Tem página só de multiplayer, separada das de REDSEC e de REDSEC Ranqueado, e ordena arma por arma dentro de cada classe.',
    timeframe: 'season-4',
  },
  {
    name: 'TheGamer — melhores armas por classe',
    url: 'https://www.thegamer.com/battlefield-6-best-weapons-class-meta-smg-lmg-assault-rifle-sniper-dmr-season-4-guide/',
    date: '2026-08-03',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Diz a que se refere: "the best weapons you can use during Season 4 across all four classes in multiplayer".',
    timeframe: 'season-4',
  },
  {
    name: 'KeenGamer — as cinco melhores da Temporada 4',
    url: 'https://www.keengamer.com/articles/guides/battlefield-6-season-4-meta-5-best-weapons-ranked/',
    date: '2026-07-24',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Julga o desempenho nos "multiplayer maps" da temporada, com Tsuru Reef como referência.',
    timeframe: 'season-4',
  },
  {
    name: 'Game Rant — armas do meta da Temporada 4',
    url: 'https://gamerant.com/battlefield-6-bf6-best-guns-weapons-meta-season-4-s4/',
    date: '2026-07-24',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Ordena pelos mapas grandes do multiplayer — Railway to Golmud e Tsuru Reef — e em nenhum momento fala de REDSEC.',
    timeframe: 'season-4',
  },
];

/** Quando esta lista foi revisada por aqui. */
export const UPDATED_AT = '2026-08-07';

/** A temporada a que esta leitura se refere. */
export const META_SEASON = 4;

/**
 * O topo do multiplayer, sem separar por categoria.
 *
 * A ordem segue o ranking de multiplayer da fonte [0], e só entra quem tem ao
 * menos duas fontes concordando — foi o que deixou de fora a PP-19, a KORD 6P67
 * e a QBZ-192, que lideram suas classes ali mas nenhum guia ainda comentou.
 * Elas aparecem em [POR_CATEGORIA], onde uma fonte que ranqueia por classe
 * basta.
 */
export const HIGHLIGHTS: MetaPick[] = [
  {
    weapon: 'm16a4',
    reason: 'A primeira colocada geral do multiplayer: recuo controlado, bala rápida e dano estável em qualquer distância.',
    sources: [0, 2],
  },
  {
    weapon: 'b36a4',
    reason: 'Bullpup equilibrado, logo atrás da M16A4 — o maior potencial de eliminação entre os fuzis, na leitura das fontes.',
    sources: [0, 3],
  },
  {
    weapon: 'drs-iar',
    reason: 'A metralhadora do momento: tempo para matar curto para o porte e alcance suficiente para segurar objetivo.',
    sources: [0, 1, 3],
  },
  {
    weapon: 'sgx',
    reason: 'A submetralhadora agressiva de quem entra primeiro, e a mais citada da classe fora do battle royale.',
    sources: [0, 1],
  },
  {
    weapon: 'pw5a3',
    reason: 'Equilíbrio entre manejo e controle no vão curto, sem o custo de mobilidade das opções mais pesadas.',
    sources: [0, 3],
  },
  {
    weapon: 'm2010-esr',
    reason: 'O ferrolho de referência: bala veloz e poder de parada, com mobilidade para trocar de posição.',
    sources: [0, 2, 3],
  },
  {
    weapon: 'sg-553r',
    reason: 'A carabina mais sólida da temporada — a segunda da classe no ranking e a primeira na leitura do guia.',
    sources: [0, 1],
  },
];

/**
 * Armas que estão aparecendo mais na conversa ou no uso percebido.
 *
 * Trending não é sinônimo de meta: entra arma que ganhou adoção, hype ou uma
 * build nova mesmo quando ainda não há consenso de que seja a escolha mais
 * eficiente. A busca diária substitui esta lista quando grava `meta-live.json`.
 */
export const TRENDING: TrendingPick[] = [
  {
    weapon: 'vssm',
    trend: 'full-auto em alta',
    reason: 'A novidade da temporada virou assunto pela combinação de supressor integrado, modo automático e força em médio alcance.',
    sources: [0, 1, 3],
  },
  {
    weapon: 'ef88',
    trend: 'arma nova',
    reason: 'Os guias ainda discutem se ela já passou as veteranas, mas a curiosidade e as builds de Season 4 mantêm a EF88 em evidência.',
    sources: [2, 3],
  },
  {
    weapon: 'brod-3',
    trend: 'mobilidade',
    reason: 'Carabina recente, citada como opção agressiva para quem quer trocar alcance por velocidade de entrada.',
    sources: [0, 3],
  },
  {
    weapon: 'drs-iar',
    trend: 'muito usada',
    reason: 'A leitura de temporada empurrou a DRS-IAR para o centro da conversa entre suportes por TTK curto e alcance confiável.',
    sources: [0, 1, 3],
  },
  {
    weapon: 'sg-553r',
    trend: 'build consistente',
    reason: 'A carabina segue subindo nas recomendações por ser fácil de encaixar em mapas e classes diferentes.',
    sources: [0, 1],
  },
];

/**
 * O melhor de cada categoria.
 *
 * Aqui a fonte [0] decide o primeiro nome, porque é a única que ordena arma por
 * arma dentro da classe e separando por modo. Os guias entram sustentando e
 * discordando: onde a leitura editorial aponta outra arma, ela vem logo abaixo,
 * nas menções, com o motivo à vista.
 */
export const BY_CATEGORY: CategoryHighlight[] = [
  {
    category: 'ar',
    best: { weapon: 'm16a4', reason: 'Primeira da classe e do ranking geral do multiplayer.', sources: [0, 2] },
    mentions: [
      { weapon: 'b36a4', reason: 'Logo atrás, com o maior potencial de eliminação entre os fuzis.', sources: [0, 3] },
      { weapon: 'kord-6p67', reason: 'Terceira da classe, e a primeira quando a briga é no vão longo.', sources: [0] },
      {
        weapon: 'ef88',
        reason: 'A novidade da temporada: os guias a chamam de melhor do jogo, mas o ranking do multiplayer ainda a põe atrás das veteranas.',
        sources: [2, 3],
      },
    ],
  },
  {
    category: 'carbine',
    best: { weapon: 'qbz-192', reason: 'Primeira da classe no multiplayer, à frente da carabina que os guias preferem.', sources: [0] },
    mentions: [
      { weapon: 'sg-553r', reason: 'Segunda no ranking e primeira na leitura do guia — a diferença entre as duas é pequena.', sources: [0, 1] },
      { weapon: 'brod-3', reason: 'A carabina nova, agressiva: para quem troca alcance por mobilidade.', sources: [0, 3] },
      { weapon: 'm4a1', reason: 'Mais fácil de dominar, e a preferida de quem joga na investida.', sources: [0, 1, 2, 3] },
    ],
  },
  {
    category: 'smg',
    best: { weapon: 'pp-19', reason: 'Primeira da classe: carregador fundo e controle que sustenta a rajada longa.', sources: [0] },
    mentions: [
      { weapon: 'sgx', reason: 'Opção agressiva para quem entra primeiro.', sources: [0, 1] },
      { weapon: 'pw5a3', reason: 'Equilíbrio entre manejo e controle no vão curto.', sources: [0, 3] },
      { weapon: 'cz3a1', reason: 'Cadência altíssima e tiro sem visada muito bom — a favorita dos guias, quinta no ranking.', sources: [0, 1, 3] },
    ],
  },
  {
    category: 'lmg',
    best: { weapon: 'drs-iar', reason: 'Tempo para matar rápido com alcance sólido — primeira da classe nas duas leituras.', sources: [0, 1, 3] },
    mentions: [
      { weapon: 'rpk-74m', reason: 'Controle firme com volume de fogo, para negar passagem em mapa aberto.', sources: [0] },
      { weapon: 'l110', reason: 'A leve da classe, para quem quer volume de fogo sem perder o passo.', sources: [0] },
      {
        weapon: 'kts100-mk8',
        reason: 'Cuidado: é a nº 1 do REDSEC e vive em lista de melhores, mas no multiplayer só a sexta da classe.',
        sources: [0, 1, 2, 3],
      },
    ],
  },
  {
    category: 'dmr',
    best: { weapon: 'vssm', reason: 'A novidade da temporada assumiu a classe: supressor integrado e automático, para quem joga escondido.', sources: [0, 1, 3] },
    mentions: [
      { weapon: 'm39-emr', reason: 'A semiautomática de sempre, segunda da classe.', sources: [0] },
      { weapon: 'svdm', reason: 'Cadência consistente, mas o multiplayer a rebaixou — no REDSEC ela lidera a classe.', sources: [0, 1] },
    ],
  },
  {
    category: 'sniper',
    best: { weapon: 'm2010-esr', reason: 'Bala veloz e poder de parada, com mobilidade entre posições.', sources: [0, 2, 3] },
    mentions: [
      { weapon: 'mini-scout', reason: 'A leve, para quem troca de posição o tempo todo.', sources: [0, 1, 3] },
      { weapon: 'psr', reason: 'Terceira da classe, para o vão realmente longo.', sources: [0] },
      { weapon: 'l115', reason: 'Ferrolho tradicional, e a primeira escolha do guia — quarta no ranking.', sources: [0, 1] },
    ],
  },
  {
    category: 'shotgun',
    best: { weapon: 'm87a1', reason: 'A única escopeta no primeiro escalão do multiplayer, e com folga sobre as demais.', sources: [0] },
    mentions: [
      { weapon: 'm1014', reason: 'A semiautomática, para quem prefere o segundo tiro rápido ao dano do primeiro.', sources: [0, 3] },
      { weapon: '18-5ks-k', reason: 'Terceira da classe, de bombeamento.', sources: [0] },
    ],
  },
  {
    category: 'pistol',
    best: { weapon: 'vz-61', reason: 'A única secundária que o ranking do multiplayer coloca acima do escalão de baixo — é rajada, não pistola.', sources: [0] },
    mentions: [],
  },
];

/**
 * As armas que o battle royale valoriza e o multiplayer, não.
 *
 * São as que estão no primeiro escalão do REDSEC e caem no multiplayer, pela
 * mesma fonte — que ranqueia os dois modos em páginas separadas. Elas explicam
 * por que boa parte das listas de "melhores armas" que circulam não serve para
 * quem joga Conquista.
 */
export const NOT_MULTIPLAYER: RedsecContrast[] = [
  {
    weapon: 'kts100-mk8',
    redsec: 'nº 1 geral',
    multiplayer: '6ª metralhadora',
    note: 'Carregador grande e bala veloz valem mais quando a vida é maior e a munição vem do chão.',
  },
  {
    weapon: 'svdm',
    redsec: '1ª DMR',
    multiplayer: '3ª DMR',
    note: 'A semiautomática rende no vão aberto do battle royale; no multiplayer a VSSM tomou o lugar.',
  },
  {
    weapon: 'ak-205',
    redsec: '2ª carabina',
    multiplayer: '6ª carabina',
    note: 'Trocar alcance por mobilidade compensa menos quando o objetivo é fixo.',
  },
  {
    weapon: 'usg-90',
    redsec: '4ª submetralhadora',
    multiplayer: '9ª submetralhadora',
    note: 'Sustenta bem a briga longa de esquadra, e perde para as de cadência alta no corredor.',
  },
];
