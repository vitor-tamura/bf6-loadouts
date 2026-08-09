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
 * Os modelos gratuitos do Google, na ordem em que se tenta.
 *
 * A lista existe porque o nome do modelo é a parte que envelhece: o
 * `gemini-2.5-flash` parou de ser liberado para projetos novos e passou a
 * responder 404 dizendo isso. O primeiro da fila é o apelido que a Google
 * mantém apontando para o Flash da vez; os outros são rede de segurança para
 * quando o apelido não existir na conta.
 */
const GOOGLE_MODELS = ['gemini-flash-latest', 'gemini-3-flash', 'gemini-2.5-flash-lite'];

/**
 * De onde vem o modelo, na ordem em que se tenta.
 *
 * O AI Gateway é o caminho preferido — uma configuração só, failover e
 * contabilidade prontos —, mas ele exige cartão cadastrado na Vercel antes de
 * liberar o crédito gratuito. Quem não quiser cadastrar cartão põe uma chave do
 * Google AI Studio em `GOOGLE_GENERATIVE_AI_API_KEY`, criada em projeto sem
 * faturamento; existindo a chave, ela ganha, porque é a única das duas que
 * funciona sem mais nada.
 *
 * Sem nenhuma das duas, a rota falha e a tela fica com a análise por regras —
 * que é o que acontece em qualquer cópia recém-clonada do repositório.
 */
function candidates() {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return GOOGLE_MODELS.map((name) => ({ model: google(name), name, viaGateway: false }));
  }
  return [{ model: MODEL, name: MODEL, viaGateway: true }];
}

/** Nome de modelo errado ou fora da conta — vale tentar o próximo da fila. */
const isModelProblem = (error: unknown) =>
  APICallError.isInstance(error) && (error.statusCode === 404 || error.statusCode === 400);

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

  /*
   * Tenta os modelos em ordem e para no primeiro que responder.
   *
   * Só vale insistir quando a recusa é do nome do modelo — 404 de modelo que
   * saiu do ar, 400 de nome que a conta não conhece. Cota estourada, chave
   * inválida ou rede fora valem para a fila inteira, e repetir só gastaria o
   * tempo de quem está esperando na tela.
   */
  let lastError: unknown = new Error('nenhum modelo configurado');

  for (const { model, name, viaGateway } of candidates()) {
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
      if (!answer) throw new Error('resposta vazia');

      return Response.json(
        { text: answer },
        // O mesmo motivo do cache acima, agora na borda da Vercel.
        { headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
      );
    } catch (error) {
      lastError = error;
      if (!isModelProblem(error)) break;
      console.warn('[matchup] modelo recusado, tentando o próximo', { name });
    }
  }

  const status = APICallError.isInstance(lastError) ? lastError.statusCode : undefined;

  /*
   * O motivo fica no log da função, não na resposta.
   *
   * Quem chama não tem o que fazer com "sem crédito" ou "chave inválida" — a
   * tela cai para a análise por regras de qualquer jeito. Mas sem isto aqui, um
   * 502 na produção não diz se o gateway está desligado, se a cota acabou ou se
   * o nome do modelo mudou de novo.
   */
  console.error('[matchup] falha no modelo', {
    status,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });

  // 402 é crédito esgotado: a tela já tem o que mostrar, então a rota só avisa
  // que não veio nada.
  return Response.json({ error: 'modelo indisponível' }, { status: status === 402 ? 402 : 502 });
}
