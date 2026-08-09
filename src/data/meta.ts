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

export interface FonteMeta {
  nome: string;
  url: string;
  /** Data de publicação ou última atualização declarada pela fonte, ISO. */
  data: string;
  /** País da publicação — as brasileiras vêm primeiro na tela. */
  pais: 'BR' | 'INT';
  /**
   * A que modo a leitura se refere.
   *
   * O tipo tem um valor só de propósito: fonte de REDSEC não entra por
   * distração, e quem tentar acrescentar uma esbarra no compilador.
   */
  modo: 'multiplayer';
  /** O indício que prova o modo. Fonte que não deixa claro do que fala não entra. */
  escopo: string;
  /**
   * A que momento do jogo a leitura se refere.
   *
   * Fonte do lançamento não descreve o meta de hoje: entre uma coisa e outra
   * vieram quatro temporadas e o patch que mexeu em velocidade e recuo. Ela
   * entra pelo histórico, não para decidir posição.
   */
  janela: 'temporada-4' | 'lancamento';
}

export interface IndicacaoMeta {
  /** Id da arma em [WEAPONS]. */
  weapon: string;
  /** Por que ela aparece, na leitura da fonte. */
  porque: string;
  /** Índices em [FONTES] que citam esta arma. */
  fontes: number[];
}

export interface DestaqueCategoria {
  category: WeaponCategory;
  /** A arma que a fonte aponta como melhor da categoria. */
  melhor: IndicacaoMeta;
  /** Quem mais foi citado, sem ser o primeiro nome. */
  mencoes: IndicacaoMeta[];
}

/** Uma arma que o battle royale valoriza e o multiplayer, não. */
export interface ContrasteRedsec {
  /** Id da arma em [WEAPONS]. */
  weapon: string;
  /** Onde ela está no ranking do REDSEC. */
  redsec: string;
  /** Onde a mesma fonte a coloca no multiplayer. */
  multiplayer: string;
  /** O que explica a diferença. */
  nota: string;
}

export const FONTES: FonteMeta[] = [
  {
    nome: 'wzstats.gg — ranking do multiplayer',
    url: 'https://wzstats.gg/battlefield-6/multiplayer/meta',
    data: '2026-08-07',
    pais: 'INT',
    modo: 'multiplayer',
    escopo: 'Tem página só de multiplayer, separada das de REDSEC e de REDSEC Ranqueado, e ordena arma por arma dentro de cada classe.',
    janela: 'temporada-4',
  },
  {
    nome: 'TheGamer — melhores armas por classe',
    url: 'https://www.thegamer.com/battlefield-6-best-weapons-class-meta-smg-lmg-assault-rifle-sniper-dmr-season-4-guide/',
    data: '2026-08-03',
    pais: 'INT',
    modo: 'multiplayer',
    escopo: 'Diz a que se refere: "the best weapons you can use during Season 4 across all four classes in multiplayer".',
    janela: 'temporada-4',
  },
  {
    nome: 'KeenGamer — as cinco melhores da Temporada 4',
    url: 'https://www.keengamer.com/articles/guides/battlefield-6-season-4-meta-5-best-weapons-ranked/',
    data: '2026-07-24',
    pais: 'INT',
    modo: 'multiplayer',
    escopo: 'Julga o desempenho nos "multiplayer maps" da temporada, com Tsuru Reef como referência.',
    janela: 'temporada-4',
  },
  {
    nome: 'DTGRE — tier list das armas novas da Temporada 4',
    url: 'https://www.dtgre.com/2026/07/battlefield-6-season-4-best-weapons-tier-list-ef88-brod-3-vssm.html',
    data: '2026-07-22',
    pais: 'INT',
    modo: 'multiplayer',
    escopo: 'Ranqueia as três armas novas pelos mapas de multiplayer da temporada; não trata do battle royale.',
    janela: 'temporada-4',
  },
  {
    nome: 'Game Rant — armas do meta da Temporada 4',
    url: 'https://gamerant.com/battlefield-6-bf6-best-guns-weapons-meta-season-4-s4/',
    data: '2026-07-24',
    pais: 'INT',
    modo: 'multiplayer',
    escopo: 'Ordena pelos mapas grandes do multiplayer — Railway to Golmud e Tsuru Reef — e em nenhum momento fala de REDSEC.',
    janela: 'temporada-4',
  },
];

