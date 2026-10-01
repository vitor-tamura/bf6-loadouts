/**
 * O Gemini gratuito, direto na API do Google, para a reserva do confronto.
 *
 * Existe só para o fim da fila de `/api/matchup`: o dia em que o crédito do
 * OpenRouter acabar ou a chave dele sair do ar. Vai direto no Google, com a
 * chave gratuita dele, porque pelo OpenRouter o Gemini sairia do mesmo crédito
 * que acabou.
 *
 * As rotinas diárias têm a mesma reserva em `scripts/meta/provedores.mjs`, com
 * busca; aqui é só texto.
 */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Os modelos gratuitos do Google, na ordem em que se tenta.
 *
 * A lista existe porque o nome do modelo é a parte que envelhece, e o log da
 * função foi quem disse quais valem: `gemini-2.5-flash`, `2.5-flash-lite` e
 * `gemini-3-flash` respondem 404 com "no longer available to new users" numa
 * conta criada agora. Quem atende é o `gemini-3.6-flash`, e é ele que abre a
 * fila; o apelido `gemini-flash-latest` fica logo atrás, para o dia em que a
 * Google promover outro Flash e aposentar este.
 */
export const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest'];

/** A chave, lida na hora. O nome antigo da rota vale; o das rotinas, também. */
export const geminiKey = () => process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;

export type GeminiError = Error & { status?: number };

export interface GeminiRequest {
  model: string;
  system?: string;
  prompt: string;
  maxTokens: number;
  signal?: AbortSignal;
}

interface GeminiBody {
  error?: { message?: string };
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
}

/**
 * O texto de uma resposta do Gemini.
 *
 * Separado da chamada para poder ser testado sem rede.
 */
export function readGeminiText(body: GeminiBody): string {
  const candidate = body.candidates?.[0];
  if (!candidate) {
    throw new Error(`resposta sem candidato (${body.promptFeedback?.blockReason ?? 'motivo não informado'})`);
  }
  if (candidate.finishReason === 'MAX_TOKENS') throw new Error('resposta cortada (MAX_TOKENS)');

  // As partes de raciocínio vêm marcadas com `thought` e não são a resposta.
  return (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');
}

/** Uma ida ao Gemini. Lança `GeminiError` com o status quando a API recusa. */
export async function generate({ model, system, prompt, maxTokens, signal }: GeminiRequest): Promise<string> {
  const response = await fetch(`${GEMINI_URL}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': geminiKey() ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // Sem raciocínio: o teto de saída conta os tokens dele, e redigir a
      // partir de números prontos não tem o que deliberar.
      generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal,
  });

  const body = (await response.json().catch(() => ({}))) as GeminiBody;

  if (!response.ok || body.error) {
    const error: GeminiError = new Error(`${response.status} ${body.error?.message ?? response.statusText}`);
    error.status = response.status;
    throw error;
  }

  return readGeminiText(body);
}
