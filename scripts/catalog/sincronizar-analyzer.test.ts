import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TRAVAS_DA_CURADORIA,
  capacidadeNoSite,
  capacidadesNoAnalyzer,
  casarArmas,
  casarCarregador,
  chaveDeNome,
  curvaDoJogo,
  jsonLegivel,
  moda,
  papeisNaTela,
  penteDeFabrica,
  sincronizar,
  tipoNoAnalyzer,
  tipoNoSite,
  varianteDe,
  versaoDeclarada,
  type DadosDoAnalyzer,
} from './sincronizar-analyzer.ts';
import { aplicarCompat, sincronizarArma, sincronizarPeca } from '../../src/data/analyzer-sync.ts';
import { WEAPONS, WEAPONS_BY_ID, WEAPONS_SEM_SINCRONIA } from '../../src/data/weapons.ts';
import { ATTACHMENTS, ATTACHMENTS_BY_ID, isCompatible } from '../../src/data/attachments.ts';
import { EMPTY_LOADOUT, attachmentCost, defaultAmmo, defaultSight, stripIncompatible } from '../../src/lib/loadout.ts';
import type { Attachment, Weapon } from '../../src/data/types.ts';

/* ------------------------------------------------------------------ moldes */

const arma = (id: string, extra: Partial<Weapon> = {}): Weapon => ({
  id,
  name: id.toUpperCase(),
  category: 'ar',
  signatureClass: 'assault',
  season: 0,
  archetype: 'ar-nato',
  summary: '',
  damage: [{ damage: 25, distance: 0 }],
  pellets: 1,
  rpm: 600,
  velocity: 600,
  drag: 1,
  headshot: 1.4,
  magazine: 30,
  reload: 2.5,
  emptyReload: 3,
  adsMs: 300,
  swapMs: 600,
  accuracy: 50,
  control: 50,
  mobility: 50,
  hipfire: 50,
  verticalRecoil: 0.5,
  horizontalRecoil: 0.3,
  fireModes: ['auto'],
  slots: ['sight', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'ammo', 'ergonomics', 'opticAccessory', 'leftRail', 'rightRail'],
  provenance: 'game',
  ...extra,
});

const peca = (id: string, slot: Attachment['slot'], originalName: string, cost: number, weapons?: string[], extra: Partial<Attachment> = {}): Attachment => ({
  id,
  name: originalName,
  originalName,
  slot,
  cost,
  description: '',
  mods: {},
  compat: weapons ? { weapons } : {},
  provenance: 'game',
  ...extra,
});

/** Um Analyzer mínimo, com os campos que a sincronização lê. */
function analyzerDeTeste(): DadosDoAnalyzer {
  return {
    armas: [
      { id: 'ak4d', name: 'AK4D', cls: 'Assault Rifle', rpm: 514.285, mag: 21, tacRld: 2.467, emptyRld: 3.3, bulletVel: 680, fireMode: 'auto', availableFireModes: ['auto', 'single'], dmg: [{ r: 0, d: 35.22 }, { r: 21, d: 35.22 }, { r: 21, d: 26.05 }] },
      { id: 'sor556', name: 'SOR-556 Mk2', cls: 'Assault Rifle', rpm: 568.4, mag: 31, tacRld: 2.384, emptyRld: 2.667, bulletVel: 768, fireMode: 'auto', availableFireModes: ['auto'], dmg: [{ r: 0, d: 26.05 }] },
    ],
    pecas: {
      SIGHTS: [
        { id: 'iron', name: 'Iron Sights', pts: 5 },
        { id: '1p86_lpvo', name: '1P86 LPVO 1.5-4.5x', pts: 20 },
      ],
      MUZZLES: [{ id: 'flash_hider', name: 'Flash Hider', pts: 10 }],
      BARRELS: [
        { id: 'basic', name: 'Basic', pts: 10 },
        { id: 'extended', name: 'Extended', pts: 5 },
      ],
      GRIPS: [],
      LASERS: [],
      LIGHTS: [],
      ERGOS: [{ id: 'match_trigger', name: 'Match Trigger', pts: 15 }],
      ACCESSORIES: [{ id: 'secondary_optic', name: 'Secondary Optic', pts: 10 }],
      WEAPON_ATTS: {
        ak4d: { sight: ['iron', '1p86_lpvo'], sightPoints: { iron: 15 }, muzzle: ['flash_hider'], barrel: ['basic', 'extended'], barrelDef: 'basic', grip: [] },
        sor556: { sight: ['iron'], muzzle: [], barrel: ['basic'], barrelDef: 'basic', grip: [] },
      },
      WEAPON_ERGO: { ak4d: { avail: ['match_trigger'] } },
      WEAPON_ACCESSORY: { sor556: { avail: ['secondary_optic'] } },
      WEAPON_MAG: {
        ak4d: { def: '20_rnd', mags: { '20_rnd': { name: '20 Rnd', pts: 5, mag: 20 }, '30_rnd': { name: '30 Rnd', pts: 40, mag: 30 } } },
        sor556: { def: '30_rnd', mags: { '30_rnd': { name: '30 Rnd', pts: 5, mag: 30 } } },
      },
    },
    municao: {
      AMMO: [{ id: 'standard', name: 'Standard' }],
      WEAPON_AMMO: { ak4d: { def: 'standard', ammo: { standard: 5 } }, sor556: { def: 'standard', ammo: { standard: 5 } } },
    },
    zonas: { weapons: { ak4d: { headshot: 1.4 }, sor556: { headshot: 1.4 } } },
  };
}

