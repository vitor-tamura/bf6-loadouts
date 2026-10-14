import { describe, expect, it } from 'vitest';
import { SEASONS, phaseOn, seasonLabel, seasonOn, seasonTheme } from './season';

const SEASON_5 = SEASONS[0];

describe('temporada no ar', () => {
  it('reconhece o dia de abertura e o de encerramento', () => {
    expect(seasonOn(new Date(SEASON_5.startsOn))?.number).toBe(5);
    expect(seasonOn(new Date(SEASON_5.endsOn))?.number).toBe(5);
  });

  it('não vale na véspera nem no dia seguinte', () => {
    expect(seasonOn(new Date('2026-10-12'))).toBeNull();
    expect(seasonOn(new Date('2027-01-13'))).toBeNull();
  });

  it('usa o tema padrão enquanto a temporada não tem tema próprio', () => {
    expect(seasonTheme(new Date('2026-10-13'))).toBeUndefined();
  });

  it('volta ao tema padrão fora de temporada', () => {
    expect(seasonTheme(new Date('2027-01-13'))).toBeUndefined();
    expect(seasonLabel(new Date('2027-01-13'))).toBeNull();
  });
});

describe('fase corrente', () => {
  it('é a última que já começou', () => {
    expect(phaseOn(new Date('2026-10-13'), SEASON_5).name).toBe('Siege of Vegas');
    expect(phaseOn(new Date('2026-11-09'), SEASON_5).name).toBe('Siege of Vegas');
    expect(phaseOn(new Date('2026-11-10'), SEASON_5).name).toBe('Casino Heist');
    expect(phaseOn(new Date('2026-12-08'), SEASON_5).name).toBe('Frozen Aces');
  });

  it('aparece na etiqueta', () => {
    expect(seasonLabel(new Date('2026-10-13'))).toBe('T5 · Siege of Vegas');
    expect(seasonLabel(new Date('2026-11-10'))).toBe('T5 · Casino Heist');
  });
});

describe('integridade do cadastro', () => {
  it('não tem temporadas sobrepostas e cada fase cabe na janela', () => {
    const inOrder = [...SEASONS].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    inOrder.forEach((season, i) => {
      expect(season.startsOn <= season.endsOn).toBe(true);
      expect(season.phases.length).toBeGreaterThan(0);
      for (const phase of season.phases) {
        expect(phase.startsOn >= season.startsOn).toBe(true);
        expect(phase.startsOn <= season.endsOn).toBe(true);
      }
      const previous = inOrder[i - 1];
      if (previous) expect(previous.endsOn < season.startsOn).toBe(true);
    });
  });
});
