import { afterEach, describe, expect, it, vi } from 'vitest';
import { generate, geminiKey, readGeminiText } from './gemini';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('readGeminiText', () => {
  it('junta o texto e ignora o raciocínio', () => {
    expect(
      readGeminiText({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: 'pensando', thought: true }, { text: 'a' }, { text: 'b' }] } },
        ],
      }),
    ).toBe('ab');
  });

  it('acusa resposta cortada e resposta sem candidato', () => {
    expect(() => readGeminiText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })).toThrow(
      /cortada/,
    );
    expect(() => readGeminiText({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/SAFETY/);
  });
});

describe('geminiKey', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('aceita o nome da rota e o das rotinas', () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', 'g-rotinas');
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    expect(geminiKey()).toBe('g-rotinas');

    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'g-rota');
    expect(geminiKey()).toBe('g-rota');
  });
});

describe('generate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('chama o Google com a chave, o system e o raciocínio desligado', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'g-teste');
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      json(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }] }),
    );
    vi.stubGlobal('fetch', fetch);

    expect(await generate({ model: 'gemini-teste-flash', system: 's', prompt: 'p', maxTokens: 100 })).toBe('ok');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-teste-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-teste');
    expect(JSON.parse(String(init.body))).toEqual({
      systemInstruction: { parts: [{ text: 's' }] },
      contents: [{ role: 'user', parts: [{ text: 'p' }] }],
      generationConfig: { maxOutputTokens: 100, thinkingConfig: { thinkingBudget: 0 } },
    });
  });

  it('a recusa sobe com o status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { error: { message: 'no longer available to new users' } })));
    await expect(generate({ model: 'gemini-velho', prompt: 'p', maxTokens: 100 })).rejects.toMatchObject({
      status: 404,
      message: '404 no longer available to new users',
    });
  });
});