/* ------------------------------------------------------------------- armas */

describe('casarArmas', () => {
  it('casa pelo id reduzido, pelo nome e pela tabela de renomeações', () => {
    const site = [
      { id: 'sor-556-mk2', name: 'SOR-556 Mk2' },
      { id: '18-5ks-k', name: '18.5KS-K' },
      { id: 'kts100-mk8', name: 'KTS100 MK8' },
      { id: 'mini-scout', name: 'Mini Scout' },
      { id: 'm60', name: 'M/60' },
      { id: 'kbr-mark-ii', name: 'KBR Mark II' },
    ];
    const analyzer = [
      { id: 'sor556', name: 'SOR-556 Mk2' },
      { id: 'ks18k', name: '18.5KS-K' },
      { id: 'kts100', name: 'KTS100 MK8' },
      { id: 'miniscout', name: 'Mini Scout' },
      { id: 'm60', name: 'M/60' },
    ];
    const { pares, siteSemPar, analyzerSemPar } = casarArmas(site, analyzer);
    expect(Object.fromEntries(pares)).toEqual({
      'sor-556-mk2': 'sor556',
      '18-5ks-k': 'ks18k',
      'kts100-mk8': 'kts100',
      'mini-scout': 'miniscout',
      m60: 'm60',
    });
    expect(siteSemPar).toEqual(['kbr-mark-ii']);
    expect(analyzerSemPar).toEqual([]);
  });

  it('casa as 67 armas de fogo do site, e só deixam de fora as de corpo a corpo', () => {
    const relatorio = JSON.parse(
      readFileSync(new URL('../../data/validation/analyzer-sync-report.json', import.meta.url), 'utf8'),
    );
    const corpoACorpo = WEAPONS_SEM_SINCRONIA.filter((w) => w.category === 'melee').map((w) => w.id).sort();
    expect([...relatorio.armasSemPar.site].sort()).toEqual(corpoACorpo);
    expect(relatorio.armasSemPar.analyzer).toEqual([]);
  });
});

