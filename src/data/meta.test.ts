import { describe, expect, it } from 'vitest';
import {
  DESTAQUES,
  FONTES,
  NAO_E_MULTIPLAYER,
  POR_CATEGORIA,
  type IndicacaoMeta,
} from './meta';
import { WEAPONS_BY_ID } from './weapons';

/**
 * A curadoria do meta é escrita à mão, e por isso erra de dois jeitos: citando
 * arma que não existe no arsenal e deixando entrar fonte do modo errado.
 *
 * O segundo é o que mais engana. Metade das listas de "melhores armas do BF6"
 * fala do REDSEC, e uma dessas leituras já sustentou sozinha uma arma no topo
 * desta tela — a KTS100 MK8, primeira do battle royale e sexta metralhadora do
 * multiplayer. O teste existe para que isso volte como falha de CI, não como
 * ranking errado publicado.
 */

const todas: IndicacaoMeta[] = [
  ...DESTAQUES,
  ...POR_CATEGORIA.flatMap((bloco) => [bloco.melhor, ...bloco.mencoes]),
];

describe('fontes do meta', () => {
  it('são todas de multiplayer, com o indício registrado', () => {
    for (const fonte of FONTES) {
      expect(fonte.modo, fonte.nome).toBe('multiplayer');
      expect(fonte.escopo.length, `escopo de ${fonte.nome}`).toBeGreaterThan(20);
    }
  });

  it('declaram data dentro da temporada corrente', () => {
    for (const fonte of FONTES) {
      expect(fonte.data, fonte.nome).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(fonte.data).getTime(), fonte.nome).toBeGreaterThan(
        new Date('2026-07-21').getTime(),
      );
    }
  });

  it('não repetem link', () => {
    expect(new Set(FONTES.map((f) => f.url)).size).toBe(FONTES.length);
  });
});

describe('indicações', () => {
  it('citam arma que existe no arsenal', () => {
    for (const indicacao of todas) {
      expect(WEAPONS_BY_ID.has(indicacao.weapon), indicacao.weapon).toBe(true);
    }
    for (const item of NAO_E_MULTIPLAYER) {
      expect(WEAPONS_BY_ID.has(item.weapon), item.weapon).toBe(true);
    }
  });

  it('apontam para fonte que existe', () => {
    for (const indicacao of todas) {
      expect(indicacao.fontes.length, indicacao.weapon).toBeGreaterThan(0);
      for (const i of indicacao.fontes) {
        expect(FONTES[i], `${indicacao.weapon} cita fonte ${i}`).toBeDefined();
      }
    }
  });

  it('exigem duas fontes para virar destaque', () => {
    for (const destaque of DESTAQUES) {
      expect(destaque.fontes.length, destaque.weapon).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('blocos por categoria', () => {
  it('só listam arma da própria categoria', () => {
    for (const bloco of POR_CATEGORIA) {
      for (const indicacao of [bloco.melhor, ...bloco.mencoes]) {
        expect(WEAPONS_BY_ID.get(indicacao.weapon)?.category, indicacao.weapon).toBe(
          bloco.category,
        );
      }
    }
  });

  it('não repetem arma dentro do mesmo bloco nem entre categorias', () => {
    const vistas = new Set<string>();
    for (const bloco of POR_CATEGORIA) {
      const ids = [bloco.melhor, ...bloco.mencoes].map((i) => i.weapon);
      expect(new Set(ids).size, bloco.category).toBe(ids.length);
      for (const id of ids) {
        expect(vistas.has(id), `${id} aparece em mais de uma categoria`).toBe(false);
        vistas.add(id);
      }
    }
  });

  it('cobrem uma categoria por vez', () => {
    const cats = POR_CATEGORIA.map((b) => b.category);
    expect(new Set(cats).size).toBe(cats.length);
  });
});
