/**
 * A fronteira entre casar nome por prova e casar nome por parecença.
 *
 * O catálogo tem `brod3`, de nome "BROD 3", e a EA escreveu "the BROD". Casar
 * os dois por semelhança de texto resolveria este caso e criaria a próxima
 * classe de erro: "M4" casaria com "M4A1", "M60" com "M60E4", e a mudança iria
 * para a arma errada com a mesma cara de apurada — que é pior do que não ter
 * casado, porque não se distingue depois de salva.
 *
 * O que estes testes fixam é a única regra que autoriza o par: a frase, depois
 * de descontado tudo que ela já nomeia por forma conhecida, precisa deixar
 * exatamente um id sem nome e exatamente um nome sem id. Dois de cada lado é
 * escolha, e escolha aqui é chute.
 */

import { describe, expect, it } from 'vitest';
import { conferirNomes, designacao, type Catalogo } from './nomes.ts';
import type { BalanceLog } from './fetch-balance-log.ts';

const log = (weaponLines: { text: string; group: string; items: string[] }[]): BalanceLog => ({
  source: { provider: 'teste', type: 'community', url: 'https://exemplo', retrievedAt: '2026-09-04' },
  patches: [
    { version: '1.4.2.5', publishedAt: '2026-08-31', url: null, categories: ['weapons'], weaponLines },
  ],
});

/*
 * O catálogo do teste é o de antes do conserto: a BROD 3 sem apelido nenhum, que
 * é o estado em que a 1.4.2.5 encontrou o dataset. Usar o de disco faria estes
 * testes passarem ou falharem conforme o apelido já tivesse sido aplicado — e a
 * regra que eles medem não muda com isso.
 */
const catalogo: Catalogo = {
  weapons: [
    { id: 'brod3', name: 'BROD 3', aliases: [] },
    { id: 'ef88', name: 'EF88', aliases: [] },
  ],
  attachments: [{ id: 'match_trigger', name: 'Match Trigger', aliases: [] }],
};

describe('a designação que pode virar apelido', () => {
  it('tira o artigo, que é da frase e não do equipamento', () => {
    expect(designacao('The 1P86')).toBe('1P86');
  });

  /*
   * Saiu daqui um apelido errado antes de esta recusa existir: "Extended
   * Barrels on all weapons now cost 5 points, reduced from 15 points" propunha
   * que o Extended Barrel também se chama "15".
   */
  it('recusa quantidade: nome de equipamento tem letra', () => {
    expect(designacao('15')).toBeNull();
    expect(designacao('5')).toBeNull();
  });

  it('aceita sigla em caixa alta e código com número', () => {
    expect(designacao('BROD')).toBe('BROD');
    expect(designacao('M2010 ESR')).toBe('M2010 ESR');
  });

  it('recusa prosa em maiúscula de começo de frase', () => {
    expect(designacao('Fixed')).toBeNull();
    expect(designacao('Weapons')).toBeNull();
  });
});

describe('o apelido provado', () => {
  /*
   * O caso do enunciado. A fonte afirma `brod-3` e `ef88`; o texto escreve
   * "EF88", que o catálogo já conhece, e "BROD", que ele não conhece. Sobra um
   * id sem nome e um nome sem id: o par é o único possível.
   */
  it('casa quando a frase não deixa outra atribuição possível', () => {
    const relatorio = conferirNomes(
      log([
        {
          text: 'The Match Trigger attachment no longer affects fully automatic fire on the BROD and EF88.',
          group: 'WEAPONS',
          items: ['brod-3', 'ef88', 'match-trigger'],
        },
      ]),
      catalogo,
    );

    expect(relatorio.provados).toHaveLength(1);
    expect(relatorio.provados[0]).toMatchObject({ id: 'brod3', apelido: 'BROD', tipo: 'weapon' });
    expect(relatorio.provados[0].prova.versao).toBe('1.4.2.5');
  });

  it('não escolhe quando a frase deixa dois de cada lado', () => {
    const relatorio = conferirNomes(
      log([
        {
          text: 'The XM99 and the ZK7 now share the same reload cadence.',
          group: 'WEAPONS',
          items: ['brod-3', 'ef88'],
        },
      ]),
      catalogo,
    );

    expect(relatorio.provados).toHaveLength(0);
    expect(relatorio.emAberto).toHaveLength(1);
    expect(relatorio.emAberto[0].porQue).toMatch(/não força um par só/);
  });

  it('não inventa entidade para o identificador que o catálogo não tem', () => {
    const relatorio = conferirNomes(
      log([{ text: 'Scopes have been adjusted.', group: 'WEAPONS', items: ['scopes'] }]),
      catalogo,
    );

    expect(relatorio.provados).toHaveLength(0);
    expect(relatorio.semEntidade.map((falta) => falta.item)).toContain('scopes');
  });
});