describe('curvaDoJogo', () => {
  it('converte salto vertical em degrau naquela distância', () => {
    const ak4d = [
      { r: 0, d: 35.22 },
      { r: 21, d: 35.22 },
      { r: 21, d: 26.05 },
      { r: 75, d: 26.05 },
      { r: 75, d: 20.67 },
    ];
    expect(curvaDoJogo(ak4d)).toEqual([
      [35.22, 0],
      [26.05, 21],
      [20.67, 75],
    ]);
  });

  it('degrau da rampa que sobe vale onde ela chega, e o da que desce, onde ela começa', () => {
    // M2010 ESR: 80 até 54 m, sobe a 100 aos 75 m, plano, desce a 62 aos 133 m.
    const m2010 = [
      { r: 54, d: 80 },
      { r: 75, d: 100 },
      { r: 100, d: 100 },
      { r: 133, d: 62 },
    ];
    expect(curvaDoJogo(m2010)).toEqual([
      [80, 0],
      [100, 75],
      [62, 100],
    ]);
  });

  it('reproduz a escada que o cadastro à mão deu à ELR-40', () => {
    const elr40 = [
      { r: 0, d: 80 },
      { r: 120, d: 80 },
      { r: 150, d: 100 },
      { r: 180, d: 100 },
      { r: 210, d: 62 },
    ];
    const curada = WEAPONS_SEM_SINCRONIA.find((w) => w.id === 'elr-40')!.damage.map((d) => [d.damage, d.distance]);
    expect(curvaDoJogo(elr40)).toEqual(curada);
  });

  it('segue constante depois do último ponto, como na M250, que para em 15 m', () => {
    expect(curvaDoJogo([{ r: 0, d: 26.05 }, { r: 15, d: 26.05 }])).toEqual([[26.05, 0]]);
  });

  it('trata a rampa curta das escopetas como as outras', () => {
    // M87A1: 8,4 até 8 m, 7,2 a partir de 9 m — desce, então vale onde começa.
    expect(curvaDoJogo([{ r: 0, d: 8.4 }, { r: 8, d: 8.4 }, { r: 9, d: 7.2 }, { r: 15, d: 7.2 }])).toEqual([
      [8.4, 0],
      [7.2, 8],
    ]);
  });
});

describe('penteDeFabrica', () => {
  it('lê o carregador de fábrica, sem a bala da câmara', () => {
    const dados = analyzerDeTeste();
    expect(dados.armas[0].mag).toBe(21);
    expect(penteDeFabrica(dados, 'ak4d')).toBe(20);
  });
});

/* ------------------------------------------------------------------- peças */

describe('chaveDeNome', () => {
  it('iguala as grafias do site e do Analyzer', () => {
    expect(chaveDeNome('1P86 LPVO')).toBe(chaveDeNome('1P86 LPVO 1.5-4.5x'));
    expect(chaveDeNome('SM Rifle Variable')).toBe(chaveDeNome('SM Rifle Variable 2-8x'));
    expect(chaveDeNome('Laser/Light Combo Red')).toBe(chaveDeNome('Combo Red'));
    expect(chaveDeNome('Hybrid Suppressor (L)')).toBe(chaveDeNome('Hybrid Suppressor L'));
    expect(chaveDeNome('Canted Vertical Grip')).toBe(chaveDeNome('Canted Vertical'));
    expect(chaveDeNome('MGO 3.50x')).toBe(chaveDeNome('MGO 3.5x'));
  });

  it('não junta peças de número diferente', () => {
    expect(chaveDeNome('R4T 2.00x')).not.toBe(chaveDeNome('CCO 2.00x'));
    expect(chaveDeNome('Classic Grip Pod')).not.toBe(chaveDeNome('Classic Vertical'));
  });
});

describe('varianteDe', () => {
  it('reconhece a peça de uma arma só pelo sufixo e pela lista', () => {
    const ids = ['interdictor', 'elr-40', 'sv-98'];
    expect(varianteDe(peca('sight-iron-sights-interdictor', 'sight', 'Iron Sights', 15, ['interdictor']), ids)).toBe('interdictor');
    expect(varianteDe(peca('underbarrel-slim-angled-elr-40', 'underbarrel', 'Slim Angled', 15, ['elr-40']), ids)).toBe('elr-40');
    expect(varianteDe(peca('sight-iron-sights', 'sight', 'Iron Sights', 5, ['interdictor', 'sv-98']), ids)).toBeNull();
  });
});

describe('moda', () => {
  it('desempata pelo custo atual, e sem ele pelo menor', () => {
    expect(moda([5, 5, 10])).toBe(5);
    expect(moda([5, 10], 10)).toBe(10);
    expect(moda([25, 5])).toBe(5);
  });
});

/* -------------------------------------------------------------- carregadores */

