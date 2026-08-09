import { generateText, APICallError } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { WEAPONS_BY_ID } from '@/data/weapons';
import { SHORT_CATEGORY_NAMES } from '@/data/classes';
import {
  damagePerSecond,
  damagePerShot,
  effectiveRange,
  shotsToKill,
  timeToKill,
} from '@/lib/ballistics';
import { baseStats } from '@/lib/stats';
import { GAME_MODES, type GameMode } from '@/lib/matchup';

/**
 * A leitura do confronto escrita por um modelo de linguagem.
 *
 * A rota existe porque a chave não pode chegar ao navegador. Ela recebe dois
 * ids de arma e o modo, recalcula as estatísticas aqui — o cliente não manda
 * número nenhum, então não há o que forjar — e pede ao modelo duas ou três
 * frases sobre o confronto.
 *
 * Quando isto falha, e vai falhar às vezes, quem responde é a análise por
 * regras de `src/lib/matchup.ts`, que já está na tela desde o primeiro quadro.
 * É por isso que aqui não há tratamento elaborado de erro: um 502 basta, e o
 * cliente segue com o texto que já tinha.
 */

/** Um texto curto não justifica esperar mais do que isto. */
export const maxDuration = 15;

/*
 * Modelo pequeno de propósito.
 *
 * A tarefa é redigir três frases a partir de números já mastigados — não há
 * raciocínio a fazer, e um modelo grande gastaria o crédito do mês em pouca
 * coisa. `models` é a fila de reserva do próprio gateway, para o caso de o
 * primeiro estar fora do ar.
 */
const MODEL = 'anthropic/claude-haiku-4.5';
const FALLBACK_MODELS = ['google/gemini-3-flash', 'openai/gpt-5.4'];

/**
 * De onde vem o modelo, na ordem em que se tenta.
 *
 * O AI Gateway é o caminho preferido — uma configuração só, failover e
 * contabilidade prontos —, mas ele exige cartão cadastrado na Vercel antes de
 * liberar o crédito gratuito. Quem não quiser cadastrar cartão põe uma chave do
 * Google AI Studio em `GOOGLE_GENERATIVE_AI_API_KEY`, que é gratuita e sai em
 * dois cliques; existindo a chave, ela ganha, porque é a única das duas que
 * funciona sem mais nada.
 *
 * Sem nenhuma das duas, a rota falha e a tela fica com a análise por regras —
 * que é o que acontece hoje em qualquer instalação recém-clonada.
 */
function pickModel() {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return { model: google('gemini-2.5-flash'), viaGateway: false };
  }
  return { model: MODEL, viaGateway: true };
}

/** O que o modelo pode escrever, e o que ele não pode inventar. */
const SYSTEM = `Você escreve para um site brasileiro de loadouts de Battlefield 6.

Regras:
- Português do Brasil, tom direto e seco, sem gíria de marketing e sem emoji.
- No máximo três frases curtas, em texto corrido, sem lista e sem título.
- Só use os números que receber. Não invente estatística, acessório, mapa nem
  nome de arma, e não cite tudo: escolha o que decide o confronto.
- Diga qual das duas leva vantagem no modo indicado, e por quê. Se a diferença
  for pequena, diga que é pequena.
- Nunca fale de acessórios: os números são da arma de fábrica.`;

interface Body {
  a?: unknown;
  b?: unknown;
  mode?: unknown;
}

