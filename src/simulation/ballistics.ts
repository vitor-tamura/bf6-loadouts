/**
 * O voo do projétil: tempo até o alvo e queda da bala.
 *
 * O modelo é `dv/dt = -k·v²` para o tiro nivelado, que tem solução fechada, e a
 * versão vetorial com gravidade — `dp/dt = v`, `dv/dt = (0, g) - k·|v|·v` —
 * resolvida numericamente quando a queda importa.
 *
 * ## O coeficiente é escolha de quem chama, não deste arquivo
 *
 * Duas fontes publicam coeficientes diferentes: 0,0035 por metro (Analyzer) e
 * 0,0025 (planilha da comunidade); a EA confirma que o arrasto existe e não
 * publica o número. Nenhuma função aqui escolhe — `model` é parâmetro
 * obrigatório, e `dragModelFor()` monta o modelo a partir do catálogo dizendo
 * qual fonte está sendo usada.
 *
 * A consequência é boa: dá para rodar a mesma trajetória com os dois
 * coeficientes e ver o quanto a resposta muda, em vez de discutir qual número
 * é o certo sem medir a diferença.
 */

import { getBallisticsModel, getWeaponBallistics } from '@/catalog';

/** Passo do integrador. Metade de um milissegundo é mais fino que o tickrate. */
const STEP_SECONDS = 1 / 500;

/** Um projétil que passasse disto já teria acertado o chão. */
const MAX_FLIGHT_SECONDS = 30;

/**
 * De onde sai o coeficiente de arrasto.
 *
 * `catalog` é o padrão e o único que descreve o jogo: é o valor que o catálogo
 * publica, escolhido entre as fontes e registrado com o porquê. Os outros dois
 * existem para comparar — rodar a mesma trajetória com os dois números e medir
 * a diferença é melhor do que discutir qual está certo.
 *
 * Manter os dois fixos aqui já custou caro uma vez: quando o catálogo passou a
 * publicar 0,0025, o motor continuou calculando com 0,0035 porque o número
 * morava no código. Dado e cálculo brigando, e o cálculo ganhando calado.
 */
export type DragSource = 'catalog' | 'analyzer' | 'community';

export interface ProjectileModel {
  velocityMps: number;
  dragPerMeter: number;
  gravityMps2: number;
  /** De onde saiu o coeficiente de arrasto — vai junto para a tela poder dizer. */
  dragSource: DragSource;
}

/** Os coeficientes que circulam, com a fonte de cada um. */
const DRAG: Record<Exclude<DragSource, 'catalog'>, { base: number; longRange: number }> = {
  analyzer: { base: 0.0035, longRange: 0.002 },
  community: { base: 0.0025, longRange: 0.001 },
};

export function isProjectileModel(model: ProjectileModel | null): model is ProjectileModel {
  return (
    !!model &&
    Number.isFinite(model.velocityMps) &&
    model.velocityMps > 0 &&
    Number.isFinite(model.dragPerMeter) &&
    model.dragPerMeter >= 0 &&
    Number.isFinite(model.gravityMps2)
  );
}

/**
 * Monta o modelo de voo de uma arma.
 *
 * `dragSource` é explícito de propósito: quem chama declara com que coeficiente
 * está contando. `longRange` troca o coeficiente pelo da munição de longo
 * alcance, que é a única variação que as duas fontes descrevem igual.
 */
export function dragModelFor(
  weaponId: string,
  options: { dragSource?: DragSource; longRange?: boolean } = {},
): ProjectileModel | null {
  const { dragSource = 'catalog', longRange = false } = options;

  const ballistics = getWeaponBallistics(weaponId);
  const velocity = ballistics?.muzzleVelocity;
  if (velocity == null) return null;

  const model = getBallisticsModel();

  /*
   * O catálogo manda; as constantes são só para comparação.
   *
   * A munição de longo alcance é a única variação que as fontes descrevem
   * igual, e o catálogo a publica no modelo. Sem ela lá, cai-se na proporção
   * conhecida entre os dois coeficientes.
   */
  const longRangeFromCatalog = (model?.ammoDragPerMeter as { long_range?: number } | undefined)
    ?.long_range;

  const base =
    dragSource === 'catalog' ? (model?.baseDragPerMeter ?? DRAG.analyzer.base) : DRAG[dragSource].base;

  const long =
    dragSource === 'catalog'
      ? (longRangeFromCatalog ?? DRAG.analyzer.longRange)
      : DRAG[dragSource].longRange;

  return {
    velocityMps: velocity,
    dragPerMeter: longRange ? long : base,
    gravityMps2: model?.gravityMps2 ?? -9.81,
    dragSource,
  };
}

/**
 * Quanto tempo a bala leva para chegar, em tiro nivelado.
 *
 * Solução fechada do arrasto quadrático — sem integrar. É o número que entra no
 * TTK: com 630 m/s, cinquenta metros custam mais de oitenta milissegundos, o
 * que muda a comparação entre uma arma rápida de perto e uma lenta de longe.
 */