describe('carregadores', () => {
  it('lê o tipo dos dois lados', () => {
    expect(tipoNoAnalyzer('30_fast')).toBe('rapido');
    expect(tipoNoAnalyzer('100_agil')).toBe('agil');
    expect(tipoNoAnalyzer('30_rnd')).toBe('comum');
    expect(tipoNoSite('30RND Fast Mag')).toBe('rapido');
    expect(tipoNoSite('8rnd Moon Clip')).toBe('rapido');
    expect(tipoNoSite('100RND Belt Box')).toBe('comum');
    expect(tipoNoSite('100 Agil')).toBe('agil');
  });

  it('lê a capacidade de tubo, de tiro único e dos dois tubos da DB-12', () => {
    expect(capacidadeNoSite({ originalName: '7 Shell Dual Tubes' })).toBe(7);
    expect(capacidadeNoSite({ originalName: 'Single Shot' })).toBe(1);
    expect(capacidadeNoSite({ originalName: '30RND Magazine', magazineSize: 30 })).toBe(30);
    expect(capacidadesNoAnalyzer('7_rnd', { name: '14 Rnd', pts: 5, mag: 14 })).toEqual([14, 7]);
  });

  const m240l = arma('m240l', { category: 'lmg' });
  const caixa = peca('magazine-100rnd-belt-box', 'magazine', '100RND Belt Box', 25, ['m240l'], { magazineSize: 100 });
  const bolsa = peca('magazine-100rnd-belt-pouch', 'magazine', '100RND Belt Pouch', 5, ['m60'], { magazineSize: 100 });
  const pente = peca('magazine-100rnd-magazine', 'magazine', '100RND Magazine', 55, ['m121-a2'], { magazineSize: 100 });
  const rapido = peca('magazine-100rnd-fast', 'magazine', '100RND Fast Mag', 10, ['z84m'], { magazineSize: 100 });
  const ids = ['m240l', 'm60', 'm121-a2', 'z84m'];

  it('fica com a peça que o cadastro já dá à arma, mesmo de outro custo', () => {
    // O site sabe que o de cem da M240L é caixa de fita; o Analyzer só sabe que é comum.
    const r = casarCarregador('100_rnd', { name: '100 Rnd', pts: 25, mag: 100 }, m240l, [caixa, bolsa, pente, rapido], ids);
    expect(r).toEqual({ escolhidas: [caixa], acrescentar: false, ambiguo: false });
  });

  it('sem peça na arma, escolhe a de mesmo custo e tipo, e a acrescenta', () => {
    const outra = arma('l110', { category: 'lmg' });
    const r = casarCarregador('100_rnd', { name: '100 Rnd', pts: 5, mag: 100 }, outra, [caixa, bolsa, pente, rapido], [...ids, 'l110']);
    expect(r).toEqual({ escolhidas: [bolsa], acrescentar: true, ambiguo: false });
  });

  it('não confunde o rápido com o comum', () => {
    const r = casarCarregador('100_fast', { name: '100 Fast', pts: 10, mag: 100 }, m240l, [caixa, bolsa, pente, rapido], ids);
    expect(r.escolhidas).toEqual([rapido]);
  });

  it('duas peças da arma com o mesmo custo são ambiguidade, e ficam as duas', () => {
    const tambor = peca('magazine-50rnd-drum', 'magazine', '50RND Drum', 5, ['m121-a2'], { magazineSize: 50 });
    const fita = peca('magazine-50rnd-belt-pouch', 'magazine', '50RND Belt Pouch', 5, ['m121-a2'], { magazineSize: 50 });
    const r = casarCarregador('50_rnd', { name: '50 Rnd', pts: 5, mag: 50 }, arma('m121-a2'), [tambor, fita], ['m121-a2']);
    expect(r.ambiguo).toBe(true);
    expect(r.escolhidas.map((p) => p.id).sort()).toEqual(['magazine-50rnd-belt-pouch', 'magazine-50rnd-drum']);
  });
});

/* ------------------------------------------------------------------- canos */

describe('papeisNaTela', () => {
  it('mostra o cano de fábrica como Básico, também quando o Analyzer o chama de pesado', () => {
    expect(Object.fromEntries(papeisNaTela(['heavy', 'heavy_ext', 'light'], 'heavy')!)).toEqual({
      'Cano Básico': 'heavy',
      'Cano Ext. Pesado': 'heavy_ext',
      'Cano Leve': 'light',
    });
  });

  it('recusa papel que a tela não nomeia', () => {
    expect(papeisNaTela(['vssm_suppressed', 'vssm_suppressed_asm'], 'vssm_suppressed')).toBeNull();
  });
});

/* -------------------------------------------------------------- tudo junto */