/** As estatísticas de uma arma, no formato que entra no prompt. */
function describe(id: string) {
  const weapon = WEAPONS_BY_ID.get(id);
  if (!weapon) return null;

  const stats = baseStats(weapon);
  const range = effectiveRange(stats);

  return {
    nome: weapon.name,
    categoria: SHORT_CATEGORY_NAMES[weapon.category],
    dano_de_perto: Math.round(damagePerShot(stats, 0)),
    tiros_para_abater: shotsToKill(stats, 0),
    tiros_para_abater_a_50m: shotsToKill(stats, 50),
    tempo_para_abater_ms: Math.round(timeToKill(stats, 0)),
    tempo_de_mira_ms: Math.round(stats.adsMs),
    dano_por_segundo: Math.round(damagePerSecond(stats)),
    cadencia_rpm: stats.rpm,
    alcance_sem_perder_dano_m: range === 0 ? 'toda distância' : Math.round(range),
    carregador: stats.magazine,
    recarga_s: Number(stats.reload.toFixed(2)),
    mobilidade: Math.round(stats.mobility),
    controle: Math.round(stats.control),
    recuo_vertical: stats.verticalRecoil,
    recuo_horizontal: stats.horizontalRecoil,
  };
}

const MODE_BRIEF: Record<GameMode, string> = {
  multiplayer:
    'Multiplayer: partidas por objetivo, respawn rápido, mapas médios. Vale quem mata primeiro, ' +
    'quem se move e quem volta rápido para a briga.',
  redsec:
    'REDSEC, o battle royale: sem respawn, mapa grande, munição contada e combate em esquadra. ' +
    'Valem alcance, o que o pente aguenta e o custo de errar.',
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'corpo inválido' }, { status: 400 });
  }

  const { a, b, mode } = body;
  if (typeof a !== 'string' || typeof b !== 'string') {
    return Response.json({ error: 'armas ausentes' }, { status: 400 });
  }
  if (!GAME_MODES.some((m) => m.value === mode)) {
    return Response.json({ error: 'modo desconhecido' }, { status: 400 });
  }

  const weaponA = describe(a);
  const weaponB = describe(b);
  if (!weaponA || !weaponB) {
    return Response.json({ error: 'arma desconhecida' }, { status: 404 });
  }

  const { model, viaGateway } = pickModel();

  try {
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: [
        `Modo: ${MODE_BRIEF[mode as GameMode]}`,
        `Arma A: ${JSON.stringify(weaponA)}`,
        `Arma B: ${JSON.stringify(weaponB)}`,
        'Escreva a leitura do confronto entre as duas neste modo.',
      ].join('\n\n'),
      maxOutputTokens: 220,
      // As opções abaixo são do gateway; com a chave do Google elas não têm
      // para quem falar, e passá-las assim mesmo só encheria o pedido.
      providerOptions: viaGateway
        ? {
            gateway: {
              models: FALLBACK_MODELS,
              tags: ['feature:matchup'],
              /*
               * As combinações são finitas — 63 armas em dois modos — e a
               * resposta não depende de quem perguntou. Guardar por um dia
               * derruba o custo para perto de zero e devolve na hora quem
               * repetir a comparação.
               */
              cacheControl: 'max-age=86400',
            },
          }
        : undefined,
    });

    const answer = text.trim();
    if (!answer) return Response.json({ error: 'resposta vazia' }, { status: 502 });

    return Response.json(
      { text: answer },
      // O mesmo motivo do cache acima, agora na borda da Vercel.
      { headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch (error) {
    const status = APICallError.isInstance(error) ? error.statusCode : undefined;
    /*
     * O motivo fica no log da função, não na resposta.
     *
     * Quem chama não tem o que fazer com "sem crédito" ou "chave inválida" — a
     * tela já cai para a análise por regras de qualquer jeito. Mas sem isto
     * aqui, um 502 na produção não diz se o gateway está desligado, se o
     * crédito acabou ou se o nome do modelo mudou.
     */
    console.error('[matchup] falha no modelo', {
      status,
      message: error instanceof Error ? error.message : String(error),
    });

    // 402 é crédito esgotado e 429 é excesso de pedidos: nos dois casos a tela
    // já tem o que mostrar, então a rota só avisa que não veio nada.
    return Response.json({ error: 'modelo indisponível' }, { status: status === 402 ? 402 : 502 });
  }
}
