import { ACESSORIOS_POR_ID } from '@/dados/acessorios';
import { ORCAMENTO_PONTOS } from '@/dados/classes';
import type { Acessorio, Arma, ChaveStat, DegrauDano, Modificador } from '@/dados/tipos';

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

export interface StatsEfetivos {
  dano: DegrauDano[];
  projeteis: number;
  rpm: number;
  velocidade: number;
  arrasto: number;
  headshot: number;
  carregador: number;
  recarga: number;
  recargaVazia: number;
  adsMs: number;
  trocaMs: number;
  precisao: number;
  controle: number;
  mobilidade: number;
  hipfire: number;
  recuoV: number;
  recuoH: number;
}

/** Estatísticas com barra de 0 a 100 na interface. */
const ESTATISTICAS_LIMITADAS: ChaveStat[] = ['precisao', 'controle', 'mobilidade', 'hipfire'];

/** Estatísticas em que um valor MENOR é melhor para o jogador. */
export const MENOR_EH_MELHOR: Set<keyof StatsEfetivos> = new Set([
  'adsMs',
  'trocaMs',
  'recarga',
  'recargaVazia',
  'recuoV',
  'recuoH',
]);

function aplicar(base: number, mods: Modificador[], limitar: boolean): number {
  let valor = base;
  for (const m of mods) if (m.add !== undefined) valor += m.add;
  for (const m of mods) if (m.mult !== undefined) valor *= m.mult;
  if (limitar) return Math.max(0, Math.min(100, valor));
  return Math.max(0, valor);
}

function modsDaChave(acessorios: Acessorio[], chave: ChaveStat): Modificador[] {
  const lista: Modificador[] = [];
  for (const a of acessorios) {
    const m = a.mods[chave];
    if (m) lista.push(m);
  }
  return lista;
}

/** Resolve ids de acessório em objetos, descartando silenciosamente os que não existem. */
export function resolverAcessorios(ids: (string | undefined | null)[]): Acessorio[] {
  const lista: Acessorio[] = [];
  for (const id of ids) {
    if (!id) continue;
    const a = ACESSORIOS_POR_ID.get(id);
    if (a) lista.push(a);
  }
  return lista;
}

export function calcularStats(arma: Arma, acessorios: Acessorio[]): StatsEfetivos {
  const num = (chave: ChaveStat, base: number) =>
    aplicar(base, modsDaChave(acessorios, chave), ESTATISTICAS_LIMITADAS.includes(chave));

  const multDano = modsDaChave(acessorios, 'dano');
  const multAlcance = modsDaChave(acessorios, 'alcance');

  const dano: DegrauDano[] = arma.dano.map((degrau) => ({
    dano: aplicar(degrau.dano, multDano, false),
    // O primeiro degrau começa sempre no cano da arma; mexer nele não faria sentido.
    distancia: degrau.distancia === 0 ? 0 : aplicar(degrau.distancia, multAlcance, false),
  }));

  const carregador = Math.max(1, Math.round(num('carregador', arma.carregador)));
  const recarga = num('recarga', arma.recarga);

  return {
    dano,
    projeteis: arma.projeteis,
    rpm: Math.round(num('rpm', arma.rpm)),
    velocidade: num('velocidade', arma.velocidade),
    arrasto: arma.arrasto,
    headshot: arma.headshot,
    carregador,
    recarga,
    // A recarga com a arma vazia acompanha proporcionalmente a recarga tática.
    recargaVazia: arma.recarga > 0 ? (recarga / arma.recarga) * arma.recargaVazia : 0,
    adsMs: num('adsMs', arma.adsMs),
    trocaMs: num('trocaMs', arma.trocaMs),
    precisao: num('precisao', arma.precisao),
    controle: num('controle', arma.controle),
    mobilidade: num('mobilidade', arma.mobilidade),
    hipfire: num('hipfire', arma.hipfire),
    recuoV: num('recuoV', arma.recuoV),
    recuoH: num('recuoH', arma.recuoH),
  };
}

/** Estatísticas da arma sem nenhum acessório — a referência para os deltas. */
export function statsBase(arma: Arma): StatsEfetivos {
  return calcularStats(arma, []);
}

export interface Orcamento {
  gasto: number;
  total: number;
  restante: number;
  estourado: boolean;
}

export function calcularOrcamento(acessorios: Acessorio[]): Orcamento {
  const gasto = acessorios.reduce((soma, a) => soma + a.custo, 0);
  return {
    gasto,
    total: ORCAMENTO_PONTOS,
    restante: ORCAMENTO_PONTOS - gasto,
    estourado: gasto > ORCAMENTO_PONTOS,
  };
}

/**
 * Um acessório só pode ser encaixado se couber no que sobrou do orçamento —
 * descontando o que já ocupa o mesmo slot, que será substituído.
 */
export function cabeNoOrcamento(
  candidato: Acessorio,
  acessoriosAtuais: Acessorio[],
): boolean {
  const substituido = acessoriosAtuais.find((a) => a.slot === candidato.slot);
  const gasto = acessoriosAtuais.reduce((soma, a) => soma + a.custo, 0);
  const novoGasto = gasto - (substituido?.custo ?? 0) + candidato.custo;
  return novoGasto <= ORCAMENTO_PONTOS;
}

export interface Delta {
  base: number;
  efetivo: number;
  diferenca: number;
  /** Percentual de variação, útil para colorir a barra. */
  percentual: number;
  /** `true` quando a mudança favorece o jogador. */
  melhora: boolean;
  mudou: boolean;
}

export function compararStat(
  chave: keyof StatsEfetivos,
  base: number,
  efetivo: number,
): Delta {
  const diferenca = efetivo - base;
  const mudou = Math.abs(diferenca) > 1e-6;
  const menorMelhor = MENOR_EH_MELHOR.has(chave);
  return {
    base,
    efetivo,
    diferenca,
    percentual: base === 0 ? 0 : (diferenca / base) * 100,
    melhora: menorMelhor ? diferenca < 0 : diferenca > 0,
    mudou,
  };
}

/** Se algum número exibido veio de curadoria, a interface avisa. */
export function temValorAproximado(arma: Arma, acessorios: Acessorio[]): boolean {
  return arma.procedencia === 'curado' || acessorios.some((a) => a.procedencia === 'curado');
}
