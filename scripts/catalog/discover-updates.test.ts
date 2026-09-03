import { describe, expect, it } from 'vitest';
import { extractUpdates, toIsoDate } from './discover-updates.ts';

/**
 * O cartão da listagem da EA, reduzido ao que o extrator lê.
 *
 * `game` é o segmento que a EA escolhe para pendurar o artigo, e é justamente
 * ele que mudou sem aviso.
 */
function card(game: string, slug: string, title: string, date: string): string {
  return (
    `<div><a href="/games/battlefield/${game}/news/${slug}" class="Card_link">` +
    `<span style="--line-clamp:2">${title}</span>` +
    `<time>${date}</time></a></div>`
  );
}

describe('descoberta de Game Update', () => {
  it('enxerga a versão pendurada em outro jogo que não battlefield-6', () => {
    /*
     * A 1.4.2.5 saiu em `/games/battlefield/redsec/news/…` e ficou invisível por
     * doze dias, porque o extrator exigia `battlefield-6` no meio do endereço. O
     * pipeline reportou "nenhuma versão a processar" com a versão publicada.
     *
     * Quem afirma que a versão existe é o `game-update-` do slug do artigo — não
     * a seção do site.
     */
    const html =
      card('battlefield-6', 'battlefield-6-game-update-1-4-2-0', 'GAME UPDATE 1.4.2.0', 'August 14, 2026') +
      card('redsec', 'battlefield-6-game-update-1-4-2-5', 'GAME UPDATE 1.4.2.5', 'August 31, 2026');

    expect(extractUpdates(html).map((u) => u.version)).toEqual(['1.4.2.0', '1.4.2.5']);
  });

  it('devolve o endereço que a EA publicou, e não um remontado', () => {
    const html = card('redsec', 'battlefield-6-game-update-1-4-2-5', 'GAME UPDATE 1.4.2.5', 'August 31, 2026');

    expect(extractUpdates(html)[0].url).toBe(
      'https://www.ea.com/games/battlefield/redsec/news/battlefield-6-game-update-1-4-2-5',
    );
  });

  it('não colhe número de quatro grupos que esteja no corpo da página', () => {
    /*
     * A página tem identificadores de componente com a cara de versão —
     * `2.926.379.084`. Colher um deles faria o pipeline abrir Pull Request para
     * uma versão que não existe.
     */
    const html =
      '<p>id 2.926.379.084 e 069.342.055.185</p>' +
      card('battlefield-6', 'battlefield-6-game-update-1-4-1-5', 'GAME UPDATE 1.4.1.5', 'August 3, 2026');

    expect(extractUpdates(html).map((u) => u.version)).toEqual(['1.4.1.5']);
  });

  it('ordena da mais antiga para a mais nova', () => {
    // Processar 1.4.2.5 antes de 1.4.2.0 faria o estado novo ser reescrito pelo velho.
    const html =
      card('redsec', 'battlefield-6-game-update-1-4-2-5', 'GAME UPDATE 1.4.2.5', 'August 31, 2026') +
      card('battlefield-6', 'battlefield-6-game-update-1-4-1-5', 'GAME UPDATE 1.4.1.5', 'August 3, 2026') +
      card('battlefield-6', 'battlefield-6-game-update-1-4-2-0', 'GAME UPDATE 1.4.2.0', 'August 14, 2026');

    expect(extractUpdates(html).map((u) => u.version)).toEqual(['1.4.1.5', '1.4.2.0', '1.4.2.5']);
  });

  it('lê título e data do cartão do próprio link', () => {
    const html =
      card('battlefield-6', 'battlefield-6-game-update-1-4-2-0', 'GAME UPDATE 1.4.2.0', 'August 14, 2026') +
      card('redsec', 'battlefield-6-game-update-1-4-2-5', 'GAME UPDATE 1.4.2.5', 'August 31, 2026');

    expect(extractUpdates(html)[1]).toMatchObject({
      version: '1.4.2.5',
      title: 'GAME UPDATE 1.4.2.5',
      publishedAt: '2026-08-31',
    });
  });
});

describe('data do cartão', () => {
  it('converte o formato que a EA escreve', () => {
    expect(toIsoDate('August 3, 2026')).toBe('2026-08-03');
    expect(toIsoDate('December 31, 2026')).toBe('2026-12-31');
  });

  it('devolve o texto quando não reconhece o mês', () => {
    // Melhor um texto que não parece data do que uma data inventada.
    expect(toIsoDate('Agosto 3, 2026')).toBe('Agosto 3, 2026');
  });
});
