/**
 * Dano por distância e tiros para abater.
 *
 * Isto não é catálogo. O catálogo responde "quais são os dados"; este arquivo
 * responde "o que acontece quando eles são aplicados". A separação importa
 * porque a resposta muda com a pergunta — distância, zona de acerto, vida do
 * alvo — enquanto o dado é o mesmo.
 *
 * ## A regra do degrau
 *
 * A curva vem como uma poligonal em que **distâncias repetidas são uma queda
 * instantânea** e distâncias distintas são uma rampa. Numa distância repetida
 * vale o degrau que **termina** ali, não o que começa: a M433 lê 26,05 em 21 m
 * e 20,67 em 21,5 m.
 *
 * Isso não é detalhe de implementação — é o comportamento medido do jogo, e
 * ler ao contrário desloca o TTK de toda arma exatamente na distância em que a
 * queda acontece, que é onde as pessoas comparam armas.
 */

import type { WeaponDamageModel } from '@/catalog';

export type HitZone = 'head' | 'body' | 'limb';

/** Vida padrão de um soldado. Fica nomeado para a conta não usar 100 solto. */
export const DEFAULT_HEALTH = 100;

/**
 * Margem para a comparação de ponto flutuante.
 *
 * Sem ela, um dano que soma exatamente 100 pede um tiro a mais por causa do
 * último bit da divisão — e o TTK sai errado justamente nas armas redondas.
 */
const EPSILON = 1e-9;

/** O dano de um projétil na distância pedida, ou `null` se não houver curva. */
export function damageAtRange(model: WeaponDamageModel | undefined, range: number): number | null {
  const points = model?.curve;
  if (!points?.length) return null;
  if (range <= points[0].distance) return points[0].damage;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (range > point.distance) continue;

    // Distância repetida: o degrau que termina aqui ainda vale.
    if (point.distance === previous.distance) return previous.damage;

    const ratio = (range - previous.distance) / (point.distance - previous.distance);
    return previous.damage + (point.damage - previous.damage) * ratio;
  }

  return points[points.length - 1].damage;
}

/**
 * O dano de um disparo — a soma dos projéteis dele.
 *
 * `pellets` existe para escopeta. Nenhuma fonte publica a contagem hoje, então
 * o padrão é 1 e quem souber informa: assumir um número aqui inflaria o dano de
 * toda escopeta do catálogo.
 */
export function damagePerShot(
  model: WeaponDamageModel | undefined,
  range: number,
  pellets = 1,
): number | null {
  const damage = damageAtRange(model, range);
  return damage == null ? null : damage * pellets;
}

/** O multiplicador da zona atingida, segundo o modelo da arma. */
export function zoneMultiplier(model: WeaponDamageModel | undefined, zone: HitZone): number {
  if (!model) return 1;
  if (zone === 'head') return model.zones.head;
  if (zone === 'limb') return model.zones.limb;
  return model.zones.body;
}

export interface ShotsToKillOptions {
  health?: number;
  /** Quantos dos disparos acertam a cabeça, do primeiro em diante. */
  headshots?: number;
  /** A zona dos demais disparos. */
  bodyZone?: HitZone;
  pellets?: number;
}

/**
 * Quantos disparos abatem o alvo àquela distância.
 *
 * Devolve `Infinity` quando o dano não mata — arma que não vence a vida do alvo
 * a distância nenhuma existe, e `Infinity` é a resposta honesta. `null` é outra
 * coisa: significa que não há curva para responder.
 */
export function shotsToKill(
  model: WeaponDamageModel | undefined,
  range: number,
  options: ShotsToKillOptions = {},
): number | null {
  const { health = DEFAULT_HEALTH, headshots = 0, bodyZone = 'body', pellets = 1 } = options;

  const perShot = damagePerShot(model, range, pellets);
  if (perShot == null) return null;
  if (!(perShot > 0) || !(health > 0)) return Infinity;

  const headDamage = perShot * zoneMultiplier(model, 'head');
  const bodyDamage = perShot * zoneMultiplier(model, bodyZone);
  if (!(headDamage > 0) || !(bodyDamage > 0)) return Infinity;

  const wanted = Math.max(0, Math.floor(headshots));
  const lethalHeadshots = Math.ceil((health - EPSILON) / headDamage);
  if (wanted >= lethalHeadshots) return lethalHeadshots;

  const remaining = health - wanted * headDamage;
  return wanted + Math.max(0, Math.ceil((remaining - EPSILON) / bodyDamage));
}
