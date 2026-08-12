/**
 * Tempo para abater.
 *
 * TTK não é dado, é resultado — e é por isso que ele não está guardado em lugar
 * nenhum do catálogo. Armazenar `"ttk": 217` obrigaria a guardar uma linha por
 * distância, por zona de acerto, por vida do alvo e por munição; e cada patch
 * que mexesse na curva de dano invalidaria todas de uma vez. Aqui ele sai da
 * curva, da cadência e do tempo de voo, para qualquer combinação.
 *
 * ## O que entra na conta
 *
 * ```
 * curva de dano ──► dano por tiro na distância
 *                        │
 *                   zona de acerto
 *                        │
 *                        ▼
 *                 tiros para abater
 *                        │
 *          ┌─────────────┴─────────────┐
 *          ▼                           ▼
 *    cadência (intervalo)        tempo de voo
 *          └─────────────┬─────────────┘
 *                        ▼
 *                       TTK
 * ```
 *
 * O último tiro não espera o intervalo seguinte: o tempo entre o primeiro e o
 * último disparo é `(tiros - 1) × intervalo`. Somar um intervalo a mais é o
 * erro clássico, e ele infla o TTK de arma lenta em dezenas de milissegundos.
 */

import { getWeaponDamageModel, getWeaponStats, getWeaponDataQuality, type DataQuality } from '@/catalog';
import { damagePerShot, shotsToKill, type HitZone } from './damage';
import { dragModelFor, flightTime, type DragSource } from './ballistics';

export interface TimeToKillOptions {
  distance?: number;
  health?: number;
  headshots?: number;
  bodyZone?: HitZone;
  pellets?: number;
  /**
   * Incluir o tempo de voo do projétil.
   *
   * Ligado por padrão porque é o que acontece no jogo: a bala leva tempo para
   * chegar. Desligar serve para comparar com fontes que publicam TTK só de
   * cadência — a maioria delas.
   */
  includeFlightTime?: boolean;
  dragSource?: DragSource;
  longRangeAmmo?: boolean;
}

export interface TimeToKill {
  weaponId: string;
  distance: number;
  /** Milissegundos até o alvo cair, ou `null` quando falta dado. */
  milliseconds: number | null;
  shots: number | null;
  damagePerShot: number | null;
  /** Milissegundos só de cadência, sem o voo. */
  fireMilliseconds: number | null;
  flightMilliseconds: number | null;
  /** O quanto se pode confiar: o pior nível entre curva e balística. */
  quality: DataQuality;
}

/** O intervalo entre disparos, em milissegundos. */
export function shotInterval(rpm: number | null | undefined): number | null {
  return rpm && rpm > 0 ? 60_000 / rpm : null;
}

/**
 * O tempo para abater, com tudo que o catálogo souber informar.
 *
 * Devolve `null` em `milliseconds` quando falta dado — nunca um número
 * aproximado sem aviso. `quality` diz o quanto confiar no que veio: hoje todas
 * as curvas são provisórias, e a tela precisa dizer isso.
 */
export function calculateTTK(weaponId: string, options: TimeToKillOptions = {}): TimeToKill {
  const {
    distance = 0,
    health,
    headshots = 0,
    bodyZone = 'body',
    pellets = 1,
    includeFlightTime = true,
    dragSource = 'analyzer',
    longRangeAmmo = false,
  } = options;

  const model = getWeaponDamageModel(weaponId);
  const rpm = getWeaponStats(weaponId).rpm;

  const shots = shotsToKill(model, distance, { health, headshots, bodyZone, pellets });
  const interval = shotInterval(rpm);
  const damage = damagePerShot(model, distance, pellets);

  const flight = includeFlightTime
    ? flightTime(dragModelFor(weaponId, { dragSource, longRange: longRangeAmmo }), distance)
    : 0;

  const fireMilliseconds =
    shots != null && Number.isFinite(shots) && interval != null ? (shots - 1) * interval : null;

  const flightMilliseconds = flight == null ? null : flight * 1000;

  const milliseconds =
    fireMilliseconds == null || flightMilliseconds == null
      ? null
      : fireMilliseconds + flightMilliseconds;

  return {
    weaponId,
    distance,
    milliseconds,
    shots,
    damagePerShot: damage,
    fireMilliseconds,
    flightMilliseconds,
    quality: getWeaponDataQuality(weaponId),
  };
}

/**
 * O TTK em várias distâncias de uma vez.
 *
 * É o que alimenta gráfico e comparação: a curva inteira sai de uma chamada, em
 * vez de a tela pedir distância por distância e cada uma refazer as buscas.
 */
export function ttkCurve(
  weaponId: string,
  distances: number[],
  options: Omit<TimeToKillOptions, 'distance'> = {},
): TimeToKill[] {
  return distances.map((distance) => calculateTTK(weaponId, { ...options, distance }));
}
