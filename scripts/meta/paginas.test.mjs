import { describe, expect, it } from 'vitest';
import {
  ancorarFontes,
  armasCitadas,
  filtrarConversa,
  parsearRss,
  recortarPagina,
  trechoDaThread,
} from './paginas.mjs';

describe('armasCitadas', () => {
  it('acha a arma do jeito que a comunidade escreve', () => {
    expect(armasCitadas('Has Brod 3 got a nerf?')).toEqual(['BROD 3']);
    expect(armasCitadas('the SG-553R and the sg553r')).toEqual(['SG 553R']);
    expect(armasCitadas('why do people hate on the TR-7?')).toEqual(['TR-7']);
  });

  it('só casa o nome inteiro', () => {
    expect(armasCitadas('the M4A1S from another game')).toEqual([]);
    expect(armasCitadas('nothing about guns here')).toEqual([]);
  });
});

describe('recortarPagina', () => {
  const menu = 'Battlefield 6 Warzone Language English '.repeat(20);
  const tabela = 'Multiplayer Meta Updated 1 M16A4 #1 Assault Rifle 2 B36A4 #2 Assault Rifle 3 PP-19 #1 SMG';
  const rodape = ' META Guns VOYAK KT-3 • KAR98K • AN-94 SPONSORS '.repeat(10);

  it('começa perto da primeira arma e para depois da última', () => {
    const recorte = recortarPagina(`${menu}${tabela}${rodape}`);
    expect(recorte).toContain('1 M16A4 #1 Assault Rifle');
    expect(recorte).toContain('PP-19 #1 SMG');
    expect(recorte).not.toContain('KAR98K');
    expect(recorte.length).toBeLessThan(400);
  });

  it('tira o rótulo do botão que repete o nome', () => {
    expect(recortarPagina('Get all the best M16A4 builds 1 M16A4 #1 Assault Rifle')).not.toContain('Get all');
  });

  it('página sem arma nenhuma não vira material', () => {
    expect(recortarPagina('Just a moment... Enable JavaScript and cookies to continue')).toBe('');
  });
});

describe('parsearRss', () => {
  const feed = `<feed>
    <entry>
      <content type="html">&lt;div&gt;&lt;p&gt;It feels weaker since the patch &amp;amp; nobody talks about it.&lt;/p&gt;&lt;/div&gt; &amp;#32; submitted by &amp;#32; &lt;a href="x"&gt; /u/alguem &lt;/a&gt; &lt;a&gt;[link]&lt;/a&gt;</content>
      <link href="https://www.reddit.com/r/Battlefield6/comments/abc/has_brod_3_got_a_nerf/" />
      <published>2026-09-24T10:00:00+00:00</published>
      <title>Has Brod 3 got a nerf?</title>
    </entry>
    <entry><title>sem link</title></entry>
  </feed>`;

  it('tira título, endereço, data e corpo, sem a assinatura', () => {
    expect(parsearRss(feed)).toEqual([
      {
        url: 'https://www.reddit.com/r/Battlefield6/comments/abc/has_brod_3_got_a_nerf/',
        title: 'Has Brod 3 got a nerf?',
        date: '2026-09-24',
        text: 'It feels weaker since the patch & nobody talks about it.',
      },
    ]);
  });

  it('feed vazio ou página de bloqueio dá lista vazia', () => {
    expect(parsearRss("You've been blocked by network security.")).toEqual([]);
    expect(parsearRss(undefined)).toEqual([]);
  });
});

describe('trechoDaThread', () => {
  it('post curto vai inteiro', () => {
    expect(trechoDaThread('The DB-12 is hard to use.')).toBe('The DB-12 is hard to use.');
  });

  it('em post longo, mostra a vizinhança da arma', () => {
    const texto = `${'Season news and maps. '.repeat(60)}The SVDM no longer kills with one headshot. ${'More news. '.repeat(60)}`;
    const trecho = trechoDaThread(texto, 300);
    expect(trecho).toContain('SVDM no longer kills');
    expect(trecho.length).toBeLessThan(320);
  });
});

describe('filtrarConversa', () => {
  const thread = (extra) => ({
    url: 'https://www.reddit.com/r/Battlefield6/comments/a/x/',
    title: 'Has Brod 3 got a nerf?',
    date: '2026-09-24',
    text: '',
    ...extra,
  });

  it('fica com o que cita arma, desta temporada, uma vez cada, do mais novo para o mais velho', () => {
    const uteis = filtrarConversa(
      [
        thread(),
        thread({ url: 'https://www.reddit.com/r/Battlefield6/comments/a/x/?ref=top' }),
        thread({ url: 'https://www.reddit.com/r/Battlefield6/comments/b/y/', title: 'Orange dots are back' }),
        thread({ url: 'https://www.reddit.com/r/Battlefield6/comments/c/z/', title: 'TR-7 build', date: '2026-09-30' }),
        thread({ url: 'https://www.reddit.com/r/Battlefield6/comments/d/w/', title: 'M16A4 at launch', date: '2026-01-10' }),
        thread({ url: 'https://www.reddit.com/r/Battlefield6/comments/e/v/', title: 'SVDM in REDSEC is broken' }),
      ],
      { desde: '2026-07-21' },
    );

    expect(uteis.map((t) => [t.title, t.armas])).toEqual([
      ['TR-7 build', ['TR-7']],
      ['Has Brod 3 got a nerf?', ['BROD 3']],
    ]);
  });
});

describe('ancorarFontes', () => {
  const material = {
    paginas: [
      { name: 'wzstats — ranking', url: 'https://wzstats.gg/battlefield-6/multiplayer/meta', date: '2026-10-01', scope: 'ranking', texto: '…' },
      { name: 'wzstats — fuzis', url: 'https://wzstats.gg/battlefield-6/multiplayer/best-gun/ar', date: '2026-10-01', scope: 'fuzis', texto: '…' },
    ],
    conversa: [
      { url: 'https://www.reddit.com/r/Battlefield6/comments/abc/brod/', title: 'Has Brod 3 got a nerf?', date: '2026-09-24', armas: ['BROD 3'], text: '' },
      { url: 'https://www.reddit.com/r/Battlefield6/comments/def/tr7/', title: 'TR-7 hate', date: '2026-10-01', armas: ['TR-7'], text: '' },
    ],
  };

  it('refaz a lista de fontes só com o que foi baixado e citado', () => {
    const { sources } = ancorarFontes(
      {
        picks: [{ weapon: 'M16A4', source: 'https://wzstats.gg/battlefield-6/multiplayer/meta' }],
        trending: [
          { weapon: 'BROD 3', source: 'https://www.reddit.com/r/Battlefield6/comments/abc/brod/' },
          { weapon: 'TR-7', source: 'https://inventado.example/thread' },
        ],
        // O que o modelo declarar aqui não vale: nem a fonte inventada, nem a data.
        sources: [{ name: 'Inventada', url: 'https://inventado.example/thread', date: '2026-10-01' }],
      },
      material,
    );

    expect(sources.map((f) => f.url)).toEqual([
      'https://wzstats.gg/battlefield-6/multiplayer/meta',
      'https://www.reddit.com/r/Battlefield6/comments/abc/brod/',
    ]);
    expect(sources[1]).toMatchObject({ name: 'Reddit — Has Brod 3 got a nerf?', date: '2026-09-24' });
  });

  it('resposta sem listas não quebra', () => {
    expect(ancorarFontes({}, material).sources).toEqual([]);
    expect(ancorarFontes({ picks: [{ weapon: 'M16A4', source: 'não é url' }] }, material).sources).toEqual([]);
  });
});
