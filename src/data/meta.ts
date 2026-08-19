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

/**
 * As fontes, todas de multiplayer e todas de depois da 1.4.2.0.
 *
 * A leitura de agosto de 2026 trocou de lastro. O que sustentava as posições
 * antes eram guias editoriais — Game Rant, TheGamer, KeenGamer —, e foi de lá
 * que veio o erro que a tela publicou: a KTS100 MK8 como "melhor metralhadora
 * do multiplayer", quando ela é a primeira colocada geral do REDSEC e nem
 * aparece no pódio das metralhadoras do multiplayer. Guia que não diz de que
 * modo fala acaba descrevendo o battle royale, porque é dele que a maioria dos
 * vídeos e das tier lists trata.
 *
 * O que entra agora são três coisas que se conferem:
 *
 * 1. **O ranking que separa os modos.** O wzstats publica multiplayer, REDSEC e
 *    REDSEC Ranqueado em páginas diferentes, e é a página de multiplayer que
 *    decide posição aqui. É medição, não opinião.
 * 2. **O que a atualização mexeu.** As notas oficiais e o registro de
 *    balanceamento dizem, arma por arma, o que mudou — e, por serem exaustivas,
 *    também dizem o que *não* mudou.
 * 3. **A conversa da comunidade.** O fórum oficial da EA e os comunicados do
 *    Battlefield Comms mostram percepção e ação do estúdio. Percepção não vira
 *    posição no ranking: entra em [TRENDING], onde é exatamente o que se quer.
 *
 * As fontes 0 e 3 são o mesmo rastreador em páginas diferentes. Elas não contam
 * como duas publicações concordando — a página de classe está na lista porque é
 * a única que publica a ordem inteira, do 1º ao 11º fuzil, que o resumo corta.
 */
export const SOURCES: MetaSource[] = [
  {
    name: 'wzstats.gg — ranking do multiplayer',
    url: 'https://wzstats.gg/battlefield-6/multiplayer/meta',
    date: '2026-08-19',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Tem página só de multiplayer, separada das de REDSEC e de REDSEC Ranqueado, e ordena arma por arma dentro de cada classe.',
    timeframe: 'season-4',
  },
  {
    name: 'EA — Battlefield 6 Game Update 1.4.2.0',
    url: 'https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-game-update-1-4-2-0',
    date: '2026-08-18',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Notas oficiais da atualização em vigor. O REDSEC tem seção própria no texto, então a seção de armas citada aqui é a da partida comum.',
    timeframe: 'season-4',
  },
  {
    name: 'BF6 Balance Log — registro da 1.4.2.0',
    url: 'https://bf6balancelog.com/',
    date: '2026-08-14',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Transcreve o changelog oficial arma por arma, com os números que o resumo da imprensa corta — a mira de ferro da L115 de 5 para 15 pontos, por exemplo.',
    timeframe: 'season-4',
  },
  {
    name: 'wzstats.gg — fuzis de assalto no multiplayer',
    url: 'https://wzstats.gg/battlefield-6/multiplayer/best-gun/best-assault-rifles-in-battlefield',
    date: '2026-08-18',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Página de classe do mesmo rastreador, também só de multiplayer: publica a ordem completa dos onze fuzis, que a página de resumo corta no quinto.',
    timeframe: 'season-4',
  },
  {
    name: 'EA Forums — Match Trigger na EF88 e na BROD 3',
    url: 'https://forums.ea.com/idea/battlefield-6-bug-reports-en/match-trigger-on-ef88--brod-3-makes-them-brokenly-accurate-on-full-auto/13590818',
    date: '2026-08-19',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Relato no fórum oficial sobre o que a peça faz em partida: desliga o aumento de dispersão por tiro e baixa o recuo em três degraus. A data é a da leitura — a página não declara a de publicação.',
    timeframe: 'season-4',
  },
  {
    name: 'Battlefield Comms — Match Trigger desligado da EF88 e da BROD 3',
    url: 'https://steamcommunity.com/app/2807960/discussions/0/581677784229939742/',
    date: '2026-08-19',
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Comunicado oficial do estúdio: a peça saiu das duas armas enquanto a "interação não intencional" é investigada, e isso vale para o Gunsmith de quem joga a partida comum. A data é a da leitura.',
    timeframe: 'season-4',
  },
];

