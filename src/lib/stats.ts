import { ATTACHMENTS_BY_ID } from '@/data/attachments';
import { POINT_BUDGET } from '@/data/classes';
import type { Attachment, Weapon, StatKey, DamageStep, Modifier } from '@/data/types';

/**
 * Combina uma arma com os acessórios escolhidos e devolve as estatísticas
 * resultantes.
 *
 * Ordem de aplicação, fixa para que o resultado nunca dependa da ordem em que o
 * jogador montou a arma:
 *   1. somam-se todos os `add`;
 *   2. multiplicam-se todos os `mult`;
 *   3. o resultado é limitado ao intervalo válido da estatística.
 */

export interface EffectiveStats {
  damage: DamageStep[];
  pellets: number;
  rpm: number;
  velocity: number;
  drag: number;
  headshot: number;
  magazine: number;
  reload: number;
  emptyReload: number;
  adsMs: number;
  swapMs: number;
  accuracy: number;
  control: number;
  mobility: number;
  hipfire: number;
  verticalRecoil: number;
  horizontalRecoil: number;
}

/** Estatísticas com barra de 0 a 100 na interface. */
const CLAMPED_STATS: StatKey[] = ['accuracy', 'control', 'mobility', 'hipfire'];

/** Estatísticas em que um valor MENOR é melhor para o jogador. */
export const LOWER_IS_BETTER: Set<keyof EffectiveStats> = new Set([
  'adsMs',
  'swapMs',
  'reload',
  'emptyReload',
  'verticalRecoil',
  'horizontalRecoil',
]);

function applyMods(base: number, mods: Modifier[], clamp: boolean): number {
  let value = base;
  for (const m of mods) if (m.add !== undefined) value += m.add;
  for (const m of mods) if (m.mult !== undefined) value *= m.mult;
  if (clamp) return Math.max(0, Math.min(100, value));
  return Math.max(0, value);
}

function modsForKey(attachments: Attachment[], statKey: StatKey): Modifier[] {
  const list: Modifier[] = [];
  for (const a of attachments) {
    const m = a.mods[statKey];
    if (m) list.push(m);
  }
  return list;
}

/** Resolve ids de acessório em objetos, descartando silenciosamente os que não existem. */
export function resolveAttachments(ids: (string | undefined | null)[]): Attachment[] {
  const list: Attachment[] = [];
  for (const id of ids) {
    if (!id) continue;
    const a = ATTACHMENTS_BY_ID.get(id);
    if (a) list.push(a);
  }
  return list;
}

export function calculateStats(weapon: Weapon, attachments: Attachment[]): EffectiveStats {
  const stat = (statKey: StatKey, base: number) =>
    applyMods(base, modsForKey(attachments, statKey), CLAMPED_STATS.includes(statKey));

  const damageMods = modsForKey(attachments, 'damage');
  const rangeMods = modsForKey(attachments, 'range');

  const damage: DamageStep[] = weapon.damage.map((step) => ({
    damage: applyMods(step.damage, damageMods, false),
    // O primeiro degrau começa sempre no cano da arma; mexer nele não faria sentido.
    distance: step.distance === 0 ? 0 : applyMods(step.distance, rangeMods, false),
  }));

  const magazine = Math.max(1, Math.round(stat('magazine', weapon.magazine)));
  const reload = stat('reload', weapon.reload);

  return {
    damage,
    pellets: weapon.pellets,
    rpm: Math.round(stat('rpm', weapon.rpm)),
    velocity: stat('velocity', weapon.velocity),
    drag: weapon.drag,
    headshot: weapon.headshot,
    magazine,
    reload,
    // A recarga com a arma vazia acompanha proporcionalmente a recarga tática.
    emptyReload: weapon.reload > 0 ? (reload / weapon.reload) * weapon.emptyReload : 0,
    adsMs: stat('adsMs', weapon.adsMs),
    swapMs: stat('swapMs', weapon.swapMs),
    accuracy: stat('accuracy', weapon.accuracy),
    control: stat('control', weapon.control),
    mobility: stat('mobility', weapon.mobility),
    hipfire: stat('hipfire', weapon.hipfire),
    verticalRecoil: stat('verticalRecoil', weapon.verticalRecoil),
    horizontalRecoil: stat('horizontalRecoil', weapon.horizontalRecoil),
  };
}

/** Estatísticas da arma sem nenhum acessório — a referência para os deltas. */
export function baseStats(weapon: Weapon): EffectiveStats {
  return calculateStats(weapon, []);
}

export interface Budget {
  spent: number;
  total: number;
  remaining: number;
  overBudget: boolean;
}

export function calculateBudget(attachments: Attachment[]): Budget {
  const spent = attachments.reduce((soma, a) => soma + a.cost, 0);
  return {
    spent,
    total: POINT_BUDGET,
    remaining: POINT_BUDGET - spent,
    overBudget: spent > POINT_BUDGET,
  };
}

/**
 * Um acessório só pode ser encaixado se couber no que sobrou do orçamento —
 * descontando o que já ocupa o mesmo slot, que será substituído.
 */
export function fitsBudget(
  candidate: Attachment,
  currentAttachments: Attachment[],
): boolean {
  const replaced = currentAttachments.find((a) => a.slot === candidate.slot);
  const spent = currentAttachments.reduce((soma, a) => soma + a.cost, 0);
  const newSpend = spent - (replaced?.cost ?? 0) + candidate.cost;
  return newSpend <= POINT_BUDGET;
}

export interface Delta {
  base: number;
  effective: number;
  difference: number;
  /** Percentual de variação, útil para colorir a barra. */
  percent: number;
  /** `true` quando a mudança favorece o jogador. */
  improves: boolean;
  changed: boolean;
}

export function compareStat(
  statKey: keyof EffectiveStats,
  base: number,
  effective: number,
): Delta {
  const difference = effective - base;
  const changed = Math.abs(difference) > 1e-6;
  const lowerIsBetter = LOWER_IS_BETTER.has(statKey);
  return {
    base,
    effective,
    difference,
    percent: base === 0 ? 0 : (difference / base) * 100,
    improves: lowerIsBetter ? difference < 0 : difference > 0,
    changed,
  };
}

/** Se algum número exibido veio de curadoria, a interface avisa. */
export function hasApproximateValue(weapon: Weapon, attachments: Attachment[]): boolean {
  return weapon.provenance === 'curado' || attachments.some((a) => a.provenance === 'curado');
}
