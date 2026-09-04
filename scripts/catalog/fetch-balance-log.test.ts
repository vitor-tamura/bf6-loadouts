/**
 * O que o coletor lê da fonte, e o que ele recusa a ler.
 *
 * Este parser depende de estrutura de página de terceiro, que é a coisa mais
 * frágil que existe num pipeline. O que impede a fragilidade de virar dado
 * errado é ele recusar resultado vazio: página que responde 200 e não rende
 * patch nenhum é layout novo, não "nenhuma atualização" — e a diferença entre
 * as duas leituras é o pipeline inteiro seguir achando que está em dia.
 */

import { describe, expect, it } from 'vitest';
import { parseBalanceLog, toIsoDate } from './fetch-balance-log.ts';

const PAGINA = `
<!-- PATCHES:weapons:START -->
<details class="patch" open>
<summary><span class="ver">1.4.2.5</span><span class="date">Aug 31, 2026</span><span class="tag tag-weapons">1 line</span></summary>
<div class="body">
<p class="grp"><b>WEAPONS</b></p>
<ul class="plain">
<li data-item="brod-3 ef88 match-trigger">The Match Trigger attachment no longer affects fully automatic fire on the BROD and EF88.</li>
</ul>
<div class="src">Source: <a href="https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-game-update-1-4-2-5">Battlefield 6 Game Update 1.4.2.5</a>, posted Aug 31, 2026</div>
</div>
</details>
<!-- PATCHES:weapons:END -->
<!-- PATCHES:vehicles:START -->
<details class="patch">
<summary><span class="ver">1.4.2.5</span><span class="date">Aug 31, 2026</span></summary>
<div class="body">
<ul class="plain"><li data-item="">Helicopter miniguns can now damage enemy soldiers in the water.</li></ul>
</div>
</details>
<details class="patch">
<summary><span class="ver">1.4.2.6</span><span class="date">Sep 2, 2026</span></summary>
<div class="body"><ul class="plain"><li>Tank turret traverse adjusted.</li></ul></div>
</details>
<!-- PATCHES:vehicles:END -->
`;

describe('a data do cartão', () => {
  it('vira ISO', () => {
    expect(toIsoDate('Aug 31, 2026')).toBe('2026-08-31');
    expect(toIsoDate('Sep 2, 2026')).toBe('2026-09-02');
  });

  it('devolve nulo quando não reconhece o mês, em vez de chutar', () => {
    expect(toIsoDate('Brumaire 12, 2026')).toBeNull();
  });
});

describe('o que a página rende', () => {
  const patches = parseBalanceLog(PAGINA);

  it('ordena da mais nova para a mais antiga', () => {
    expect(patches.map((patch) => patch.version)).toEqual(['1.4.2.6', '1.4.2.5']);
  });

  /*
   * Um patch aparece em várias categorias e aqui vira um registro só. É o que
   * permite saber que uma versão existe mesmo quando ela não encostou em arma
   * nenhuma — que é exatamente a informação de que a descoberta precisa.
   */
  it('funde as categorias do mesmo patch num registro só', () => {
    const patch = patches.find((candidato) => candidato.version === '1.4.2.5')!;

    expect(patch.categories).toEqual(['weapons', 'vehicles']);
    expect(patch.publishedAt).toBe('2026-08-31');
  });

  /*
   * A 1.4.2.5 foi baixada de `/redsec/news/…` porque foi onde a EA pendurou o
   * cartão naquele dia. A fonte aponta a canônica.
   */
  it('guarda o endereço oficial que a fonte cita', () => {
    const patch = patches.find((candidato) => candidato.version === '1.4.2.5')!;

    expect(patch.url).toBe(
      'https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-game-update-1-4-2-5',
    );
  });

  /*
   * O `data-item` é o que o parser de patch note não tinha: a EA escreveu "the
   * BROD" e o catálogo guarda `brod3`. Aqui o casamento vem feito por quem lê o
   * jogo.
   */
  it('guarda as entidades que a fonte diz que a linha nomeia', () => {
    const patch = patches.find((candidato) => candidato.version === '1.4.2.5')!;

    expect(patch.weaponLines).toHaveLength(1);
    expect(patch.weaponLines[0].group).toBe('WEAPONS');
    expect(patch.weaponLines[0].items).toEqual(['brod-3', 'ef88', 'match-trigger']);
  });

  it('só guarda linha da categoria de armas', () => {
    const patch = patches.find((candidato) => candidato.version === '1.4.2.5')!;

    expect(patch.weaponLines.map((linha) => linha.text).join(' ')).not.toContain('Helicopter');
  });
});

describe('página que mudou de forma', () => {
  it('não vira lista vazia de patches', () => {
    expect(parseBalanceLog('<html><body>nada aqui</body></html>')).toEqual([]);
  });
});