/** Quando esta lista foi revisada por aqui. */
export const UPDATED_AT = '2026-08-19';

/** A temporada a que esta leitura se refere. */
export const META_SEASON = 4;

/**
 * O topo do multiplayer, sem separar por categoria.
 *
 * Quem decide aqui é a popularidade: o quanto a arma está sendo escolhida e
 * recomendada agora. Isso se lê na posição do ranking de multiplayer da fonte
 * [0], na ordem completa da classe da fonte [3] — que mostra quanta folga há até
 * a seguinte — e em quantas fontes independentes repetem o mesmo nome. Como o
 * jogo não publica pick rate, "popular" é convergência de fonte, não número
 * medido; é por isso, também, que a ordem daqui é a do ranking e não a das
 * contas de TTK que o resto do site faz.
 *
 * O que a 1.4.2.0 fez com a arma entra no motivo como contexto: serve para quem
 * lê saber se a colocação foi confirmada depois do patch, e o caso mais forte é
 * o do changelog inteiro não citá-la, afirmação conferível justamente porque a
 * lista é exaustiva. Não é o que põe a arma na lista — mudança recente, por
 * maior que seja, é assunto de [TRENDING], que mede variação, não nível.
 */
export const HIGHLIGHTS: MetaPick[] = [
  {
    weapon: 'm16a4',
    reason: 'Primeira colocada geral e primeira entre os onze fuzis do multiplayer, e a 1.4.2.0 não encostou nela: a rajada de três segue matando a distância sem concorrente à altura.',
    sources: [0, 3],
  },
  {
    weapon: 'b36a4',
    reason: 'Segunda entre os fuzis: cadência menor que a da M16A4 — 720 contra 800 RPM — trocada por bala mais rápida e recuo bem mais fácil de segurar na automática.',
    sources: [0, 3],
  },
  {
    weapon: 'kord-6p67',
    reason: 'Terceira entre os fuzis e quarta no ranking geral: 900 RPM, a maior cadência da classe, para quem ganha a troca no primeiro segundo.',
    sources: [0, 3],
  },
  {
    weapon: 'pp-19',
    reason: 'Primeira submetralhadora e terceira colocada geral do multiplayer, com 53 tiros no carregador helicoidal — e nenhuma linha sobre ela no changelog da 1.4.2.0.',
    sources: [0, 2],
  },
  {
    weapon: 'drs-iar',
    reason: 'Primeira metralhadora e quinta colocada geral: maneja como fuzil e segura objetivo. A 1.4.2.0 manteve a posição por omissão — mexeu na RPK-74M, não nela.',
    sources: [0, 2],
  },
  {
    weapon: 'm2010-esr',
    reason: 'Primeiro ferrolho do multiplayer, e a 1.4.2.0 devolveu o que faltava: a Munição Match Grade parou de aplicar uma redução de dano que não era intencional.',
    sources: [0, 1],
  },
  {
    weapon: 'vssm',
    reason: 'Segue como a primeira DMR do multiplayer mesmo depois de a 1.4.2.0 tirar dos canos dela um modificador de recuo que não deveria existir e refazer os multiplicadores de dano em membro.',
    sources: [0, 1],
  },
];

/**
 * Armas que estão aparecendo mais na conversa ou no uso percebido.
 *
 * Trending não é sinônimo de meta: entra arma que ganhou adoção, hype ou uma
 * build nova mesmo quando ainda não há consenso de que seja a escolha mais
 * eficiente. A busca diária substitui esta lista quando grava `meta-live.json`.
 *
 * Nesta rodada tudo aqui tem data: a 1.4.2.0 subiu em 18/08, e o estúdio
 * desligou o Match Trigger fora do patch, por comunicado. São fatos, não
 * impressões — e é essa a diferença entre esta seção e uma lista de "o que anda
 * popular".
 */