export function flightTime(model: ProjectileModel | null, distance: number): number | null {
  if (!isProjectileModel(model) || !Number.isFinite(distance) || distance < 0) return null;
  if (distance === 0) return 0;

  const { velocityMps: velocity, dragPerMeter: drag } = model;
  return drag === 0 ? distance / velocity : Math.expm1(drag * distance) / (drag * velocity);
}

interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function derivative(state: State, model: ProjectileModel): State {
  const speed = Math.hypot(state.vx, state.vy);
  const drag = model.dragPerMeter * speed;
  return {
    x: state.vx,
    y: state.vy,
    vx: -drag * state.vx,
    vy: model.gravityMps2 - drag * state.vy,
  };
}

/** Runge-Kutta de quarta ordem: preciso o bastante para trajetória de bala. */
function step(state: State, model: ProjectileModel, dt: number): State {
  const add = (base: State, slope: State, scale: number): State => ({
    x: base.x + slope.x * scale,
    y: base.y + slope.y * scale,
    vx: base.vx + slope.vx * scale,
    vy: base.vy + slope.vy * scale,
  });

  const k1 = derivative(state, model);
  const k2 = derivative(add(state, k1, dt / 2), model);
  const k3 = derivative(add(state, k2, dt / 2), model);
  const k4 = derivative(add(state, k3, dt), model);

  return {
    x: state.x + (dt * (k1.x + 2 * k2.x + 2 * k3.x + k4.x)) / 6,
    y: state.y + (dt * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)) / 6,
    vx: state.vx + (dt * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx)) / 6,
    vy: state.vy + (dt * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy)) / 6,
  };
}

export interface Trajectory {
  timeSeconds: number;
  distanceMeters: number;
  /** Altura relativa ao eixo do cano, positiva para cima. */
  dropMeters: number;
}

/** Segue o projétil até o plano do alvo, com gravidade e arrasto. */
export function trajectoryAt(
  model: ProjectileModel | null,
  distance: number,
  launchAngle = 0,
): Trajectory | null {
  if (!isProjectileModel(model) || !Number.isFinite(distance) || distance < 0) return null;
  if (!Number.isFinite(launchAngle)) return null;
  if (distance === 0) return { timeSeconds: 0, distanceMeters: 0, dropMeters: 0 };

  let state: State = {
    x: 0,
    y: 0,
    vx: model.velocityMps * Math.cos(launchAngle),
    vy: model.velocityMps * Math.sin(launchAngle),
  };
  let elapsed = 0;

  while (state.x < distance && elapsed < MAX_FLIGHT_SECONDS) {
    const previous = state;
    const next = step(state, model, STEP_SECONDS);
    elapsed += STEP_SECONDS;

    if (next.x >= distance) {
      // Interpola dentro do último passo para não arredondar ao passo inteiro.
      const fraction = (distance - previous.x) / (next.x - previous.x);
      return {
        timeSeconds: elapsed - STEP_SECONDS + STEP_SECONDS * fraction,
        distanceMeters: distance,
        dropMeters: previous.y + (next.y - previous.y) * fraction,
      };
    }
    state = next;
  }

  return null;
}

/**
 * A queda vista pela mira, para uma zeragem escolhida.
 *
 * Procura por bisseção a elevação do cano que faz a bala cruzar o plano na
 * distância de zeragem, e avalia essa mesma trajetória na distância pedida.
 * Ignora a altura da mira sobre o cano de propósito: ela desloca a curva
 * inteira e não muda a comparação entre armas.
 */
export function dropRelativeToZero(
  model: ProjectileModel | null,
  distance: number,
  zeroDistance: number | null = null,
): number | null {
  if (zeroDistance == null || zeroDistance === 0) {
    return trajectoryAt(model, distance)?.dropMeters ?? null;
  }
  if (!Number.isFinite(zeroDistance) || zeroDistance < 0) return null;

  let low = -0.1;
  let high = 0.1;

  const lowDrop = trajectoryAt(model, zeroDistance, low)?.dropMeters;
  const highDrop = trajectoryAt(model, zeroDistance, high)?.dropMeters;
  if (
    !Number.isFinite(lowDrop as number) ||
    !Number.isFinite(highDrop as number) ||
    (lowDrop as number) > 0 ||
    (highDrop as number) < 0
  ) {
    return null;
  }

  for (let index = 0; index < 36; index += 1) {
    const mid = (low + high) / 2;
    const drop = trajectoryAt(model, zeroDistance, mid)?.dropMeters;
    if (!Number.isFinite(drop as number)) return null;
    if ((drop as number) < 0) low = mid;
    else high = mid;
  }

  return trajectoryAt(model, distance, (low + high) / 2)?.dropMeters ?? null;
}
