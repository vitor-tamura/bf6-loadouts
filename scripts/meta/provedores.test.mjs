import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODELO_PADRAO,
  candidatos,
  cotaDoGoogle,
  ehFaltaDeCredito,
  ehGratuito,
  filtrarGratuitos,
  lerRespostaGemini,
  lerRespostaOpenRouter,
  filaEsgotada,
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
    // O teto de gasto da própria chave chega como 403, não como 402.
    expect(ehFaltaDeCredito(403, { code: 403, message: 'Key limit exceeded (total limit). Manage it using https://openrouter.ai/…' })).toBe(true);
    expect(
      ehFaltaDeCredito(429, {
        message: 'You exceeded your current quota, please check your plan and billing details.',
      }),
    ).toBe(true);
  });

  it('não confunde limite de taxa com crédito', () => {
    expect(ehFaltaDeCredito(429, { code: 429, message: 'Rate limit exceeded' })).toBe(false);
    expect(ehFaltaDeCredito(400, { message: 'bad request' })).toBe(false);
    // 403 de moderação ou de permissão é do pedido, não da conta.
    expect(ehFaltaDeCredito(403, { code: 403, message: 'Input flagged by moderation' })).toBe(false);
  });
});

describe('ehGratuito', () => {
  it('reconhece o sufixo :free e o roteador de gratuitos', () => {
    expect(ehGratuito('qwen/qwen3.8-27b:free')).toBe(true);
    expect(ehGratuito('openrouter/free')).toBe(true);
    expect(ehGratuito(MODELO_PADRAO)).toBe(true);
    expect(ehGratuito('openai/gpt-5.6-luna')).toBe(false);
    expect(ehGratuito('casa/freeze')).toBe(false);
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

  it('o teto da chave (403) libera o gratuito do mesmo jeito', async () => {
    const fetch = vi.fn(async (url) => {
      if (String(url).includes('openrouter')) {
        return json(403, { error: { code: 403, message: 'Key limit exceeded (total limit). Manage it using …' } });
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

    expect(usados).toEqual(['casa/a', 'gemini-teste-flash']);
    expect(resposta).toMatchObject({ provedor: 'google', texto: '{"ok":true}' });
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('openrouter'))).toHaveLength(1);
  });

  it('com busca, o gratuito do OpenRouter fica de fora e quem lê é o Gemini', async () => {
    const fetch = vi.fn(async () => json(200, { models: [] }));
    vi.stubGlobal('fetch', fetch);

    expect(await coletar(candidatos(['openrouter/free', 'casa/a:free']))).toEqual([
      { provedor: 'google', modelo: 'gemini-teste-flash' },
    ]);
    // Nenhuma chamada paga: só a lista de modelos do Google.
    expect(fetch.mock.calls.every(([url]) => String(url).includes('googleapis'))).toBe(true);
  });

  it('com busca, modelo pago posto na fila ainda busca pelo OpenRouter', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await coletar(candidatos(['casa/a:free', 'casa/pago']))).toEqual([
      { provedor: 'openrouter', modelo: 'casa/pago' },
    ]);
  });

  it('sem busca, os gratuitos do OpenRouter vêm primeiro e o Gemini fica de reserva', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { models: [] })));
    expect(await coletar(candidatos(['openrouter/free', 'casa/a:free'], { busca: false }))).toEqual([
      { provedor: 'openrouter', modelo: 'openrouter/free' },
      { provedor: 'openrouter', modelo: 'casa/a:free' },
      { provedor: 'google', modelo: 'gemini-teste-flash' },
    ]);
  });

  it('cota do dia do gratuito não fica esperando: sobe para o próximo da fila', async () => {
    const fetch = vi.fn(async () =>
      json(429, { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day' } }, { 'retry-after': '3600' }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      perguntarSemBusca({ provedor: 'openrouter', modelo: 'openrouter/free' }, 'p', { maxOutputTokens: 100 }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
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

  it('429 do Google sem tempo de espera tira o modelo da fila na primeira recusa', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetch = vi.fn(async (url) =>
      String(url).endsWith('/models?pageSize=200')
        ? json(200, { models: [] })
        : json(429, {
            error: {
              message: 'You exceeded your current quota, please check your plan and billing details.',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                  violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
                },
              ],
            },
          }),
    );
    vi.stubGlobal('fetch', fetch);

    const [candidato] = await coletar(candidatos([]));
    await expect(perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 })).rejects.toThrow(
      /cota: GenerateRequestsPerDayPerProjectPerModel-FreeTier/,
    );
    // Uma chamada só ao modelo: sem `RetryInfo`, esperar não muda a resposta.
    expect(fetch.mock.calls.filter(([url]) => String(url).includes(':generateContent'))).toHaveLength(1);
  });

  it('limite do minuto, com tempo de espera, ainda espera e insiste', async () => {
    delete process.env.OPENROUTER_API_KEY;
    let chamadas = 0;
    const fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/models?pageSize=200')) return json(200, { models: [] });
      chamadas += 1;
      return chamadas === 1
        ? json(429, {
            error: {
              message: 'You exceeded your current quota',
              details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0.01s' }],
            },
          })
        : json(200, respostaGemini);
    });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [candidato] = await coletar(candidatos([]));
    expect(await perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 })).toMatchObject({ texto: '{"ok":true}' });
    expect(chamadas).toBe(2);
  });

  it('três modelos do Google recusando por cota em seguida fecham o Gemini inteiro', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.GEMINI_MODELS = 'g-1,g-2,g-3,g-4,g-5';
    const fetch = vi.fn(async (url) =>
      String(url).endsWith('/models?pageSize=200')
        ? json(200, { models: [] })
        : json(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.' } }),
    );
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const usados = [];
    for await (const candidato of candidatos([])) {
      usados.push(candidato.modelo);
      await expect(perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 })).rejects.toThrow(/429/);
    }

    // g-4 e g-5 nem são tentados, e a pergunta seguinte já começa sem ninguém.
    expect(usados).toEqual(['g-1', 'g-2', 'g-3']);
    expect(filaEsgotada()).toBe(true);
    expect(await coletar(candidatos([]))).toEqual([]);
  });

  it('com busca, a chave do OpenRouter não segura a fila aberta se ela só tem gratuitos', async () => {
    process.env.GEMINI_MODELS = 'g-1,g-2,g-3';
    const fetch = vi.fn(async (url) =>
      String(url).endsWith('/models?pageSize=200')
        ? json(200, { models: [] })
        : json(429, { error: { message: 'You exceeded your current quota' } }),
    );
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    for await (const candidato of candidatos(['openrouter/free'])) {
      await expect(perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 })).rejects.toThrow(/429/);
    }

    expect(filaEsgotada(['openrouter/free'])).toBe(true);
    // Sem busca o gratuito do OpenRouter ainda responde, e com modelo pago também.
    expect(filaEsgotada(['openrouter/free'], { busca: false })).toBe(false);
    expect(filaEsgotada(['casa/pago'])).toBe(false);
  });

  it('um modelo do Google que responde zera a contagem de recusas', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.GEMINI_MODELS = 'g-1,g-2,g-3,g-4,g-5';
    const fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/models?pageSize=200')) return json(200, { models: [] });
      return String(url).includes('/g-3:')
        ? json(200, respostaGemini)
        : json(429, { error: { message: 'You exceeded your current quota' } });
    });
    vi.stubGlobal('fetch', fetch);

    for await (const candidato of candidatos([])) {
      try {
        await perguntarComBusca(candidato, 'p', { maxOutputTokens: 100 });
        break;
      } catch {
        // próximo da fila
      }
    }

    expect(filaEsgotada()).toBe(false);
    expect(await coletar(candidatos([]))).toEqual([
      { provedor: 'google', modelo: 'g-3' },
      { provedor: 'google', modelo: 'g-4' },
      { provedor: 'google', modelo: 'g-5' },
    ]);
  });

  it('cotaDoGoogle lê o nome da cota e não quebra sem detalhes', () => {
    expect(cotaDoGoogle({ message: 'x' })).toBe('');
    expect(cotaDoGoogle(undefined)).toBe('');
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
