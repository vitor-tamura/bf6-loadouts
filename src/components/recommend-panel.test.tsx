import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecommendPanel } from './recommend-panel';
import { WEAPONS_BY_ID } from '@/data/weapons';
import { factoryAttachments } from '@/lib/loadout';
import type { LoadoutAdvice } from '@/lib/recommend';

/**
 * O painel lê uma resposta de modelo, e resposta de modelo vem furada.
 *
 * Playstyle sem evidência, alternativa que não se sustentou, busca que não
 * citou ninguém: a rota manda tudo isso como `null` de propósito, em vez de
 * inventar texto. O teste existe para o painel continuar suportando o caso
 * magro — é ele que aparece quando a busca rende pouco, justamente o dia em que
 * uma tela quebrada seria mais notada.
 */

const weapon = WEAPONS_BY_ID.get('m16a4')!;

const magro: LoadoutAdvice = {
  attachments: factoryAttachments(weapon),
  why: {},
  reason: 'Montagem citada pela comunidade para este alcance.',
  playstyle: null,
  range: { main: null, secondary: null },
  status: null,
  confidence: null,
  alternative: null,
  consensus: null,
  changes: null,
  sources: [],
  unsourced: true,
};

describe('painel da sugestão', () => {
  it('renderiza com tudo que podia faltar faltando', () => {
    const html = renderToStaticMarkup(
      <RecommendPanel weapon={weapon} advice={magro} onApply={() => {}} />,
    );

    expect(html).toContain('Build aplicada');
    expect(html).toContain(magro.reason);
    // Blocos sem conteúdo não abrem título vazio na tela.
    expect(html).not.toContain('Como jogar');
    expect(html).not.toContain('Alternativa');
    expect(html).not.toContain('De onde saiu');
  });

  it('mostra cada bloco que a busca sustentou', () => {
    const cheio: LoadoutAdvice = {
      ...magro,
      why: { barrel: 'Segura o coice vertical nas rajadas longas.' },
      playstyle: 'Fique entre 20 e 60 m e mire antes de entrar no corredor.',
      range: { main: '30–60 m', secondary: '15–30 m' },
      status: 'TRENDING',
      confidence: 'MEDIUM',
      alternative: {
        label: 'longo alcance',
        when: 'Em mapas abertos, quando o duelo começa longe.',
        attachments: factoryAttachments(weapon),
      },
      consensus: 'A comunidade se divide entre a build full-auto e a de rajada.',
      changes: 'O último patch reduziu o recuo vertical.',
      sources: [{ name: 'reddit.com', url: 'https://reddit.com/r/Battlefield6/comments/abc' }],
    };

    const html = renderToStaticMarkup(
      <RecommendPanel weapon={weapon} advice={cheio} onApply={() => {}} />,
    );

    expect(html).toContain('TRENDING');
    expect(html).toContain('30–60 m');
    expect(html).toContain('longo alcance');
    expect(html).toContain('Como jogar');
    expect(html).toContain('reddit.com');
    expect(html).toContain('Segura o coice vertical');
  });
});
