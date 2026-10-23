import { describe, expect, it } from 'vitest';
import type { Attachment, Weapon } from '../../src/data/types.ts';
import {
  NOVIDADES_VAZIO,
  aplicarTraducao,
  caixaDeTitulo,
  calibrar,
  casarArma,
  casarPeca,
  casarPecaComo,
  chaveDePeca,
  detectar,
  indexarPecas,
  lerFichaDaArma,
  lerListaDeArmas,
  nomearCanos,
  papelDoCano,
  type Ficha,
  type PecaNova,
} from './novidades.ts';

/** Uma ficha como o rnkd a escreve: título, rótulo, quadro de números, `<h3>` de seção e `<h4>` de peça. */
const fichaHtml = (nome: string, rotulo: string, numeros: Record<string, string>, secoes: Record<string, [string, number][]>) => `
<html><head><title>${nome} Stats, Builds &amp; Meta - Battlefield 6</title>
<meta property="og:image" content="/media/battlefield6/weapons/cropped_processed_${nome}.png"></head>
<body><div>${nome}</div><div>${rotulo}</div><div>•</div><div>Base Weapon Stats</div><div>Global</div>
${Object.entries(numeros).map(([k, v]) => `<div>${k}:</div><div>${v}</div><div>#4</div>`).join('\n')}
<h2>Available Attachments</h2>
${Object.entries(secoes)
  .map(([secao, pecas]) => `<h3 class="t">${secao}</h3>${pecas.map(([p, c]) => `<div><h4 class="n">${p}</h4><span>Rank 0</span><span>${c} pts</span></div>`).join('')}`)
  .join('\n')}
