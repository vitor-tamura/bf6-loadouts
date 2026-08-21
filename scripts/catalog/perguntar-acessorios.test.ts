/**
 * O que a varredura pode afirmar a partir de uma ficha.
 *
 * A leitura da ficha é o único ponto desta rotina em que estrutura de HTML vira
 * evidência, e é onde um erro passa calado: um parser que devolvesse a peça sem
 * a seção transformaria "esta arma não tem boca" em "esta arma tem boca e a peça
 * não está nela" — uma negativa inventada, gravada como se fosse leitura.
 *
 * Os testes fixam essa fronteira com um HTML de mentira que tem a forma do
 * verdadeiro. Não cobrem a rede: o que se garante aqui é que, tendo a página, a
 * conclusão tirada dela é a certa.
 */

import { describe, expect, it } from 'vitest';
import { lerFicha } from './perguntar-acessorios.ts';

/** Uma ficha como o rnkd.gg a escreve: seção em `h3`, peça em `h4`, custo ao lado. */
const ficha = (secoes: Record<string, [string, number | null][]>) =>
  Object.entries(secoes)
    .map(
      ([secao, pecas]) =>
        `<div class="mb-6"><h3 class="text-lg font-semibold">${secao}</h3><div class="grid">` +
        pecas
          .map(
            ([nome, custo]) =>
              '<div class="bg-rnkd-gray-darker rounded p-3"><div class="flex"><div class="flex gap-3">' +
              `<h4 class="font-medium">${nome}</h4>` +
              '<span class="text-sm">Rank 0</span>' +
              (custo === null ? '' : `<span class="text-sm text-rnkd-primary">${custo} pts</span>`) +
              '</div></div></div>',
          )
          .join('') +
        '</div></div>',
    )
    .join('');

describe('a ficha de uma arma', () => {
  it('separa as peças por seção, com o custo de cada uma', () => {
    const lida = lerFicha(
      ficha({
        Muzzle: [
          ['HYBRID SUPPRESSOR (L)', 30],
          ['FLASH HIDER', 10],
        ],
        Underbarrel: [['CANTED STUBBY', 30]],
      }),
    );

    expect([...lida.keys()]).toEqual(['Muzzle', 'Underbarrel']);
    expect(lida.get('Muzzle')!.get('hybridsuppressorl')).toBe(30);
    expect(lida.get('Muzzle')!.get('flashhider')).toBe(10);
    expect(lida.get('Underbarrel')!.get('cantedstubby')).toBe(30);
  });

  it('dá a cada peça o custo dela, e não o da vizinha', () => {
    const lida = lerFicha(
      ficha({
        Muzzle: [
          ['HYBRID SUPPRESSOR (K)', 50],
          ['HYBRID SUPPRESSOR (S)', 40],
          ['HYBRID SUPPRESSOR (L)', 30],
        ],
      }),
    );

    expect(lida.get('Muzzle')!.get('hybridsuppressork')).toBe(50);
    expect(lida.get('Muzzle')!.get('hybridsuppressors')).toBe(40);
    expect(lida.get('Muzzle')!.get('hybridsuppressorl')).toBe(30);
  });

  /*
    A distinção que a rotina inteira depende: seção ausente é uma coisa, seção
    presente sem a peça é outra. A primeira não diz nada; a segunda é negativa.
  */
  it('não inventa a seção que a arma não tem', () => {
    const lida = lerFicha(ficha({ Barrel: [['200MM FACTORY', 10]] }));

    expect(lida.has('Muzzle')).toBe(false);
    expect(lida.has('Barrel')).toBe(true);
  });

  it('enumera o slot: a peça que falta na seção falta de verdade', () => {
    const lida = lerFicha(ficha({ Muzzle: [['CQB SUPPRESSOR', 30]] }));

    expect(lida.get('Muzzle')!.has('cqbsuppressor')).toBe(true);
    expect(lida.get('Muzzle')!.has('hybridsuppressorl')).toBe(false);
  });

  it('desfaz a entidade no nome da peça', () => {
    const lida = lerFicha(ficha({ Barrel: [['11.5&quot; COMMANDO', 25]] }));

    expect(lida.get('Barrel')!.get('115commando')).toBe(25);
  });

  it('aceita peça sem custo declarado sem perder a peça', () => {
    const lida = lerFicha(ficha({ Scope: [['IRON SIGHTS', null]] }));

    expect(lida.get('Scope')!.has('ironsights')).toBe(true);
    expect(lida.get('Scope')!.get('ironsights')).toBeNull();
  });

  /*
    Layout que muda devolve vazio, e vazio vira `ausente_da_fonte` — ruído
    visível no log. O que não pode acontecer é devolver meia leitura, que
    viraria uma lista de conflitos falsos.
  */
  it('devolve vazio quando a página não tem a forma esperada', () => {
    expect(lerFicha('<main><p>Página em manutenção</p></main>').size).toBe(0);
  });
});
