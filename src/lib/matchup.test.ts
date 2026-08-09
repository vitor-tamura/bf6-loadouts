import { describe, expect, it } from 'vitest';
import { analyzeMatchup } from './matchup';
import { baseStats } from './stats';
import { WEAPONS_BY_ID } from '@/data/weapons';

const stats = (id: string) => baseStats(WEAPONS_BY_ID.get(id)!);

describe('leitura do confronto', () => {
  it('dá empate quando a arma é comparada com ela mesma', () => {
    const ak = stats('ak4d');
    const leitura = analyzeMatchup(ak, ak, 'AK4D', 'AK4D', 'multiplayer');

    expect(leitura.winner).toBe('tie');
    expect(leitura.headline).toContain('se equivalem');
  });

  it('troca de assunto quando o modo muda', () => {
    const a = stats('ak4d');
    const b = stats('cz3a1');

    const mp = analyzeMatchup(a, b, 'AK4D', 'CZ3A1', 'multiplayer');
    const br = analyzeMatchup(a, b, 'AK4D', 'CZ3A1', 'redsec');

    // A abertura sempre diz de que modo está falando.
    expect(mp.headline).toContain('multiplayer');
    expect(br.headline).toContain('REDSEC');

    // E os eixos escolhidos não são os mesmos: o peso de cada um muda.
    expect(br.points).not.toEqual(mp.points);
  });

  it('escreve no máximo três pontos, com números dos dois lados', () => {
    const leitura = analyzeMatchup(
      stats('ak4d'),
      stats('m4a1'),
      'AK4D',
      'M4A1',
      'multiplayer',
    );

    expect(leitura.points.length).toBeGreaterThan(0);
    expect(leitura.points.length).toBeLessThanOrEqual(3);
    expect(leitura.points.some((p) => /\d/.test(p))).toBe(true);
  });

  it('aponta a submetralhadora de perto e o fuzil no vão aberto', () => {
    const smg = stats('cz3a1');
    const rifle = stats('m2010-esr');

    const perto = analyzeMatchup(smg, rifle, 'CZ3A1', 'M2010 ESR', 'multiplayer');
    const longe = analyzeMatchup(smg, rifle, 'CZ3A1', 'M2010 ESR', 'redsec');

    // No multiplayer o tempo de abate curto da SMG pesa mais; no REDSEC, o
    // alcance do ferrolho encosta ou passa.
    expect(perto.winner).toBe('a');
    expect(['b', 'tie']).toContain(longe.winner);
  });
});
