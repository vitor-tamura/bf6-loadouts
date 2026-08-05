import { describe, expect, it } from 'vitest';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import {
  effectiveRange,
  damageCurve,
  dropCurve,
  damageAtDistance,
  damagePerShot,
  analysisDistance,
  bulletDrop,
  timeOfFlight,
  timeToKill,
  shotsToKill,
} from './ballistics';
import { resolveAttachments, calculateStats, baseStats } from './stats';

const ak4d = baseStats(WEAPONS_BY_ID.get('ak4d')!); // 33,4 / 25 aos 21 m / 20 aos 75 m
const m1014 = baseStats(WEAPONS_BY_ID.get('m1014')!); // escopeta de 15 projéteis

describe('dano por distância', () => {
  it('mantém o valor do degrau até o degrau seguinte', () => {
    expect(damageAtDistance(ak4d, 0)).toBe(33.4);
    expect(damageAtDistance(ak4d, 20.9)).toBe(33.4);
    expect(damageAtDistance(ak4d, 21)).toBe(25);
    expect(damageAtDistance(ak4d, 74)).toBe(25);
    expect(damageAtDistance(ak4d, 75)).toBe(20);
    expect(damageAtDistance(ak4d, 500)).toBe(20);
  });

  it('soma os projéteis de uma escopeta em um único disparo', () => {
    expect(damagePerShot(m1014, 0)).toBeCloseTo(7.2 * 15, 5);
    expect(shotsToKill(m1014, 0)).toBe(1);
  });
});

describe('tiros e tempo para eliminar', () => {
  it('calcula os tiros a partir dos 100 de vida', () => {
    expect(shotsToKill(ak4d, 0)).toBe(3); // 33,4 × 3 = 100,2
    expect(shotsToKill(ak4d, 30)).toBe(4); // 25 × 4 = 100
    expect(shotsToKill(ak4d, 100)).toBe(5); // 20 × 5 = 100
  });

  it('conta apenas os intervalos entre disparos', () => {
    // 514 RPM → 116,7 ms entre tiros; três tiros levam dois intervalos.
    expect(timeToKill(ak4d, 0)).toBeCloseTo(2 * (60_000 / 514), 3);
  });

  it('reduz os tiros necessários no acerto de cabeça', () => {
    const sniper = baseStats(WEAPONS_BY_ID.get('sv-98')!);
    expect(shotsToKill(sniper, 10)).toBe(2); // 80 de dano ao peito
    expect(shotsToKill(sniper, 10, true)).toBe(1); // 80 × 1,7 = 136
    expect(timeToKill(sniper, 10, true)).toBe(0);
  });
});

describe('alcance efetivo', () => {
  it('aponta onde a arma passa a precisar de mais um tiro', () => {
    expect(effectiveRange(ak4d)).toBe(21);
  });

  it('não encontra queda em arma de dano constante', () => {
    const m250 = baseStats(WEAPONS_BY_ID.get('m250')!);
    expect(effectiveRange(m250)).toBe(0);
  });

  it('cresce quando o cano estendido empurra os degraus', () => {
    const weapon = WEAPONS_BY_ID.get('ak4d')!;
    const comCano = calculateStats(weapon, resolveAttachments(['cano-estendido-8']));
    expect(effectiveRange(comCano)).toBeGreaterThan(effectiveRange(ak4d));
  });
});

describe('queda do projétil', () => {
  it('parte de zero na boca do cano e cresce com a distância', () => {
    expect(bulletDrop(ak4d, 0)).toBe(0);
    const q100 = bulletDrop(ak4d, 100);
    const q200 = bulletDrop(ak4d, 200);
    expect(q100).toBeGreaterThan(0);
    expect(q200).toBeGreaterThan(q100 * 2); // acelera, não é linear
  });

  it('fica em valores plausíveis para um fuzil a 100 m', () => {
    const queda = bulletDrop(ak4d, 100);
    expect(queda).toBeGreaterThan(0.05);
    expect(queda).toBeLessThan(0.2);
  });

  it('cai menos quando a bala é mais rápida', () => {
    const weapon = WEAPONS_BY_ID.get('ak4d')!;
    const comCano = calculateStats(weapon, resolveAttachments(['cano-prototipo-264']));
    expect(bulletDrop(comCano, 150)).toBeLessThan(bulletDrop(ak4d, 150));
  });

  it('cai muito mais com munição subsônica', () => {
    const weapon = WEAPONS_BY_ID.get('ak4d')!;
    const subsonica = calculateStats(weapon, resolveAttachments(['mun-subsonica']));
    expect(bulletDrop(subsonica, 150)).toBeGreaterThan(bulletDrop(ak4d, 150) * 1.5);
  });

  it('não calcula voo para arma de corpo a corpo', () => {
    const knife = baseStats(WEAPONS_BY_ID.get('kbr-mark-ii')!);
    expect(timeOfFlight(knife, 50)).toBe(0);
    expect(bulletDrop(knife, 50)).toBe(0);
  });
});

describe('curvas dos gráficos', () => {
  it('desenha a queda de dano em ângulo reto', () => {
    const points = damageCurve(ak4d, 100);
    // Cada transição repete a distância: uma vez fechando o patamar, outra abrindo.
    const em21 = points.filter((p) => p.distance === 21);
    expect(em21).toHaveLength(2);
    expect(em21[0].value).toBe(33.4);
    expect(em21[1].value).toBe(25);
  });

  it('estende a curva até o limite pedido', () => {
    const points = damageCurve(ak4d, 150);
    expect(points[points.length - 1].distance).toBe(150);
  });

  it('amostra a queda com a quantidade de pontos pedida', () => {
    const points = dropCurve(ak4d, 200, 20);
    expect(points).toHaveLength(21);
    expect(points[0]).toEqual({ distance: 0, value: 0 });
    expect(points[20].distance).toBe(200);
  });

  it('escolhe uma distância de análise coerente para cada arma', () => {
    for (const weapon of WEAPONS) {
      if (weapon.category === 'corpo-a-corpo') continue;
      const distance = analysisDistance(baseStats(weapon));
      expect(distance, weapon.name).toBeGreaterThanOrEqual(100);
      expect(distance, weapon.name).toBeLessThanOrEqual(400);
    }
  });
});
