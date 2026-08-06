import type { EffectiveStats } from './stats';

/**
 * Balística: dano por distância, tiros e tempo para eliminar, e queda do
 * projétil.
 *
 * O jogo trata a queda de dano em degraus — cada degrau vale da sua distância
 * até o próximo. A trajetória usa arrasto proporcional à velocidade, que tem
 * solução fechada e roda barato o suficiente para redesenhar a cada acessório
 * encaixado.
 */

export const FULL_HEALTH = 100;
const GRAVITY = 9.81;
/** Calibra o arrasto para que as quedas batam com o que se vê em jogo. */
const DRAG_COEFFICIENT = 0.0006;

export function damageAtDistance(stats: EffectiveStats, distance: number): number {
  let current = stats.damage[0]?.damage ?? 0;
  for (const step of stats.damage) {
    if (distance >= step.distance) current = step.damage;
    else break;
  }
  return current;
}

/** Dano de um disparo completo — escopetas somam todos os projéteis. */
export function damagePerShot(stats: EffectiveStats, distance: number): number {
  return damageAtDistance(stats, distance) * stats.pellets;
}

/** Tiros necessários para eliminar um alvo de 100 de vida. */
export function shotsToKill(
  stats: EffectiveStats,
  distance: number,
  head = false,
): number {
  const damage = damagePerShot(stats, distance) * (head ? stats.headshot : 1);
  if (damage <= 0) return Infinity;
  return Math.ceil(FULL_HEALTH / damage);
}

/**
 * Tempo para eliminar, em milissegundos. Só conta os intervalos ENTRE disparos:
 * o primeiro tiro sai no instante zero.
 */
export function timeToKill(
  stats: EffectiveStats,
  distance: number,
  head = false,
): number {
  const shots = shotsToKill(stats, distance, head);
  if (!Number.isFinite(shots) || stats.rpm <= 0) return Infinity;
  return (shots - 1) * (60_000 / stats.rpm);
}

/** Intervalo entre dois disparos, em milissegundos. */
export function shotInterval(stats: EffectiveStats): number {
  return stats.rpm > 0 ? 60_000 / stats.rpm : 0;
}

/** Dano por segundo em fogo sustentado, ignorando recarga. */
export function damagePerSecond(stats: EffectiveStats, distance = 0): number {
  return (damagePerShot(stats, distance) * stats.rpm) / 60;
}

/**
 * Distância em que a arma deixa de matar com o número de tiros do vão curto —
 * o número que mais importa na hora de escolher munição e cano.
 */
export function effectiveRange(stats: EffectiveStats): number {
  const closeShots = shotsToKill(stats, 0);
  for (const step of stats.damage) {
    if (step.distance === 0) continue;
    const damage = step.damage * stats.pellets;
    if (damage <= 0) continue;
    if (Math.ceil(FULL_HEALTH / damage) > closeShots) return step.distance;
  }
  return stats.damage[stats.damage.length - 1]?.distance ?? 0;
}

/** Tempo de voo do projétil até a distância informada, em segundos. */
export function timeOfFlight(stats: EffectiveStats, distance: number): number {
  if (stats.velocity <= 0) return 0;
  const k = DRAG_COEFFICIENT * stats.drag;
  if (k <= 0) return distance / stats.velocity;
  // Arrasto proporcional à velocidade: v(t) = v0·e^(−kt) → solução fechada.
  return (Math.exp(k * distance) - 1) / (k * stats.velocity);
}

/** Queda do projétil, em metros, na distância informada. */
export function bulletDrop(stats: EffectiveStats, distance: number): number {
  if (stats.velocity <= 0) return 0;
  const t = timeOfFlight(stats, distance);
  return 0.5 * GRAVITY * t * t;
}

export interface CurvePoint {
  distance: number;
  value: number;
}

/**
 * Curva de dano em degraus. Cada transição vira dois pontos na mesma distância
 * para que a linha desça em ângulo reto, como o dano realmente muda.
 */
export function damageCurve(stats: EffectiveStats, maxDistance: number): CurvePoint[] {
  const points: CurvePoint[] = [];
  const steps = stats.damage;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.distance > maxDistance) break;
    const value = step.damage * stats.pellets;
    if (i > 0) {
      // Fecha o patamar anterior antes de saltar para o novo valor.
      points.push({ distance: step.distance, value: points[points.length - 1].value });
    }
    points.push({ distance: step.distance, value });
  }

  const lastStep = points[points.length - 1];
  if (lastStep && lastStep.distance < maxDistance) {
    points.push({ distance: maxDistance, value: lastStep.value });
  }
  return points;
}

/** Curva de tiros para eliminar, também em degraus. */
export function shotsToKillCurve(stats: EffectiveStats, maxDistance: number): CurvePoint[] {
  return damageCurve(stats, maxDistance).map((p) => ({
    distance: p.distance,
    value: p.value > 0 ? Math.ceil(FULL_HEALTH / p.value) : Infinity,
  }));
}

/** Curva de queda do projétil, amostrada em `amostras` pontos. */
export function dropCurve(
  stats: EffectiveStats,
  maxDistance: number,
  samples = 48,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const distance = (maxDistance * i) / samples;
    points.push({ distance, value: bulletDrop(stats, distance) });
  }
  return points;
}

/** Curva de tempo para eliminar por distância, em milissegundos. */
export function ttkCurve(stats: EffectiveStats, maxDistance: number): CurvePoint[] {
  return damageCurve(stats, maxDistance).map((p) => {
    const shots = p.value > 0 ? Math.ceil(FULL_HEALTH / p.value) : Infinity;
    const value =
      Number.isFinite(shots) && stats.rpm > 0 ? (shots - 1) * (60_000 / stats.rpm) : Infinity;
    return { distance: p.distance, value };
  });
}

/**
 * Até onde faz sentido desenhar os gráficos desta arma: um pouco além do último
 * degrau de dano, com um piso por categoria para não espremer a curva.
 */
export function analysisDistance(stats: EffectiveStats, minimum = 100): number {
  const lastStep = stats.damage[stats.damage.length - 1]?.distance ?? 0;
  const target = Math.max(minimum, Math.ceil((lastStep * 1.35) / 25) * 25);
  return Math.min(target, 400);
}