export const TRENDING: TrendingPick[] = [
  {
    weapon: 'ef88',
    trend: 'match trigger desligado',
    reason: 'O estúdio tirou o Match Trigger da arma depois de jogadores mostrarem no fórum que a peça desliga o aumento de dispersão por tiro e derruba o recuo em três degraus, deixando a automática quase sem coice.',
    sources: [4, 5],
  },
  {
    weapon: 'brod-3',
    trend: 'perdeu a peça que a segurava',
    reason: 'A carabina caiu no mesmo comunicado: terceira da classe no multiplayer, agora precisa segurar o recuo sem o acessório que vinha carregando as montagens dela.',
    sources: [4, 5],
  },
  {
    weapon: 'interdictor',
    trend: 'chegou na 1.4.2.0',
    reason: 'Antimaterial de alcance extremo que entrou pelo Passe de Batalha na fase Top Gun, feita para tirar piloto de dentro da cabine — e por isso divide quem joga a pé de quem voa.',
    sources: [1, 2],
  },
  {
    weapon: 'svk-86',
    trend: 'munição match corrigida',
    reason: 'Dividiu com a M2010 ESR o acerto da Munição Match Grade, e é a via mais barata de aproveitá-lo: .338 semiautomático, dois tiros ao peito.',
    sources: [1, 2],
  },
  {
    weapon: 'l115',
    trend: 'mira de ferro de 5 para 15',
    reason: 'O custo do acessório de mira de ferro triplicou no patch, o que reabre a conta dos 100 pontos em toda montagem de ferrolho que contava com ela para sobrar orçamento.',
    sources: [2],
  },
];

/**
 * O melhor de cada categoria.
 *
 * Aqui a fonte [0] decide o primeiro nome, porque é a única que ordena arma por
 * arma dentro da classe e separando por modo. As notas do patch entram onde
 * mexeram na arma, e o fórum onde a comunidade tem algo a dizer que o ranking
 * não mostra.
 */
