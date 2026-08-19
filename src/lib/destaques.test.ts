import { describe, expect, it } from 'vitest';
import { completarDestaques, MIN_DESTAQUES, realocarCategorias } from './destaques';
import type { CategoryHighlight, MetaPick, MetaSource } from '@/data/meta';

/**
 * O que estes testes protegem é o colchete.
 *
 * Completar o ranking é fácil; completar sem embaralhar a citação é o que dá
 * trabalho. Um cartão da curadoria carrega índices que valem na lista de fontes
 * dela, e jogá-los na lista da leitura do dia faria cada card apontar para uma
 * página que fala de outra coisa — com a mesma cara de tela bem citada.
 */

const fonte = (nome: string, url: string): MetaSource => ({
  name: nome,
  url,
  date: '2026-08-18',
  country: 'INT',
  mode: 'multiplayer',
  scope: 'Página de multiplayer da temporada, com o modo declarado no texto.',
  timeframe: 'season-4',
});

const DA_LEITURA = [
  fonte('Notas oficiais', 'https://ea.com/battlefield-6/update-1420'),
  fonte('Fórum', 'https://forums.ea.com/discussao'),
];

const DA_CURADORIA = [
  fonte('Ranking do rastreador', 'https://wzstats.gg/battlefield-6/multiplayer/meta'),
  fonte('Fórum', 'https://forums.ea.com/pt/discussao'),
];

const curado = (weapon: string, sources: number[]): MetaPick => ({
  weapon,
  reason: 'Primeira colocada geral do multiplayer desde o ajuste de recuo da temporada.',
  sources,
});

const CURADORIA = [
  curado('m16a4', [0]),
  curado('b36a4', [0, 1]),
  curado('pp-19', [1]),
  curado('drs-iar', [0]),
];

const completar = (picks: MetaPick[]) =>
  completarDestaques(picks, DA_LEITURA, {
    curadoria: CURADORIA,
    fontesDaCuradoria: DA_CURADORIA,
  });

const lido = (weapon: string): MetaPick => ({
  weapon,
  reason: 'Citada no ranking do dia como uma das mais escolhidas depois do patch.',
  sources: [0],
});

describe('completar o topo do multiplayer', () => {
  it('não mexe no bloco que a leitura já enche', () => {
    const picks = [lido('ef88'), lido('brod-3'), lido('vssm'), lido('interdictor')];
    const { destaques, fontes } = completar(picks);

    expect(destaques).toEqual(picks);
    expect(fontes).toEqual(DA_LEITURA);
  });

  it('completa com a curadoria e mantém a leitura na frente', () => {
    const { destaques } = completar([lido('vssm'), lido('interdictor')]);

    expect(destaques).toHaveLength(MIN_DESTAQUES);
    expect(destaques.map((pick) => pick.weapon)).toEqual([
      'vssm',
      'interdictor',
      'm16a4',
      'b36a4',
    ]);
  });

  it('marca o cartão que veio da curadoria', () => {
    const { destaques } = completar([lido('vssm')]);

    for (const pick of destaques.slice(1)) {
      expect(pick.reason, pick.weapon).toMatch(/^Da curadoria escrita à mão do site/);
    }
    expect(destaques[0].reason).toBe(lido('vssm').reason);
  });

  it('não repete arma que a leitura já citou', () => {
    const armas = completar([lido('m16a4')]).destaques.map((pick) => pick.weapon);

    expect(new Set(armas).size).toBe(armas.length);
    expect(armas.filter((id) => id === 'm16a4')).toHaveLength(1);
  });

  it('acrescenta ao rodapé a fonte que a curadoria cita, e o colchete aponta para ela', () => {
    const { destaques, fontes } = completar([lido('vssm'), lido('interdictor')]);
    const m16a4 = destaques.find((pick) => pick.weapon === 'm16a4');

    expect(fontes.slice(0, 2)).toEqual(DA_LEITURA);
    expect(fontes[2]?.url).toBe('https://wzstats.gg/battlefield-6/multiplayer/meta');
    expect(m16a4?.sources).toEqual([2]);
    for (const pick of destaques) {
      for (const i of pick.sources) expect(fontes[i], `${pick.weapon} cita [${i + 1}]`).toBeDefined();
    }
  });

  /*
    O fórum aparece nas duas listas em endereços que abrem a mesma página. Contar
    duas vezes inflaria o rodapé e faria a tela parecer mais sustentada do que é.
  */
  it('não duplica no rodapé a página que as duas listas citam', () => {
    const { destaques, fontes } = completar([lido('vssm'), lido('interdictor')]);
    const b36a4 = destaques.find((pick) => pick.weapon === 'b36a4');

    expect(fontes).toHaveLength(3);
    expect(b36a4?.sources).toEqual([2, 1]);
  });

  it('descarta arma que não está mais no arsenal antes de contar', () => {
    const { destaques } = completar([lido('arma-que-saiu-do-jogo'), lido('vssm')]);

    expect(destaques.map((pick) => pick.weapon)).not.toContain('arma-que-saiu-do-jogo');
    expect(destaques).toHaveLength(MIN_DESTAQUES);
  });

  it('devolve o que tem quando a curadoria não sobra ninguém', () => {
    const { destaques } = completarDestaques([lido('m16a4')], DA_LEITURA, {
      curadoria: [curado('m16a4', [0])],
      fontesDaCuradoria: DA_CURADORIA,
    });

    expect(destaques.map((pick) => pick.weapon)).toEqual(['m16a4']);
  });
});

