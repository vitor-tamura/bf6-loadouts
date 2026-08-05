import { describe, expect, it } from 'vitest';
import { SEASONS, phaseOn, seasonLabel, seasonOn, seasonTheme } from './season';

/**
 * O tema sazonal precisa entrar e, sobretudo, **sair** sozinho: o risco real é
 * o site continuar vestido de uma temporada encerrada meses depois.
 */

const T4 = SEASONS[0];

describe('temporada no ar', () => {
  it('reconhece o dia de abertura e o de encerramento', () => {
    expect(seasonOn(new Date(T4.startsOn))?.number).toBe(4);
    expect(seasonOn(new Date(T4.endsOn))?.number).toBe(4);
  });

  it('não vale na véspera nem no dia seguinte', () => {
    expect(seasonOn(new Date('2026-07-20'))).toBeNull();
    expect(seasonOn(new Date('2026-10-20'))).toBeNull();
  });

  it('volta ao tema padrão fora de temporada', () => {
    expect(seasonTheme(new Date('2026-08-05'))).toBe('naval');
    expect(seasonTheme(new Date('2026-10-20'))).toBeUndefined();
    expect(seasonLabel(new Date('2026-10-20'))).toBeNull();
  });
});

describe('fase corrente', () => {
  it('é a última que já começou', () => {
    expect(phaseOn(new Date('2026-07-21'), T4).name).toBe('Pacific Front');
    expect(phaseOn(new Date('2026-08-17'), T4).name).toBe('Pacific Front');
    expect(phaseOn(new Date('2026-08-18'), T4).name).toBe('Top Gun');
    expect(phaseOn(new Date('2026-09-30'), T4).name).toBe('Tidal Strike');
  });

  it('aparece na etiqueta', () => {
    expect(seasonLabel(new Date('2026-08-18'))).toBe('T4 · Top Gun');
  });
});

describe('integridade do cadastro', () => {
  it('não tem temporadas sobrepostas e cada fase cabe na janela', () => {
    const ordenadas = [...SEASONS].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    ordenadas.forEach((season, i) => {
      expect(season.startsOn <= season.endsOn).toBe(true);
      expect(season.phases.length).toBeGreaterThan(0);
      for (const fase of season.phases) {
        expect(fase.startsOn >= season.startsOn).toBe(true);
        expect(fase.startsOn <= season.endsOn).toBe(true);
      }
      const anterior = ordenadas[i - 1];
      if (anterior) expect(anterior.endsOn < season.startsOn).toBe(true);
    });
  });
});