export const BY_CATEGORY: CategoryHighlight[] = [
  {
    category: 'ar',
    best: { weapon: 'm16a4', reason: 'Primeira da classe e do ranking geral do multiplayer.', sources: [0, 3] },
    mentions: [
      { weapon: 'b36a4', reason: 'Segunda: mais lenta e mais estável que a primeira colocada.', sources: [0, 3] },
      { weapon: 'kord-6p67', reason: 'Terceira aqui e primeira no REDSEC — a diferença entre os dois modos em uma arma só.', sources: [0, 3] },
      { weapon: 'nvo-228e', reason: 'Quarta: soco de três tiros no vão curto que degrada em degraus suaves.', sources: [3] },
      {
        weapon: 'ef88',
        reason: 'Quinta. A novidade da temporada não subiu mais que isso, e agora joga sem o Match Trigger que o estúdio desligou.',
        sources: [3, 5],
      },
    ],
  },
  {
    category: 'carbine',
    best: { weapon: 'qbz-192', reason: 'Primeira da classe no multiplayer: bullpup compacta com boa velocidade de bala para o tamanho.', sources: [0] },
    mentions: [
      { weapon: 'sg-553r', reason: 'Segunda aqui e primeira no REDSEC: três tiros de perto, com a bala mais lenta da classe.', sources: [0] },
      { weapon: 'brod-3', reason: 'Terceira, e a que mais perdeu com a retirada do Match Trigger.', sources: [0, 5] },
    ],
  },
  {
    category: 'smg',
    best: { weapon: 'pp-19', reason: 'Primeira da classe: carregador de 53 e controle que sustenta a rajada longa.', sources: [0] },
    mentions: [
      { weapon: 'sgx', reason: 'Segunda aqui e primeira no REDSEC — a bala mais lenta do arsenal cobra mira adiantada.', sources: [0] },
      { weapon: 'pw5a3', reason: 'Terceira: equilíbrio entre manejo e controle no vão curto.', sources: [0] },
    ],
  },
  {
    category: 'lmg',
    best: { weapon: 'drs-iar', reason: 'Primeira da classe: maneja como fuzil e é a única metralhadora no primeiro escalão do multiplayer.', sources: [0, 2] },
    mentions: [
      { weapon: 'rpk-74m', reason: 'Segunda: bala a 808 m/s e manejo próximo ao de um fuzil. A 1.4.2.0 só corrigiu uma pose de animação dela.', sources: [0, 2] },
      { weapon: 'l110', reason: 'Terceira, a leve da classe: volume de fogo sem perder o passo.', sources: [0] },
      {
        weapon: 'kts100-mk8',
        reason: 'Cuidado: é a primeira colocada geral do REDSEC e vive em lista de melhores, mas no multiplayer não chega ao pódio da própria classe.',
        sources: [0],
      },
    ],
  },
  {
    category: 'dmr',
    best: { weapon: 'vssm', reason: 'Primeira da classe: subsônica e silenciosa de fábrica, mesmo depois do acerto de recuo da 1.4.2.0.', sources: [0, 1] },
    mentions: [
      { weapon: 'm39-emr', reason: 'Segunda: a semiautomática de sempre.', sources: [0] },
      { weapon: 'svdm', reason: 'Primeira DMR do REDSEC, e aqui atrás das duas de cima.', sources: [0] },
      { weapon: 'svk-86', reason: 'Voltou ao dano pretendido com Munição Match Grade na 1.4.2.0.', sources: [1, 2] },
    ],
  },
  {
    category: 'sniper',
    best: { weapon: 'm2010-esr', reason: 'Primeiro da classe nos dois modos, e beneficiado direto pela correção da Munição Match Grade.', sources: [0, 1] },
    mentions: [
      { weapon: 'mini-scout', reason: 'Segundo: o leve, para quem troca de posição o tempo todo.', sources: [0] },
      { weapon: 'psr', reason: 'Terceiro, para o vão realmente longo.', sources: [0] },
      { weapon: 'l115', reason: 'A mira de ferro dele passou de 5 para 15 pontos no patch, e a conta dos 100 mudou junto.', sources: [2] },
      { weapon: 'interdictor', reason: 'Chegou na 1.4.2.0, pelo Passe de Batalha: alcance extremo, feito para alcançar piloto na cabine.', sources: [1, 2] },
    ],
  },
  {
    category: 'shotgun',
    best: { weapon: 'm87a1', reason: 'A única escopeta no primeiro escalão do multiplayer, e com folga sobre as demais.', sources: [0] },
    mentions: [
      { weapon: 'm1014', reason: 'A semiautomática, para quem prefere o segundo tiro rápido ao dano do primeiro.', sources: [0] },
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
 * As quatro saem da mesma leitura, do mesmo dia, no mesmo rastreador, em
 * páginas separadas por modo — é isso que faz a comparação valer. Elas explicam
 * por que boa parte das listas de "melhores armas do BF6" que circulam não
 * serve para quem joga Conquista: essas listas leem o REDSEC e não avisam.
 */
export const NOT_MULTIPLAYER: RedsecContrast[] = [
  {
    weapon: 'kts100-mk8',
    redsec: 'nº 1 geral',
    multiplayer: 'fora do pódio das metralhadoras',
    note: 'Carregador de 60 e bala a 808 m/s valem mais quando a vida é maior e a munição vem do chão.',
  },
  {
    weapon: 'vcr-2',
    redsec: '2º fuzil',
    multiplayer: '7º fuzil',
    note: 'Cadência alta em corpo curto rende na briga de esquadra; no objetivo fixo, a classe tem seis opções melhores.',
  },
  {
    weapon: 'sor-556-mk2',
    redsec: '3º fuzil',
    multiplayer: '8º fuzil',
    note: 'Recuo domado compensa quando o combate é longo e a munição é achada, não escolhida.',
  },
  {
    weapon: 'svdm',
    redsec: '1ª DMR',
    multiplayer: 'atrás da VSSM e da M39 EMR',
    note: 'A semiautomática rende no vão aberto do battle royale; no multiplayer a novidade subsônica da temporada tomou o lugar.',
  },
];
