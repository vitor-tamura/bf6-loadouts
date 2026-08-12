/**
 * O que o parser pode e o que ele não pode afirmar.
 *
 * Este é o ponto do pipeline em que texto de marketing vira dado, e o único em
 * que uma leitura errada passa despercebida: ninguém confere linha a linha um
 * Pull Request com trezentas mudanças. Os testes aqui existem para fixar a
 * fronteira — o que segue sozinho, o que vai marcado para revisão e o que não
 * pode virar número de jeito nenhum.
 */

import { describe, expect, it } from 'vitest';
import { knownEntities, parseLine, parseNote } from './parse-patch-note.ts';
import { compareVersions, isGameVersion } from './lib/io.ts';
import { extractVersions } from './discover-updates.ts';

const known = knownEntities();
const parse = (line: string) => parseLine(line, known);

describe('mudança com os dois números', () => {
  it('aplica sozinha, porque o antes e o depois vieram da fonte', () => {
    const change = parse('M16A4: rate of fire increased from 800 to 820 RPM');

    expect(change).toBeTruthy();
    expect(change!.entityId).toBe('m16a4');
    expect(change!.field).toBe('rpm');
    expect(change!.operation).toBe('set');
    expect(change!.before).toBe(800);
    expect(change!.after).toBe(820);
    expect(change!.automation).toBe('auto');
  });

  it('entende a forma de tabela, com seta', () => {
    const change = parse('M121 A2 — magazine capacity: 100 → 150');

    expect(change!.entityId).toBe('m121a2');
    expect(change!.field).toBe('magazineCapacity');
    expect(change!.before).toBe(100);
    expect(change!.after).toBe(150);
  });
});

describe('mudança em porcentagem', () => {
  /*
   * O caso do enunciado: "Recoil reduced by 10%" diz a operação e a proporção,
   * e nada além disso. Inventar o valor de antes ou o de depois produziria uma
   * estatística com cara de medida.
   */
  it('guarda a operação e o sinal, sem inventar valores', () => {
    const change = parse('RPK-74M: recoil reduced by 10%');

    expect(change!.entityId).toBe('rpk74m');
    expect(change!.operation).toBe('percentage');
    expect(change!.value).toBe(-10);
    expect(change!.before).toBeNull();
    expect(change!.after).toBeNull();
  });

  it('lê aumento como número positivo', () => {
    const change = parse('CZ3A1: damage increased by 5%');

    expect(change!.value).toBe(5);
    expect(change!.operation).toBe('percentage');
  });

  it('manda para revisão quando a arma citada não existe no catálogo', () => {
    const change = parse('XM-99 Prototype: recoil reduced by 12%');

    expect(change!.automation).toBe('review');
    expect(change!.entityId).toBeNull();
  });
});

describe('adições e remoções', () => {
  it('nunca cria entidade sozinha', () => {
    const change = parse('New weapon added: XM-99 Prototype assault rifle');

    expect(change!.kind).toBe('weapon_added');
    expect(change!.automation).toBe('review');
    expect(change!.entityId).toBeNull();
  });

  it('aceita remoção de quem existe, porque o id já é conhecido', () => {
    const change = parse('The DB-12 shotgun has been removed from the store rotation');

    expect(change!.entityId).toBe('db12');
    expect(change!.kind).toBe('weapon_removed');
    expect(change!.automation).toBe('auto');
  });

  it('bloqueia remoção sem entidade reconhecível', () => {
    const change = parse('Some weapon attachments were removed from the test range');

    expect(change!.automation).toBe('blocked');
  });
});

describe('o que o parser ignora', () => {
  it('não vê mudança em frase que não fala de arma nem de peça', () => {
    expect(parse('Fixed a crash when joining a squad in the lobby')).toBeNull();
    expect(parse('Server stability improvements')).toBeNull();
  });

  it('não confunde M4A1 com M4 ao casar o nome mais longo', () => {
    const change = parse('M4A1: reload time reduced by 8%');
    expect(change!.entityId).toBe('m4a1');
  });

  it('deixa a peça específica de arma para o revisor', () => {
    /*
     * "30 Rnd" é o nome de dezenas de carregadores diferentes, um por arma.
     * Casar pelo nome escolheria um a esmo.
     */
    const change = parse('30 Rnd magazine reload speed increased by 5%');
    expect(change?.entityId ?? null).toBeNull();
  });
});

describe('mudança sem número', () => {
  it('vai para revisão, porque não dá para medir uma frase', () => {
    const change = parse('M16A4 recoil has been slightly improved');

    expect(change!.automation).toBe('review');
    expect(change!.operation).toBe('none');
  });
});

describe('o patch note inteiro', () => {
  it('lê cada linha e descarta as que não dizem respeito ao catálogo', () => {
    const changes = parseNote(
      {
        version: '1.4.2.0',
        source: {
          provider: 'EA',
          official: true,
          type: 'official',
          url: 'https://example.invalid',
          retrievedAt: '2026-08-12T00:00:00.000Z',
        },
        publishedAt: null,
        title: null,
        rawContent: [
          'Battlefield 6 Update 1.4.2.0',
          'Fixed an issue with squad spawn',
          'M16A4: rate of fire increased from 800 to 820 RPM',
          'RPK-74M: recoil reduced by 10%',
          '',
        ].join('\n'),
        changes: [],
      },
      known,
    );

    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.entityId)).toEqual(['m16a4', 'rpk74m']);
  });
});

describe('números de versão', () => {
  it('ordena como a EA numera, e não como texto', () => {
    const versions = ['1.4.10.0', '1.4.2.0', '1.3.3.0'].sort(compareVersions);
    expect(versions).toEqual(['1.3.3.0', '1.4.2.0', '1.4.10.0']);
  });

  it('reconhece só o formato de quatro grupos', () => {
    expect(isGameVersion('1.4.2.0')).toBe(true);
    expect(isGameVersion('Season 4')).toBe(false);
    expect(isGameVersion('1.4')).toBe(false);
  });

  it('colhe as versões citadas numa página, sem repetir', () => {
    const found = extractVersions(
      'Update 1.4.2.0 is live. Read the 1.4.2.0 notes. Previously: 1.4.1.0. Ignore 2.0 and 3.1.4.',
    );
    expect(found).toEqual(['1.4.1.0', '1.4.2.0']);
  });
});
