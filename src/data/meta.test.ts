import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHTS,
  TRENDING,
  SOURCES,
  NOT_MULTIPLAYER,
  BY_CATEGORY,
  type MetaPick,
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

const all: MetaPick[] = [
  ...HIGHLIGHTS,
  ...TRENDING,
  ...BY_CATEGORY.flatMap((group) => [group.best, ...group.mentions]),
];

describe('fontes do meta', () => {
  it('são todas de multiplayer, com o indício registrado', () => {
    for (const source of SOURCES) {
      expect(source.mode, source.name).toBe('multiplayer');
      expect(source.scope.length, `escopo de ${source.name}`).toBeGreaterThan(20);
    }
  });

  it('declaram data dentro da temporada corrente', () => {
    for (const source of SOURCES) {
      expect(source.date, source.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(source.date).getTime(), source.name).toBeGreaterThan(
        new Date('2026-07-21').getTime(),
      );
    }
  });

  it('não repetem link', () => {
    expect(new Set(SOURCES.map((f) => f.url)).size).toBe(SOURCES.length);
  });
});

describe('indicações', () => {
  it('citam arma que existe no arsenal', () => {
    for (const pick of all) {
      expect(WEAPONS_BY_ID.has(pick.weapon), pick.weapon).toBe(true);
    }
    for (const item of NOT_MULTIPLAYER) {
      expect(WEAPONS_BY_ID.has(item.weapon), item.weapon).toBe(true);
    }
  });

  it('apontam para fonte que existe', () => {
    for (const pick of all) {
      expect(pick.sources.length, pick.weapon).toBeGreaterThan(0);
      for (const i of pick.sources) {
        expect(SOURCES[i], `${pick.weapon} cita fonte ${i}`).toBeDefined();
      }
    }
  });

  it('exigem duas fontes para virar destaque', () => {
    for (const highlight of HIGHLIGHTS) {
      expect(highlight.sources.length, highlight.weapon).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('blocos por categoria', () => {
  it('só listam arma da própria categoria', () => {
    for (const group of BY_CATEGORY) {
      for (const pick of [group.best, ...group.mentions]) {
        expect(WEAPONS_BY_ID.get(pick.weapon)?.category, pick.weapon).toBe(
          group.category,
        );
      }
    }
  });

  it('não repetem arma dentro do mesmo bloco nem entre categorias', () => {
    const seen = new Set<string>();
    for (const group of BY_CATEGORY) {
      const ids = [group.best, ...group.mentions].map((i) => i.weapon);
      expect(new Set(ids).size, group.category).toBe(ids.length);
      for (const id of ids) {
        expect(seen.has(id), `${id} aparece em mais de uma categoria`).toBe(false);
        seen.add(id);
      }
    }
  });

  it('cobrem uma categoria por vez', () => {
    const cats = BY_CATEGORY.map((b) => b.category);
    expect(new Set(cats).size).toBe(cats.length);
  });
});
