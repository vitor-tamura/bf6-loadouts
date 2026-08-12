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
  /*
   * A reclamação que originou a regra: toda sugestão terminava com lanterna e
   * alça de ferro inclinada montadas, em qualquer arma e qualquer distância.
   *
   * Eram dois defeitos somados. O ganho de um slot vazio era medido contra
   * zero, e não contra a arma sem a peça, então qualquer coisa num slot vazio
   * valia a nota inteira da arma — centenas, contra os dois ou três pontos que
   * um cano melhor rende. E a passada que gasta o troco aceitava ganho
   * positivo por qualquer fração, enchendo trilho e acessório de mira com o
   * que sobrasse.
   */
  it('não gasta o orçamento em peça que só mexe no tiro de quadril', () => {
    const cosmeticos = new Set([
      'leftRail-flashlight',
      'opticAccessory-canted-iron-sight',
      'opticAccessory-canted-iron-sights',
    ]);

    // Média e longa é onde o orçamento tem competição de verdade, e é a média
    // que o botão da tela pede. Em curta sobra ponto numa LMG ou num sniper, e
    // aí a lanterna é o melhor uso do troco — o que a regra impede é ela passar
    // na frente de peça que muda a arma, não que ela exista.
    for (const range of ['media', 'longa'] as const) {
      for (const weapon of WEAPONS.filter((w) => w.slots.length > 0)) {
        const montadas = Object.values(idealLoadout(weapon, range));
        const intrusa = montadas.find((id) => id && cosmeticos.has(id));
        expect(intrusa, `${weapon.name} em ${range} montou ${intrusa}`).toBeUndefined();
      }
    }
  });

  it('monta boca, cano e empunhadura antes de qualquer trilho', () => {
    for (const id of ['m433', 'b36a4', 'm16a4', 'sgx']) {
      const weapon = WEAPONS_BY_ID.get(id)!;
      const build = idealLoadout(weapon, 'media');

      for (const slot of ['muzzle', 'barrel', 'underbarrel'] as const) {
        if (!weapon.slots.includes(slot)) continue;
        expect(build[slot], `${weapon.name} ficou sem ${slot}`).toBeTruthy();
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

  /**
   * A regressão que a TR-7 mostrou em produção.
   *
   * A build principal veio impecável duas vezes seguidas, e as duas respostas
   * foram recusadas porque a alternativa pedia a "Mini Reflex 1.00x" — que na
   * TR-7 se chama "Mini Flex 1.00x". O visitante clicou no botão e recebeu a
   * montagem calculada por estatística, com o aviso de que a comunidade não
   * respondeu. Ela tinha respondido.
   */
  it('tira a alternativa que não se sustenta, sem derrubar a principal', () => {
    const { advice, discarded, alternativeDiscarded } = buildAdvice(m16, resposta({
      alternative: { label: 'longo alcance', picks: { barrel: 'Cano Que Não Existe' } },
    }), sources);

    expect(discarded).toEqual([]);
    expect(alternativeDiscarded).toHaveLength(1);
    expect(advice.alternative).toBeNull();
    expect(advice.attachments.barrel).not.toBe(defaultBarrel(m16));
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

/**
 * O nome que o modelo escreve de memória.
 *
 * Ele lê a lista e reescreve, e às vezes reescreve torto — "Mini Reflex 1.00x"
 * por "Mini Flex 1.00x". Recusar por duas letras custava a resposta inteira;
 * aceitar qualquer parecido montaria a arma errada. O meio-termo tem regra:
 * nome exato manda, o parecido só entra sozinho, e número tem de bater.
 */
describe('nome aproximado da peça', () => {
  const tr7 = WEAPONS_BY_ID.get('tr-7')!;

  /** Uma letra a mais no meio: o deslize típico de quem escreve de memória. */
  const comDeslize = (name: string) => `${name.slice(0, 3)}${name[2]}${name.slice(3)}`;

  it('aceita o nome com uma letra trocada quando só uma peça fica perto', () => {
    for (const weapon of [m16, tr7]) {
      for (const slot of weapon.slots) {
        const parts = attachmentsForWeapon(weapon).get(slot) ?? [];
        const part = parts.find((a) => attachmentName(a, weapon).length >= 10);
        if (!part) continue;

        const nome = attachmentName(part, weapon);
        const { attachments, discarded } = validateRecommendation(weapon, {
          [slot]: comDeslize(nome),
        });

        // Ou a peça certa entrou, ou o deslize deixou dois candidatos igualmente
        // perto — e aí recusar é o comportamento combinado.
        if (!discarded.length) expect(attachments[slot]).toBe(part.id);
      }
    }
  });

  it('não confunde peças que se distinguem pelo número', () => {
    const canos = (attachmentsForWeapon(m16).get('barrel') ?? []).map((a) => attachmentName(a, m16));
    const comNumero = canos.find((nome) => /\d/.test(nome));
    if (!comNumero) return;

    // Mesmo nome, outro número: é outra peça, não um erro de digitação.
    const outro = comNumero.replace(/\d/, (d) => (d === '9' ? '8' : String(Number(d) + 1)));
    if (canos.includes(outro)) return;

    const { discarded } = validateRecommendation(m16, { barrel: outro });
    expect(discarded).toHaveLength(1);
  });

  it('recusa o nome que não lembra nenhuma peça', () => {
    const { discarded } = validateRecommendation(m16, { barrel: 'Cano de Plasma Sideral' });
    expect(discarded).toHaveLength(1);
  });

  it('aceita o nome abreviado quando ele só pode ser uma peça', () => {
    /*
     * O modelo escreveu "RO-M" para a "RO-M 1.00x": cortou a ampliação, que é
     * o que distingue uma mira da outra. Quando o prefixo aponta para uma peça
     * só, ele basta; quando serve para duas, escolher seria adivinhar.
     */
    const miras = (attachmentsForWeapon(m16).get('sight') ?? []).map((a) => attachmentName(a, m16));
    const comAmpliacao = miras.find((nome) => / \d[.,]\d\dx$/.test(nome));
    if (!comAmpliacao) return;

    const base = comAmpliacao.replace(/ \d[.,]\d\dx$/, '');
    const irmas = miras.filter((nome) => nome.startsWith(base));

    const { attachments, discarded } = validateRecommendation(m16, { sight: base });

    if (irmas.length === 1) {
      expect(discarded).toHaveLength(0);
      expect(attachments.sight).toBeTruthy();
    } else {
      // Prefixo ambíguo: recusar é a resposta honesta.
      expect(discarded).toHaveLength(1);
    }
  });

  it('aceita o nome com o custo colado, que é como o modelo o devolve', () => {
    /*
     * O cardápio do prompt lista "Cano Estendido (10 pts)", porque o preço é o
     * que decide o que cabe no orçamento — e o modelo copia o nome com o preço
     * junto. A peça deixava de ser encontrada por causa do sufixo que a própria
     * pergunta pôs ali.
     */
    const cano = (attachmentsForWeapon(m16).get('barrel') ?? [])[0];
    const nome = attachmentName(cano, m16);

    const comCusto = validateRecommendation(m16, { barrel: `${nome} (10 pts)` });
    expect(comCusto.discarded).toHaveLength(0);
    expect(comCusto.attachments.barrel).toBe(cano.id);

    // Uma peça só, sem plural e sem espaço, continua valendo.
    expect(validateRecommendation(m16, { barrel: `${nome} (5 pt)` }).discarded).toHaveLength(0);
  });
});
