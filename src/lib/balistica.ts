import type { StatsEfetivos } from './stats';

/**
 * Balística: dano por distância, tiros e tempo para eliminar, e queda do
 * projétil.
 *
 * O jogo trata a queda de dano em degraus — cada degrau vale da sua distância
 * até o próximo. A trajetória usa arrasto proporcional à velocidade, que tem
 * solução fechada e roda barato o suficiente para redesenhar a cada acessório
 * encaixado.
 */

export const VIDA_TOTAL = 100;
const GRAVIDADE = 9.81;
/** Calibra o arrasto para que as quedas batam com o que se vê em jogo. */
const COEF_ARRASTO = 0.0006;

export function danoNaDistancia(stats: StatsEfetivos, distancia: number): number {
  let atual = stats.dano[0]?.dano ?? 0;
  for (const degrau of stats.dano) {
    if (distancia >= degrau.distancia) atual = degrau.dano;
    else break;
  }
  return atual;
}

/** Dano de um disparo completo — escopetas somam todos os projéteis. */
export function danoPorDisparo(stats: StatsEfetivos, distancia: number): number {
  return danoNaDistancia(stats, distancia) * stats.projeteis;
}

/** Tiros necessários para eliminar um alvo de 100 de vida. */
export function tirosParaEliminar(
  stats: StatsEfetivos,
  distancia: number,
  cabeca = false,
): number {
  const dano = danoPorDisparo(stats, distancia) * (cabeca ? stats.headshot : 1);
  if (dano <= 0) return Infinity;
  return Math.ceil(VIDA_TOTAL / dano);
}

/**
 * Tempo para eliminar, em milissegundos. Só conta os intervalos ENTRE disparos:
 * o primeiro tiro sai no instante zero.
 */
export function tempoParaEliminar(
  stats: StatsEfetivos,
  distancia: number,
  cabeca = false,
): number {
  const tiros = tirosParaEliminar(stats, distancia, cabeca);
  if (!Number.isFinite(tiros) || stats.rpm <= 0) return Infinity;
  return (tiros - 1) * (60_000 / stats.rpm);
}

/** Intervalo entre dois disparos, em milissegundos. */
export function intervaloDisparo(stats: StatsEfetivos): number {
  return stats.rpm > 0 ? 60_000 / stats.rpm : 0;
}

/** Dano por segundo em fogo sustentado, ignorando recarga. */
export function danoPorSegundo(stats: StatsEfetivos, distancia = 0): number {
  return (danoPorDisparo(stats, distancia) * stats.rpm) / 60;
}

/**
 * Distância em que a arma deixa de matar com o número de tiros do vão curto —
 * o número que mais importa na hora de escolher munição e cano.
 */
export function alcanceEfetivo(stats: StatsEfetivos): number {
  const tirosDePerto = tirosParaEliminar(stats, 0);
  for (const degrau of stats.dano) {
    if (degrau.distancia === 0) continue;
    const dano = degrau.dano * stats.projeteis;
    if (dano <= 0) continue;
    if (Math.ceil(VIDA_TOTAL / dano) > tirosDePerto) return degrau.distancia;
  }
  return stats.dano[stats.dano.length - 1]?.distancia ?? 0;
}

/** Tempo de voo do projétil até a distância informada, em segundos. */
export function tempoDeVoo(stats: StatsEfetivos, distancia: number): number {
  if (stats.velocidade <= 0) return 0;
  const k = COEF_ARRASTO * stats.arrasto;
  if (k <= 0) return distancia / stats.velocidade;
  // Arrasto proporcional à velocidade: v(t) = v0·e^(−kt) → solução fechada.
  return (Math.exp(k * distancia) - 1) / (k * stats.velocidade);
}

/** Queda do projétil, em metros, na distância informada. */
export function quedaDaBala(stats: StatsEfetivos, distancia: number): number {
  if (stats.velocidade <= 0) return 0;
  const t = tempoDeVoo(stats, distancia);
  return 0.5 * GRAVIDADE * t * t;
}

export interface PontoCurva {
  distancia: number;
  valor: number;
}

/**
 * Curva de dano em degraus. Cada transição vira dois pontos na mesma distância
 * para que a linha desça em ângulo reto, como o dano realmente muda.
 */
export function curvaDano(stats: StatsEfetivos, distanciaMax: number): PontoCurva[] {
  const pontos: PontoCurva[] = [];
  const degraus = stats.dano;

  for (let i = 0; i < degraus.length; i++) {
    const degrau = degraus[i];
    if (degrau.distancia > distanciaMax) break;
    const valor = degrau.dano * stats.projeteis;
    if (i > 0) {
      // Fecha o patamar anterior antes de saltar para o novo valor.
      pontos.push({ distancia: degrau.distancia, valor: pontos[pontos.length - 1].valor });
    }
    pontos.push({ distancia: degrau.distancia, valor });
  }

  const ultimo = pontos[pontos.length - 1];
  if (ultimo && ultimo.distancia < distanciaMax) {
    pontos.push({ distancia: distanciaMax, valor: ultimo.valor });
  }
  return pontos;
}

/** Curva de tiros para eliminar, também em degraus. */
export function curvaTiros(stats: StatsEfetivos, distanciaMax: number): PontoCurva[] {
  return curvaDano(stats, distanciaMax).map((p) => ({
    distancia: p.distancia,
    valor: p.valor > 0 ? Math.ceil(VIDA_TOTAL / p.valor) : Infinity,
  }));
}

/** Curva de queda do projétil, amostrada em `amostras` pontos. */
export function curvaQueda(
  stats: StatsEfetivos,
  distanciaMax: number,
  amostras = 48,
): PontoCurva[] {
  const pontos: PontoCurva[] = [];
  for (let i = 0; i <= amostras; i++) {
    const distancia = (distanciaMax * i) / amostras;
    pontos.push({ distancia, valor: quedaDaBala(stats, distancia) });
  }
  return pontos;
}

/** Curva de tempo para eliminar por distância, em milissegundos. */
export function curvaTTK(stats: StatsEfetivos, distanciaMax: number): PontoCurva[] {
  return curvaDano(stats, distanciaMax).map((p) => {
    const tiros = p.valor > 0 ? Math.ceil(VIDA_TOTAL / p.valor) : Infinity;
    const valor =
      Number.isFinite(tiros) && stats.rpm > 0 ? (tiros - 1) * (60_000 / stats.rpm) : Infinity;
    return { distancia: p.distancia, valor };
  });
}

/**
 * Até onde faz sentido desenhar os gráficos desta arma: um pouco além do último
 * degrau de dano, com um piso por categoria para não espremer a curva.
 */
export function distanciaDeAnalise(stats: StatsEfetivos, minimo = 100): number {
  const ultimo = stats.dano[stats.dano.length - 1]?.distancia ?? 0;
  const alvo = Math.max(minimo, Math.ceil((ultimo * 1.35) / 25) * 25);
  return Math.min(alvo, 400);
}
