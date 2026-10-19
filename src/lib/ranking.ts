import type { CategoryHighlight, MetaPick, MetaSource, RedsecContrast } from '@/data/meta';
import type { Weapon, WeaponCategory } from '@/data/types';

/**
 * O ranking inteiro de uma página que mede, como a leitura diária o grava.
 *
 * Sai de `rankingDaPagina` (scripts/meta/paginas.mjs), lido pelo código: a
 * ordem é a da página, e `categoryRank` é o "#k" que ela põe ao lado de cada
 * arma.
 */
export interface RankingEntry {
  weapon: string;
  category: WeaponCategory;
  categoryRank: number;
  overall: number;
}

export interface Ranking {
  name: string;
  url: string;
  date: string;
  entries: RankingEntry[];
}

export interface DailyRanking {
  multiplayer: Ranking;
  redsec?: Ranking;
}

/** A ordem das categorias na tela, a mesma da curadoria escrita à mão. */
const ORDEM: WeaponCategory[] = ['ar', 'carbine', 'smg', 'lmg', 'dmr', 'sniper', 'shotgun', 'pistol'];

/** Quantas armas além da primeira cada categoria mostra. */
const MENCOES = 3;

/**
 * A fonte do ranking na lista de fontes da tela, por endereço.
 *
 * A leitura do dia costuma já citar a página do ranking — ela sustenta os
 * picks. Quando não cita, a página entra no fim, e o colchete aponta para ela.
 */
export function indiceDaFonte(
  fontes: MetaSource[],
  ranking: Ranking,
  { temporada }: { temporada: number },
): { fontes: MetaSource[]; indice: number } {
  const semBarra = (url: string) => url.replace(/\/+$/, '');
  const indice = fontes.findIndex((fonte) => semBarra(fonte.url) === semBarra(ranking.url));
  if (indice !== -1) return { fontes, indice };

  const fonte: MetaSource = {
    name: ranking.name,
    url: ranking.url,
    date: ranking.date,
    country: 'INT',
    mode: 'multiplayer',
    scope: 'Página só de multiplayer, separada da de REDSEC: ordena as armas no geral e dentro de cada classe.',
    timeframe: `season-${temporada}`,
  };
  return { fontes: [...fontes, fonte], indice: fontes.length };
}

/**
 * O meta por categoria a partir do ranking do dia.
 *
 * Primeira da classe em destaque e as três seguintes como menção. Arma da
 * temporada em curso que o ranking ainda não classificou entra no fim da
 * categoria dela, dita como tal: é a pergunta que todo mundo faz na primeira
 * semana, e a resposta honesta é que ninguém mediu ainda.
 */
export function categoriasDoRanking(
  ranking: Ranking,
  {
    fonte,
    temporada,
    armas,
  }: { fonte: number; temporada: number; armas: Pick<Weapon, 'id' | 'category' | 'season'>[] },
): CategoryHighlight[] {
  const ranqueadas = new Set(ranking.entries.map((e) => e.weapon));

  return ORDEM.flatMap((categoria) => {
    const daClasse = ranking.entries
      .filter((e) => e.category === categoria)
      .sort((a, b) => a.categoryRank - b.categoryRank || a.overall - b.overall);
    const novas = armas.filter((a) => a.category === categoria && a.season === temporada && !ranqueadas.has(a.id));
    if (!daClasse.length && !novas.length) return [];

    const pick = (entrada: RankingEntry, i: number): MetaPick => ({
      weapon: entrada.weapon,
      reason:
        i === 0
          ? `Primeira da classe no ranking do multiplayer, ${entrada.overall}ª no geral.`
          : `${entrada.categoryRank}ª da classe, ${entrada.overall}ª no geral.`,
      sources: [fonte],
    });
    const nova = (arma: Pick<Weapon, 'id'>): MetaPick => ({
      weapon: arma.id,
      reason: `Nova na Temporada ${temporada}: o ranking do multiplayer ainda não a classificou.`,
      sources: [],
    });

    const [primeira, ...resto] = daClasse;
    const best = primeira ? pick(primeira, 0) : nova(novas[0]);
    const mentions = [
      ...resto.slice(0, MENCOES).map((entrada, i) => pick(entrada, i + 1)),
      ...(primeira ? novas : novas.slice(1)).map(nova),
    ];
    return [{ category: categoria, best, mentions }];
  });
}

