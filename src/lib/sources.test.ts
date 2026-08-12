import { describe, expect, it } from 'vitest';
import { dedupeCitations, pageKey } from './sources';

/**
 * A busca cita a mesma página uma vez por trecho, e sites de guia publicam a
 * mesma tier list em três idiomas. Sem estas duas regras, "cinco fontes" vira
 * um número que não descreve nada.
 */

describe('chave de página', () => {
  it('junta www, barra final e prefixo de idioma', () => {
    expect(pageKey('https://www.battlefieldmeta.gg/pt/')).toBe(pageKey('https://battlefieldmeta.gg'));
    expect(pageKey('https://exemplo.gg/es/meta')).toBe(pageKey('https://exemplo.gg/meta'));
  });

  it('mantém páginas diferentes separadas', () => {
    expect(pageKey('https://exemplo.gg/meta')).not.toBe(pageKey('https://exemplo.gg/trending'));
    // "pt" só é idioma no começo do caminho — aqui é o nome da página.
    expect(pageKey('https://exemplo.gg/guias/pt')).not.toBe(pageKey('https://exemplo.gg/guias'));
  });
});

describe('citações da busca', () => {
  it('cita cada página uma vez, na ordem em que apareceu', () => {
    const sources = dedupeCitations([
      { url: 'https://www.reddit.com/r/Battlefield6/comments/abc', title: 'Melhor build da M16A4' },
      { url: 'https://www.reddit.com/r/Battlefield6/comments/abc', title: 'Melhor build da M16A4' },
      { url: 'https://battlefieldmeta.gg/pt', title: 'Tier list' },
      { url: 'https://battlefieldmeta.gg', title: 'Tier list' },
    ]);

    expect(sources.map((s) => s.name)).toEqual(['reddit.com', 'battlefieldmeta.gg']);
    expect(sources[0].title).toBe('Melhor build da M16A4');
  });

  it('corta no limite e ignora o que não é URL', () => {
    const sources = dedupeCitations(
      [
        { url: 'https://a.gg/1' },
        { url: 'nem-url' },
        { url: 'https://b.gg/2' },
        { url: 'https://c.gg/3' },
      ],
      2,
    );

    expect(sources.map((s) => s.name)).toEqual(['a.gg', 'b.gg']);
  });

  it('devolve lista vazia quando a busca não citou nada', () => {
    expect(dedupeCitations(undefined)).toEqual([]);
    expect(dedupeCitations([])).toEqual([]);
  });
});
