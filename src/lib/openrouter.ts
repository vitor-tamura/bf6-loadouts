/**
 * A conversa com o OpenRouter, para as rotas do site.
 *
 * As duas rotas que perguntam a um modelo — a leitura do confronto e a sugestão
 * de montagem — falavam cada uma com uma casa e de um jeito: o confronto pelo
 * AI SDK, com gateway, OpenAI e Google em fila; a sugestão direto na API da
 * OpenAI. Agora as duas passam por aqui, com uma chave só.
 *
 * O OpenRouter fala o formato de chat da OpenAI com qualquer modelo do catálogo
 * dele, então o modelo é um nome com a casa na frente (`openai/gpt-5.6-luna`),
 * e trocá-lo não pede código novo.
 *
 * As rotinas diárias têm o par deste arquivo em `scripts/meta/provedores.mjs`:
 * elas rodam fora do Next, em `.mjs`, e não importam de `src/lib`.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * O modelo das rotas, quando a variável de ambiente não diz outro.
 *
 * É o roteador de gratuitos do OpenRouter, e não um nome: a chave paga parou
 * no teto de gasto dela, e a decisão foi não depender de crédito. A lista de
 * modelos `:free` muda de mês em mês, e um nome fixo viraria 404 sem ninguém
 * ter mexido no código; o roteador escolhe, entre os gratuitos no ar, um que
 * aceite o pedido. Redigir três frases ou escolher peças de uma lista dada é
 * trabalho que modelo pequeno faz.
 *
 * O preço é a cota: os gratuitos têm teto de pedidos por minuto e por dia, e
 * respondem 429 quando ele acaba.
 */
export const DEFAULT_MODEL = 'openrouter/free';

/** A chave, lida na hora: a rota responde 502 com o motivo quando ela falta. */
export const openRouterKey = () => process.env.OPENROUTER_API_KEY;

/** A fila de modelos de uma rota, a partir da variável de ambiente dela. */
export function modelsFrom(value: string | undefined, fallback = DEFAULT_MODEL): string[] {
  return (value || fallback)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

export type OpenRouterError = Error & { status?: number; retryAfterMs?: number; outOfCredit?: boolean };

/**
 * A recusa é falta de crédito?
 *
 * O sinal oficial é o 402. Mas a chave pode ter teto de gasto próprio, e esse
 * chega como 403 — "Key limit exceeded (total limit)". Os dois valem para a
 * conta inteira: nenhum outro nome do catálogo responderia.
 */
export const isOutOfCredit = (status: number, message = '') =>
  status === 402 || (status === 403 && /key limit exceeded/i.test(message));

export interface Citation {
  url: string;
  title?: string;
}

export interface ChatRequest {
  model: string;
  system?: string;
  prompt: string;
  /** O teto de saída — raciocínio e texto contam juntos. */
  maxTokens: number;
  /** Liga a busca na web do OpenRouter, cobrada por consulta até em modelo gratuito. O modelo decide se a usa. */
  webSearch?: boolean;
  /** Dito quando importa: o padrão das casas é `medium`. */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  signal?: AbortSignal;
  /** A tentativa em curso, para o recuo quando o servidor não diz quanto esperar. */
  attempt?: number;
}

export interface ChatAnswer {
  text: string;
  /** As páginas que a busca abriu, na ordem da resposta. */
  citations: Citation[];
}

interface ChatBody {
  error?: { code?: number | string; message?: string };
  choices?: {
    finish_reason?: string;
    error?: { code?: number | string; message?: string };
    message?: {
      content?: string | { type?: string; text?: string }[] | null;
      annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[];
    };
  }[];
}

export function chatRequestBody({ model, system, prompt, maxTokens, webSearch, reasoningEffort }: ChatRequest) {
  return {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
    ...(webSearch ? { tools: [{ type: 'openrouter:web_search' }] } : {}),
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    max_tokens: maxTokens,
  };
}

/**
 * O texto e as citações de uma resposta de chat.
 *
 * Separado da chamada para poder ser testado sem rede.
 */
export function readChatAnswer(body: ChatBody): ChatAnswer {
  const choice = body.choices?.[0];
  if (!choice) throw new Error('resposta sem mensagem');

  /*
   * Erro com status 200: a casa por trás do modelo caiu no meio da resposta, e
   * o OpenRouter entrega o que tinha com `finish_reason: "error"`.
   */
  if (choice.error || choice.finish_reason === 'error') {
    throw new Error(`o modelo falhou no meio da resposta (${choice.error?.message ?? 'motivo não informado'})`);
  }

  /*
   * Resposta cortada não é resposta.
   *
   * O teto de saída conta também os tokens de raciocínio: quem pensa demais
   * chega aqui com a mensagem vazia, que o extrator reportaria como "resposta
   * sem JSON" — erro que manda procurar no lugar errado. Assim ele se
   * identifica.
   */
  if (choice.finish_reason === 'length') throw new Error('resposta cortada (length)');

  const content = choice.message?.content;
  const text =
    typeof content === 'string'
      ? content
      : (content ?? [])
          .filter((part) => part.type === 'text' || part.type === 'output_text')
          .map((part) => part.text ?? '')
          .join('');

  const citations = (choice.message?.annotations ?? []).flatMap((annotation) =>
    annotation.type === 'url_citation' && annotation.url_citation?.url
      ? [{ url: annotation.url_citation.url, title: annotation.url_citation.title }]
      : [],
  );

  return { text, citations };
}

/** Quanto esperar antes de insistir: o que o servidor mandou, ou recuo exponencial. */
function retryDelayMs(response: Response, attempt: number) {
  const header = response.headers.get('retry-after');
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;
  return Math.min(30_000, 1500 * 2 ** (attempt - 1));
}

/**
 * Uma ida ao modelo. Lança `OpenRouterError` com o status quando a API recusa.
 *
 * O que importa a quem chama: `outOfCredit` é crédito esgotado — vale para a
 * conta inteira, não só para o modelo —, 429 é limite de taxa e passa com
 * espera, 400 e 404 são do modelo e pedem o próximo da fila.
 */
export async function chat(request: ChatRequest): Promise<ChatAnswer> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${openRouterKey()}`,
      'content-type': 'application/json',
      'x-title': 'bf6-loadouts',
    },
    body: JSON.stringify(chatRequestBody(request)),
    signal: request.signal,
  });

  const body = (await response.json().catch(() => ({}))) as ChatBody;

  if (!response.ok || body.error) {
    // O erro pode vir com status 200 e o código de verdade dentro do corpo.
    const status = response.ok ? Number(body.error?.code) || response.status : response.status;
    const error: OpenRouterError = new Error(
      body.error?.message ? `${status} ${body.error.message}` : `${status} ${response.statusText}`,
    );
    error.status = status;
    error.outOfCredit = isOutOfCredit(status, body.error?.message);
    error.retryAfterMs = retryDelayMs(response, request.attempt ?? 1);
    throw error;
  }

  return readChatAnswer(body);
}