const PLURAL: Record<WeaponCategory, string> = {
  ar: 'fuzis',
  carbine: 'carabinas',
  smg: 'submetralhadoras',
  lmg: 'metralhadoras',
  dmr: 'DMRs',
  sniper: 'rifles de precisão',
  shotgun: 'escopetas',
  pistol: 'secundárias',
  melee: 'armas brancas',
};

/** Quantas entradas do topo do REDSEC entram na comparação. */
const TOPO_DO_REDSEC = 20;
const MAX_CONTRASTES = 4;

/**
 * As armas que o REDSEC põe bem mais alto que o multiplayer, na mesma fonte.
 *
 * Entra a arma do topo do battle royale que, no multiplayer, cai pelo menos
 * duas posições dentro da própria classe — comparação de classe com classe,
 * porque é o "#k" que as duas páginas publicam do mesmo jeito.
 */
export function contrasteRedsec(ranking: DailyRanking): RedsecContrast[] {
  if (!ranking.redsec) return [];
  const noMultiplayer = new Map(ranking.multiplayer.entries.map((e) => [e.weapon, e]));

  return ranking.redsec.entries
    .slice(0, TOPO_DO_REDSEC)
    .flatMap((br) => {
      const mp = noMultiplayer.get(br.weapon);
      if (mp && mp.categoryRank - br.categoryRank < 2) return [];
      const classe = PLURAL[br.category];
      const aFrente = mp ? mp.categoryRank - 1 : null;
      return [
        {
          weapon: br.weapon,
          redsec: br.overall === 1 ? 'nº 1 geral' : `nº ${br.categoryRank} entre ${classe}`,
          multiplayer: mp ? `nº ${mp.categoryRank} entre ${classe}` : 'fora do ranking',
          note: mp
            ? `${br.overall}ª no geral do battle royale; no multiplayer, ${aFrente} ${aFrente === 1 ? 'arma' : 'armas'} da classe ficam à frente.`
            : `${br.overall}ª no geral do battle royale, e o ranking do multiplayer nem a lista.`,
        },
      ];
    })
    .slice(0, MAX_CONTRASTES);
}

/* ========================================================================== *
 * O ranking ao longo dos dias
 * ========================================================================== */

/** A ordem do ranking do multiplayer num dia, gravada pela leitura diária. */
export interface RankingSnapshot {
  date: string;
  order: string[];
}

export interface RankingHistory {
  multiplayer: RankingSnapshot[];
}

/** Quanto uma arma andou no ranking. Positivo é subida. */
export interface Movimento {
  /** Posição de hoje, 1 em diante. */
  posicao: number;
  /** Desde a leitura anterior; `null` quando não há leitura anterior. */
  desdeOntem: number | null;
  /** Desde a leitura de uma semana atrás (ou a mais antiga que houver). */
  naSemana: number | null;
  /** O dia da leitura contra a qual `naSemana` foi medido. */
  semanaDesde: string | null;
  /** A arma não estava no ranking da leitura anterior. */
  entrou: boolean;
  /** Há quantas leituras seguidas ela está nesta mesma posição, contando hoje. */
  leiturasNaPosicao: number;
}

const DIA_MS = 86_400_000;