</body></html>`;

const arma = (parcial: Partial<Weapon> & Pick<Weapon, 'id' | 'name' | 'category'>): Weapon => ({
  signatureClass: null,
  season: 0,
  archetype: 'sniper-bolt',
  summary: '',
  damage: [
    { damage: 80, distance: 0 },
    { damage: 100, distance: 150 },
  ],
  pellets: 1,
  rpm: 40,
  velocity: 700,
  drag: 0.6,
  headshot: 2,
  magazine: 5,
  reload: 2.5,
  emptyReload: 3.5,
  adsMs: 800,
  swapMs: 1000,
  accuracy: 90,
  control: 20,
  mobility: 40,
  hipfire: 30,
  verticalRecoil: 2.5,
  horizontalRecoil: 0.2,
  fireModes: ['ferrolho'],
  slots: ['sight', 'muzzle', 'barrel', 'magazine'],
  provenance: 'game',
  ...parcial,
});

const peca = (parcial: Partial<Attachment> & Pick<Attachment, 'id' | 'slot' | 'originalName'>): Attachment => ({
  name: parcial.originalName,
  cost: 10,
  description: 'x',
  mods: {},
  compat: { weapons: [] },
  provenance: 'game',
  ...parcial,
});

describe('lerFichaDaArma', () => {
  const html = fichaHtml(
    'ELR-40',
    'Sniper Rifle',
    { Damage: '100', 'Fire Rate': '36 RPM', 'Muzzle Velocity': '788 m/s', 'Mag Size': '7', 'Reload Time': '2.4 s', 'Aim Downsight Speed': '367.0 ms', 'Headshot Multiplier': '1.75', Mobility: '42%', Hipfire: '34%', Precision: '100%', Control: '24%' },
    { Scope: [['MGO 3.50X', 10]], 'Top Accessory': [['5 MW RED', 10]], Barrel: [['29" FULL', 10]] },
  );

  it('lê nome, rótulo, números, foto e peças por seção', () => {
    const ficha = lerFichaDaArma(html);
    expect(ficha.nome).toBe('ELR-40');
    expect(ficha.rotulo).toBe('Sniper Rifle');
    expect(ficha.numeros).toEqual({
      damage: 100, rpm: 36, velocity: 788, magazine: 7, reload: 2.4, adsMs: 367, headshot: 1.75,
      mobility: 42, hipfire: 34, accuracy: 100, control: 24,
    });
    expect(ficha.imagem).toBe('https://rnkd.gg/media/battlefield6/weapons/cropped_processed_ELR-40.png');
    expect(ficha.pecas.get('Scope')).toEqual([{ nome: 'MGO 3.50X', custo: 10 }]);
    expect(ficha.pecas.get('Barrel')).toEqual([{ nome: '29" FULL', custo: 10 }]);
  });

  it('a lista de armas ignora as imagens que moram no mesmo caminho', () => {
    const lista = '<a href="/battlefield6/weapons/elr-40/"><img src="/media/battlefield6/weapons/cropped_processed_ELR40.png"></a>';
    expect(lerListaDeArmas(lista)).toEqual(['elr-40']);
  });
});

describe('casar com o cadastro', () => {
  const cadastro = indexarPecas([
    peca({ id: 'mag-10', slot: 'magazine', originalName: '10RND Magazine' }),
    peca({ id: 'taclight', slot: 'leftRail', originalName: 'Taclight - Hipfire' }),
    peca({ id: 'thread', slot: 'muzzle', originalName: 'Thread Protector' }),
    peca({ id: 'mgo', slot: 'sight', originalName: 'MGO 3.5x' }),
  ]);

  it('escreve o número de um jeito só', () => {
    expect(chaveDePeca('MGO 3.50X')).toBe(chaveDePeca('MGO 3,5x'));
    expect(chaveDePeca('MGO 3.50X')).not.toBe(chaveDePeca('MGO 3.00X'));
  });

  it('casa por nome igual, por prefixo e por erro de digitação', () => {
    expect(casarPecaComo('MGO 3.50X', 'sight', cadastro)?.como).toBe('exato');
    expect(casarPecaComo('TACLIGHT - HIP', 'rightRail', cadastro)).toMatchObject({ id: 'taclight', como: 'prefixo' });
    expect(casarPecaComo('THREAD PROTETOR', 'muzzle', cadastro)).toMatchObject({ id: 'thread', como: 'digitacao' });
  });

  it('não casa peças de números diferentes', () => {
    // A primeira versão casava estes dois por erro de digitação.
    expect(casarPeca('22RND MAGAZINE', 'magazine', cadastro)).toBeNull();
    expect(casarPeca('QMK 3.00X', 'sight', cadastro)).toBeNull();
  });

  it('casa a arma pelo apelido de endereço, pelo id e pelo nome', () => {
    const armas = [{ id: '18-5ks-k', name: '18.5KS-K' }, { id: 'svdm', name: 'SVDM' }, { id: 'm4a1', name: 'M4A1' }];
    expect(casarArma('185ks-k', '18.5KS-K', armas)).toBe('18-5ks-k');
    expect(casarArma('SVDM', 'SVDM', armas)).toBe('svdm');
    expect(casarArma('m4a1', 'M4A1', armas)).toBe('m4a1');
    expect(casarArma('elr-40', 'ELR-40', armas)).toBeNull();
  });

  it('dá caixa de título ao nome que a fonte escreve todo em maiúscula', () => {
    expect(caixaDeTitulo('MULTI-PORT BRAKE')).toBe('Multi-Port Brake');
    expect(caixaDeTitulo('MGO 3.50X')).toBe('MGO 3.50x');
  });
});

describe('calibrar', () => {
  it('usa a razão mediana da categoria, e a de todas quando a categoria não tem par', () => {
    const fator = calibrar([
      { categoria: 'sniper', site: { accuracy: 100, control: 15, mobility: 38, hipfire: 34, adsMs: 815 }, fonte: { adsMs: 367, control: 24 } },
      { categoria: 'sniper', site: { accuracy: 100, control: 20, mobility: 38, hipfire: 34, adsMs: 880 }, fonte: { adsMs: 400, control: 30 } },
      { categoria: 'ar', site: { accuracy: 30, control: 40, mobility: 50, hipfire: 40, adsMs: 340 }, fonte: { adsMs: 340 } },
    ]);
    expect(fator('sniper', 'adsMs')).toBeCloseTo((815 / 367 + 880 / 400) / 2, 5);
    // Sem par na categoria, vale a mediana de todas: 815/367, 880/400 e 340/340.
    expect(fator('smg', 'adsMs')).toBeCloseTo(880 / 400, 5);
    expect(fator('smg', 'hipfire')).toBe(1); // ninguém tem o número
  });
});

describe('canos de arma nova', () => {
  const novo = (id: string, nome: string, custo: number, armas: string[]): PecaNova => ({
    id,
    name: nome,
    originalName: nome,
    slot: 'barrel',
    cost: custo,
    description: '',
    mods: {},
    compat: { weapons: armas },
    provenance: 'curated',
    origem: { fonte: 'f', detectadaEm: 'd', secao: 'Barrel', nomeNaFonte: nome },
  });

  it('nomeia pelo papel, com o custo da tabela', () => {
    expect(papelDoCano('29" FULL', 10)).toBe('Cano Pesado');
    expect(papelDoCano('16" CRYOGENIC', 20)).toBe('Cano Crio');
    expect(papelDoCano('16" PENCIL', 20)).toBe('Cano Leve');
    expect(papelDoCano('10" COMPACT', 25)).toBe('Cano Curto Leve');
    expect(papelDoCano('X', 30)).toBeNull();
  });

  it('dá um Básico só, e prefere o que se diz de fábrica', () => {
    const canos = [novo('a', '20" HEAVY', 10, ['nova']), novo('b', '20" FACTORY', 10, ['nova']), novo('c', '18" SHORT', 15, ['nova'])];
    const saida = nomearCanos(canos, new Set(['nova']), {}, []);
    expect(Object.fromEntries(saida.map((c) => [c.id, c.name]))).toEqual({ a: 'Cano Pesado', b: 'Cano Básico', c: 'Cano Curto' });
  });

  it('não repete papel que o cadastro já dá à arma', () => {
    const cadastro = [peca({ id: 'curto', slot: 'barrel', originalName: 'Short', name: 'Cano Curto', compat: { weapons: ['nova'] } })];
    const saida = nomearCanos([novo('a', '20" FACTORY', 10, ['nova']), novo('c', '18" SHORT', 15, ['nova'])], new Set(['nova']), {}, cadastro);
    expect(saida.map((c) => c.id)).toEqual(['a']);
  });

  it('sem cano de dez pontos, a arma fica sem cano nenhum', () => {
    const extra = { leve: ['nova'] };
    const cadastro = [peca({ id: 'leve', slot: 'barrel', originalName: 'Light', name: 'Cano Leve', compat: { weapons: [] } })];
    const saida = nomearCanos([novo('c', '18" SHORT', 15, ['nova'])], new Set(['nova']), extra, cadastro);
    expect(saida).toEqual([]);
    expect(extra).toEqual({});
  });
});

describe('detectar', () => {
  const armas = [arma({ id: 'sv-98', name: 'SV-98', category: 'sniper' })];
  const pecas = [
    peca({ id: 'sight-mgo', slot: 'sight', originalName: 'MGO 3.50x', compat: { weapons: ['sv-98'] } }),
    peca({ id: 'barrel-basic', slot: 'barrel', originalName: 'Basic', name: 'Cano Básico', compat: { weapons: ['sv-98'] } }),
  ];
  const ficha = (nome: string, numeros: Ficha['numeros'], secoes: Record<string, [string, number][]>): Ficha => ({
    nome,
    rotulo: 'Sniper Rifle',
    numeros,
    imagem: `https://rnkd.gg/${nome}.png`,
    pecas: new Map(Object.entries(secoes).map(([s, l]) => [s, l.map(([n, c]) => ({ nome: n, custo: c }))])),
  });
  const fichas = new Map<string, Ficha>([
    ['sv-98', ficha('SV-98', { damage: 100, rpm: 40, adsMs: 400, control: 25 }, { Scope: [['MGO 3.50X', 10], ['QMK 3.00X', 10]], Barrel: [['BASIC', 10], ['24" HBAR', 5]] })],
    ['elr-40', ficha('ELR-40', { damage: 125, rpm: 36, velocity: 788, adsMs: 367, control: 24 }, { Scope: [['MGO 3.50X', 10], ['QMK 3.00X', 10]] })],
  ]);
  const contexto = { armas, pecas, anterior: structuredClone(NOVIDADES_VAZIO), hoje: '2026-10-23', temporada: 5, fonte: 'https://rnkd.gg/battlefield6/weapons' };

  it('acha a arma nova, com números da ficha e o resto da gêmea', () => {
    const { armas: novas, imagens } = detectar(fichas, contexto);
    expect(novas).toHaveLength(1);
    expect(novas[0]).toMatchObject({
      id: 'elr-40', name: 'ELR-40', category: 'sniper', archetype: 'sniper-bolt', rpm: 36, velocity: 788,
      season: 5, provenance: 'curated', origem: { gemea: 'sv-98' },
      // 367 ms × (800 / 400) da calibração; dano máximo da gêmea escalado para 125.
      adsMs: 734, damage: [[100, 0], [125, 150]],
    });
    expect(imagens['elr-40']).toEqual({ render: 'https://rnkd.gg/ELR-40.png' });
  });

  it('acha a peça nova e dá a ela as armas que a listam, a nova inclusive', () => {
    const { acessorios, compatExtra } = detectar(fichas, contexto);
    expect(acessorios.map((p) => [p.originalName, p.compat.weapons, p.magnification])).toEqual([['QMK 3.00x', ['elr-40', 'sv-98'], 3]]);
    expect(compatExtra).toEqual({ 'sight-mgo': ['elr-40'] });
  });

  it('cano novo em arma já cadastrada fica para a curadoria', () => {
    const { acessorios, canosParaCurar } = detectar(fichas, contexto);
    expect(acessorios.some((p) => p.slot === 'barrel')).toBe(false);
    expect(canosParaCurar).toEqual(['sv-98: 24" HBAR']);
  });

  it('respeita a lista de ignorados e o que a rodada anterior já nomeou', () => {
    const primeira = detectar(fichas, contexto);
    aplicarTraducao(primeira.armas, primeira.acessorios, { pecas: [{ id: primeira.acessorios[0].id, name: 'QMK 3,00x', description: 'Mira de 3x.' }] });
    const anterior = { ...structuredClone(NOVIDADES_VAZIO), armas: primeira.armas, acessorios: primeira.acessorios, ignorar: ['arma:elr-40'] };

    const segunda = detectar(fichas, { ...contexto, anterior });
    expect(segunda.armas).toEqual([]);
    expect(segunda.acessorios[0]).toMatchObject({ name: 'QMK 3,00x', description: 'Mira de 3x.', compat: { weapons: ['sv-98'] } });
  });
});

