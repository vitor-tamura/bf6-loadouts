import { describe, expect, it } from 'vitest';
import { completarTendencia, MIN_TENDENCIA } from './trending';
import type { TrendingPick } from '@/data/meta';
import { WEAPONS_BY_ID } from '@/data/weapons';

/**
 * O que estes testes protegem é a promessa da tela: o bloco de tendência ou
 * aparece inteiro, ou não aparece. A leitura de 19/08 saiu com duas armas e
 * ficou na tela como fileira quebrada — a completação pelo catálogo existe para
 * que isso não dependa de o modelo ter tido um bom dia.
 */

const NA_LEITURA = '2026-08-19';

const trend = (weapon: string): TrendingPick => ({
  weapon,
  trend: 'chegou no patch',
  reason: 'Arma nova do patch, já aparecendo em conversa da comunidade.',
  sources: [0],
});

describe('completar a tendência', () => {
  it('não mexe na lista que já enche o bloco', () => {
    const lida = [trend('ef88'), trend('brod-3'), trend('vssm'), trend('interdictor')];
    expect(completarTendencia(lida, { on: NA_LEITURA })).toEqual(lida);
  });

  it('completa com as armas que chegaram na temporada da leitura', () => {
    const completa = completarTendencia([trend('interdictor'), trend('ef88')], {
      on: NA_LEITURA,
    });

    expect(completa).toHaveLength(MIN_TENDENCIA);
    expect(completa.map((pick) => pick.weapon)).toEqual([
      'interdictor',
      'ef88',
      'brod-3',
      'vssm',
    ]);
    for (const pick of completa) {
      expect(WEAPONS_BY_ID.get(pick.weapon)?.season, pick.weapon).toBe(4);
    }
  });

  it('completa só o que falta e deixa a leitura na frente', () => {
    const [primeira, ...resto] = completarTendencia([trend('vssm')], { on: NA_LEITURA });

    expect(primeira.weapon).toBe('vssm');
    expect(primeira.reason).toBe(trend('vssm').reason);
    expect(resto).toHaveLength(MIN_TENDENCIA - 1);
  });

  it('não repete arma que a leitura já citou', () => {
    const armas = completarTendencia([trend('brod-3')], { on: NA_LEITURA }).map(
      (pick) => pick.weapon,
    );

    expect(new Set(armas).size).toBe(armas.length);
    expect(armas.filter((id) => id === 'brod-3')).toHaveLength(1);
  });

  /*
    Sem colchete e dizendo de onde veio: o cartão do catálogo não pode passar por
    leitura de comunidade, que é a única coisa que esta tela promete não fazer.
  */
  it('marca o cartão do catálogo e não inventa citação', () => {
    const doCatalogo = completarTendencia([trend('interdictor')], { on: NA_LEITURA }).slice(1);

    for (const pick of doCatalogo) {
      expect(pick.sources, pick.weapon).toEqual([]);
      expect(pick.trend, pick.weapon).toBe('chegou na Temporada 4');
      expect(pick.reason, pick.weapon).toContain('catálogo do site');
      expect(pick.reason, pick.weapon).toContain('21/07/2026');
    }
  });

  it('descarta arma que não está mais no arsenal antes de contar', () => {
    const completa = completarTendencia(
      [trend('arma-que-saiu-do-jogo'), trend('interdictor')],
      { on: NA_LEITURA },
    );

    expect(completa.map((pick) => pick.weapon)).not.toContain('arma-que-saiu-do-jogo');
    expect(completa).toHaveLength(MIN_TENDENCIA);
  });

  /*
    Fora de temporada cadastrada não há o que provar pelo catálogo. O bloco fica
    curto de propósito, e a tela o esconde — melhor sumir que completar com arma
    escolhida a esmo.
  */
  it('devolve o que tem quando a data não cai em temporada nenhuma', () => {
    const completa = completarTendencia([trend('interdictor')], { on: '2020-01-01' });

    expect(completa.map((pick) => pick.weapon)).toEqual(['interdictor']);
    expect(completa.length).toBeLessThan(MIN_TENDENCIA);
  });
});
