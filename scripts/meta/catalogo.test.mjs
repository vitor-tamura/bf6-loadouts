import { describe, expect, it } from 'vitest';
import { CATALOGO, paginaDoCatalogo } from './catalogo.mjs';
import { confiabilidade } from './leitura.mjs';

const ranking = {
  entries: [
    { weapon: 'b36a4', category: 'ar', categoryRank: 1, overall: 1 },
    { weapon: 'm16a4', category: 'ar', categoryRank: 2, overall: 2 },
  ],
};

describe('paginaDoCatalogo', () => {
  const historico = [
    { date: '2026-10-14', order: ['m16a4', 'b36a4'] },
    { date: '2026-10-25', order: ['b36a4', 'm16a4'] },
  ];
  const pagina = paginaDoCatalogo({ ranking, historico, temporada: 5, hoje: '2026-10-26' });

  it('traz as armas do topo do ranking com os números e o movimento da semana', () => {
    expect(pagina.texto).toMatch(/B36A4 \(fuzil\) — wzstats: 1º geral e 1º da classe \(▲1 na semana\)\. 720 RPM; 10 m: \d+ tiros/);
  });

  it('traz as armas novas da temporada, mesmo fora do ranking, marcadas como tal', () => {
    expect(pagina.texto).toMatch(/Mk 24 \(fuzil\) — fora do ranking do wzstats\..*nova na Temporada 5/);
  });

  it('é fonte que pode sustentar o topo, como as páginas que medem', () => {
    expect(confiabilidade(CATALOGO.url)).toBe('analise');
  });
});

describe('battlefinity', () => {
  it('a linha da arma traz o tier e a taxa de escolha do battlefinity', () => {
    const battlefinity = { entries: [{ weapon: 'mk-24', category: 'ar', categoryRank: 1, overall: 1, tier: 'S', pickRate: 20.2 }] };
    const pagina = paginaDoCatalogo({ ranking, battlefinity, historico: [], temporada: 5, hoje: '2026-10-26' });
    expect(pagina.texto).toMatch(/Mk 24 \(fuzil\) — fora do ranking do wzstats; battlefinity: 1º, tier S, 20,2% de escolha\./);
  });
});