/** Quando esta lista foi revisada por aqui. */
export const ATUALIZADO_EM = '2026-08-07';

/** A temporada a que esta leitura se refere. */
export const TEMPORADA_DO_META = 4;

/**
 * O topo do multiplayer, sem separar por categoria.
 *
 * A ordem segue o ranking de multiplayer da fonte [0], e só entra quem tem ao
 * menos duas fontes concordando — foi o que deixou de fora a PP-19, a KORD 6P67
 * e a QBZ-192, que lideram suas classes ali mas nenhum guia ainda comentou.
 * Elas aparecem em [POR_CATEGORIA], onde uma fonte que ranqueia por classe
 * basta.
 */
export const DESTAQUES: IndicacaoMeta[] = [
  {
    weapon: 'm16a4',
    porque: 'A primeira colocada geral do multiplayer: recuo controlado, bala rápida e dano estável em qualquer distância.',
    fontes: [0, 2],
  },
  {
    weapon: 'b36a4',
    porque: 'Bullpup equilibrado, logo atrás da M16A4 — o maior potencial de eliminação entre os fuzis, na leitura das fontes.',
    fontes: [0, 4],
  },
  {
    weapon: 'drs-iar',
    porque: 'A metralhadora do momento: tempo para matar curto para o porte e alcance suficiente para segurar objetivo.',
    fontes: [0, 1, 4],
  },
  {
    weapon: 'sgx',
    porque: 'A submetralhadora agressiva de quem entra primeiro, e a mais citada da classe fora do battle royale.',
    fontes: [0, 1],
  },
  {
    weapon: 'pw5a3',
    porque: 'Equilíbrio entre manejo e controle no vão curto, sem o custo de mobilidade das opções mais pesadas.',
    fontes: [0, 4],
  },
  {
    weapon: 'm2010-esr',
    porque: 'O ferrolho de referência: bala veloz e poder de parada, com mobilidade para trocar de posição.',
    fontes: [0, 2, 4],
  },
  {
    weapon: 'sg-553r',
    porque: 'A carabina mais sólida da temporada — a segunda da classe no ranking e a primeira na leitura do guia.',
    fontes: [0, 1],
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
export const POR_CATEGORIA: DestaqueCategoria[] = [
  {
    category: 'ar',
    melhor: { weapon: 'm16a4', porque: 'Primeira da classe e do ranking geral do multiplayer.', fontes: [0, 2] },
    mencoes: [
      { weapon: 'b36a4', porque: 'Logo atrás, com o maior potencial de eliminação entre os fuzis.', fontes: [0, 4] },
      { weapon: 'kord-6p67', porque: 'Terceira da classe, e a primeira quando a briga é no vão longo.', fontes: [0] },
      {
        weapon: 'ef88',
        porque: 'A novidade da temporada: os guias a chamam de melhor do jogo, mas o ranking do multiplayer ainda a põe atrás das veteranas.',
        fontes: [2, 3, 4],
      },
    ],
  },
  {
    category: 'carbine',
    melhor: { weapon: 'qbz-192', porque: 'Primeira da classe no multiplayer, à frente da carabina que os guias preferem.', fontes: [0] },
    mencoes: [
      { weapon: 'sg-553r', porque: 'Segunda no ranking e primeira na leitura do guia — a diferença entre as duas é pequena.', fontes: [0, 1] },
      { weapon: 'brod-3', porque: 'A carabina nova, agressiva: para quem troca alcance por mobilidade.', fontes: [0, 3, 4] },
      { weapon: 'm4a1', porque: 'Mais fácil de dominar, e a preferida de quem joga na investida.', fontes: [0, 1, 2, 4] },
    ],
  },
  {
    category: 'smg',
    melhor: { weapon: 'pp-19', porque: 'Primeira da classe: carregador fundo e controle que sustenta a rajada longa.', fontes: [0] },
    mencoes: [
      { weapon: 'sgx', porque: 'Opção agressiva para quem entra primeiro.', fontes: [0, 1] },
      { weapon: 'pw5a3', porque: 'Equilíbrio entre manejo e controle no vão curto.', fontes: [0, 4] },
      { weapon: 'cz3a1', porque: 'Cadência altíssima e tiro sem visada muito bom — a favorita dos guias, quinta no ranking.', fontes: [0, 1, 4] },
    ],
  },
  {
    category: 'lmg',
    melhor: { weapon: 'drs-iar', porque: 'Tempo para matar rápido com alcance sólido — primeira da classe nas duas leituras.', fontes: [0, 1, 4] },
    mencoes: [
      { weapon: 'rpk-74m', porque: 'Controle firme com volume de fogo, para negar passagem em mapa aberto.', fontes: [0] },
      { weapon: 'l110', porque: 'A leve da classe, para quem quer volume de fogo sem perder o passo.', fontes: [0] },
      {
        weapon: 'kts100-mk8',
        porque: 'Cuidado: é a nº 1 do REDSEC e vive em lista de melhores, mas no multiplayer só a sexta da classe.',
        fontes: [0, 1, 2, 4],
      },
    ],
  },
  {
    category: 'dmr',
    melhor: { weapon: 'vssm', porque: 'A novidade da temporada assumiu a classe: supressor integrado e automático, para quem joga escondido.', fontes: [0, 1, 3, 4] },
    mencoes: [
      { weapon: 'm39-emr', porque: 'A semiautomática de sempre, segunda da classe.', fontes: [0] },
      { weapon: 'svdm', porque: 'Cadência consistente, mas o multiplayer a rebaixou — no REDSEC ela lidera a classe.', fontes: [0, 1] },
    ],
  },
  {
    category: 'sniper',
    melhor: { weapon: 'm2010-esr', porque: 'Bala veloz e poder de parada, com mobilidade entre posições.', fontes: [0, 2, 4] },
    mencoes: [
      { weapon: 'mini-scout', porque: 'A leve, para quem troca de posição o tempo todo.', fontes: [0, 1, 4] },
      { weapon: 'psr', porque: 'Terceira da classe, para o vão realmente longo.', fontes: [0] },
      { weapon: 'l115', porque: 'Ferrolho tradicional, e a primeira escolha do guia — quarta no ranking.', fontes: [0, 1] },
    ],
  },
  {
    category: 'shotgun',
    melhor: { weapon: 'm87a1', porque: 'A única escopeta no primeiro escalão do multiplayer, e com folga sobre as demais.', fontes: [0] },
    mencoes: [
      { weapon: 'm1014', porque: 'A semiautomática, para quem prefere o segundo tiro rápido ao dano do primeiro.', fontes: [0, 4] },
      { weapon: '18-5ks-k', porque: 'Terceira da classe, de bombeamento.', fontes: [0] },
    ],
  },
  {
    category: 'pistol',
    melhor: { weapon: 'vz-61', porque: 'A única secundária que o ranking do multiplayer coloca acima do escalão de baixo — é rajada, não pistola.', fontes: [0] },
    mencoes: [],
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
export const NAO_E_MULTIPLAYER: ContrasteRedsec[] = [
  {
    weapon: 'kts100-mk8',
    redsec: 'nº 1 geral',
    multiplayer: '6ª metralhadora',
    nota: 'Carregador grande e bala veloz valem mais quando a vida é maior e a munição vem do chão.',
  },
  {
    weapon: 'svdm',
    redsec: '1ª DMR',
    multiplayer: '3ª DMR',
    nota: 'A semiautomática rende no vão aberto do battle royale; no multiplayer a VSSM tomou o lugar.',
  },
  {
    weapon: 'ak-205',
    redsec: '2ª carabina',
    multiplayer: '6ª carabina',
    nota: 'Trocar alcance por mobilidade compensa menos quando o objetivo é fixo.',
  },
  {
    weapon: 'usg-90',
    redsec: '4ª submetralhadora',
    multiplayer: '9ª submetralhadora',
    nota: 'Sustenta bem a briga longa de esquadra, e perde para as de cadência alta no corredor.',
  },
];