describe('sincronizar', () => {
  const armas = [arma('ak4d'), arma('sor-556-mk2'), arma('kbr-mark-ii', { category: 'melee', slots: [] })];
  const pecas = [
    peca('sight-iron-sights', 'sight', 'Iron Sights', 5, ['ak4d', 'sor-556-mk2']),
    peca('sight-1p86-lpvo', 'sight', '1P86 LPVO', 25, ['sor-556-mk2']),
    peca('sight-dvo-500x', 'sight', 'DVO 5.00x', 10, ['ak4d']),
    peca('muzzle-flash-hider', 'muzzle', 'Flash Hider', 10, ['ak4d', 'sor-556-mk2']),
    peca('ergonomics-match-trigger', 'ergonomics', 'Match Trigger', 15, []),
    peca('opticAccessory-canted-reflex', 'opticAccessory', 'Canted Reflex', 10, ['ak4d']),
    peca('opticAccessory-piggyback-reflex', 'opticAccessory', 'Piggyback Reflex', 10, []),
    peca('magazine-20rnd-magazine', 'magazine', '20RND Magazine', 5, ['ak4d'], { magazineSize: 20 }),
    peca('magazine-30rnd-magazine', 'magazine', '30RND Magazine', 5, ['ak4d', 'sor-556-mk2'], { magazineSize: 30 }),
    peca('ammo-fmj', 'ammo', 'FMJ', 5, undefined, { compat: { categories: ['ar'] } }),
    peca('barrel-ak4d-factory', 'barrel', 'Factory', 10, ['ak4d'], { name: 'Cano Básico' }),
    peca('barrel-sor-factory', 'barrel', 'Factory', 10, ['sor-556-mk2'], { name: 'Cano Básico' }),
    peca('barrel-sor-long', 'barrel', 'Long', 5, ['sor-556-mk2'], { name: 'Cano Estendido' }),
  ];
  const { arquivo, relatorio } = sincronizar({ dados: analyzerDeTeste(), armas, pecas });

  it('corrige os números da arma e guarda o valor de antes', () => {
    const ak = arquivo.armas.ak4d.campos;
    expect(ak.damage).toEqual({
      valor: [[35.22, 0], [26.05, 21]],
      antes: [[25, 0]],
      fonte: 'data/weapons.json#dmg',
    });
    expect(ak.rpm?.valor).toBe(514);
    expect(ak.magazine?.valor).toBe(20);
    expect(ak.reload?.valor).toBe(2.467);
    expect(ak.emptyReload?.valor).toBe(3.3);
    expect(ak.fireModes?.valor).toEqual(['auto', 'semi']);
    // O que já bate não vira correção.
    expect(ak.headshot).toBeUndefined();
    expect(arquivo.armas['kbr-mark-ii']).toBeUndefined();
  });

  it('corrige o custo e acrescenta a arma que o Analyzer lista', () => {
    expect(arquivo.pecas['sight-1p86-lpvo'].custo).toMatchObject({ valor: 20, antes: 25 });
    expect(arquivo.pecas['sight-1p86-lpvo'].compat?.adicionar).toEqual(['ak4d']);
  });

  it('divide a peça que custa outra coisa numa arma', () => {
    // `sightPoints: { iron: 15 }` na AK4D de teste: a alça dela vira variante.
    expect(arquivo.pecas['sight-iron-sights'].compat?.remover).toEqual(['ak4d']);
    const variante = arquivo.pecasNovas.find((p) => p.id === 'sight-iron-sights-ak4d')!;
    expect(variante).toMatchObject({ cost: 15, compat: { weapons: ['ak4d'] }, originalName: 'Iron Sights' });
  });

  it('tira a arma que o Analyzer enumera sem a peça, e não apaga a peça que ele não conhece', () => {
    expect(arquivo.pecas['muzzle-flash-hider'].compat?.remover).toEqual(['sor-556-mk2']);
    expect(arquivo.pecas['sight-dvo-500x']).toBeUndefined();
    expect(relatorio.pecasDoSiteSemPar.map((p) => p.id)).toContain('sight-dvo-500x');
  });

  it('respeita a trava da curadoria', () => {
    expect(TRAVAS_DA_CURADORIA['ergonomics-match-trigger'].armas).toContain('ef88');
    const dados = analyzerDeTeste();
    dados.armas.push({ ...dados.armas[0], id: 'ef88', name: 'EF88' });
    dados.pecas.WEAPON_ATTS.ef88 = dados.pecas.WEAPON_ATTS.ak4d;
    dados.pecas.WEAPON_ERGO.ef88 = { avail: ['match_trigger'] };
    const comTrava = sincronizar({
      dados,
      armas: [arma('ef88'), arma('ak4d')],
      pecas: [peca('ergonomics-match-trigger', 'ergonomics', 'Match Trigger', 15, [])],
    });
    // O Analyzer lista o Gatilho nas duas; só a AK4D ganha.
    expect(comTrava.arquivo.pecas['ergonomics-match-trigger'].compat?.adicionar).toEqual(['ak4d']);
    expect(comTrava.relatorio.travadas.map((t) => t.arma)).toEqual(['ef88']);
  });

  it('no grupo da mira secundária, só tira', () => {
    // A AK4D de teste não tem `secondary_optic`: perde o Canted Reflex. A SOR tem, e não ganha nenhum.
    expect(arquivo.pecas['opticAccessory-canted-reflex'].compat?.remover).toEqual(['ak4d']);
    expect(arquivo.pecas['opticAccessory-piggyback-reflex']).toBeUndefined();
    expect(relatorio.grupos.map((g) => g.arma)).toEqual(['sor-556-mk2']);
  });

  it('casa carregador por capacidade e reprecifica na arma em que ele custa outra coisa', () => {
    // O 30 da AK4D custa 40: sai do geral e ganha variante.
    expect(arquivo.pecas['magazine-30rnd-magazine'].compat?.remover).toEqual(['ak4d']);
    expect(arquivo.pecasNovas.find((p) => p.id === 'magazine-30rnd-magazine-ak4d')?.cost).toBe(40);
  });

  it('cria o cano do papel que falta só quando nada no site pode ser ele', () => {
    expect(relatorio.canos.criados).toEqual([{ id: 'barrel-ak4d-extended', arma: 'ak4d', papel: 'extended' }]);
    const criado = arquivo.pecasNovas.find((p) => p.id === 'barrel-ak4d-extended')!;
    expect(criado).toMatchObject({ name: 'Cano Estendido', cost: 5, compat: { weapons: ['ak4d'] } });
    // A SOR de teste só tem o Básico no jogo: o Estendido do site sobra e sai.
    expect(relatorio.canos.removidos).toEqual([{ peca: 'barrel-sor-long', arma: 'sor-556-mk2', papelNoSite: 'Cano Estendido' }]);
  });

  it('é idempotente: a mesma entrada dá o mesmo arquivo', () => {
    const outra = sincronizar({ dados: analyzerDeTeste(), armas, pecas });
    expect(JSON.stringify(outra.arquivo)).toBe(JSON.stringify(arquivo));
  });
});

