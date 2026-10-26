import { describe, expect, it } from 'vitest';
import { rotuloDaFonte, semNomeDeFonte } from './sem-fonte';

describe('semNomeDeFonte', () => {
  it('troca o nome do site pelo papel do ranking', () => {
    expect(semNomeDeFonte('1º geral e 1º fuzil no wzstats; no catálogo, 4 tiros em 250 ms.')).toBe(
      '1º geral e 1º fuzil no ranking de força; nos números do jogo, 4 tiros em 250 ms.',
    );
    expect(semNomeDeFonte('Tier S e 21,2% de escolha no battlefinity, a maior taxa da lista.')).toBe(
      'Tier S e 21,2% de escolha no ranking de uso, a maior taxa da lista.',
    );
    expect(semNomeDeFonte('Ocupa a primeira posição no ranking do multiplayer do wzstats.gg.')).toBe(
      'Ocupa a primeira posição no ranking de força do multiplayer.',
    );
    expect(semNomeDeFonte('Thread do r/Battlefield6 que cita a SGX.')).toBe('Thread na comunidade que cita a SGX.');
  });

  it('deixa intacto o texto que não cita site', () => {
    const texto = 'Thread de 19/10 reclama de 4 tiros no corpo e recuo ruim.';
    expect(semNomeDeFonte(texto)).toBe(texto);
  });
});

describe('rotuloDaFonte', () => {
  it('nomeia a fonte pelo que ela é', () => {
    expect(rotuloDaFonte({ name: 'wzstats.gg — ranking do multiplayer', url: 'https://wzstats.gg/battlefield-6/multiplayer/meta' })).toBe(
      'Ranking de força do multiplayer',
    );
    expect(rotuloDaFonte({ name: 'battlefinity.gg — meta do multiplayer', url: 'https://battlefinity.gg/battlefield' })).toBe(
      'Ranking de uso do multiplayer',
    );
    expect(rotuloDaFonte({ name: 'Reddit — New AR is great', url: 'https://www.reddit.com/r/Battlefield6/comments/x' })).toBe(
      'Thread da comunidade — New AR is great',
    );
    expect(
      rotuloDaFonte({
        name: 'EA — Battlefield 6 Game Update 2.1.1.0',
        url: 'https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-game-update-2-1-1-0',
      }),
    ).toBe('Notas oficiais da atualização 2.1.1.0');
  });
});
