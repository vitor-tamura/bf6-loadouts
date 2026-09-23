import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/data/weapons.ts';
import { pecaDoSite, propostaDeArma } from './aplicar-no-site.ts';
import type { PatchChange } from './parse-patch-note.ts';

const mudanca = (parcial: Partial<PatchChange>): PatchChange => ({
  kind: 'stat_changed',
  entityType: 'weapon',
  entityId: 'interdictor',
  mentioned: null,
  field: 'damage',
  operation: 'set',
  value: null,
  before: null,
  after: null,
  automation: 'auto',
  reason: null,
  line: 'Minimum damage increased from 62 to 80.',
  ...parcial,
});

const interdictor = WEAPONS.find((w) => w.id === 'interdictor')!;
/** A Interdictor com a curva que a EA descreve como de antes da 1.4.3.0. */
const antes = {
  ...interdictor,
  damage: [
    { damage: 62, distance: 0 },
    { damage: 150, distance: 110 },
    { damage: 62, distance: 150 },
  ],
};

describe('propostaDeArma', () => {
  it('troca o degrau que vale o número de antes, e só ele', () => {
    const proposta = propostaDeArma(mudanca({ before: 62, after: 80 }), antes);
    expect(proposta).toMatchObject({
      weapon: 'interdictor',
      field: 'damage',
      value: [
        [80, 0],
        [150, 110],
        [80, 150],
      ],
    });
  });

  it('recusa quando o site não mostra o número de antes', () => {
    // O caso real da 1.4.3.0: a curva do site (125 → 90) veio de outra fonte, e
    // não tinha o 62 que a EA diz ter trocado.
    const outraFonte = { ...interdictor, damage: [{ damage: 125, distance: 0 }, { damage: 90, distance: 200 }] };
    expect(propostaDeArma(mudanca({ before: 62, after: 80 }), outraFonte)).toMatch(/não tem degrau de 62/);
  });

  it('reconhece o que já foi aplicado', () => {
    expect(propostaDeArma(mudanca({ before: 62, after: 80 }), interdictor)).toBe('ja');
  });

  it('número simples: só com o valor de antes batendo', () => {
    const psr = WEAPONS.find((w) => w.id === 'psr')!;
    const rpm = mudanca({ entityId: 'psr', field: 'rpm', before: psr.rpm, after: psr.rpm + 4, line: 'x' });
    expect(propostaDeArma(rpm, psr)).toMatchObject({ field: 'rpm', value: psr.rpm + 4 });
    expect(propostaDeArma({ ...rpm, before: psr.rpm + 1 }, psr)).toMatch(/o site mostra/);
  });

  it('sem os dois números, não aplica', () => {
    expect(propostaDeArma(mudanca({ before: null, after: 80 }), antes)).toMatch(/antes e o de depois/);
  });

  it('campo que o site não guarda fica de fora', () => {
    expect(propostaDeArma(mudanca({ field: 'recoil', before: 1, after: 2 }), antes)).toMatch(/não guarda/);
  });
});

describe('pecaDoSite', () => {
  it('acha a entrada da peça que a arma aceita, no singular ou no plural', () => {
    expect(pecaDoSite('Iron Sights', 'interdictor')?.id).toBe('sight-iron-sights-interdictor');
    expect(pecaDoSite('Iron Sight', 'l115')?.id).toBe('sight-iron-sights');
  });

  it('não escolhe a esmo quando a arma não aceita a peça', () => {
    expect(pecaDoSite('Iron Sights', 'arma-que-nao-existe')).toBeNull();
  });
});
