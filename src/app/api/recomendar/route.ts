import { WEAPONS_BY_ID } from '@/data/weapons';
import { budgetFor } from '@/data/classes';
import type { SlotId } from '@/data/types';
import { factoryAttachments } from '@/lib/loadout';
import { cardapio, DISTANCIAS, isDistancia, validarRecomendacao } from '@/lib/recommend';

/**
 * O loadout recomendado de uma arma, escolhido por um modelo com busca na web.
 *
 * A rota recebe a arma e a distância de combate (`curta`, `media` ou `longa`)
 * e pergunta ao modelo o que a comunidade — Reddit e guias recentes — está
 * montando nela para esse alcance. A resposta só cita peças do cardápio que a
 * rota mesma envia, e ainda assim passa pelo funil de `validarRecomendacao`:
 * nome que não existe na arma cai fora, peça que estoura o orçamento também.
 *
 * É GET de propósito: as combinações são finitas — 63 armas × 3 distâncias — e
 * a resposta não depende de quem perguntou, então a borda guarda cada uma por
 * uma semana. O custo de IA fica limitado a uma busca por combinação por
 * semana, não por visitante.
 */

/** A busca na web leva o tempo dela; o texto que vem depois é rápido. */
export const maxDuration = 60;

const API_KEY = process.env.OPENAI_API_KEY;

/*
 * A mesma fila do meta diário, pelo mesmo motivo: o nano é o mais barato do
 * catálogo, mas o guia da ferramenta de busca não o cita — se recusar, o mini
 * resolve, e o gpt-4.1-mini fecha a fila noutra família.
 */
const MODELOS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-4.1-mini'];

/*
 * O freio de gasto por visitante, idêntico ao do confronto.
 *
 * A borda absorve as repetições — combinação já vista nem chega aqui —, então
 * o contador só conta o que custaria busca nova. Dez por dia por IP dá para
 * montar um arsenal e não dá para drenar o crédito.
 */
const RECOMENDACOES_POR_DIA = 10;
const UM_DIA_MS = 86_400_000;
const usoPorIp = new Map<string, { usadas: number; zeraEm: number }>();

function estourouLimite(request: Request) {
  const ip =
    request.headers.get('x-real-ip') ??
    (request.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim();

  const agora = Date.now();
  if (usoPorIp.size > 1000) {
    for (const [dono, uso] of usoPorIp) if (agora >= uso.zeraEm) usoPorIp.delete(dono);
  }

  let uso = usoPorIp.get(ip);
  if (!uso || agora >= uso.zeraEm) {
    uso = { usadas: 0, zeraEm: agora + UM_DIA_MS };
    usoPorIp.set(ip, uso);
  }
  if (uso.usadas >= RECOMENDACOES_POR_DIA) return true;
  uso.usadas += 1;
  return false;
}

interface ParteDaResposta {
  type?: string;
  text?: string;
}

interface CorpoDaResposta {
  error?: { message?: string };
  output?: { type?: string; content?: ParteDaResposta[] }[];
}

async function perguntar(modelo: string, prompt: string): Promise<string> {
  const resposta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: 'web_search' }],
      input: prompt,
    }),
  });

  const corpo = (await resposta.json()) as CorpoDaResposta;
  if (corpo.error) throw new Error(`${resposta.status} ${corpo.error.message}`);

  const mensagem = (corpo.output ?? []).find((item) => item.type === 'message');
  return (mensagem?.content ?? [])
    .filter((p) => p.type === 'output_text')
    .map((p) => p.text ?? '')
    .join('');
}

/** Tira as cercas de código que o modelo às vezes põe em volta do JSON. */
function extrairJson(texto: string): { picks?: unknown; reason?: unknown } | null {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1)) as { picks?: unknown; reason?: unknown };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const arma = url.searchParams.get('arma');
  const distancia = url.searchParams.get('distancia');

  if (!arma || !isDistancia(distancia)) {
    return Response.json({ error: 'parâmetros inválidos' }, { status: 400 });
  }
  const weapon = WEAPONS_BY_ID.get(arma);
  if (!weapon || !weapon.slots.length) {
    return Response.json({ error: 'arma desconhecida' }, { status: 404 });
  }

  // A mesma regra do confronto: IA generativa é coisa de produção.
  if (!API_KEY || process.env.VERCEL_ENV !== 'production') {
    return Response.json({ error: 'modelo indisponível' }, { status: 502 });
  }

  if (estourouLimite(request)) {
    return Response.json({ error: 'limite diário de recomendações atingido' }, { status: 429 });
  }

  const perfil = DISTANCIAS.find((d) => d.value === distancia)!;
  const prompt = `Pesquise no Reddit (r/Battlefield6 e afins) e em guias recentes qual é o melhor conjunto de acessórios para a ${weapon.name} no MULTIPLAYER de Battlefield 6, montado para combate a ${perfil.label.toLowerCase()} distância: ${perfil.hint}

Escolha SOMENTE dentre os acessórios desta lista — cada linha é um slot, no formato "id do slot (nome): peças com o custo em pontos":

${cardapio(weapon)}

Responda SOMENTE com um JSON neste formato, sem cercas de código e sem texto antes ou depois:

{"picks":{"id do slot":"NOME EXATO DA PEÇA"},"reason":"uma frase curta, em português do Brasil, explicando a montagem"}

Regras:
- No máximo uma peça por slot, e não precisa preencher todos: siga o que a comunidade monta, não a vontade de encher a arma.
- O orçamento total é de ${budgetFor(weapon.category)} pontos, e os custos estão na lista.
- Use o id do slot exatamente como aparece antes do parêntese, e o nome da peça exatamente como está na lista.
- Só multiplayer. Montagem que só faz sentido no REDSEC, o battle royale, fica de fora.`;

  let ultimoErro: unknown = null;

  for (const modelo of MODELOS) {
    try {
      const bruto = extrairJson(await perguntar(modelo, prompt));
      const picks = bruto?.picks;
      if (!picks || typeof picks !== 'object') throw new Error('resposta sem escolhas');

      const { attachments, descartados } = validarRecomendacao(
        weapon,
        picks as Partial<Record<SlotId, unknown>>,
      );

      // Recomendação que não muda nada além da fábrica não vale publicar.
      const fabrica = factoryAttachments(weapon);
      const escolhasReais = Object.entries(attachments).filter(
        ([slot, id]) => fabrica[slot as keyof typeof fabrica] !== id,
      );
      if (!escolhasReais.length) throw new Error('nenhuma peça reconhecida além da fábrica');

      if (descartados.length) {
        console.warn('[recomendar] descartados', { arma, distancia, descartados });
      }
      console.log('[recomendar] respondeu', { arma, distancia, modelo });

      const reason =
        typeof bruto.reason === 'string' && bruto.reason.trim()
          ? bruto.reason.trim()
          : 'Montagem citada pela comunidade para esta distância.';

      return Response.json(
        { attachments, reason },
        {
          headers: {
            // Cada combinação paga uma busca por semana, não por visitante.
            'cache-control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
          },
        },
      );
    } catch (erro) {
      ultimoErro = erro;
      console.warn('[recomendar] modelo recusado, tentando o próximo', {
        modelo,
        message: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  console.error('[recomendar] falha no modelo', {
    arma,
    distancia,
    message: ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro),
  });
  return Response.json({ error: 'modelo indisponível' }, { status: 502 });
}
