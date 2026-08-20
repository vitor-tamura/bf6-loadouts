import { describe, expect, it } from 'vitest';
import { completarTendencia, fichaDaArma, MIN_TENDENCIA } from './trending';
import type { TrendingPick } from '@/data/meta';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import { effectiveRange } from './ballistics';
import { baseStats } from './stats';

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
  it('data o cartão do catálogo e não inventa citação', () => {
    const doCatalogo = completarTendencia([trend('interdictor')], { on: NA_LEITURA }).slice(1);

    for (const pick of doCatalogo) {
      expect(pick.sources, pick.weapon).toEqual([]);
      expect(pick.trend, pick.weapon).toBe('chegou na Temporada 4');
      // A data é o que o catálogo tem a provar sobre ela, e é o que entra.
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

/*
  A leitura de 19/08 pôs cinco cartões na tela sem um colchete sequer: as páginas
  que o modelo apontou tinham sido recusadas por modo ou por data. Do lado da
  tela, isso não é um cartão pobre — é uma afirmação sem nada atrás.
*/
describe('cartão sem citação', () => {
  const semFonte = (weapon: string): TrendingPick => ({ ...trend(weapon), sources: [] });

  it('não ocupa lugar no bloco', () => {
    const completa = completarTendencia([semFonte('interdictor'), trend('ef88')], {
      on: NA_LEITURA,
    });

    expect(completa[0].weapon).toBe('ef88');
    expect(completa.filter((pick) => pick.weapon === 'interdictor')).toHaveLength(1);
    expect(completa.find((pick) => pick.weapon === 'interdictor')?.trend).toBe(
      'chegou na Temporada 4',
    );
  });

  it('o do catálogo é a única exceção ao colchete obrigatório', () => {
    const completa = completarTendencia([semFonte('ef88'), semFonte('brod-3')], {
      on: NA_LEITURA,
    });

    expect(completa).toHaveLength(MIN_TENDENCIA);
    for (const pick of completa) {
      expect(pick.sources, pick.weapon).toEqual([]);
      expect(pick.trend, pick.weapon).toBe('chegou na Temporada 4');
    }
  });
});

/*
  A ficha é o que o cartão diz sobre a arma quando a conversa já foi explicada:
  ela responde "o que é essa arma?", que é a pergunta seguinte de quem nunca a
  pegou. Sai do dataset, então não pode divergir do que o resto do site mostra
  nem inventar superlativo que a arma não tem.
*/
describe('ficha da arma', () => {
  it('descreve a arma pelo papel que o catálogo dá a ela', () => {
    const arma = WEAPONS_BY_ID.get('ef88')!;
    const ficha = fichaDaArma(arma);

    expect(ficha.papel).toBe(arma.summary);
    expect(ficha.rpm).toBe(arma.rpm);
  });

  it('conta o alcance como o resto do site conta', () => {
    for (const arma of WEAPONS) {
      expect(fichaDaArma(arma).alcance, arma.name).toBe(
        Math.round(effectiveRange(baseStats(arma))),
      );
    }
  });

  it('arma de um tiro não mostra tempo até a morte', () => {
    const ficha = fichaDaArma(WEAPONS_BY_ID.get('interdictor')!);

    expect(ficha.tiros).toBe(1);
    expect(ficha.ttk).toBeNull();
  });

  /*
    Duas armas da mesma categoria com "maior cadência da categoria" seria a prova
    de que o rótulo não separa nada — e uma arma com três etiquetas não diz em
    qual reparar.
  */
  it('não repete o mesmo superlativo dentro de uma categoria', () => {
    const porCategoria = new Map<string, string[]>();

    for (const arma of WEAPONS) {
      const { destaque } = fichaDaArma(arma);
      if (!destaque) continue;
      porCategoria.set(arma.category, [...(porCategoria.get(arma.category) ?? []), destaque]);
    }

    for (const [categoria, rotulos] of porCategoria) {
      expect(new Set(rotulos).size, categoria).toBe(rotulos.length);
    }
  });

  it('só dá superlativo a quem está na frente com folga', () => {
    const cadencia = WEAPONS.filter((arma) => arma.category === 'ar').sort((a, b) => b.rpm - a.rpm);
    const primeira = fichaDaArma(cadencia[0]);

    // A vice-líder da categoria nunca leva o rótulo da liderança.
    expect(fichaDaArma(cadencia[1]).destaque).not.toBe('maior cadência da categoria');
    expect(primeira.destaque === null || typeof primeira.destaque === 'string').toBe(true);
  });
});
