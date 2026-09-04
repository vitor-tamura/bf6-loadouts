/**
 * O que o briefing pode dizer, e o que ele não pode deixar de dizer.
 *
 * Este bloco é o que substituiu uma pergunta paga: antes, a leitura do meta
 * mandava o modelo descobrir na busca qual é a atualização em vigor. Custava
 * chamadas de busca e errava — a leitura de 02/09 saiu apontando a 1.4.1.5, de
 * 04/08, com a 1.4.2.5 no ar desde 31/08 e já processada no catálogo.
 *
 * Os testes daqui fixam as três coisas que fazem o briefing valer a troca: sair
 * do texto certo, não misturar REDSEC com multiplayer, e dizer com todas as
 * letras quando o patch não mexeu em arma — que é o silêncio que fazia o modelo
 * sair procurando a mudança do patch anterior até achar alguma.
 */

import { describe, expect, it } from 'vitest';
import { briefingDoPatch, changelogDeMultiplayer, linhasDeArma } from './patch-atual.mjs';

/*
 * O sumário é a armadilha desta página: `TABLE OF CONTENTS:` lista `NEW
 * CONTENT`, `CHANGELOG` e `REDSEC`, e os mesmos títulos reaparecem adiante com
 * texto embaixo. Cortar no primeiro `CHANGELOG` pegava a linha do sumário, e o
 * `REDSEC` logo abaixo fechava o corpo antes de ele começar.
 */
const NOTA = `BATTLEFIELD 6 GAME UPDATE 1.4.2.0

 TABLE OF CONTENTS:

 NEW CONTENT
 CHANGELOG
 REDSEC

 NEW CONTENT

 EF88: Precision meets efficiency with the EF88, a bullpup assault rifle designed for mid-range combat.

 CHANGELOG

 WEAPONS:

 The Match Trigger attachment no longer affects fully automatic fire on the BROD and EF88.

 VEHICLES:

 Helicopter miniguns can now damage enemy soldiers who are in the water.

 REDSEC

 WEAPONS:

 The KTS100 MK8 has been rebalanced for battle royale.
`;

describe('o corpo do patch note', () => {
  it('começa no artigo, e não no sumário', () => {
    const corpo = changelogDeMultiplayer(NOTA);

    expect(corpo).toContain('Match Trigger');
    expect(corpo).not.toContain('TABLE OF CONTENTS');
  });

  /*
   * A leitura do meta é do multiplayer tradicional, e o patch note traz os dois
   * modos no mesmo texto. Mandar o bloco inteiro seria pedir ao modelo que
   * ignorasse metade do que acabou de receber — e essa é a regra que ele mais
   * erra.
   */
  it('para no REDSEC, que é outro jogo para esta leitura', () => {
    expect(changelogDeMultiplayer(NOTA)).not.toContain('KTS100');
  });
});

describe('as linhas que interessam à leitura do meta', () => {
  it('traz a seção de armas inteira', () => {
    expect(linhasDeArma(NOTA)).toContain(
      'The Match Trigger attachment no longer affects fully automatic fire on the BROD and EF88.',
    );
  });

  /*
   * "Helicopter miniguns can now damage…" tem a palavra `damage` e nada a ver
   * com o arsenal que se leva a pé. Cada linha à toa é contexto pago que empurra
   * a resposta para o assunto errado.
   */
  it('deixa de fora a arma montada em veículo', () => {
    expect(linhasDeArma(NOTA).join(' ')).not.toContain('Helicopter miniguns');
  });

  it('pega o anúncio de arma nova, que está fora do changelog', () => {
    expect(linhasDeArma(NOTA).join(' ')).toContain('EF88');
  });
});

describe('o briefing', () => {
  const patch = {
    version: '1.4.2.5',
    label: 'BATTLEFIELD 6 GAME UPDATE 1.4.2.5',
    releasedAt: '2026-08-31',
    anterior: '1.4.2.0',
    url: 'https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-game-update-1-4-2-5',
    linhasDeArma: ['The Match Trigger attachment no longer affects fully automatic fire.'],
  };

  it('diz a versão, a data e manda não pesquisar isso', () => {
    const texto = briefingDoPatch(patch);

    expect(texto).toContain('1.4.2.5');
    expect(texto).toContain('2026-08-31');
    expect(texto).toMatch(/não gaste busca/i);
  });

  /*
   * A frase que mais importa. Patch de correção legitimamente não mexe em arma,
   * e sem dizer isso o modelo sai atrás da mudança que não existe até achar
   * alguma — que vai ser a do patch anterior, escrita como se fosse desta
   * semana. Foi assim que a 1.4.2.0 virou "a atualização em vigor" na tela, duas
   * semanas depois de deixar de ser.
   */
  it('afirma o changelog vazio em vez de calar sobre ele', () => {
    const texto = briefingDoPatch({ ...patch, linhasDeArma: [] });

    expect(texto).toMatch(/não tem mudança de arma/i);
    expect(texto).toMatch(/não houve/i);
  });

  it('não inventa briefing quando o catálogo não tem a versão', () => {
    expect(briefingDoPatch(null)).toBe('');
  });
});
