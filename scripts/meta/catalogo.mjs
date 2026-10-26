/**
 * Os números do próprio catálogo, como uma página a mais do material do topo.
 *
 * O topo copiava o ranking do wzstats, e o ranking quase não anda: entre 15 e
 * 25/10 as oito primeiras ficaram nas mesmas posições, e a tela dizia "= 10d"
 * em todos os cartões. As armas novas da temporada nem entravam — o rastreador
 * ainda não as mediu, e "fonte que mede" era só ele.
 *
 * O site tem a outra metade da resposta: dano por distância, cadência, tiros e
 * tempo para eliminar, calculados dos mesmos números que o montador usa. Com
 * eles no material, o modelo deixa de transcrever o ranking e passa a julgar —
 * parte da ordem do rastreador e a corrige onde o patch e os números sustentam,
 * inclusive para a arma que chegou ontem.
 *
 * É gerada pelo código, como o ranking: o modelo lê, não calcula.
 */

import { WEAPONS } from '../../src/data/weapons.ts';
import { effectiveRange, shotsToKill, timeToKill } from '../../src/lib/ballistics.ts';

/** O endereço com que a página entra nas fontes da tela. */
export const CATALOGO = {
  name: 'Arsenal BF6 — números do catálogo',
  url: 'https://bf6-loadouts.vercel.app/armas',
  scope:
    'Números do próprio site, dos arquivos do jogo e da curadoria: dano por distância, cadência, tiros e tempo para eliminar. Medição, não opinião.',
};

const CATEGORIA = {
  ar: 'fuzil',
  carbine: 'carabina',
  smg: 'submetralhadora',
  lmg: 'metralhadora',
  dmr: 'DMR',
  sniper: 'rifle de precisão',
  shotgun: 'escopeta',
  pistol: 'secundária',
};

/** As distâncias em que o motivo costuma decidir: perto, médio, longe. */
const DISTANCIAS = [10, 30, 50];

/** Quantas armas do topo do ranking entram, além das novas da temporada. */
const DO_RANKING = 16;

const ms = (valor) => (Number.isFinite(valor) ? `${Math.round(valor)} ms` : '—');

/** Uma linha por arma: o ranking, o movimento na semana e os números do catálogo. */
export function linhaDaArma(arma, { entrada = null, naSemana = null, temporada = null, finity = null } = {}) {
  const porDistancia = DISTANCIAS.map((d) => {
    const tiros = shotsToKill(arma, d);
    return `${d} m: ${Number.isFinite(tiros) ? tiros : '—'} tiros, ${tiros === 1 ? 'um tiro' : ms(timeToKill(arma, d))}`;
  }).join('; ');

  const ranking = entrada
    ? `wzstats: ${entrada.overall}º geral e ${entrada.categoryRank}º da classe${
        naSemana ? ` (${naSemana > 0 ? '▲' : '▼'}${Math.abs(naSemana)} na semana)` : ''
      }`
    : 'fora do ranking do wzstats';
  const noBattlefinity = finity
    ? `; battlefinity: ${finity.overall}º, tier ${finity.tier}, ${String(finity.pickRate).replace('.', ',')}% de escolha`
    : '';

  // Arma nova sai de ficha pública e de arma parecida, sem conferência em jogo.
  const marcas = arma.season === temporada ? [`nova na Temporada ${temporada}`, 'números ainda não conferidos em jogo'] : [];

  return `- ${arma.name} (${CATEGORIA[arma.category] ?? arma.category}) — ${ranking}${noBattlefinity}. ${arma.rpm} RPM; ${porDistancia}; mantém os tiros do vão curto até ${effectiveRange(arma)} m; bala a ${arma.velocity} m/s; carregador de ${arma.magazine}${marcas.length ? ` [${marcas.join(', ')}]` : ''}.`;
}

/**
 * A página do catálogo para o material do dia.
 *
 * Entram as dezesseis primeiras do ranking e todas as armas da temporada em
 * curso — estas são exatamente as que o rastreador ainda não sabe julgar.
 */
export function paginaDoCatalogo({ ranking = null, battlefinity = null, historico = [], temporada = null, hoje }) {
  const entradas = new Map((ranking?.entries ?? []).map((e) => [e.weapon, e]));
  const doFinity = new Map((battlefinity?.entries ?? []).map((e) => [e.weapon, e]));
  const ids = [
    ...(ranking?.entries ?? []).slice(0, DO_RANKING).map((e) => e.weapon),
    ...(battlefinity?.entries ?? []).slice(0, DO_RANKING).map((e) => e.weapon),
    ...WEAPONS.filter((a) => a.season === temporada).map((a) => a.id),
  ];

  // Posição de uma semana atrás, da leitura mais antiga até sete dias antes.
  const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const semanaPassada = [...historico].reverse().find((l) => l.date <= limite) ?? historico[0];

  const linhas = [...new Set(ids)]
    .map((id) => WEAPONS.find((a) => a.id === id))
    .filter((arma) => arma && arma.category !== 'melee')
    .map((arma) => {
      const entrada = entradas.get(arma.id) ?? null;
      const antes = semanaPassada?.order.indexOf(arma.id) ?? -1;
      const naSemana = entrada && antes !== -1 ? antes + 1 - entrada.overall : null;
      return linhaDaArma(arma, { entrada, naSemana, temporada, finity: doFinity.get(arma.id) ?? null });
    });

  if (!linhas.length) return null;

  return {
    ...CATALOGO,
    date: hoje,
    texto: [
      'Tiros e tempo para eliminar um alvo de 100 de vida, sem acessório, no corpo. As posições são as dos dois rastreadores nesta leitura.',
      ...linhas,
    ].join('\n'),
  };
}

/**
 * O ranking do battlefinity como página do material, já lido pelo código.
 *
 * Uma linha por arma, na ordem do site: tier e taxa de escolha. As trinta
 * primeiras bastam — abaixo disso a taxa é de fração de ponto.
 */
export function paginaDoBattlefinity(ranking, { hoje }) {
  if (!ranking?.entries?.length) return null;
  const nome = new Map(WEAPONS.map((a) => [a.id, a.name]));
  return {
    name: ranking.name,
    url: ranking.url,
    date: hoje,
    scope:
      'Meta do multiplayer do battlefinity: tier da melhor montagem de cada arma (julgamento de força) e ordem pela taxa de escolha entre os jogadores que o site acompanha.',
    texto: ranking.entries
      .slice(0, 30)
      .map(
        (e) =>
          `${e.overall}. ${nome.get(e.weapon) ?? e.weapon} — tier ${e.tier}, ${String(e.pickRate).replace('.', ',')}% de escolha, ${e.categoryRank}º da classe (${CATEGORIA[e.category] ?? e.category})`,
      )
      .join('\n'),
  };
}
