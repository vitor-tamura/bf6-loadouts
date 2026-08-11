import { describe, expect, it } from 'vitest';
import { attachmentsForWeapon } from '@/data/attachments';
import { budgetFor } from '@/data/classes';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import { attachmentCost, attachmentName, defaultBarrel, factoryAttachments } from './loadout';
import { cardapio, custoDaMontagem, isDistancia, validarRecomendacao } from './recommend';

/**
 * O modelo que recomenda loadout escreve nomes, e nomes mentem: vêm em caixa
 * diferente, com peça que a arma não aceita, com conta que estoura o
 * orçamento. Estes testes seguram o funil que fica entre o modelo e a tela —
 * o que sai dele tem de ser uma montagem que o jogo aceitaria, sempre.
 */

const m16 = WEAPONS_BY_ID.get('m16a4')!;

describe('isDistancia', () => {
  it('aceita as três distâncias e rejeita o resto', () => {
    expect(isDistancia('curta')).toBe(true);
    expect(isDistancia('media')).toBe(true);
    expect(isDistancia('longa')).toBe(true);
    expect(isDistancia('redsec')).toBe(false);
    expect(isDistancia(undefined)).toBe(false);
  });
});

describe('cardapio', () => {
  it('lista cada slot pelo id, com nome desta arma e custo ao lado', () => {
    const texto = cardapio(m16);
    expect(texto).toContain('barrel (');

    // O nome no cardápio tem de ser o nome na M16A4 — o 20" Factory é o
    // Estendido dela, e é assim que um guia se refere a ele.
    const estendido = (attachmentsForWeapon(m16).get('barrel') ?? []).find(
      (a) => attachmentName(a, m16) === 'Cano Estendido',
    )!;
    expect(texto).toContain(`Cano Estendido (${attachmentCost(estendido, m16)} pts)`);
  });
});

describe('validarRecomendacao', () => {
  it('aceita o nome em qualquer caixa e devolve o id da peça', () => {
    const { attachments, descartados } = validarRecomendacao(m16, { barrel: 'CANO ESTENDIDO' });
    const escolhido = attachments.barrel!;
    const peca = (attachmentsForWeapon(m16).get('barrel') ?? []).find((a) => a.id === escolhido)!;
    expect(attachmentName(peca, m16)).toBe('Cano Estendido');
    expect(descartados).toEqual([]);
  });

  it('descarta nome que não existe na arma e mantém a peça de fábrica', () => {
    const { attachments, descartados } = validarRecomendacao(m16, { barrel: 'Cano Inventado 9000' });
    expect(attachments.barrel).toBe(defaultBarrel(m16));
    expect(descartados).toHaveLength(1);
  });

  it('nunca deixa vazio um slot que tem peça de fábrica', () => {
    const { attachments } = validarRecomendacao(m16, {});
    for (const [slot, id] of Object.entries(factoryAttachments(m16))) {
      expect(attachments[slot as keyof typeof attachments]).toBe(id);
    }
  });

  it('respeita o orçamento mesmo quando o pedido é a peça mais cara de cada slot', () => {
    // Vale para o arsenal inteiro: é a propriedade, não um exemplo.
    for (const weapon of WEAPONS.filter((w) => w.slots.length > 0)) {
      const porSlot = attachmentsForWeapon(weapon);
      const gula: Record<string, string> = {};
      for (const slot of weapon.slots) {
        const pecas = porSlot.get(slot) ?? [];
        if (!pecas.length) continue;
        const maisCara = [...pecas].sort(
          (a, b) => attachmentCost(b, weapon) - attachmentCost(a, weapon),
        )[0];
        gula[slot] = attachmentName(maisCara, weapon);
      }

      const { attachments } = validarRecomendacao(weapon, gula);
      expect(custoDaMontagem(weapon, attachments)).toBeLessThanOrEqual(budgetFor(weapon.category));
    }
  });
});
