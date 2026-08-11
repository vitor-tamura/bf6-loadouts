import { describe, expect, it } from 'vitest';
import { ATTACHMENTS_BY_ID, attachmentsForWeapon } from '@/data/attachments';
import { budgetFor } from '@/data/classes';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import { attachmentCost, attachmentName, defaultBarrel, factoryAttachments } from './loadout';
import {
  attachmentMenu,
  buildAdvice,
  buildCost,
  COMBAT_RANGES,
  isCombatRange,
  idealLoadout,
  attachmentScore,
  type RawAdvice,
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

/**
 * O que a rota entrega para a tela.
 *
 * Uma resposta real do modelo mostrou os três buracos de uma vez: aplicou a
 * munição FMJ e explicou a Hollow Point logo abaixo dela; descreveu, no "como
 * jogar", um supressor e um carregador rápido que o funil tinha tirado; e se
 * declarou "META, confiança HIGH" sem a busca ter aberto uma única página.
 *
 * Texto que descreve uma arma diferente da que está montada é pior que texto
 * nenhum — some com a razão de existir do painel, que é explicar o que está na
 * tela. Daí as três travas testadas aqui.
 */
describe('buildAdvice', () => {
  const sources = [{ name: 'reddit.com', url: 'https://reddit.com/r/Battlefield6/comments/abc' }];

  const resposta = (extra: Partial<RawAdvice> = {}): RawAdvice => ({
    picks: { barrel: 'Cano Estendido' },
    reason: 'A comunidade converge nesta montagem desde o último ajuste de recuo.',
    ...extra,
  });

  it('monta o conselho a partir de uma resposta que se sustenta', () => {
    const { advice, discarded } = buildAdvice(m16, resposta({
      why: { barrel: 'Segura o coice nas rajadas longas.' },
      status: 'trending',
      confidence: 'high',
    }), sources);

    expect(discarded).toEqual([]);
    expect(advice.why.barrel).toBe('Segura o coice nas rajadas longas.');
    // Vocabulário fechado, em caixa alta, venha o modelo como vier.
    expect(advice.status).toBe('TRENDING');
    expect(advice.confidence).toBe('HIGH');
    expect(advice.unsourced).toBe(false);
  });

  it('não deixa a explicação de uma peça embaixo de outra', () => {
    // Uma mira que não é a de fábrica, para a montagem ter o que mostrar mesmo
    // com o cano recusado.
    const sight = (attachmentsForWeapon(m16).get('sight') ?? []).find(
      (a) => a.id !== factoryAttachments(m16).sight,
    )!;

    const { advice, discarded } = buildAdvice(m16, resposta({
      picks: { barrel: 'Cano Inventado 9000', sight: attachmentName(sight, m16) },
      // O funil recusa o cano e a peça de fábrica fica no lugar; esta frase,
      // que fala do cano pedido, não pode aparecer descrevendo o que ficou.
      why: {
        barrel: 'O cano inventado estica o alcance efetivo.',
        sight: 'Leitura limpa do alvo a média distância.',
      },
    }), sources);

    expect(advice.attachments.barrel).toBe(defaultBarrel(m16));
    expect(advice.why.barrel).toBeUndefined();
    expect(advice.why.sight).toBe('Leitura limpa do alvo a média distância.');
    expect(discarded).toHaveLength(1);
  });

  it('cobra a alternativa pelo mesmo funil da principal', () => {
    const { discarded } = buildAdvice(m16, resposta({
      alternative: { label: 'longo alcance', picks: { barrel: 'Cano Que Não Existe' } },
    }), sources);

    expect(discarded.some((item) => item.includes('na alternativa'))).toBe(true);
  });

  it('rebaixa a confiança quando a busca não citou nada', () => {
    const { advice } = buildAdvice(m16, resposta({ status: 'META', confidence: 'HIGH' }), []);

    expect(advice.unsourced).toBe(true);
    expect(advice.confidence).toBe('LOW');
    // O status continua sendo o que o modelo disse: quem perde peso é a
    // confiança, que é justamente o campo que mede o lastro.
    expect(advice.status).toBe('META');
  });

  it('recusa a resposta que não muda nada além da fábrica', () => {
    expect(() => buildAdvice(m16, { picks: {}, reason: 'Vai assim mesmo.' }, sources)).toThrow(
      /fábrica/,
    );
  });
});
