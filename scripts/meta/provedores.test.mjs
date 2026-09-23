import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  candidatos,
  ehFaltaDeCredito,
  filtrarGratuitos,
  lerRespostaGemini,
  perguntarComBusca,
  reiniciarEstado,
} from './provedores.mjs';

const coletar = async (gerador) => {
  const itens = [];
  for await (const item of gerador) itens.push(item);
  return itens;
};

const json = (status, corpo) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

describe('ehFaltaDeCredito', () => {
  it('reconhece o 429 de cota esgotada da OpenAI', () => {
    expect(ehFaltaDeCredito(429, { code: 'insufficient_quota', message: 'x' })).toBe(true);
    expect(
      ehFaltaDeCredito(429, {
        message: 'You exceeded your current quota, please check your plan and billing details.',
      }),
    ).toBe(true);
    expect(ehFaltaDeCredito(402, null)).toBe(true);
  });

  it('não confunde limite de taxa com crédito', () => {
    expect(
      ehFaltaDeCredito(429, { code: 'rate_limit_exceeded', message: 'Rate limit reached. Please try again in 2s.' }),
    ).toBe(false);
    expect(ehFaltaDeCredito(400, { message: 'bad request' })).toBe(false);
  });
});

describe('filtrarGratuitos', () => {
  it('fica só com os Flash de texto', () => {
    const nomes = filtrarGratuitos([
      { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.6-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.6-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.6-flash-live', supportedGenerationMethods: ['bidiGenerateContent'] },
      { name: 'models/gemini-embedding-flash', supportedGenerationMethods: ['embedContent'] },
    ]);
    expect(nomes).toEqual(['gemini-3.6-flash']);
  });
});

describe('lerRespostaGemini', () => {
  it('junta o texto, ignora o raciocínio e diz se buscou', () => {
    const lido = lerRespostaGemini(
      {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: 'pensando', thought: true }, { text: '{"a":' }, { text: '1}' }] },
            groundingMetadata: {
              webSearchQueries: ['bf6 meta'],
              groundingChunks: [{ web: { uri: 'https://exemplo.com/a', title: 'exemplo.com' } }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 },
      },
      1000,
    );
    expect(lido.texto).toBe('{"a":1}');
    expect(lido.buscou).toBe(true);
    expect(lido.web).toHaveLength(1);
    expect(lido.custo).toEqual({ entrada: 10, saida: 8, raciocinio: 3, buscas: 1 });
  });

  it('acusa a resposta cortada em vez de devolver JSON pela metade', () => {
    expect(() =>
      lerRespostaGemini({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }, 1000),
    ).toThrow(/cortada/);
  });
});

describe('a fila', () => {
  const ambiente = { ...process.env };

  beforeEach(() => {
    reiniciarEstado();
    process.env.OPENAI_API_KEY = 'sk-teste';
    process.env.GEMINI_API_KEY = 'g-teste';
    process.env.GEMINI_MODELS = 'gemini-teste-flash';
  });

  afterEach(() => {
    process.env = { ...ambiente };
    vi.unstubAllGlobals();
  });

  it('com crédito na OpenAI, não chega ao gratuito', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await coletar(candidatos(['gpt-a']))).toEqual([{ provedor: 'openai', modelo: 'gpt-a' }]);
  });

  it('crédito esgotado libera o gratuito e vale para o resto da execução', async () => {
    const fetch = vi.fn(async (url) => {
      if (String(url).includes('openai')) {
        return json(429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } });
      }
      if (String(url).endsWith('/models?pageSize=200')) return json(200, { models: [] });
      return json(200, {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: '{"ok":true}' }] },
            groundingMetadata: { webSearchQueries: ['q'], groundingChunks: [] },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetch);

    const usados = [];
    let resposta = null;
    for await (const candidato of candidatos(['gpt-a', 'gpt-b'])) {
      usados.push(candidato.modelo);
      try {
        resposta = await perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 });
        break;
      } catch {
        // próximo da fila
      }
    }

    // O gpt-b nem é tentado: o crédito é da conta, não do modelo.
    expect(usados).toEqual(['gpt-a', 'gemini-teste-flash']);
    expect(resposta).toMatchObject({ provedor: 'google', texto: '{"ok":true}', buscou: true });
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('openai'))).toHaveLength(1);

    // Na pergunta seguinte, a OpenAI já fica de fora.
    expect(await coletar(candidatos(['gpt-a']))).toEqual([{ provedor: 'google', modelo: 'gemini-teste-flash' }]);
  });

  it('sem chave da OpenAI, vai direto ao gratuito', async () => {
    delete process.env.OPENAI_API_KEY;
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { models: [] })));
    expect(await coletar(candidatos(['gpt-a']))).toEqual([{ provedor: 'google', modelo: 'gemini-teste-flash' }]);
  });

  it('modelo gratuito com a cota do dia gasta sai da fila', async () => {
    delete process.env.OPENAI_API_KEY;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        String(url).endsWith('/models?pageSize=200')
          ? json(200, { models: [] })
          : json(429, { error: { message: 'Quota exceeded for GenerateRequestsPerDayPerProjectPerModel-FreeTier' } }),
      ),
    );
    const [candidato] = await coletar(candidatos([]));
    await expect(perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 })).rejects.toThrow(/429/);
    expect(await coletar(candidatos([]))).toEqual([]);
  });
});
