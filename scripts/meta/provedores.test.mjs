import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODELO_PADRAO,
  candidatos,
  ehFaltaDeCredito,
  filtrarGratuitos,
  lerRespostaGemini,
  lerRespostaOpenRouter,
  modelosDe,
  perguntarComBusca,
  perguntarSemBusca,
  reiniciarEstado,
  temAlgumaChave,
} from './provedores.mjs';

const coletar = async (gerador) => {
  const itens = [];
  for await (const item of gerador) itens.push(item);
  return itens;
};

const json = (status, corpo, headers = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } });

const respostaBoa = (texto = '{"ok":true}') => ({
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: texto,
        annotations: [{ type: 'url_citation', url_citation: { url: 'https://exemplo.com/a', title: 'Exemplo' } }],
      },
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 8,
    completion_tokens_details: { reasoning_tokens: 3 },
    server_tool_use: { web_search_requests: 2 },
  },
});

describe('ehFaltaDeCredito', () => {
  it('reconhece o 402 do OpenRouter e a recusa de cobrança da casa por trás', () => {
    expect(ehFaltaDeCredito(402, null)).toBe(true);
    expect(ehFaltaDeCredito(402, { code: 402, message: 'Insufficient credits' })).toBe(true);
    expect(
      ehFaltaDeCredito(429, {
        message: 'You exceeded your current quota, please check your plan and billing details.',
      }),
    ).toBe(true);
  });

  it('não confunde limite de taxa com crédito', () => {
    expect(ehFaltaDeCredito(429, { code: 429, message: 'Rate limit exceeded' })).toBe(false);
    expect(ehFaltaDeCredito(400, { message: 'bad request' })).toBe(false);
  });
});

describe('modelosDe', () => {
  it('lê a lista da variável e cai no padrão quando ela não diz nada', () => {
    expect(modelosDe(' casa/a , casa/b ,')).toEqual(['casa/a', 'casa/b']);
    expect(modelosDe(undefined)).toEqual([MODELO_PADRAO]);
    expect(modelosDe('')).toEqual([MODELO_PADRAO]);
  });
});