describe('jsonLegivel', () => {
  it('põe lista curta numa linha sem mudar o conteúdo', () => {
    const valor = { a: [[35.22, 0], [26.05, 21]], b: ['x, y', 'z [w]'], c: { d: [] }, e: 'f' };
    expect(JSON.parse(jsonLegivel(valor))).toEqual(valor);
    expect(jsonLegivel(valor)).toContain('[35.22, 0]');
  });

  it('o arquivo gravado é o que a função escreve', () => {
    const texto = readFileSync(new URL('../../src/data/analyzer-sync.json', import.meta.url), 'utf8');
    expect(jsonLegivel(JSON.parse(texto))).toBe(texto);
  });
});

describe('versaoDeclarada', () => {
  it('fica com a fonte mais nova, ignorando rótulo que não é versão', () => {
    expect(versaoDeclarada({ sources: [{ sourceVersion: '1.4.2.5' }, { sourceVersion: '2.1.1.0' }, { sourceVersion: 'live' }] })).toBe('2.1.1.0');
    expect(versaoDeclarada({})).toBeNull();
  });
});

/* ------------------------------------------------------- aplicação no site */

describe('aplicação da sincronia', () => {
  it('só corrige o campo que o cadastro ainda mostra como a sincronização viu', () => {
    const base = arma('x', { rpm: 600 });
    const sincronia = { idNoAnalyzer: 'x', campos: { rpm: { valor: 720, antes: 600, fonte: 't' } } };
    expect(sincronizarArma(base, sincronia).rpm).toBe(720);
    // A curadoria (ou o patch note) mudou o campo depois: ela vence.
    expect(sincronizarArma({ ...base, rpm: 650 }, sincronia).rpm).toBe(650);
  });

  it('acrescenta e tira em peça por lista e em peça por categoria', () => {
    expect(aplicarCompat({ weapons: ['a', 'b'], except: ['c'] }, { adicionar: ['c'], remover: ['a'] })).toEqual({ weapons: ['b', 'c'], except: [] });
    expect(aplicarCompat({ categories: ['ar'] }, { adicionar: ['smg1'], remover: ['ar1'] })).toEqual({
      categories: ['ar'],
      except: ['ar1'],
      extraWeapons: ['smg1'],
    });
  });

  it('só troca o custo se o cadastro ainda cobra o de antes', () => {
    const p = peca('p', 'sight', 'P', 25, ['a']);
    expect(sincronizarPeca(p, { custo: { valor: 20, antes: 25, fonte: 't' } }).cost).toBe(20);
    expect(sincronizarPeca({ ...p, cost: 30 }, { custo: { valor: 20, antes: 25, fonte: 't' } }).cost).toBe(30);
  });
});

