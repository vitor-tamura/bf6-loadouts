import { describe, expect, it } from 'vitest';
import seasonPalettes from '../../src/data/season-palettes.json' with { type: 'json' };
import { artigosDaTemporada, conferirProposta, textoDaTemporada } from './update-season-theme.ts';

describe('artigosDaTemporada', () => {
  it('acha o anúncio pelo endereço, sob battlefield-6 ou redsec, e o põe na frente', () => {
    const html = `
      <a href="/games/battlefield/battlefield-6/news/battlefield-6-season-5-dead-space-event">evento</a>
      <a href="/games/battlefield/redsec/news/battlefield-season-5-roadmap">roadmap</a>
      <a href="/games/battlefield/battlefield-6/news/battlefield-season-50-anything">outra</a>
      <a href="/games/battlefield/battlefield-6/news/battlefield-season-4-roadmap">anterior</a>`;
    expect(artigosDaTemporada(html, 5)).toEqual([
      'https://www.ea.com/games/battlefield/redsec/news/battlefield-season-5-roadmap',
      'https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-season-5-dead-space-event',
    ]);
  });
});

describe('textoDaTemporada', () => {
  it('pula o portão de idade e começa na temporada', () => {
    const texto = `Please enter your date of birth ${'menu '.repeat(200)} Season 5: Siege of Vegas takes the fight to the neon-lit Strip.`;
    const recorte = textoDaTemporada(texto, 5, 'Siege of Vegas');
    expect(recorte).toContain('neon-lit Strip');
    expect(recorte).not.toContain('date of birth');
  });

  it('sem menção à temporada, nada sai', () => {
    expect(textoDaTemporada('Game Update 1.4.2.0 weapon changes', 5, 'Siege of Vegas')).toBe('');
  });
});

describe('conferirProposta', () => {
  const ea = 'https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-game-update-2-1-1-0';
  const resposta = (source: string) => JSON.stringify({ source, concept: 'neon', palette: seasonPalettes.vegas });

  it('aceita paleta válida citando a página entregue', () => {
    expect(conferirProposta(resposta(ea), { fontesPermitidas: new Set([ea]) }).source).toBe(ea);
  });

  it('recusa fonte oficial que o script não entregou', () => {
    const outra = 'https://www.ea.com/games/battlefield/battlefield-6/news/qualquer';
    expect(() => conferirProposta(resposta(outra), { fontesPermitidas: new Set([ea]) })).toThrow();
  });

  it('recusa paleta sem contraste', () => {
    const ruim = structuredClone(seasonPalettes.vegas);
    ruim.dark.text = ruim.dark.bg;
    expect(() => conferirProposta(JSON.stringify({ source: ea, palette: ruim }))).toThrow(/contraste/);
  });
});
