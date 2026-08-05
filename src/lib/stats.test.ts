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

  it('dá a toda arma de fogo um conjunto útil de slots para montar', () => {
    // Nem toda arma recebe peça em todos os dez slots — o catálogo do jogo não é
    // simétrico. O que precisa valer é que a montagem faça sentido: vários slots
    // com opção, e nenhum slot exibido vazio.
    for (const weapon of WEAPONS) {
      if (weapon.category === 'corpo-a-corpo') continue;
      const bySlot = attachmentsForWeapon(weapon);
      expect(bySlot.size, weapon.name).toBeGreaterThanOrEqual(4);
      for (const [slot, list] of bySlot) {
        expect(list.length, `${weapon.name} · ${slot}`).toBeGreaterThan(0);
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
    const cano = ATTACHMENTS_BY_ID.get('cano-600mm-dmr')!;
    const stats = calculateStats(ak4d, [cano]);
    expect(stats.velocity).toBeGreaterThan(ak4d.velocity);
    // O primeiro degrau nasce no cano e não se move.
    expect(stats.damage[0].distance).toBe(0);
    expect(stats.damage[1].distance).toBeGreaterThan(ak4d.damage[1].distance);
  });

  it('não muda o resultado conforme a ordem dos acessórios', () => {
    const a = ATTACHMENTS_BY_ID.get('cano-600mm-dmr')!;
    const b = ATTACHMENTS_BY_ID.get('boca-standard-suppressor')!;
    const c = ATTACHMENTS_BY_ID.get('ergonomia-a3-receiver')!;
    const um = calculateStats(ak4d, [a, b, c]);
    const otherSlot = calculateStats(ak4d, [c, a, b]);
    expect(um).toEqual(otherSlot);
  });

  it('soma antes de multiplicar', () => {
    // Empunhadura Vertical: controle +7 e recuo vertical ×0,84.
    const grip = ATTACHMENTS_BY_ID.get('acoplamento-classic-vertical')!;
    const stats = calculateStats(ak4d, [grip]);
    expect(stats.control).toBe(ak4d.control + 7);
    expect(stats.verticalRecoil).toBeCloseTo(ak4d.verticalRecoil * 0.84, 5);
  });

  it('mantém as barras de 0 a 100', () => {
    const empilhados = resolveAttachments([
      'mira-vs-8-00x',
      'cano-600mm-dmr',
      'carregador-100rnd-drum-mag',
      'ergonomia-a3-receiver',
      'acoplamento-bipod',
    ]);
    const stats = calculateStats(WEAPONS_BY_ID.get('m2010-esr')!, empilhados);
    for (const value of [stats.accuracy, stats.control, stats.mobility, stats.hipfire]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('arredonda o carregador para um número inteiro de balas', () => {
    const estendido = ATTACHMENTS_BY_ID.get('carregador-45rnd-magazine')!;
    const stats = calculateStats(WEAPONS_BY_ID.get('ak-205')!, [estendido]);
    expect(Number.isInteger(stats.magazine)).toBe(true);
    expect(stats.magazine).toBe(45);
  });

  it('acompanha a recarga vazia proporcionalmente à recarga tática', () => {
    const rapido = ATTACHMENTS_BY_ID.get('carregador-20rnd-fast-mag')!;
    const stats = calculateStats(ak4d, [rapido]);
    expect(stats.reload / ak4d.reload).toBeCloseTo(stats.emptyReload / ak4d.emptyReload, 5);
  });

  it('descarta id de acessório desconhecido em vez de quebrar', () => {
    expect(resolveAttachments(['nao-existe', null, undefined, 'cano-409mm-us'])).toHaveLength(1);
  });
});

describe('orçamento de 100 pontos', () => {
  it('soma o custo dos acessórios escolhidos', () => {
    const list = resolveAttachments(['mira-iron-sights', 'boca-compensated-brake']);
    const custos = list.reduce((soma, a) => soma + a.cost, 0);
    const budget = calculateBudget(list);
    expect(budget.spent).toBe(custos);
    expect(budget.remaining).toBe(POINT_BUDGET - custos);
    expect(budget.overBudget).toBe(false);
  });

  it('desconta a peça que será substituída no mesmo slot', () => {
    const mira = ATTACHMENTS_BY_ID.get('mira-iron-sights')!;
    const outra = ATTACHMENTS_BY_ID.get('boca-compensated-brake')!;
    const atuais = [mira, outra];

    // Trocar dentro do mesmo slot só considera a diferença de custo.
    const substituta = ATTACHMENTS.find(
      (a) => a.slot === 'mira' && a.id !== mira.id && a.cost <= POINT_BUDGET - outra.cost,
    )!;
    expect(fitsBudget(substituta, atuais)).toBe(true);

    // Já uma peça cara em slot livre precisa caber no que sobrou.
    const gastoQuaseTodo = ATTACHMENTS.filter((a) => a.slot === 'cano').slice(0, 1);
    const caro = { ...substituta, id: 'teste-caro', slot: 'ergonomia' as const, cost: POINT_BUDGET };
    expect(fitsBudget(caro, [...atuais, ...gastoQuaseTodo])).toBe(false);
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