/*
 * Os valores do jogo que motivaram a sincronização, lidos no arsenal que o site
 * monta (`WEAPONS`, `ATTACHMENTS`). Se o Analyzer mudar algum deles, este teste
 * quebra junto com o arquivo novo — e é a hora de conferir se a mudança é do
 * jogo.
 */
describe('o arsenal do site depois da sincronização', () => {
  it('AK4D com a curva e as recargas do jogo', () => {
    const ak4d = WEAPONS_BY_ID.get('ak4d')!;
    expect(ak4d.damage[0]).toEqual({ damage: 35.22, distance: 0 });
    expect(ak4d.reload).toBe(2.467);
    expect(ak4d.emptyReload).toBe(3.3);
  });

  it('PP-19 com o pente de fábrica, sem a bala da câmara', () => {
    expect(WEAPONS_BY_ID.get('pp-19')!.magazine).toBe(30);
  });

  it('1P86 LPVO por 20 pontos', () => {
    expect(ATTACHMENTS_BY_ID.get('sight-1p86-lpvo')!.cost).toBe(20);
  });

  it('a alça dos rifles de precisão por 15, e montada de fábrica', () => {
    const sv98 = WEAPONS_BY_ID.get('sv-98')!;
    const alca = ATTACHMENTS_BY_ID.get(defaultSight(sv98)!)!;
    expect([alca.originalName, attachmentCost(alca, sv98)]).toEqual(['Iron Sights', 15]);
  });

  it('VSSM sai com a munição dela, sem efeito', () => {
    const vssm = WEAPONS_BY_ID.get('vssm')!;
    const municao = ATTACHMENTS_BY_ID.get(defaultAmmo(vssm)!)!;
    expect(municao.id).toBe('ammo-tungsten-match');
    expect(isCompatible(municao, vssm)).toBe(true);
    expect(municao.mods).toEqual({});
  });

  it('link antigo com a peça geral abre com a variante da arma', () => {
    // A Slim Angled custa 20 nas SMGs: a PP-19 saiu da geral para a variante dela.
    const aberto = stripIncompatible({ ...EMPTY_LOADOUT, weapon: 'pp-19', attachments: { underbarrel: 'underbarrel-slim-angled' } });
    expect(aberto.attachments.underbarrel).toBe('underbarrel-slim-angled-pp-19');
    expect(ATTACHMENTS_BY_ID.get('underbarrel-slim-angled-pp-19')!.cost).toBe(20);
  });

  it('não deixa variante com id repetido nem peça apontando para arma que não existe', () => {
    const ids = ATTACHMENTS.map((a) => a.id);
    expect(ids.length).toBe(new Set(ids).size);
    const armas = new Set(WEAPONS.map((w) => w.id));
    const fantasmas = ATTACHMENTS.flatMap((a) => [...(a.compat.weapons ?? []), ...(a.compat.extraWeapons ?? [])]).filter((w) => !armas.has(w));
    expect([...new Set(fantasmas)]).toEqual([]);
  });
});