describe('aplicarTraducao', () => {
  it('sem modelo, fica o nome original e uma descrição que não inventa efeito', () => {
    const { acessorios, armas } = detectar(
      new Map([['nova', { nome: 'NOVA', rotulo: 'Sniper Rifle', numeros: {}, imagem: null, pecas: new Map([['Muzzle', [{ nome: 'MULTI-PORT BRAKE', custo: 10 }]]]) }]]),
      { armas: [arma({ id: 'sv-98', name: 'SV-98', category: 'sniper' })], pecas: [], anterior: structuredClone(NOVIDADES_VAZIO), hoje: 'h', temporada: 5, fonte: 'f' },
    );
    aplicarTraducao(armas, acessorios, null);
    expect(acessorios[0]).toMatchObject({ name: 'Multi-Port Brake', originalName: 'Multi-Port Brake', mods: {} });
    expect(acessorios[0].description).toMatch(/efeito ainda não foi medido/);
    expect(armas[0].summary).toMatch(/preliminares/);
  });

  it('recusa o originalName que não é o mesmo nome da fonte', () => {
    const { acessorios } = detectar(
      new Map([['sv-98', { nome: 'SV-98', rotulo: 'Sniper Rifle', numeros: {}, imagem: null, pecas: new Map([['Muzzle', [{ nome: 'MULTI-PORT BRAKE', custo: 10 }]]]) }]]),
      { armas: [arma({ id: 'sv-98', name: 'SV-98', category: 'sniper' })], pecas: [], anterior: structuredClone(NOVIDADES_VAZIO), hoje: 'h', temporada: 5, fonte: 'f' },
    );
    aplicarTraducao([], acessorios, { pecas: [{ id: acessorios[0].id, originalName: 'Compensator', name: 'Freio Multiportas', description: 'Freio.' }] });
    expect(acessorios[0]).toMatchObject({ originalName: 'Multi-Port Brake', name: 'Freio Multiportas' });
  });
});
