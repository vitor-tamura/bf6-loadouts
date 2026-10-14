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