describe('lerRespostaOpenRouter', () => {
  it('devolve o texto, as páginas citadas e a conta da busca', () => {
    const lido = lerRespostaOpenRouter(respostaBoa('{"a":1}'), 1000);
    expect(lido.texto).toBe('{"a":1}');
    expect(lido.anotacoes).toEqual([{ url: 'https://exemplo.com/a', title: 'Exemplo' }]);
    expect(lido.buscou).toBe(true);
    expect(lido.tipos).toEqual(['web_search', 'message']);
    expect(lido.custo).toEqual({ entrada: 10, saida: 8, raciocinio: 3, buscas: 2 });
  });

  it('junta o texto que chega em partes', () => {
    const lido = lerRespostaOpenRouter(
      {
        choices: [
          {
            finish_reason: 'stop',
            message: { content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] },
          },
        ],
      },
      1000,
    );
    expect(lido.texto).toBe('{"a":1}');
  });

  it('sem contagem de busca nem citação, diz que não buscou', () => {
    const lido = lerRespostaOpenRouter(
      { choices: [{ finish_reason: 'stop', message: { content: 'de memória' } }], usage: { prompt_tokens: 1 } },
      1000,
    );
    expect(lido.buscou).toBe(false);
    expect(lido.tipos).toEqual(['message']);
  });

  it('acusa a resposta cortada em vez de devolver JSON pela metade', () => {
    expect(() =>
      lerRespostaOpenRouter({ choices: [{ finish_reason: 'length', message: { content: '' } }] }, 1000),
    ).toThrow(/cortada/);
  });

  it('acusa o erro que chega com status 200', () => {
    expect(() =>
      lerRespostaOpenRouter(
        {
          choices: [
            {
              finish_reason: 'error',
              message: { content: 'pela met' },
              error: { code: 502, message: 'Provider disconnected mid-stream' },
            },
          ],
        },
        1000,
      ),
    ).toThrow(/Provider disconnected/);
    expect(() => lerRespostaOpenRouter({ choices: [] }, 1000)).toThrow(/sem mensagem/);
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

const respostaGemini = {
  candidates: [
    {
      finishReason: 'STOP',
      content: { parts: [{ text: '{"ok":true}' }] },
      groundingMetadata: { webSearchQueries: ['q'], groundingChunks: [] },
    },
  ],
};

describe('a fila', () => {
  const ambiente = { ...process.env };

  beforeEach(() => {
    reiniciarEstado();
    process.env.OPENROUTER_API_KEY = 'sk-or-teste';
    process.env.GEMINI_API_KEY = 'g-teste';
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.GEMINI_MODELS = 'gemini-teste-flash';
  });

  afterEach(() => {
    process.env = { ...ambiente };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sem chave nenhuma, não há fila', async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(temAlgumaChave()).toBe(false);
    expect(await coletar(candidatos(['casa/a']))).toEqual([]);
  });

  it('com crédito no OpenRouter, a fila é a lista de modelos e não chega ao gratuito', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(temAlgumaChave()).toBe(true);
    expect(await coletar(candidatos(['casa/a', 'casa/b']))).toEqual([
      { provedor: 'openrouter', modelo: 'casa/a' },
      { provedor: 'openrouter', modelo: 'casa/b' },
    ]);
  });

  it('pergunta ao OpenRouter com a chave, a busca ligada e o teto de saída', async () => {
    const fetch = vi.fn(async () => json(200, respostaBoa()));
    vi.stubGlobal('fetch', fetch);

    const resposta = await perguntarComBusca({ provedor: 'openrouter', modelo: 'casa/a' }, 'p', {
      maxOutputTokens: 100,
    });

    expect(resposta).toMatchObject({ provedor: 'openrouter', modelo: 'casa/a', texto: '{"ok":true}', buscou: true });

    const [url, pedido] = fetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(pedido.headers.authorization).toBe('Bearer sk-or-teste');
    expect(JSON.parse(pedido.body)).toMatchObject({
      model: 'casa/a',
      messages: [{ role: 'user', content: 'p' }],
      tools: [{ type: 'openrouter:web_search' }],
      max_tokens: 100,
    });
  });

  it('sem busca, não manda a ferramenta', async () => {
    const fetch = vi.fn(async () => json(200, respostaBoa()));
    vi.stubGlobal('fetch', fetch);

    await perguntarSemBusca({ provedor: 'openrouter', modelo: 'casa/a' }, 'p', { maxOutputTokens: 100 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('tools');
  });

  it('crédito esgotado libera o gratuito e vale para o resto da execução', async () => {
    const fetch = vi.fn(async (url) => {
      if (String(url).includes('openrouter')) {
        return json(402, { error: { code: 402, message: 'Insufficient credits' } });
      }
      if (String(url).endsWith('/models?pageSize=200')) return json(200, { models: [] });
      return json(200, respostaGemini);
    });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const usados = [];
    let resposta = null;
    for await (const candidato of candidatos(['casa/a', 'casa/b'])) {
      usados.push(candidato.modelo);
      try {
        resposta = await perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 });
        break;
      } catch {
        // próximo da fila
      }
    }

    // O casa/b nem é tentado: o crédito é da conta, não do modelo.
    expect(usados).toEqual(['casa/a', 'gemini-teste-flash']);
    expect(resposta).toMatchObject({ provedor: 'google', texto: '{"ok":true}', buscou: true });
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('openrouter'))).toHaveLength(1);

    // Na pergunta seguinte, o OpenRouter já fica de fora.
    expect(await coletar(candidatos(['casa/a']))).toEqual([{ provedor: 'google', modelo: 'gemini-teste-flash' }]);
  });

  it('crédito esgotado sem chave gratuita encerra a fila', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetch = vi.fn(async () => json(402, { error: { code: 402, message: 'Insufficient credits' } }));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const usados = [];
    for await (const candidato of candidatos(['casa/a', 'casa/b'])) {
      usados.push(candidato.modelo);
      await expect(perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 })).rejects.toThrow(/402/);
    }

    expect(usados).toEqual(['casa/a']);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await coletar(candidatos(['casa/a']))).toEqual([]);
  });

  it('sem chave do OpenRouter, vai direto ao gratuito', async () => {
    delete process.env.OPENROUTER_API_KEY;
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { models: [] })));
    expect(await coletar(candidatos(['casa/a']))).toEqual([{ provedor: 'google', modelo: 'gemini-teste-flash' }]);
  });

  it('modelo gratuito com a cota do dia gasta sai da fila', async () => {
    delete process.env.OPENROUTER_API_KEY;
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

  it('modelo pago recusado não fecha a fila para o seguinte, nem abre o gratuito', async () => {
    const fetch = vi.fn(async (_url, pedido) =>
      JSON.parse(pedido.body).model === 'casa/a'
        ? json(404, { error: { code: 404, message: 'No endpoints found for casa/a' } })
        : json(200, respostaBoa()),
    );
    vi.stubGlobal('fetch', fetch);

    const usados = [];
    let resposta = null;
    for await (const candidato of candidatos(['casa/a', 'casa/b'])) {
      usados.push(candidato.modelo);
      try {
        resposta = await perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 });
        break;
      } catch {
        // próximo da fila
      }
    }

    expect(usados).toEqual(['casa/a', 'casa/b']);
    expect(resposta).toMatchObject({ provedor: 'openrouter', modelo: 'casa/b', texto: '{"ok":true}' });
  });

  it('limite de taxa espera e insiste no mesmo modelo', async () => {
    let chamadas = 0;
    const fetch = vi.fn(async () => {
      chamadas += 1;
      return chamadas === 1
        ? json(429, { error: { code: 429, message: 'Rate limit exceeded' } }, { 'retry-after': '0' })
        : json(200, respostaBoa());
    });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resposta = await perguntarComBusca({ provedor: 'openrouter', modelo: 'casa/a' }, 'p', {
      maxOutputTokens: 100,
    });
    expect(resposta.texto).toBe('{"ok":true}');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('erro que chega com status 200 sobe com o código de dentro do corpo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { error: { code: 502, message: 'Provider down' } })));
    await expect(
      perguntarComBusca({ provedor: 'openrouter', modelo: 'casa/a' }, 'p', { maxOutputTokens: 100, tentativas: 1 }),
    ).rejects.toMatchObject({ status: 502, message: '502 Provider down' });
  });
});
