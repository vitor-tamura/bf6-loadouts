import { describe, expect, it } from 'vitest';
import live from '@/data/meta-live.json';
import { WEAPONS } from '@/data/weapons';
import { categoriasDoRanking, contrasteRedsec, indiceDaFonte, type DailyRanking } from './ranking';

const ranking = live.ranking as DailyRanking;

describe('categoriasDoRanking', () => {
  const categorias = categoriasDoRanking(ranking.multiplayer, { fonte: 0, temporada: 5, armas: WEAPONS });

  it('a primeira da classe é a #1 da página', () => {
    const fuzis = categorias.find((c) => c.category === 'ar')!;
    expect(fuzis.best.weapon).toBe('m16a4');
    expect(fuzis.mentions.slice(0, 3).map((m) => m.weapon)).toEqual(['b36a4', 'kord-6p67', 'nvo-228e']);
  });

  it('arma nova da temporada sem posição entra dita como tal, sem fonte', () => {
    const todas = categorias.flatMap((c) => [c.best, ...c.mentions]);
    for (const id of ['mk-24', 'rspr', 'z84m', 'elr-40']) {
      const pick = todas.find((p) => p.weapon === id);
      expect(pick?.reason).toMatch(/Nova na Temporada 5/);
      expect(pick?.sources).toEqual([]);
    }
  });
});

describe('contrasteRedsec', () => {
  it('fica com o que o REDSEC põe bem acima do multiplayer, na mesma classe', () => {
    const contrastes = contrasteRedsec(ranking);
    expect(contrastes[0]).toMatchObject({ weapon: 'kts100-mk8', redsec: 'nº 1 geral' });
    expect(contrastes.map((c) => c.weapon)).not.toContain('sgx');
    expect(contrastes.length).toBeLessThanOrEqual(4);
  });
});

describe('indiceDaFonte', () => {
  it('reusa a fonte já citada e acrescenta a que falta', () => {
    const citada = { ...ranking.multiplayer, url: `${ranking.multiplayer.url}/` };
    expect(indiceDaFonte([citada as never], ranking.multiplayer, { temporada: 5 }).indice).toBe(0);
    const { fontes, indice } = indiceDaFonte([], ranking.multiplayer, { temporada: 5 });
    expect(indice).toBe(0);
    expect(fontes[0].timeframe).toBe('season-5');
  });
});
