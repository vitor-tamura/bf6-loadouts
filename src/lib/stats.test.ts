import { describe, expect, it } from 'vitest';
import { ATTACHMENTS, ATTACHMENTS_BY_ID, attachmentsForWeapon, isCompatible } from '@/data/attachments';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import { POINT_BUDGET } from '@/data/classes';
import {
  fitsBudget,
  calculateBudget,
  calculateStats,
  compareStat,
  resolveAttachments,
  baseStats,
} from './stats';

const ak4d = WEAPONS_BY_ID.get('ak4d')!;

describe('integridade do dataset', () => {
  it('não tem ids de arma repetidos', () => {
    expect(new Set(WEAPONS.map((a) => a.id)).size).toBe(WEAPONS.length);
  });

  it('não tem ids de acessório repetidos', () => {
    expect(new Set(ATTACHMENTS.map((a) => a.id)).size).toBe(ATTACHMENTS.length);
  });

  it('mantém os degraus de dano em distância crescente', () => {
    for (const weapon of WEAPONS) {
      const distancias = weapon.damage.map((d) => d.distance);
      expect(distancias, weapon.name).toEqual([...distancias].sort((a, b) => a - b));
      expect(weapon.damage[0].distance, weapon.name).toBe(0);
    }
  });

  it('deixa toda arma de fogo com pelo menos uma opção em cada slot', () => {
    for (const weapon of WEAPONS) {
      if (weapon.category === 'corpo-a-corpo') continue;
      const bySlot = attachmentsForWeapon(weapon);
      for (const slot of weapon.slots) {
        expect(bySlot.get(slot)?.length ?? 0, `${weapon.name} · ${slot}`).toBeGreaterThan(0);
      }
    }
  });

  it('permite montar a arma inteira sem estourar os 100 pontos usando as peças baratas', () => {
    for (const weapon of WEAPONS) {
      if (weapon.category === 'corpo-a-corpo') continue;
      const maisBaratos = [...attachmentsForWeapon(weapon).values()].map((list) =>
        list.reduce((menor, a) => (a.cost < menor.cost ? a : menor)),
      );
      const total = maisBaratos.reduce((soma, a) => soma + a.cost, 0);
      expect(total, weapon.name).toBeLessThanOrEqual(POINT_BUDGET);
    }
  });

  it('só aceita acessório em slot que a arma possui', () => {
    for (const attachment of ATTACHMENTS) {
      for (const weapon of WEAPONS) {
        if (isCompatible(attachment, weapon)) {
          expect(weapon.slots, `${weapon.name} · ${attachment.name}`).toContain(attachment.slot);
        }
      }
    }
  });
});

