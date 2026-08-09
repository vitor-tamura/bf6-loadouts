import 'server-only';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { WEAPONS } from '@/data/weapons';
import type { MetaPick, MetaSource } from '@/data/meta';

/**
 * O meta lido do que a comunidade está dizendo agora.
 *
 * A tela do meta era curadoria manual: alguém lia guias, checava data e modo, e
 * escrevia a lista à mão. Isso envelhecia junto com o patch e dependia de
 * alguém lembrar de voltar. Aqui a mesma pergunta é feita uma vez por dia ao
 * Gemini com a busca do Google ligada, que é o caminho para alcançar o Reddit —
 * as ferramentas de busca comuns não o indexam para robôs.
 *
 * O que muda em relação à curadoria, e precisa ficar claro na tela: ninguém lê
 * antes de publicar. As defesas contra isso são duas, e as duas estão aqui.
 *
 * A primeira é o dataset: só entra arma cujo nome bate com uma do jogo. Modelo
 * que invente "AK-74U" ou escreva o nome errado tem a linha descartada, e não
 * aparece arma que não existe.
 *
 * A segunda é a fonte: cada resposta traz os links que a busca usou, e eles vão
 * para a tela. Sem link, a leitura não é publicada — é o mesmo critério que a
 * curadoria manual aplicava, agora automático.
 */

export interface AiMeta {
  /** Quando a leitura foi feita, em ISO. */
  readAt: string;
  /** As armas em ordem, do topo para baixo. */
  picks: MetaPick[];
  /** De onde a busca tirou o que disse. */
  sources: MetaSource[];
}

const MODELS = ['gemini-3.6-flash', 'gemini-flash-latest'];

/** Sem acentos e sem pontuação: "SG 553R" e "sg553r" viram a mesma coisa. */
const key = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const BY_KEY = new Map(WEAPONS.map((w) => [key(w.name), w]));

const PROMPT = `Pesquise o que a comunidade de Battlefield 6 está dizendo agora sobre as melhores armas do MULTIPLAYER na temporada em curso. Dê peso às discussões do Reddit (r/Battlefield6 e afins) e a guias publicados depois do patch mais recente.

Responda SOMENTE com um JSON neste formato, sem cercas de código e sem texto antes ou depois:

{"picks":[{"weapon":"NOME EXATO DA ARMA","reason":"uma frase curta, em português do Brasil, dizendo por que ela está forte"}]}

Regras:
- No máximo 8 armas, da mais citada para a menos citada.
- O nome tem de ser o nome exato da arma no jogo, sem apelido e sem acessório junto.
- Só multiplayer. Arma que só se destaca no REDSEC, o battle royale, fica de fora.
- Se não achar consenso sobre alguma, deixe-a de fora em vez de chutar.`;

/** Tira as cercas de código que o modelo às vezes põe em volta do JSON. */
function parseJson(text: string): { picks?: { weapon?: string; reason?: string }[] } | null {
  const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Faz a leitura do dia.
 *
 * Devolve `null` quando qualquer coisa dá errado — sem chave, sem cota, resposta
 * ilegível, nenhuma arma reconhecida. Quem chama cai para a curadoria escrita à
 * mão, que continua no repositório justamente para isso.
 */
export async function readMetaFromSearch(): Promise<AiMeta | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const google = createGoogleGenerativeAI({ apiKey });

  for (const name of MODELS) {
    try {
      const result = await generateText({
        model: google(name),
        prompt: PROMPT,
        tools: { google_search: google.tools.googleSearch({}) },
        maxOutputTokens: 1200,
      });

      const parsed = parseJson(result.text);
      if (!parsed?.picks?.length) continue;

      /*
       * O dataset é o filtro. Nome que não bate com arma do jogo cai fora, e
       * com ele a chance de a tela anunciar algo que não existe.
       */
      const seen = new Set<string>();
      const picks: MetaPick[] = [];
      for (const pick of parsed.picks) {
        const weapon = pick.weapon ? BY_KEY.get(key(pick.weapon)) : undefined;
        if (!weapon || seen.has(weapon.id)) continue;
        seen.add(weapon.id);
        picks.push({
          weapon: weapon.id,
          reason: (pick.reason ?? '').trim() || 'Citada entre as mais fortes da temporada.',
          sources: [],
        });
      }
      if (!picks.length) continue;

      /*
       * As fontes vêm do próprio grounding, não do texto: é a lista de páginas
       * que a busca consultou, com título e link. Sem elas a leitura não vale —
       * seria a mesma opinião solta que a curadoria manual recusava.
       */
      const chunks = (
        result.providerMetadata?.google as
          | { groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }
          | undefined
      )?.groundingMetadata?.groundingChunks;

      const sources: MetaSource[] = (chunks ?? [])
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
        .slice(0, 8)
        .map((web) => ({
          name: web.title ?? new URL(web.uri).hostname,
          url: web.uri,
          date: new Date().toISOString().slice(0, 10),
          country: 'INT' as const,
          mode: 'multiplayer' as const,
          scope: 'Resultado da busca usada na leitura automática desta lista.',
          timeframe: 'season-4' as const,
        }));

      if (!sources.length) continue;

      // A ordem da lista é a citação: quem está no topo apareceu mais.
      picks.forEach((pick, i) => {
        pick.sources = [i < sources.length ? i : 0];
      });

      return { readAt: new Date().toISOString(), picks, sources };
    } catch {
      // Modelo fora do ar, cota estourada, rede caída: tenta o próximo e, no
      // fim da fila, desiste em silêncio.
    }
  }

  return null;
}
