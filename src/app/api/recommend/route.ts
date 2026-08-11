import { WEAPONS_BY_ID } from '@/data/weapons';
import { budgetFor } from '@/data/classes';
import type { SlotId } from '@/data/types';
import { factoryAttachments } from '@/lib/loadout';
import {
  attachmentMenu,
  COMBAT_RANGES,
  isCombatRange,
  validateRecommendation,
} from '@/lib/recommend';

/**
 * O loadout recomendado de uma arma, escolhido por um modelo com busca na web.
 *
 * A rota recebe a arma e o alcance de combate (`curta`, `media` ou `longa`) e
 * pergunta ao modelo o que a comunidade — Reddit e guias recentes — está
 * montando nela para esse alcance. A resposta só cita peças do cardápio que a
 * rota mesma envia, e ainda assim passa pelo funil de `validateRecommendation`:
 * nome que não existe na arma cai fora, peça que estoura o orçamento também.
 *
 * É GET de propósito: as combinações são finitas — 63 armas × 3 alcances — e a
 * resposta não depende de quem perguntou, então a borda guarda cada uma por uma
 * semana. O custo de IA fica limitado a uma busca por combinação por semana,
 * não por visitante.
 */

/** A busca na web leva o tempo dela; o texto que vem depois é rápido. */
export const maxDuration = 60;

const API_KEY = process.env.OPENAI_API_KEY;

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/*
 * A mesma fila do meta diário, pelo mesmo motivo: o nano é o mais barato do
 * catálogo, mas o guia da ferramenta de busca não o cita — se recusar, o mini
 * resolve, e o gpt-4.1-mini fecha a fila noutra família.
 */
const MODELS = (process.env.OPENAI_RECOMMEND_MODELS ?? 'gpt-5-nano,gpt-5-mini,gpt-4.1-mini')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
const MAX_OUTPUT_TOKENS = positiveInt(process.env.OPENAI_RECOMMEND_MAX_OUTPUT_TOKENS, 900);
const MAX_RETRIES = positiveInt(process.env.OPENAI_RECOMMEND_RETRIES, 3);

/*
 * O freio de gasto por visitante, idêntico ao do confronto.
 *
 * A borda absorve as repetições — combinação já vista nem chega aqui —, então
 * o contador só conta o que custaria busca nova. Dez por dia por IP dá para
 * montar um arsenal e não dá para drenar o crédito.
 */
const RECOMMENDATIONS_PER_DAY = 10;
const ONE_DAY_MS = 86_400_000;
const usageByIp = new Map<string, { used: number; resetsAt: number }>();

function overDailyLimit(request: Request) {
  const ip =
    request.headers.get('x-real-ip') ??
    (request.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim();

  const now = Date.now();
  if (usageByIp.size > 1000) {
    for (const [owner, usage] of usageByIp) if (now >= usage.resetsAt) usageByIp.delete(owner);
  }

  let usage = usageByIp.get(ip);
  if (!usage || now >= usage.resetsAt) {
    usage = { used: 0, resetsAt: now + ONE_DAY_MS };
    usageByIp.set(ip, usage);
  }
  if (usage.used >= RECOMMENDATIONS_PER_DAY) return true;
  usage.used += 1;
  return false;
}

interface ResponsePart {
  type?: string;
  text?: string;
}

interface ResponseBody {
  error?: { message?: string };
  output?: { type?: string; content?: ResponsePart[] }[];
}

type ApiError = Error & { status?: number; retryAfterMs?: number };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Quanto esperar antes de insistir: o que o servidor mandou, ou recuo exponencial. */
function retryDelayMs(response: Response, message: string, attempt: number) {
  const header = response.headers.get('retry-after');
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;

  const match = message.match(/try again in ([0-9.]+)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);

  return Math.min(30_000, 1500 * 2 ** (attempt - 1));
}

/*
 * Nada de modo JSON aqui, e nada de raciocínio.
 *
 * A API recusa os dois junto com a busca na web — "Web Search cannot be used
 * with JSON mode" foi o 400 que derrubou a rota inteira em produção, e o
 * `reasoning: minimal` tem a mesma incompatibilidade nos modelos gpt-5. Como a
 * busca é o ponto desta rota, quem sai é o resto: o JSON vem em texto corrido
 * e `extractJson` o recorta, que é para isso que ele existe.
 */
function requestBody(model: string, prompt: string) {
  return {
    model,
    tools: [{ type: 'web_search' }],
    input: prompt,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  };
}

async function callOpenAI(model: string, prompt: string, attempt: number): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody(model, prompt)),
  });

  const body = (await response.json()) as ResponseBody;
  if (!response.ok || body.error) {
    const error: ApiError = new Error(
      body.error?.message
        ? `${response.status} ${body.error.message}`
        : `${response.status} ${response.statusText}`,
    );
    error.status = response.status;
    error.retryAfterMs = retryDelayMs(response, error.message, attempt);
    throw error;
  }

  const message = (body.output ?? []).find((item) => item.type === 'message');
  return (message?.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('');
}

