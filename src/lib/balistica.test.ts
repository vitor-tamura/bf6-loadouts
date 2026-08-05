import { describe, expect, it } from 'vitest';
import { ARMAS, ARMAS_POR_ID } from '@/dados/armas';
import {
  alcanceEfetivo,
  curvaDano,
  curvaQueda,
  danoNaDistancia,
  danoPorDisparo,
  distanciaDeAnalise,
  quedaDaBala,
  tempoDeVoo,
  tempoParaEliminar,
  tirosParaEliminar,
} from './balistica';
import { resolverAcessorios, calcularStats, statsBase } from './stats';

const ak4d = statsBase(ARMAS_POR_ID.get('ak4d')!); // 33,4 / 25 aos 21 m / 20 aos 75 m
const m1014 = statsBase(ARMAS_POR_ID.get('m1014')!); // escopeta de 15 projéteis

describe('dano por distância', () => {
  it('mantém o valor do degrau até o degrau seguinte', () => {
    expect(danoNaDistancia(ak4d, 0)).toBe(33.4);
    expect(danoNaDistancia(ak4d, 20.9)).toBe(33.4);
    expect(danoNaDistancia(ak4d, 21)).toBe(25);
    expect(danoNaDistancia(ak4d, 74)).toBe(25);
    expect(danoNaDistancia(ak4d, 75)).toBe(20);
    expect(danoNaDistancia(ak4d, 500)).toBe(20);
  });

  it('soma os projéteis de uma escopeta em um único disparo', () => {
    expect(danoPorDisparo(m1014, 0)).toBeCloseTo(7.2 * 15, 5);
    expect(tirosParaEliminar(m1014, 0)).toBe(1);
  });
});

describe('tiros e tempo para eliminar', () => {
  it('calcula os tiros a partir dos 100 de vida', () => {
    expect(tirosParaEliminar(ak4d, 0)).toBe(3); // 33,4 × 3 = 100,2
    expect(tirosParaEliminar(ak4d, 30)).toBe(4); // 25 × 4 = 100
    expect(tirosParaEliminar(ak4d, 100)).toBe(5); // 20 × 5 = 100
  });

  it('conta apenas os intervalos entre disparos', () => {
    // 514 RPM → 116,7 ms entre tiros; três tiros levam dois intervalos.
    expect(tempoParaEliminar(ak4d, 0)).toBeCloseTo(2 * (60_000 / 514), 3);
  });

  it('reduz os tiros necessários no acerto de cabeça', () => {
    const sniper = statsBase(ARMAS_POR_ID.get('sv-98')!);
    expect(tirosParaEliminar(sniper, 10)).toBe(2); // 80 de dano ao peito
    expect(tirosParaEliminar(sniper, 10, true)).toBe(1); // 80 × 1,7 = 136
    expect(tempoParaEliminar(sniper, 10, true)).toBe(0);
  });
});

describe('alcance efetivo', () => {
  it('aponta onde a arma passa a precisar de mais um tiro', () => {
    expect(alcanceEfetivo(ak4d)).toBe(21);
  });

  it('não encontra queda em arma de dano constante', () => {
    const m250 = statsBase(ARMAS_POR_ID.get('m250')!);
    expect(alcanceEfetivo(m250)).toBe(0);
  });

  it('cresce quando o cano estendido empurra os degraus', () => {
    const arma = ARMAS_POR_ID.get('ak4d')!;
    const comCano = calcularStats(arma, resolverAcessorios(['cano-estendido-8']));
    expect(alcanceEfetivo(comCano)).toBeGreaterThan(alcanceEfetivo(ak4d));
  });
});

describe('queda do projétil', () => {
  it('parte de zero na boca do cano e cresce com a distância', () => {
    expect(quedaDaBala(ak4d, 0)).toBe(0);
    const q100 = quedaDaBala(ak4d, 100);
    const q200 = quedaDaBala(ak4d, 200);
    expect(q100).toBeGreaterThan(0);
    expect(q200).toBeGreaterThan(q100 * 2); // acelera, não é linear
  });

  it('fica em valores plausíveis para um fuzil a 100 m', () => {
    const queda = quedaDaBala(ak4d, 100);
    expect(queda).toBeGreaterThan(0.05);
    expect(queda).toBeLessThan(0.2);
  });

  it('cai menos quando a bala é mais rápida', () => {
    const arma = ARMAS_POR_ID.get('ak4d')!;
    const comCano = calcularStats(arma, resolverAcessorios(['cano-prototipo-264']));
    expect(quedaDaBala(comCano, 150)).toBeLessThan(quedaDaBala(ak4d, 150));
  });

  it('cai muito mais com munição subsônica', () => {
    const arma = ARMAS_POR_ID.get('ak4d')!;
    const subsonica = calcularStats(arma, resolverAcessorios(['mun-subsonica']));
    expect(quedaDaBala(subsonica, 150)).toBeGreaterThan(quedaDaBala(ak4d, 150) * 1.5);
  });

  it('não calcula voo para arma de corpo a corpo', () => {
    const faca = statsBase(ARMAS_POR_ID.get('kbr-mark-ii')!);
    expect(tempoDeVoo(faca, 50)).toBe(0);
    expect(quedaDaBala(faca, 50)).toBe(0);
  });
});

describe('curvas dos gráficos', () => {
  it('desenha a queda de dano em ângulo reto', () => {
    const pontos = curvaDano(ak4d, 100);
    // Cada transição repete a distância: uma vez fechando o patamar, outra abrindo.
    const em21 = pontos.filter((p) => p.distancia === 21);
    expect(em21).toHaveLength(2);
    expect(em21[0].valor).toBe(33.4);
    expect(em21[1].valor).toBe(25);
  });

  it('estende a curva até o limite pedido', () => {
    const pontos = curvaDano(ak4d, 150);
    expect(pontos[pontos.length - 1].distancia).toBe(150);
  });

  it('amostra a queda com a quantidade de pontos pedida', () => {
    const pontos = curvaQueda(ak4d, 200, 20);
    expect(pontos).toHaveLength(21);
    expect(pontos[0]).toEqual({ distancia: 0, valor: 0 });
    expect(pontos[20].distancia).toBe(200);
  });

  it('escolhe uma distância de análise coerente para cada arma', () => {
    for (const arma of ARMAS) {
      if (arma.categoria === 'corpo-a-corpo') continue;
      const distancia = distanciaDeAnalise(statsBase(arma));
      expect(distancia, arma.nome).toBeGreaterThanOrEqual(100);
      expect(distancia, arma.nome).toBeLessThanOrEqual(400);
    }
  });
});