/**
 * Os blocos por categoria nunca foram substituídos pela leitura do dia, e é
 * justamente por isso que eles quebram quando ela entra: são cartões da
 * curadoria citando a lista de fontes de outra pessoa.
 */
describe('citações dos blocos por categoria', () => {
  const CATEGORIAS: CategoryHighlight[] = [
    {
      category: 'ar',
      best: curado('m16a4', [0]),
      mentions: [curado('b36a4', [0, 1]), curado('l85a3', [1])],
    },
  ];

  const realocar = (fontes: MetaSource[]) =>
    realocarCategorias(CATEGORIAS, fontes, { fontesDaCuradoria: DA_CURADORIA });

  it('acrescenta ao rodapé as páginas da curadoria e reaponta os colchetes', () => {
    const { categorias, fontes } = realocar(DA_LEITURA);
    const [grupo] = categorias;

    expect(fontes.slice(0, 2)).toEqual(DA_LEITURA);
    expect(fontes[2]?.url).toBe('https://wzstats.gg/battlefield-6/multiplayer/meta');
    expect(grupo.best.sources).toEqual([2]);
    expect(grupo.mentions[0].sources).toEqual([2, 1]);
    expect(grupo.mentions[1].sources).toEqual([1]);
  });

  it('deixa toda citação apontando para uma fonte que existe', () => {
    const { categorias, fontes } = realocar(DA_LEITURA);

    for (const grupo of categorias) {
      for (const pick of [grupo.best, ...grupo.mentions]) {
        for (const i of pick.sources) {
          expect(fontes[i], `${pick.weapon} cita [${i + 1}]`).toBeDefined();
        }
      }
    }
  });

  it('não mexe no texto nem na ordem dos cartões', () => {
    const [grupo] = realocar(DA_LEITURA).categorias;

    expect(grupo.category).toBe('ar');
    expect(grupo.best.weapon).toBe('m16a4');
    expect(grupo.best.reason).toBe(curado('m16a4', [0]).reason);
    expect(grupo.mentions.map((pick) => pick.weapon)).toEqual(['b36a4', 'l85a3']);
  });

  /*
    A tela sem leitura do dia mostra a curadoria inteira, e aí a lista de fontes
    já é a dela: costurar não pode acrescentar nada nem mudar número nenhum.
  */
  it('não mexe em nada quando o rodapé já é o da curadoria', () => {
    const { categorias, fontes } = realocar(DA_CURADORIA);

    expect(fontes).toEqual(DA_CURADORIA);
    expect(categorias).toEqual(CATEGORIAS);
  });
});