/**
 * Pergunta ao modelo, insistindo só onde insistir resolve.
 *
 * Limite de taxa é temporário e pede espera. Qualquer outra recusa é do
 * modelo, e quem cuida dela é a fila de `MODELS` — repetir o mesmo pedido ao
 * mesmo modelo daria o mesmo 400.
 */
async function ask(model: string, prompt: string): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await callOpenAI(model, prompt, attempt);
    } catch (error) {
      lastError = error;
      const apiError = error as ApiError;

      if (apiError.status === 429 && attempt < MAX_RETRIES) {
        console.warn('[recommend] rate limit, aguardando retry', {
          model,
          seconds: Math.ceil((apiError.retryAfterMs ?? 1000) / 1000),
        });
        await wait(apiError.retryAfterMs ?? 1000);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

/** Tira as cercas de código que o modelo às vezes põe em volta do JSON. */
function extractJson(text: string): { picks?: unknown; reason?: unknown } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { picks?: unknown; reason?: unknown };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const weaponId = url.searchParams.get('weapon');
  const range = url.searchParams.get('range');

  if (!weaponId || !isCombatRange(range)) {
    return Response.json({ error: 'parâmetros inválidos' }, { status: 400 });
  }
  const weapon = WEAPONS_BY_ID.get(weaponId);
  if (!weapon || !weapon.slots.length) {
    return Response.json({ error: 'arma desconhecida' }, { status: 404 });
  }

  // A mesma regra do confronto: IA generativa é coisa de produção.
  if (!API_KEY || process.env.VERCEL_ENV !== 'production') {
    return Response.json({ error: 'modelo indisponível' }, { status: 502 });
  }

  if (overDailyLimit(request)) {
    return Response.json({ error: 'limite diário de recomendações atingido' }, { status: 429 });
  }

  const profile = COMBAT_RANGES.find((item) => item.value === range)!;
  const prompt = `Pesquise no Reddit (r/Battlefield6 e afins) e em guias recentes qual é o melhor conjunto de acessórios para a ${weapon.name} no MULTIPLAYER de Battlefield 6, montado para combate a ${profile.label.toLowerCase()} distância: ${profile.hint}

Escolha SOMENTE dentre os acessórios desta lista — cada linha é um slot, no formato "id do slot (nome): peças com o custo em pontos":

${attachmentMenu(weapon)}

Responda SOMENTE com um JSON neste formato, sem cercas de código e sem texto antes ou depois:

{"picks":{"id do slot":"NOME EXATO DA PEÇA"},"reason":"uma frase curta, em português do Brasil, explicando a montagem"}

Regras:
- No máximo uma peça por slot, e não precisa preencher todos: siga o que a comunidade monta, não a vontade de encher a arma.
- O orçamento total é de ${budgetFor(weapon.category)} pontos, e os custos estão na lista.
- Use o id do slot exatamente como aparece antes do parêntese, e o nome da peça exatamente como está na lista.
- Só multiplayer. Montagem que só faz sentido no REDSEC, o battle royale, fica de fora.`;

  let lastError: unknown = null;

  for (const model of MODELS) {
    try {
      const parsed = extractJson(await ask(model, prompt));
      const picks = parsed?.picks;
      if (!picks || typeof picks !== 'object') throw new Error('resposta sem escolhas');

      const { attachments, discarded } = validateRecommendation(
        weapon,
        picks as Partial<Record<SlotId, unknown>>,
      );

      // Recomendação que não muda nada além da fábrica não vale publicar.
      const factory = factoryAttachments(weapon);
      const realChoices = Object.entries(attachments).filter(
        ([slot, id]) => factory[slot as keyof typeof factory] !== id,
      );
      if (!realChoices.length) throw new Error('nenhuma peça reconhecida além da fábrica');

      if (discarded.length) {
        console.warn('[recommend] descartados', { weaponId, range, discarded });
      }
      console.log('[recommend] respondeu', { weaponId, range, model });

      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'Montagem citada pela comunidade para este alcance.';

      return Response.json(
        { attachments, reason },
        {
          headers: {
            // Cada combinação paga uma busca por semana, não por visitante.
            'cache-control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
          },
        },
      );
    } catch (error) {
      lastError = error;
      console.warn('[recommend] modelo recusado, tentando o próximo', {
        model,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.error('[recommend] falha no modelo', {
    weaponId,
    range,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return Response.json({ error: 'modelo indisponível' }, { status: 502 });
}