describe('cálculo de estatísticas', () => {
  it('sem acessórios devolve os valores de fábrica', () => {
    const stats = baseStats(ak4d);
    expect(stats.rpm).toBe(ak4d.rpm);
    expect(stats.velocity).toBe(ak4d.velocity);
    expect(stats.magazine).toBe(ak4d.magazine);
  });

  it('aplica multiplicadores de velocidade e alcance do cano', () => {
    const cano = ATTACHMENTS_BY_ID.get('cano-estendido-8')!;
    const stats = calculateStats(ak4d, [cano]);
    expect(stats.velocity).toBeCloseTo(ak4d.velocity * 1.14, 5);
    // O primeiro degrau nasce no cano e não se move.
    expect(stats.damage[0].distance).toBe(0);
    expect(stats.damage[1].distance).toBeCloseTo(ak4d.damage[1].distance * 1.12, 5);
  });

  it('não muda o resultado conforme a ordem dos acessórios', () => {
    const a = ATTACHMENTS_BY_ID.get('cano-estendido-8')!;
    const b = ATTACHMENTS_BY_ID.get('boca-supressor-padrao')!;
    const c = ATTACHMENTS_BY_ID.get('ergo-coronha-pesada')!;
    const um = calculateStats(ak4d, [a, b, c]);
    const otherSlot = calculateStats(ak4d, [c, a, b]);
    expect(um).toEqual(otherSlot);
  });

  it('soma antes de multiplicar', () => {
    // Empunhadura Vertical: controle +7 e recuo vertical ×0,84.
    const grip = ATTACHMENTS_BY_ID.get('acopl-vertical-classica')!;
    const stats = calculateStats(ak4d, [grip]);
    expect(stats.control).toBe(ak4d.control + 7);
    expect(stats.verticalRecoil).toBeCloseTo(ak4d.verticalRecoil * 0.84, 5);
  });

  it('mantém as barras de 0 a 100', () => {
    const empilhados = resolveAttachments([
      'mira-nx8-800',
      'cano-pesado-264',
      'carreg-tambor',
      'ergo-coronha-pesada',
      'acopl-bipe',
    ]);
    const stats = calculateStats(WEAPONS_BY_ID.get('m2010-esr')!, empilhados);
    for (const value of [stats.accuracy, stats.control, stats.mobility, stats.hipfire]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('arredonda o carregador para um número inteiro de balas', () => {
    const estendido = ATTACHMENTS_BY_ID.get('carreg-estendido')!;
    const stats = calculateStats(WEAPONS_BY_ID.get('ak-205')!, [estendido]);
    expect(Number.isInteger(stats.magazine)).toBe(true);
    expect(stats.magazine).toBe(45);
  });

  it('acompanha a recarga vazia proporcionalmente à recarga tática', () => {
    const rapido = ATTACHMENTS_BY_ID.get('carreg-rapido')!;
    const stats = calculateStats(ak4d, [rapido]);
    expect(stats.reload / ak4d.reload).toBeCloseTo(stats.emptyReload / ak4d.emptyReload, 5);
  });

  it('descarta id de acessório desconhecido em vez de quebrar', () => {
    expect(resolveAttachments(['nao-existe', null, undefined, 'cano-curto-128'])).toHaveLength(1);
  });
});

describe('orçamento de 100 pontos', () => {
  it('soma o custo dos acessórios escolhidos', () => {
    const list = resolveAttachments(['mira-osa7-100', 'boca-freio-compensado']);
    const budget = calculateBudget(list);
    expect(budget.spent).toBe(8 + 12);
    expect(budget.remaining).toBe(POINT_BUDGET - 20);
    expect(budget.overBudget).toBe(false);
  });

  it('desconta a peça que será substituída no mesmo slot', () => {
    const atuais = resolveAttachments(['mira-nx8-800']); // 26 pontos
    const caros = resolveAttachments([
      'cano-prototipo-264', // 18
      'carreg-tambor', // 18
      'ergo-coronha-pesada', // 11
      'acopl-bipe', // 12
      'mun-perfurante', // 15
    ]);
    const ocupado = [...atuais, ...caros]; // 100 pontos exatos
    expect(calculateBudget(ocupado).spent).toBe(100);

    // Trocar a mira de 26 por outra de 22 cabe; subir para uma mais cara, não.
    const maisBarata = ATTACHMENTS_BY_ID.get('mira-vdd-600')!;
    expect(fitsBudget(maisBarata, ocupado)).toBe(true);

    const novoSlot = ATTACHMENTS_BY_ID.get('opt-ampliador-200')!;
    expect(fitsBudget(novoSlot, ocupado)).toBe(false);
  });
});

describe('comparação com a arma de fábrica', () => {
  it('marca como melhora quando o tempo de mira cai', () => {
    const delta = compareStat('adsMs', 350, 315);
    expect(delta.improves).toBe(true);
    expect(delta.changed).toBe(true);
    expect(delta.percent).toBeCloseTo(-10, 5);
  });

  it('marca como piora quando a mobilidade cai', () => {
    expect(compareStat('mobility', 52, 46).improves).toBe(false);
  });

  it('não sinaliza mudança quando nada mudou', () => {
    expect(compareStat('rpm', 514, 514).changed).toBe(false);
  });
});
