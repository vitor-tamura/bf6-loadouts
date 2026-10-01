import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL, chat, chatRequestBody, modelsFrom, readChatAnswer } from './openrouter';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('modelsFrom', () => {
  it('lê a fila da variável e cai no padrão quando ela não diz nada', () => {
    expect(modelsFrom(' casa/a , casa/b ,')).toEqual(['casa/a', 'casa/b']);
    expect(modelsFrom(undefined)).toEqual([DEFAULT_MODEL]);
    expect(modelsFrom('')).toEqual([DEFAULT_MODEL]);
  });
});

describe('chatRequestBody', () => {
  it('monta o pedido mínimo, sem busca e sem raciocínio dito', () => {
    expect(chatRequestBody({ model: 'casa/a', prompt: 'p', maxTokens: 100 })).toEqual({
      model: 'casa/a',
      messages: [{ role: 'user', content: 'p' }],
      max_tokens: 100,
    });
  });

  it('leva o system, a busca e o esforço quando pedidos', () => {
    expect(
      chatRequestBody({
        model: 'casa/a',
        system: 's',
        prompt: 'p',
        maxTokens: 100,
        webSearch: true,
        reasoningEffort: 'none',
      }),
    ).toEqual({
      model: 'casa/a',
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'p' },
      ],
      tools: [{ type: 'openrouter:web_search' }],
      reasoning: { effort: 'none' },
      max_tokens: 100,
    });
  });
});

describe('readChatAnswer', () => {
  it('devolve o texto e as páginas citadas', () => {
    const answer = readChatAnswer({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: '{"picks":{}}',
            annotations: [
              { type: 'url_citation', url_citation: { url: 'https://exemplo.com/a', title: 'Exemplo' } },
              { type: 'file_citation' },
            ],
          },
        },
      ],
    });
    expect(answer).toEqual({
      text: '{"picks":{}}',
      citations: [{ url: 'https://exemplo.com/a', title: 'Exemplo' }],
    });
  });

  it('junta o texto que chega em partes', () => {
    const answer = readChatAnswer({
      choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }],
    });
    expect(answer.text).toBe('ab');
  });

  it('acusa resposta cortada, erro no meio e resposta sem mensagem', () => {
    expect(() => readChatAnswer({ choices: [{ finish_reason: 'length', message: { content: '' } }] })).toThrow(
      /cortada/,
    );
    expect(() =>
      readChatAnswer({ choices: [{ finish_reason: 'error', error: { code: 502, message: 'Provider caiu' } }] }),
    ).toThrow(/Provider caiu/);
    expect(() => readChatAnswer({ choices: [] })).toThrow(/sem mensagem/);
  });
});

describe('chat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('chama o OpenRouter com a chave do ambiente', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-teste');
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      json(200, { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }),
    );
    vi.stubGlobal('fetch', fetch);

    expect(await chat({ model: 'casa/a', prompt: 'p', maxTokens: 100 })).toEqual({ text: 'ok', citations: [] });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-teste');
  });

  it('a recusa sobe com o status e com a espera que o servidor mandou', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(429, { error: { code: 429, message: 'Rate limit exceeded' } }, { 'retry-after': '7' })),
    );
    await expect(chat({ model: 'casa/a', prompt: 'p', maxTokens: 100 })).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 7000,
      message: '429 Rate limit exceeded',
    });
  });

  it('crédito esgotado chega como 402, e o teto da chave como 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(402, { error: { code: 402, message: 'Insufficient credits' } })));
    await expect(chat({ model: 'casa/a', prompt: 'p', maxTokens: 100 })).rejects.toMatchObject({
      status: 402,
      outOfCredit: true,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(403, { error: { code: 403, message: 'Key limit exceeded (total limit). Manage it using …' } })),
    );
    await expect(chat({ model: 'casa/a', prompt: 'p', maxTokens: 100 })).rejects.toMatchObject({
      status: 403,
      outOfCredit: true,
    });
  });

  it('403 de moderação e limite de taxa não são falta de crédito', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { error: { code: 403, message: 'Input flagged' } })));
    await expect(chat({ model: 'casa/a', prompt: 'p', maxTokens: 100 })).rejects.toMatchObject({ outOfCredit: false });
  });

  it('erro que chega com status 200 sobe com o código de dentro do corpo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { error: { code: 502, message: 'Provider down' } })));
    await expect(chat({ model: 'casa/a', prompt: 'p', maxTokens: 100 })).rejects.toMatchObject({ status: 502 });
  });
});
