import { describe, expect, it } from 'vitest';
import { SEASONS, phaseOn, seasonLabel, seasonOn, seasonPaletteStyle, seasonTheme } from './season';

const SEASON_5 = SEASONS.find((season) => season.number === 5)!;

describe('temporada no ar', () => {
  it('reconhece o dia de abertura e o de encerramento', () => {
    expect(seasonOn(new Date(SEASON_5.startsOn))?.number).toBe(5);
    expect(seasonOn(new Date(SEASON_5.endsOn))?.number).toBe(5);
  });

  it('mantém a temporada anterior na véspera e encerra após a janela atual', () => {
    expect(seasonOn(new Date('2026-10-12'))?.number).toBe(4);
    expect(seasonOn(new Date('2027-01-13'))).toBeNull();
  });

  it('ativa o tema Vegas durante a temporada 5', () => {
    expect(seasonTheme(new Date('2026-10-13'))).toBe('vegas');
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


describe('paletas sazonais', () => {
  it('toda temporada temática fornece uma paleta completa para os dois modos', () => {
    const tons = ['950', '900', '850', '800', '700', '600', '500', '400', '300', '200', '100'];
    const hex = /^#[0-9a-f]{6}$/i;

    for (const season of SEASONS.filter((item) => item.theme)) {
      expect(season.palette, season.name).toBeDefined();
      const palette = season.palette!;
      for (const mode of ['dark', 'light'] as const) {
        const colors = palette[mode];
        for (const key of ['bg', 'surface', 'surfaceRaised', 'border', 'borderSoft', 'text', 'textSoft', 'textDim', 'accent', 'accentLight', 'info']) {
          expect(colors[key as keyof typeof colors], `${season.name} ${mode} ${key}`).toMatch(hex);
        }
        for (const shade of tons) {
          expect(colors.base[shade as keyof typeof colors.base], `${season.name} ${mode} base-${shade}`).toMatch(hex);
        }
      }
      expect(seasonPaletteStyle(palette)['--season-dark-info']).toBe(palette.dark.info);
      expect(seasonPaletteStyle(palette)['--season-light-accent']).toBe(palette.light.accent);
    }
  });
});
