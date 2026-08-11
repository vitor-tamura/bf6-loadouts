import { describe, expect, it } from 'vitest';
import { ATTACHMENTS_BY_ID, attachmentsForWeapon } from '@/data/attachments';
import { budgetFor } from '@/data/classes';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import { attachmentCost, attachmentName, defaultBarrel, factoryAttachments } from './loadout';
import {
  attachmentMenu,
  buildCost,
  COMBAT_RANGES,
  isCombatRange,
  idealLoadout,
  attachmentScore,
  validateRecommendation,
} from './recommend';

/**
 * O modelo que recomenda loadout escreve nomes, e nomes mentem: vêm em caixa
 * diferente, com peça que a arma não aceita, com conta que estoura o
 * orçamento. Estes testes seguram o funil que fica entre o modelo e a tela —
 * o que sai dele tem de ser uma montagem que o jogo aceitaria, sempre.
 */

const m16 = WEAPONS_BY_ID.get('m16a4')!;

describe('isCombatRange', () => {
  it('aceita as três distâncias e rejeita o resto', () => {
    expect(isCombatRange('curta')).toBe(true);
    expect(isCombatRange('media')).toBe(true);
    expect(isCombatRange('longa')).toBe(true);
    expect(isCombatRange('redsec')).toBe(false);
    expect(isCombatRange(undefined)).toBe(false);
  });
});

describe('attachmentMenu', () => {
  it('lista cada slot pelo id, com nome desta arma e custo ao lado', () => {
    const menu = attachmentMenu(m16);
    expect(menu).toContain('barrel (');

    // O nome no cardápio tem de ser o nome na M16A4 — o 20" Factory é o
    // Estendido dela, e é assim que um guia se refere a ele.
    const extended = (attachmentsForWeapon(m16).get('barrel') ?? []).find(
      (a) => attachmentName(a, m16) === 'Cano Estendido',
    )!;
    expect(menu).toContain(`Cano Estendido (${attachmentCost(extended, m16)} pts)`);
  });
});

describe('validateRecommendation', () => {
  it('aceita o nome em qualquer caixa e devolve o id da peça', () => {
    const { attachments, discarded } = validateRecommendation(m16, { barrel: 'CANO ESTENDIDO' });
    const chosen = attachments.barrel!;
    const part = (attachmentsForWeapon(m16).get('barrel') ?? []).find((a) => a.id === chosen)!;
    expect(attachmentName(part, m16)).toBe('Cano Estendido');
    expect(discarded).toEqual([]);
  });

  it('descarta nome que não existe na arma e mantém a peça de fábrica', () => {
    const { attachments, discarded } = validateRecommendation(m16, { barrel: 'Cano Inventado 9000' });
    expect(attachments.barrel).toBe(defaultBarrel(m16));
    expect(discarded).toHaveLength(1);
  });

  it('nunca deixa vazio um slot que tem peça de fábrica', () => {
    const { attachments } = validateRecommendation(m16, {});
    for (const [slot, id] of Object.entries(factoryAttachments(m16))) {
      expect(attachments[slot as keyof typeof attachments]).toBe(id);
    }
  });

  it('respeita o orçamento mesmo quando o pedido é a peça mais cara de cada slot', () => {
    // Vale para o arsenal inteiro: é a propriedade, não um exemplo.
    for (const weapon of WEAPONS.filter((w) => w.slots.length > 0)) {
      const bySlot = attachmentsForWeapon(weapon);
      const greedy: Record<string, string> = {};
      for (const slot of weapon.slots) {
        const parts = bySlot.get(slot) ?? [];
        if (!parts.length) continue;
        const priciest = [...parts].sort(
          (a, b) => attachmentCost(b, weapon) - attachmentCost(a, weapon),
        )[0];
        greedy[slot] = attachmentName(priciest, weapon);
      }

      const { attachments } = validateRecommendation(weapon, greedy);
      expect(buildCost(weapon, attachments)).toBeLessThanOrEqual(budgetFor(weapon.category));
    }
  });
});

describe('idealLoadout', () => {
  it('gera uma montagem válida e dentro do orçamento para o arsenal inteiro', () => {
    for (const weapon of WEAPONS.filter((w) => w.slots.length > 0)) {
      const attachments = idealLoadout(weapon);
      const bySlot = attachmentsForWeapon(weapon);

      expect(buildCost(weapon, attachments)).toBeLessThanOrEqual(budgetFor(weapon.category));
      for (const [slot, id] of Object.entries(attachments)) {
        expect(bySlot.get(slot as keyof typeof attachments)?.some((a) => a.id === id)).toBe(true);
      }
    }
  });

  it('mantém as peças de fábrica quando elas existem', () => {
    const attachments = idealLoadout(m16);
    for (const slot of Object.keys(factoryAttachments(m16))) {
      expect(attachments[slot as keyof typeof attachments]).toBeTruthy();
    }
  });

  /*
   * A regressão que motivou a trava por slot.
   *
   * Os candidatos vêm ordenados do melhor ganho para o pior, e sem trava o
   * seguinte do mesmo slot sobrescrevia o que já tinha entrado: na M16A4 a
   * curta distância, o Cano Crio (ganho 19,6) perdia o lugar para o Cano Curto
   * (ganho 7,2), que é o último da fila. Trocar uma peça por outra pior é o
   * oposto do que o botão promete.
   */
  it('escolhe, em cada slot, a melhor peça que cabe no orçamento', () => {
    for (const range of COMBAT_RANGES.map((item) => item.value)) {
      const chosen = idealLoadout(m16, range);

      for (const slot of m16.slots) {
        const id = chosen[slot];
        if (!id) continue;

        // Quem entrou tem de ser, entre as peças daquele slot que caberiam no
        // lugar dela, a de melhor pontuação — ninguém melhor ficou de fora.
        const affordable = (attachmentsForWeapon(m16).get(slot) ?? []).filter(
          (a) => buildCost(m16, { ...chosen, [slot]: a.id }) <= budgetFor(m16.category),
        );
        const scoreOf = (part: { id: string }) =>
          attachmentScore(m16, ATTACHMENTS_BY_ID.get(part.id)!, range);

        const best = Math.max(...affordable.map(scoreOf));
        expect(scoreOf({ id })).toBeCloseTo(best, 5);
      }
    }
  });
});
