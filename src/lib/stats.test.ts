import { describe, expect, it } from 'vitest';
import { ATTACHMENTS, ATTACHMENTS_BY_ID, attachmentsForWeapon, isCompatible } from '@/data/attachments';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import {
  attachmentCost,
  attachmentName,
  defaultAmmo,
  defaultSight,
  factoryAttachments,
  stripIncompatible,
  EMPTY_LOADOUT,
} from './loadout';
import { budgetFor, POINT_BUDGET } from '@/data/classes';
import type { SlotId, Weapon } from '@/data/types';
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
      const distances = weapon.damage.map((d) => d.distance);
      expect(distances, weapon.name).toEqual([...distances].sort((a, b) => a - b));
      expect(weapon.damage[0].distance, weapon.name).toBe(0);
    }
  });

  it('dá a toda arma de fogo um conjunto útil de slots para montar', () => {
    // Nem toda arma recebe peça em todos os dez slots — o catálogo do jogo não é
    // simétrico. O que precisa valer é que a montagem faça sentido: vários slots
    // com opção, e nenhum slot exibido vazio.
    for (const weapon of WEAPONS) {
      if (weapon.category === 'melee') continue;
      const bySlot = attachmentsForWeapon(weapon);
      expect(bySlot.size, weapon.name).toBeGreaterThanOrEqual(4);
      for (const [slot, list] of bySlot) {
        expect(list.length, `${weapon.name} · ${slot}`).toBeGreaterThan(0);
      }
    }
  });

  it('mantém a montagem essencial dentro do orçamento', () => {
    /*
     * Encher os dez slots nem sempre cabe nos cem pontos, e isso é do jogo: a
     * M2010 gasta trinta só no ferrolho, e escolher o que fica de fora é parte
     * de montar a arma. O que precisa caber é o essencial — o que a arma leva
     * para o combate em qualquer build.
     *
     * Pistola tem metade dos pontos, então o teste é mais apertado nela, que é
     * onde um acessório caro demais passaria despercebido.
     */
    const ESSENCIAIS: SlotId[] = ['sight', 'muzzle', 'barrel', 'magazine', 'ammo'];

    for (const weapon of WEAPONS) {
      if (weapon.category === 'melee') continue;
      const bySlot = attachmentsForWeapon(weapon);
      const total = ESSENCIAIS.reduce((sum, slot) => {
        const list = bySlot.get(slot);
        return list ? sum + Math.min(...list.map((a) => a.cost)) : sum;
      }, 0);
      expect(total, weapon.name).toBeLessThanOrEqual(budgetFor(weapon.category));
    }
  });

  it('não tem peça que sozinha estoure o orçamento da arma', () => {
    for (const weapon of WEAPONS) {
      if (weapon.category === 'melee') continue;
      for (const [slot, list] of attachmentsForWeapon(weapon)) {
        const cheapest = Math.min(...list.map((a) => a.cost));
        expect(cheapest, `${weapon.name} · ${slot}`).toBeLessThanOrEqual(budgetFor(weapon.category));
      }
    }
  });

  it('dá seis blocos à pistola e dez à arma principal', () => {
    expect(budgetFor('pistol')).toBe(60);
    expect(budgetFor('ar')).toBe(POINT_BUDGET);
    expect(budgetFor('melee')).toBe(0);
  });

  /*
    O montador não pode oferecer peça que o Gunsmith do jogo não oferece: quem
    monta aqui vai montar lá, e uma build que não fecha no jogo é pior que uma
    build ruim. O caso é o Gatilho na EF88 e na BROD 3, desligado por comunicado
    do estúdio em agosto de 2026 e sem uma linha em changelog — que é
    justamente por que nenhuma sincronização automática pega isso.
  */
  it('não oferece o Gatilho onde o estúdio o desligou', () => {
    const gatilho = ATTACHMENTS.find((a) => a.id === 'ergonomics-match-trigger');

    expect(gatilho, 'ergonomics-match-trigger').toBeDefined();
    expect(gatilho?.compat.weapons).not.toContain('ef88');
    expect(gatilho?.compat.weapons).not.toContain('brod-3');
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
    const barrelGlyph = ATTACHMENTS_BY_ID.get('barrel-600mm-dmr')!;
    const stats = calculateStats(ak4d, [barrelGlyph]);
    expect(stats.velocity).toBeGreaterThan(ak4d.velocity);
    // O primeiro degrau nasce no cano e não se move.
    expect(stats.damage[0].distance).toBe(0);
    expect(stats.damage[1].distance).toBeGreaterThan(ak4d.damage[1].distance);
  });

  it('não muda o resultado conforme a ordem dos acessórios', () => {
    const a = ATTACHMENTS_BY_ID.get('barrel-600mm-dmr')!;
    const b = ATTACHMENTS_BY_ID.get('muzzle-standard-suppressor')!;
    const c = ATTACHMENTS_BY_ID.get('ergonomics-a3-receiver')!;
    const one = calculateStats(ak4d, [a, b, c]);
    const otherSlot = calculateStats(ak4d, [c, a, b]);
    expect(one).toEqual(otherSlot);
  });

  it('soma antes de multiplicar', () => {
    // Empunhadura Vertical: controle +7 e recuo vertical ×0,84.
    const grip = ATTACHMENTS_BY_ID.get('underbarrel-classic-vertical')!;
    const stats = calculateStats(ak4d, [grip]);
    expect(stats.control).toBe(ak4d.control + 7);
    expect(stats.verticalRecoil).toBeCloseTo(ak4d.verticalRecoil * 0.84, 5);
  });

  it('mantém as barras de 0 a 100', () => {
    const stacked = resolveAttachments([
      'sight-vs-8-00x',
      'barrel-600mm-dmr',
      'magazine-100rnd-drum-mag',
      'ergonomics-a3-receiver',
      'underbarrel-bipod',
    ]);
    const stats = calculateStats(WEAPONS_BY_ID.get('m2010-esr')!, stacked);
    for (const value of [stats.accuracy, stats.control, stats.mobility, stats.hipfire]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('arredonda o carregador para um número inteiro de balas', () => {
    const extended = ATTACHMENTS_BY_ID.get('magazine-45rnd-magazine')!;
    const stats = calculateStats(WEAPONS_BY_ID.get('ak-205')!, [extended]);
    expect(Number.isInteger(stats.magazine)).toBe(true);
    expect(stats.magazine).toBe(45);
  });

  it('acompanha a recarga vazia proporcionalmente à recarga tática', () => {
    const fast = ATTACHMENTS_BY_ID.get('magazine-20rnd-fast-mag')!;
    const stats = calculateStats(ak4d, [fast]);
    expect(stats.reload / ak4d.reload).toBeCloseTo(stats.emptyReload / ak4d.emptyReload, 5);
  });

  it('descarta id de acessório desconhecido em vez de quebrar', () => {
    expect(resolveAttachments(['nao-existe', null, undefined, 'barrel-409mm-us'])).toHaveLength(1);
  });
});

describe('orçamento de 100 pontos', () => {
  it('soma o custo dos acessórios escolhidos', () => {
    const list = resolveAttachments(['sight-iron-sights', 'muzzle-compensated-brake']);
    const costs = list.reduce((sum, a) => sum + a.cost, 0);
    const budget = calculateBudget(list);
    expect(budget.spent).toBe(costs);
    expect(budget.remaining).toBe(POINT_BUDGET - costs);
    expect(budget.overBudget).toBe(false);
  });

  it('desconta a peça que será substituída no mesmo slot', () => {
    const sight = ATTACHMENTS_BY_ID.get('sight-iron-sights')!;
    const other = ATTACHMENTS_BY_ID.get('muzzle-compensated-brake')!;
    const currentOnes = [sight, other];

    // Trocar dentro do mesmo slot só considera a diferença de custo.
    const replacement = ATTACHMENTS.find(
      (a) => a.slot === 'sight' && a.id !== sight.id && a.cost <= POINT_BUDGET - other.cost,
    )!;
    expect(fitsBudget(replacement, currentOnes)).toBe(true);

    // Já uma peça cara em slot livre precisa caber no que sobrou.
    const nearlyFullSpend = ATTACHMENTS.filter((a) => a.slot === 'barrel').slice(0, 1);
    const expensive = { ...replacement, id: 'teste-caro', slot: 'ergonomics' as const, cost: POINT_BUDGET };
    expect(fitsBudget(expensive, [...currentOnes, ...nearlyFullSpend])).toBe(false);
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

describe('munição', () => {
  it('deixa toda arma de fogo com a munição de série montada', () => {
    for (const weapon of WEAPONS) {
      const ammo = defaultAmmo(weapon);
      if (weapon.category === 'melee') {
        expect(ammo, weapon.name).toBeNull();
        continue;
      }
      const attachment = ATTACHMENTS_BY_ID.get(ammo!)!;
      expect(attachment, weapon.name).toBeDefined();
      expect(isCompatible(attachment, weapon), weapon.name).toBe(true);
      // De série já vem montada, então não altera número nenhum — mas ocupa
      // pontos do orçamento como qualquer outra peça.
      expect(Object.keys(attachment.mods), weapon.name).toHaveLength(0);
      expect(attachment.cost, weapon.name).toBeGreaterThan(0);
    }
  });

  it('deixa toda arma de fogo enxergando alguma coisa', () => {
    for (const weapon of WEAPONS) {
      if (weapon.category === 'melee') continue;
      const sight = defaultSight(weapon);
      expect(sight, weapon.name).toBeTruthy();
      const attachment = ATTACHMENTS_BY_ID.get(sight!)!;
      expect(isCompatible(attachment, weapon), weapon.name).toBe(true);
      // A alça de ferro é a de série; onde a arma não a aceita — só a UMG-40,
      // hoje —, vale a mira mais barata que ela aceita.
      const options = attachmentsForWeapon(weapon).get('sight')!;
      expect(attachment.cost, weapon.name).toBe(options[0].cost);
    }
    expect(defaultSight(WEAPONS_BY_ID.get('ak4d')!)).toBe('sight-iron-sights');
    // Ferrolho também enxerga por alça de ferro: o filtro por categoria a negava
    // à classe inteira, e as duas fontes que olham o Gunsmith dizem o contrário.
    expect(defaultSight(WEAPONS_BY_ID.get('sv-98')!)).toBe('sight-iron-sights');
    expect(defaultSight(WEAPONS_BY_ID.get('umg-40')!)).not.toBe('sight-iron-sights');
  });

  it('repõe a munição ao limpar a montagem ou trocar de arma', () => {
    const built = stripIncompatible({ ...EMPTY_LOADOUT, weapon: 'ak4d', attachments: {} });
    expect(built.attachments.ammo).toBe('ammo-fmj');

    const shotgun = stripIncompatible({ ...EMPTY_LOADOUT, weapon: 'm1014', attachments: {} });
    expect(shotgun.attachments.ammo).toBe('ammo-buckshot');
  });

  it('fixa o dano na cabeça em vez de multiplicar o da arma', () => {
    const hollowPoint = ATTACHMENTS_BY_ID.get('ammo-hollow-point')!;
    const synthetic = ATTACHMENTS_BY_ID.get('ammo-synthetic-tip')!;
    // O valor é o mesmo em qualquer arma — é isso que "1,50x" quer dizer.
    expect(calculateStats(ak4d, [hollowPoint]).headshot).toBe(1.5);
    expect(calculateStats(WEAPONS_BY_ID.get('b36a4')!, [synthetic]).headshot).toBe(1.75);
  });

  it('dobra o arrasto do projétil com a munição de longo alcance', () => {
    // O patch 1.3.3.0 subiu o arrasto de todas as armas em 40% e o da Match
    // Grade em 100%: a peça fecha o agrupamento e cobra na queda da bala.
    const sniper = WEAPONS_BY_ID.get('sv-98')!;
    const longRange = ATTACHMENTS_BY_ID.get('ammo-match-grade')!;
    expect(calculateStats(sniper, [longRange]).drag).toBeGreaterThan(baseStats(sniper).drag);
  });
});

describe('nome do cano', () => {
  const canos = ATTACHMENTS.filter((a) => a.slot === 'barrel');
  const canosDe = (weapon: Weapon) => canos.filter((c) => (c.compat.weapons ?? []).includes(weapon.id));
  const comCano = WEAPONS.filter((w) => canosDe(w).length > 0);

  /*
   * O jogo nomeia o cano pelo papel que ele cumpre na arma, e cada papel aparece
   * uma vez só na tela de seleção. Dois canos com o mesmo nome na mesma arma são
   * duas peças que o jogador não consegue distinguir na hora de escolher.
   *
   * Vinte e duas armas ainda caem nisso: são canos de mesmo comprimento e mesmo
   * perfil, que o dataset não tem como separar sem a tela do jogo. O teste
   * segura o número onde está — ele deve cair quando chegar tela nova, e nunca
   * subir.
   */
  it('não deixa o nome do cano repetir mais do que o já conhecido', () => {
    const repetidos = comCano.flatMap((w) => {
      const porNome = new Map<string, number>();
      for (const c of canosDe(w)) {
        const nome = attachmentName(c, w);
        porNome.set(nome, (porNome.get(nome) ?? 0) + 1);
      }
      return [...porNome.values()].filter((n) => n > 1);
    });
    expect(repetidos.length).toBeLessThanOrEqual(22);
  });

  /** Toda arma sai de fábrica com um cano montado, e é sempre o Básico. */
  it('dá a cada arma um cano básico, e um só', () => {
    const semUm = comCano.filter(
      (w) => canosDe(w).filter((c) => attachmentName(c, w) === 'Cano Básico').length !== 1,
    );
    // As mesmas armas do teste acima, pela mesma razão.
    expect(semUm.length).toBeLessThanOrEqual(14);
  });

  it('só usa os nomes que a tela de seleção do jogo mostra', () => {
    const oficiais = new Set([
      'Cano Curto', 'Cano Básico', 'Cano Estendido', 'Cano Curto Leve', 'Cano Leve',
      'Cano Estendido Leve', 'Cano Pesado', 'Cano Ext. Pesado', 'Cano Crio',
    ]);
    const fora = new Set<string>();
    for (const w of comCano) for (const c of canosDe(w)) {
      const nome = attachmentName(c, w);
      if (!oficiais.has(nome)) fora.add(nome);
    }
    expect([...fora]).toEqual([]);
  });

  it('cobra pelo cano o que a tela do jogo cobra', () => {
    // Tabela lida em duas telas, e igual nas duas.
    const tabela: Record<string, number> = {
      'Cano Estendido': 5, 'Cano Básico': 10, 'Cano Pesado': 10, 'Cano Ext. Pesado': 10,
      'Cano Curto': 15, 'Cano Leve': 20, 'Cano Crio': 20,
      'Cano Curto Leve': 25, 'Cano Estendido Leve': 25,
    };
    for (const c of canos) expect(tabela[c.name]).toBe(c.cost);
  });

  /*
   * Nenhuma arma sai de fábrica sem cano: o Básico vem montado, cobra os dez
   * pontos e não há como tirá-lo para recuperá-los. Sem isso, o orçamento da
   * tela não bate com o do jogo.
   */
  it('monta o cano de fábrica em toda arma que tem o slot', () => {
    const semCano = WEAPONS.filter(
      (w) => w.slots.includes('barrel') && canosDe(w).length > 0 && !factoryAttachments(w).barrel,
    );
    expect(semCano.map((w) => w.name)).toEqual([]);
  });

  it('monta sempre o Cano Básico como peça de fábrica', () => {
    for (const w of comCano) {
      const cano = ATTACHMENTS_BY_ID.get(factoryAttachments(w).barrel!)!;
      expect([w.name, attachmentName(cano, w)]).toEqual([w.name, 'Cano Básico']);
    }
  });

  /*
   * O cano de fábrica custa dez pontos em toda arma — é o que o jogo cobra só
   * por carregá-la. Antes três armas escapavam disso, porque a peça que faz o
   * papel de Básico nelas cumpre outro papel na maioria e o preço vinha de um
   * campo só por peça. Agora o preço sai da categoria, que é por arma.
   */
  it('mantém o cano de fábrica em dez pontos, em toda arma', () => {
    const fora = comCano
      .filter((w) => attachmentCost(ATTACHMENTS_BY_ID.get(factoryAttachments(w).barrel!)!, w) !== 10)
      .map((w) => w.name);
    expect(fora).toEqual([]);
  });

  /*
   * Os cinco canos que a correção encareceu, com o valor que tinham antes.
   *
   * Ficam nomeados porque são o efeito visível dela: um link compartilhado que
   * estivesse no limite com um destes abre marcado como capacidade excedida. O
   * link não deixou de valer — ele descrevia uma montagem que o jogo não
   * aceita, e o site é que dizia o contrário.
   *
   * Os dois primeiros são os que mais pesam: `14.5" Carbine` é barato por ser
   * Estendido na maioria das armas, e nestas duas ele é o Curto.
   */
  it('encarece exatamente os cinco canos que estavam com o preço de outro papel', () => {
    const casos = [
      ['drs-iar', '14.5" Carbine', 5, 15],
      ['grt-cps', '14.5" Carbine', 5, 15],
      ['grt-cps', '16" Rifle', 5, 10],
      ['m87a1', '20" Factory', 5, 10],
      ['pp-19', '264mm Fluted', 20, 25],
    ] as const;

    for (const [armaId, original, antes, agora] of casos) {
      const w = WEAPONS_BY_ID.get(armaId)!;
      const cano = canosDe(w).find((c) => c.originalName === original)!;
      expect([armaId, original, cano.cost, attachmentCost(cano, w)]).toEqual([
        armaId,
        original,
        antes,
        agora,
      ]);
    }
  });

  it('cobra pelo cano o papel que ele cumpre naquela arma, e não na maioria', () => {
    // A mesma peça: Estendido na M16A4 por 5, Básico na M87A1 por 10.
    const vinte = ATTACHMENTS_BY_ID.get('barrel-20-factory')!;
    expect(attachmentCost(vinte, WEAPONS_BY_ID.get('m16a4')!)).toBe(5);
    expect(attachmentCost(vinte, WEAPONS_BY_ID.get('m87a1')!)).toBe(10);
  });

  it('reproduz a tela da M16A4 peça por peça', () => {
    const m16a4 = WEAPONS_BY_ID.get('m16a4')!;
    const esperado = {
      'barrel-16-dissipator': ['Cano Curto', 15],
      'barrel-18-govt': ['Cano Básico', 10],
      'barrel-18-pencil': ['Cano Leve', 20],
      'barrel-18-spr': ['Cano Pesado', 10],
      'barrel-20-factory': ['Cano Estendido', 5],
      'barrel-20-hbar': ['Cano Ext. Pesado', 10],
      'barrel-cryogenic': ['Cano Crio', 20],
    } as const;
    for (const [id, [nome, custo]] of Object.entries(esperado)) {
      const peca = ATTACHMENTS_BY_ID.get(id)!;
      expect([id, attachmentName(peca, m16a4), peca.cost]).toEqual([id, nome, custo]);
    }
  });
});