/** As leituras até `on`, da mais antiga para a mais nova, uma por dia. */
function ate(historico: RankingSnapshot[], on: string): RankingSnapshot[] {
  const porDia = new Map<string, RankingSnapshot>();
  for (const leitura of historico) if (leitura.date <= on) porDia.set(leitura.date, leitura);
  return [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Quanto uma arma subiu ou caiu, contra ontem e contra a semana.
 *
 * O topo é o ranking de um rastreador, e ele anda devagar: na primeira semana
 * da Temporada 5 só a B36A4 e a M16A4 trocaram de lugar, e a tela parecia
 * parada mesmo com a leitura rodando todo dia. Dizer o movimento — inclusive
 * "a mesma posição há cinco leituras" — é o que mostra que a lista foi relida.
 */
export function movimentoNoRanking(historico: RankingSnapshot[], arma: string, on: string): Movimento | null {
  const leituras = ate(historico, on);
  const hoje = leituras.at(-1);
  if (!hoje) return null;
  const posicao = hoje.order.indexOf(arma) + 1;
  if (!posicao) return null;

  const posEm = (leitura: RankingSnapshot | undefined) => {
    if (!leitura) return null;
    const i = leitura.order.indexOf(arma);
    return i === -1 ? null : i + 1;
  };

  const anterior = leituras.at(-2);
  const ontem = posEm(anterior);

  const limite = new Date(Date.parse(`${hoje.date}T12:00:00Z`) - 7 * DIA_MS).toISOString().slice(0, 10);
  const daSemana = [...leituras].reverse().find((l) => l.date <= limite) ?? (leituras.length > 1 ? leituras[0] : undefined);
  const semana = posEm(daSemana);

  let leiturasNaPosicao = 0;
  for (const leitura of [...leituras].reverse()) {
    if (posEm(leitura) !== posicao) break;
    leiturasNaPosicao += 1;
  }

  return {
    posicao,
    desdeOntem: ontem === null ? null : ontem - posicao,
    naSemana: semana === null ? null : semana - posicao,
    semanaDesde: daSemana?.date ?? null,
    entrou: Boolean(anterior) && ontem === null,
    leiturasNaPosicao,
  };
}

/**
 * Quem mais subiu no ranking inteiro desde a leitura de uma semana atrás, e
 * quem entrou nele. É a parte do ranking que muda de um dia para o outro.
 */
export function subidasNoRanking(
  historico: RankingSnapshot[],
  on: string,
  { minimo = 2, max = 4 }: { minimo?: number; max?: number } = {},
): { weapon: string; movimento: Movimento }[] {
  const hoje = ate(historico, on).at(-1);
  if (!hoje) return [];
  return hoje.order
    .map((weapon) => ({ weapon, movimento: movimentoNoRanking(historico, weapon, on)! }))
    .filter(({ movimento }) => {
      if (!movimento) return false;
      const novaNaSemana = movimento.naSemana === null && movimento.semanaDesde !== null;
      return (movimento.naSemana ?? 0) >= minimo || movimento.entrou || novaNaSemana;
    })
    .sort((a, b) => (b.movimento.naSemana ?? 99) - (a.movimento.naSemana ?? 99) || a.movimento.posicao - b.movimento.posicao)
    .slice(0, max);
}

/**
 * O topo do dia, na ordem do ranking do dia.
 *
 * O texto de cada cartão continua sendo o da leitura do modelo quando a arma
 * é a mesma. Mas a ordem e as armas são as do ranking: quando o modelo falha e
 * a rotina grava só o ranking (`gravarSoORanking`), o topo seguia com a lista
 * de ontem enquanto as categorias, logo abaixo, já mostravam a de hoje.
 */
export function topoDoDia(picks: MetaPick[], ranking: Ranking, fonte: number, quantas = 8): MetaPick[] {
  const daLeitura = new Map(picks.map((pick) => [pick.weapon, pick]));
  return ranking.entries.slice(0, quantas).map(
    (entrada) =>
      daLeitura.get(entrada.weapon) ?? {
        weapon: entrada.weapon,
        reason: `${entrada.overall}ª no ranking geral do multiplayer e ${entrada.categoryRank}ª da classe.`,
        sources: [fonte],
      },
  );
}
