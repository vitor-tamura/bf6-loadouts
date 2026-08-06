import type { WeaponCategory } from './types';

/**
 * O meta da temporada, por curadoria.
 *
 * Não existe fonte pública de uso real: a API do gametools só serve estatística
 * por jogador, e os endpoints agregados de arma existem para BF1, BF3, BF4 e
 * BFV, não para o 6. O tracker.gg tem os números, mas não publica API.
 *
 * Então isto aqui é o que a comunidade escreve, não o que alguém mediu — e a
 * tela precisa dizer isso com todas as letras. Cada indicação cita de onde veio
 * e quando, para o leitor julgar a idade da opinião.
 *
 * Para atualizar: troque `atualizadoEm`, revise as listas e acrescente a fonte
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

export const FONTES: FonteMeta[] = [
  {
    nome: 'Critical Hits — armas ranqueadas, tier list completa',
    url: 'https://criticalhits.com.br/dicas/battlefield-6-lista-de-armas-ranqueadas-tier-list-completa/',
    data: '2025-10-14',
    pais: 'BR',
    janela: 'lancamento',
  },
  {
    nome: 'Omelete — as melhores armas do jogo',
    url: 'https://www.omelete.com.br/games/battlefield-6-confira-melhores-armas-do-jogo',
    data: '2025-10-14',
    pais: 'BR',
    janela: 'lancamento',
  },
  {
    nome: 'TheGamer — melhores armas por classe',
    url: 'https://www.thegamer.com/battlefield-6-best-weapons-class-meta-smg-lmg-assault-rifle-sniper-dmr-season-4-guide/',
    data: '2026-08-03',
    pais: 'INT',
    janela: 'temporada-4',
  },
  {
    nome: 'KeenGamer — as cinco melhores da Temporada 4',
    url: 'https://www.keengamer.com/articles/guides/battlefield-6-season-4-meta-5-best-weapons-ranked/',
    data: '2026-07-24',
    pais: 'INT',
    janela: 'temporada-4',
  },
  {
    nome: 'Nerdschalk — meta e loadouts da Temporada 4',
    url: 'https://nerdschalk.com/battlefield-6-season-4-meta-weapons-tier-list-and-best-loadouts/',
    data: '2026-07-22',
    pais: 'INT',
    janela: 'temporada-4',
  },
  {
    nome: 'DTGRE — tier list das armas novas da Temporada 4',
    url: 'https://www.dtgre.com/2026/07/battlefield-6-season-4-best-weapons-tier-list-ef88-brod-3-vssm.html',
    data: '2026-07-22',
    pais: 'INT',
    janela: 'temporada-4',
  },
];

/** Quando esta lista foi revisada por aqui. */
export const ATUALIZADO_EM = '2026-08-06';

/** A temporada a que esta leitura se refere. */
export const TEMPORADA_DO_META = 4;

/**
 * As mais citadas, sem separar por categoria.
 *
 * A ordem segue quantas fontes citam a arma e quão alto ela aparece em cada
 * uma: a EF88 abre a lista porque duas fontes a põem em primeiro, e a M16A4
 * vem logo atrás por ser primeira em uma e segunda em outra.
 */
export const DESTAQUES: IndicacaoMeta[] = [
  {
    weapon: 'ef88',
    porque: 'A novidade que encara as veteranas: recuo previsível, alcance médio-longo confiável e a curva de aprendizado mais curta da temporada.',
    fontes: [3, 5],
  },
  {
    weapon: 'm16a4',
    porque: 'Recuo controlado, bala rápida e dano estável em qualquer distância — o pacote mais completo entre as veteranas.',
    fontes: [3, 4],
  },
  {
    weapon: 'm4a1',
    porque: 'A carabina de investida: mobilidade para tomar objetivo e resposta boa no médio-curto.',
    fontes: [0, 1, 3, 4],
  },
  {
    weapon: 'kts100-mk8',
    porque: 'Carregador grande e bala veloz: sustenta a defesa de objetivo em área aberta.',
    fontes: [3],
  },
  {
    weapon: 'rpk-74m',
    porque: 'A metralhadora que mais aparece nas listas: controle firme com volume de fogo.',
    fontes: [4],
  },
  {
    weapon: 'm2010-esr',
    porque: 'Bala veloz e poder de parada — permite trocar de posição sem perder o domínio do vão longo.',
    fontes: [0, 3],
  },
  {
    weapon: 'b36a4',
    porque: 'Bullpup equilibrado com o maior potencial de eliminação entre os fuzis, na leitura da fonte.',
    fontes: [4],
  },
];

/**
 * O melhor de cada categoria.
 *
 * Escopo do que a fonte cobre: escopeta e pistola ficam de fora porque nenhuma
 * das listas consultadas as ranqueia — inventar posição ali seria opinião
 * disfarçada de leitura.
 */
export const POR_CATEGORIA: DestaqueCategoria[] = [
  {
    category: 'ar',
    melhor: { weapon: 'tr-7', porque: 'Tempo para matar curto, boa mobilidade e cadência alta.', fontes: [2] },
    mencoes: [{ weapon: 'm433', porque: 'A alternativa de cadência ainda maior no vão curto.', fontes: [2] }],
  },
  {
    category: 'carbine',
    melhor: { weapon: 'sg-553r', porque: 'A carabina mais sólida da temporada na leitura da fonte.', fontes: [2] },
    mencoes: [
      { weapon: 'm4a1', porque: 'Mais fácil de dominar, e a preferida de quem joga na investida.', fontes: [2, 3, 4] },
      { weapon: 'brod-3', porque: 'A carabina nova, agressiva: para quem troca alcance por mobilidade.', fontes: [5] },
    ],
  },
  {
    category: 'smg',
    melhor: { weapon: 'cz3a1', porque: 'Cadência altíssima e tiro sem visada muito bom.', fontes: [2] },
    mencoes: [
      { weapon: 'scw-10', porque: 'Equilíbrio entre manejo e controle no vão curto.', fontes: [2] },
      { weapon: 'sgx', porque: 'Opção agressiva para quem entra primeiro — já era tier S no lançamento.', fontes: [0, 2] },
    ],
  },
  {
    category: 'lmg',
    melhor: { weapon: 'drs-iar', porque: 'Tempo para matar rápido com alcance sólido.', fontes: [2] },
    mencoes: [
      { weapon: 'kts100-mk8', porque: 'Carregador grande e bala veloz para segurar objetivo.', fontes: [2, 3] },
      { weapon: 'm123k', porque: 'Volume de fogo para negar passagem.', fontes: [2] },
    ],
  },
  {
    category: 'dmr',
    melhor: { weapon: 'svdm', porque: 'Cadência consistente, o que mais importa no semiautomático.', fontes: [2] },
    mencoes: [
      { weapon: 'vssm', porque: 'A novidade da temporada: supressor integrado e automático, para quem joga escondido.', fontes: [2, 5] },
    ],
  },
  {
    category: 'sniper',
    melhor: { weapon: 'l115', porque: 'Ferrolho tradicional, excelente no vão longo.', fontes: [2] },
    mencoes: [
      { weapon: 'm2010-esr', porque: 'Bala veloz e mobilidade entre posições.', fontes: [3] },
      { weapon: 'mini-scout', porque: 'A leve, para quem troca de posição o tempo todo.', fontes: [2] },
    ],
  },
];
