import { describe, expect, it } from 'vitest';
import { WEAPONS } from '@/data/weapons';
import {
  categoriasDoRanking,
  contrasteRedsec,
  indiceDaFonte,
  movimentoNoRanking,
  subidasNoRanking,
  topoDoDia,
  type DailyRanking,
} from './ranking';

/*
  Um recorte fixo do ranking de 14/10, e não o `meta-live.json`: aquele arquivo
  muda todo dia com a leitura, e o teste quebraria na primeira troca de lugar.
*/
const linha = (weapon: string, category: string, categoryRank: number, overall: number) => ({
  weapon,
  category,
  categoryRank,
  overall,
});
const ranking = {
  multiplayer: {
    name: 'wzstats.gg — ranking do multiplayer',
    url: 'https://wzstats.gg/battlefield-6/multiplayer/meta',
    date: '2026-10-14',
    entries: [
      linha('m16a4', 'ar', 1, 1),
      linha('b36a4', 'ar', 2, 2),
      linha('pp-19', 'smg', 1, 3),
      linha('kord-6p67', 'ar', 3, 4),
      linha('drs-iar', 'lmg', 1, 5),
      linha('sgx', 'smg', 2, 6),
      linha('qbz-192', 'carbine', 1, 7),
      linha('nvo-228e', 'ar', 4, 9),
      linha('kts100-mk8', 'lmg', 6, 46),
      linha('m2010-esr', 'sniper', 1, 11),
      linha('vssm', 'dmr', 1, 34),
    ],
  },
  redsec: {
    name: 'wzstats.gg — ranking do REDSEC',
    url: 'https://wzstats.gg/battlefield-6/meta',
    date: '2026-10-14',
    entries: [linha('kts100-mk8', 'lmg', 1, 1), linha('sgx', 'smg', 1, 3)],
  },
} as DailyRanking;

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

describe('movimento no ranking', () => {
  const historico = [
    { date: '2026-10-10', order: ['a', 'b', 'c', 'd'] },
    { date: '2026-10-14', order: ['b', 'a', 'c', 'd'] },
    { date: '2026-10-15', order: ['b', 'a', 'c', 'e', 'd'] },
    { date: '2026-10-17', order: ['b', 'c', 'a', 'e', 'd'] },
  ];

  it('mede contra a leitura anterior e contra a de uma semana atrás', () => {
    expect(movimentoNoRanking(historico, 'c', '2026-10-17')).toMatchObject({
      posicao: 2,
      desdeOntem: 1,
      naSemana: 1,
      semanaDesde: '2026-10-10',
    });
    expect(movimentoNoRanking(historico, 'a', '2026-10-17')?.desdeOntem).toBe(-1);
  });

  it('conta há quantas leituras a posição se repete', () => {
    expect(movimentoNoRanking(historico, 'b', '2026-10-17')?.leiturasNaPosicao).toBe(3);
  });

  it('marca quem entrou e lista quem subiu', () => {
    expect(movimentoNoRanking(historico, 'e', '2026-10-15')?.entrou).toBe(true);
    expect(subidasNoRanking(historico, '2026-10-17', { minimo: 1 }).map((s) => s.weapon)).toEqual(['e', 'b', 'c']);
  });

  it('não olha leitura depois do dia pedido', () => {
    expect(movimentoNoRanking(historico, 'a', '2026-10-14')).toMatchObject({ posicao: 2, desdeOntem: -1 });
  });
});

describe('topoDoDia', () => {
  it('segue a ordem do ranking e guarda o texto do modelo da mesma arma', () => {
    const picks = [{ weapon: 'm16a4', reason: 'texto do modelo', sources: [3] }];
    const topo = topoDoDia(picks, ranking.multiplayer, 0, 3);
    expect(topo.map((p) => p.weapon)).toEqual(ranking.multiplayer.entries.slice(0, 3).map((e) => e.weapon));
    expect(topo.find((p) => p.weapon === 'm16a4')?.reason).toBe('texto do modelo');
  });
});
