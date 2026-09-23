import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/data/weapons.ts';
import { ATTACHMENTS } from '../../src/data/attachments.ts';
import {
  aplicarCusto,
  aplicarNaArma,
  pendentes,
  validarProposta,
  type Contexto,
  type PropostaArma,
} from './analisar-patch.ts';

/*
  A 1.4.3.0 é o caso que motivou a rotina: a Interdictor só aparece no título
  da seção, e as linhas embaixo não repetem o nome. O texto é o patch note real,
  como a descoberta o baixou.
*/
const texto = JSON.parse(readFileSync(new URL('../../data/patches/1.4.3.0.json', import.meta.url), 'utf8')).rawContent;

const ctx: Contexto = {
  texto,
  linhas: [],
  armas: WEAPONS.map((w) => ({ id: w.id, name: w.name })),
  pecas: ATTACHMENTS.map((a) => ({ id: a.id, originalName: a.originalName, compat: a.compat.weapons ?? [] })),
};

const curvaNova: PropostaArma = {
  weapon: 'interdictor',
  field: 'damage',
  value: [
    [80, 0],
    [100, 120],
    [80, 160],
  ],
  evidence: [
    'Minimum damage increased from 62 to 80.',
    'Sweet spot damage decreased from 150 to 100',
    'Sweet spot range adjusted to 120m to 160m',
  ],
};

describe('validarProposta', () => {
  it('aceita o que a 1.4.3.0 diz da Interdictor, pelo título da seção', () => {
    const { aceitas, recusadas } = validarProposta(
      {
        weapons: [curvaNova],
        attachmentCosts: [
          {
            // A entrada própria da Interdictor, que a 1.4.3.0 já criou no dataset.
            attachment: 'sight-iron-sights-interdictor',
            weapon: 'interdictor',
            cost: 15,
            evidence: ['Iron Sight attachment now costs 15 points.'],
          },
        ],
      },
      ctx,
    );

    expect(recusadas).toEqual([]);
    expect(aceitas.armas).toHaveLength(1);
    expect(aceitas.custos).toHaveLength(1);
  });

  it('recusa número que o texto não diz', () => {
    const { recusadas } = validarProposta(
      { weapons: [{ ...curvaNova, value: [[90, 0], [100, 120], [80, 160]] }] },
      ctx,
    );
    expect(recusadas[0].motivo).toMatch(/90/);
  });

  it('recusa pendurar a frase na arma errada', () => {
    const { recusadas } = validarProposta({ weapons: [{ ...curvaNova, weapon: 'psr' }] }, ctx);
    expect(recusadas[0].motivo).toMatch(/não fala da psr/);
  });

  it('recusa frase que não está no patch', () => {
    const { recusadas } = validarProposta(
      { weapons: [{ ...curvaNova, evidence: ['Minimum damage increased from 62 to 80 at every range.'] }] },
      ctx,
    );
    expect(recusadas[0].motivo).toMatch(/não está no patch/);
  });

  it('aceita a frase que o balancelog liga à arma, mesmo longe do nome no texto', () => {
    const frase = 'The weight of the long and lightened suppressor in the L115 has been swapped.';
    const { recusadas } = validarProposta(
      { weapons: [{ weapon: 'l115', field: 'rpm', value: 60, evidence: [frase] }] },
      { ...ctx, linhas: [{ text: frase, group: 'WEAPONS', items: ['l115'] }] },
    );
    // A arma confere; o que derruba é o número, que a frase não tem.
    expect(recusadas[0].motivo).toMatch(/número sem frase/);
  });
});

const armasTs = `const X = [
  {
    id: 'interdictor',
    name: 'Interdictor',
    damage: [
      [125, 0],
      [90.0, 200],
    ],
    rpm: 30,
  },
  {
    id: 'psr',
    damage: [[95, 0]],
    rpm: 34,
  },
];`;

describe('aplicarNaArma', () => {
  it('troca a curva só na arma certa, com a frase de origem', () => {
    const novo = aplicarNaArma(armasTs, curvaNova, '1.4.3.0')!;
    expect(novo).toContain('[100, 120],');
    expect(novo).toContain('// Atualização 1.4.3.0: "Minimum damage increased from 62 to 80."');
    expect(novo).not.toContain('[125, 0]');
    expect(novo).toContain('damage: [[95, 0]],');
  });

  it('não reescreve o que já está igual', () => {
    const uma = aplicarNaArma(armasTs, curvaNova, '1.4.3.0')!;
    expect(aplicarNaArma(uma, curvaNova, '1.4.3.0')).toBeNull();
  });

  it('troca um número simples', () => {
    const novo = aplicarNaArma(armasTs, { weapon: 'psr', field: 'rpm', value: 40, evidence: ['x'] }, '9.9.9.9')!;
    expect(novo).toMatch(/id: 'psr',[\s\S]*rpm: 40,/);
    expect(novo).toMatch(/rpm: 30,/);
  });
});

const pecasTs = `const Y = [
  {
    id: 'sight-iron-sights',
    name: 'Alça de Ferro',
    cost: 5,
    /*
      Comentário da peça comum.
    */
    compat: { weapons: ['interdictor', 'l115', 'psr'] },
  },
];`;

describe('aplicarCusto', () => {
  const custo = {
    attachment: 'sight-iron-sights',
    weapon: 'interdictor',
    cost: 15,
    evidence: ['Iron Sight attachment now costs 15 points.'],
  };

  it('divide a peça quando o preço muda numa arma só', () => {
    const novo = aplicarCusto(pecasTs, custo, '1.4.3.0')!;
    expect(novo).toContain("compat: { weapons: ['l115', 'psr'] }");
    expect(novo).toContain("id: 'sight-iron-sights-interdictor'");
    expect(novo).toMatch(/sight-iron-sights-interdictor'[\s\S]*cost: 15,[\s\S]*weapons: \['interdictor'\]/);
    expect(novo.match(/Comentário da peça comum/g)).toHaveLength(1);
  });

  it('na segunda vez, atualiza a entrada própria em vez de dividir de novo', () => {
    const uma = aplicarCusto(pecasTs, custo, '1.4.3.0')!;
    expect(aplicarCusto(uma, custo, '1.4.3.0')).toBeNull();
    const outra = aplicarCusto(uma, { ...custo, cost: 20, evidence: ['costs 20'] }, '1.5.0.0')!;
    expect(outra.match(/id: 'sight-iron-sights-interdictor'/g)).toHaveLength(1);
    expect(outra).toContain('cost: 20,');
  });
});

describe('pendentes', () => {
  it('lê só a partir da primeira versão analisada', () => {
    expect(pendentes(['1.4.2.5', '1.4.3.0', '9.0.0.0'])).toEqual(['9.0.0.0']);
  });
});
