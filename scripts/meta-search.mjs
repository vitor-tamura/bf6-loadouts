#!/usr/bin/env node
/**
 * Relê o meta a partir de uma busca, uma vez por dia.
 *
 *   OPENAI_API_KEY=... node --experimental-strip-types scripts/meta-search.mjs
 *
 * Pergunta a um modelo da OpenAI, com a busca na web ligada, quais armas a
 * comunidade está apontando como as melhores do multiplayer — dando peso ao
 * Reddit, que é onde a discussão acontece e onde as ferramentas de busca
 * comuns não chegam para robôs. O resultado vai para
 * `src/data/meta-live.json`, que a tela lê.
 *
 * ## Por que OpenAI e não Gemini
 *
 * A versão anterior perguntava ao Gemini com a busca do Google ligada, numa
 * chave do free tier. Nunca publicou uma leitura: todas as execuções do
 * workflow falharam na chamada. Esta versão usa uma chave paga da OpenAI, e o
 * custo é de centavos: uma chamada por dia, com uma busca (~US$ 0,01) e um
 * punhado de tokens de um modelo pequeno.
 *
 * ## O que impede bobagem de entrar
 *
 * Ninguém revisa antes de publicar, então há duas travas. A primeira é o
 * dataset: só entra arma cujo nome bate com uma do jogo, o que descarta nome
 * inventado ou escrito errado. A segunda é a fonte: se a busca não devolver os
 * links que usou, o arquivo não é escrito — sem link, a leitura não vale, que
 * é o mesmo critério que a curadoria manual aplicava.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { WEAPONS } from '../src/data/weapons.ts';

const API_KEY = process.env.OPENAI_API_KEY;
const DESTINO = new URL('../src/data/meta-live.json', import.meta.url);

/*
 * A chave é paga por uso, então a fila não existe por causa de cota — ela
 * existe porque nem todo modelo aceita a ferramenta de busca. O `gpt-5-nano`
 * abre por ser o mais barato do catálogo; a página de preços diz que a busca
 * vale para todos os modelos, mas o guia dela não cita os nanos — se ele
 * recusar, o mini resolve, e o `gpt-4.1-mini` fecha a fila noutra família.
 */
const MODELOS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-4.1-mini'];

const PROMPT = `Pesquise o que a comunidade de Battlefield 6 está dizendo agora sobre armas do MULTIPLAYER tradicional na temporada em curso. Não considere REDSEC, battle royale, ranked REDSEC nem modos derivados.

Separe:
- META: armas atualmente mais fortes/eficientes por desempenho, TTK, controle, alcance, versatilidade e consenso.
- TRENDING: armas que estão aumentando de popularidade, aparecendo mais nas partidas, recebendo mais recomendações ou puxando conversa recente. Uma arma pode estar trending sem ser meta.

Dê peso a discussões recentes do Reddit (r/Battlefield6, r/Battlefield, r/BF6 e afins), patch notes oficiais, guias publicados depois do patch mais recente e qualquer dado público de uso/pick rate quando existir. Priorize últimos 7 dias para trending e últimos 30 dias para contexto.

Responda SOMENTE com um JSON neste formato, sem cercas de código e sem texto antes ou depois:

{"picks":[{"weapon":"NOME EXATO DA ARMA","reason":"uma frase curta, em português do Brasil, dizendo por que ela está forte"}],"trending":[{"weapon":"NOME EXATO DA ARMA","trend":"rótulo curto da tendência","reason":"uma frase curta, em português do Brasil, dizendo por que todo mundo está usando, comentando ou testando agora"}]}

Regras:
- No máximo 8 armas em picks, da mais forte para a menos forte.
- No máximo 8 armas em trending, da mais quente para a menos quente.
- O nome tem de ser o nome exato da arma no jogo, sem apelido e sem acessório junto.
- Só multiplayer. Arma que só se destaca no REDSEC, o battle royale, fica de fora.
- Não classifique uma arma como meta só porque ela é popular.
- Não classifique uma arma como trending só porque ela é nova; procure sinal de adoção, discussão ou build específica.
- Se não achar evidência suficiente sobre alguma, deixe-a de fora em vez de chutar.`;

/** Sem acentos e sem pontuação: "SG 553R" e "sg553r" viram a mesma coisa. */
const chave = (nome) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const PORCHAVE = new Map(WEAPONS.map((w) => [chave(w.name), w]));

async function perguntar(modelo) {
  const resposta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: 'web_search' }],
      input: PROMPT,
    }),
  });

  const corpo = await resposta.json();
  if (corpo.error) throw new Error(`${resposta.status} ${corpo.error.message}`);

  // A resposta vem como uma lista de itens — raciocínio, chamadas de busca,
  // mensagem. O texto está na mensagem, e os links que a busca sustentou vêm
  // como anotações `url_citation` penduradas nele.
  const mensagem = (corpo.output ?? []).find((item) => item.type === 'message');
  const partes = (mensagem?.content ?? []).filter((p) => p.type === 'output_text');
  const texto = partes.map((p) => p.text ?? '').join('');
  const fontes = partes
    .flatMap((p) => p.annotations ?? [])
    .filter((a) => a.type === 'url_citation');
  return { texto, fontes };
}

/** Tira as cercas de código que o modelo às vezes põe em volta do JSON. */
function extrairJson(texto) {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

function normalizarLista(lista, { max, campoPadrao, incluirTrend = false, trendPadrao = 'em alta' }) {
  const vistas = new Set();
  const items = [];
  const descartadas = [];

  for (const pick of lista ?? []) {
    if (!pick || typeof pick !== 'object') continue;
    if (items.length === max) break;
    const arma = pick.weapon ? PORCHAVE.get(chave(pick.weapon)) : undefined;
    if (!arma) {
      descartadas.push(pick.weapon);
      continue;
    }
    if (vistas.has(arma.id)) continue;
    vistas.add(arma.id);

    const item = {
      weapon: arma.id,
      reason: (pick.reason ?? '').trim() || campoPadrao,
      sources: [items.length],
    };
    if (incluirTrend) item.trend = (pick.trend ?? '').trim() || trendPadrao;
    items.push(item);
  }

  return { items, descartadas };
}

async function main() {
  if (!API_KEY) {
    console.error('Falta OPENAI_API_KEY.');
    process.exit(1);
  }

  let ultimoErro = null;

  for (const modelo of MODELOS) {
    try {
      console.log(`Perguntando ao ${modelo}…`);
      const { texto, fontes } = await perguntar(modelo);

      const bruto = extrairJson(texto);
      if (!bruto?.picks?.length) throw new Error('resposta sem lista de armas');

      const meta = normalizarLista(bruto.picks, {
        max: 8,
        campoPadrao: 'Citada entre as mais fortes da temporada.',
      });
      const trends = normalizarLista(bruto.trending, {
        max: 8,
        campoPadrao: 'Aparece entre as armas que mais cresceram nas discussões recentes.',
        incluirTrend: true,
      });

      const descartadas = [...meta.descartadas, ...trends.descartadas];
      if (descartadas.length) {
        console.warn(`Descartadas por não existirem no dataset: ${descartadas.join(', ')}`);
      }
      const picks = meta.items;
      const trending = trends.items;
      if (!picks.length) throw new Error('nenhuma arma reconhecida');

      // A mesma página costuma ser citada várias vezes, uma por trecho.
      const vistasUrls = new Set();
      const sources = [];
      for (const fonte of fontes) {
        if (!fonte.url || vistasUrls.has(fonte.url)) continue;
        vistasUrls.add(fonte.url);
        if (sources.length === 8) break;
        sources.push({
          name: fonte.title || new URL(fonte.url).hostname,
          url: fonte.url,
          date: new Date().toISOString().slice(0, 10),
          country: 'INT',
          mode: 'multiplayer',
          scope: 'Página consultada pela busca que montou esta lista.',
          timeframe: 'season-4',
        });
      }

      if (!sources.length) throw new Error('busca não devolveu fonte nenhuma');

      // Cada arma aponta para uma fonte existente; sobrando armas, todas caem
      // na primeira, que é a mais citada pela busca.
      for (const pick of picks) {
        if (pick.sources[0] >= sources.length) pick.sources = [0];
      }
      for (const pick of trending) {
        if (pick.sources[0] >= sources.length) pick.sources = [0];
      }

      const conteudo = {
        readAt: new Date().toISOString().slice(0, 10),
        model: modelo,
        picks,
        trending,
        sources,
      };

      const anterior = (() => {
        try {
          return readFileSync(DESTINO, 'utf8');
        } catch {
          return null;
        }
      })();

      const novo = `${JSON.stringify(conteudo, null, 2)}\n`;
      if (anterior === novo) {
        console.log('Nada mudou.');
        return;
      }

      writeFileSync(DESTINO, novo);
      console.log(`Gravado: ${picks.length} armas, ${trending.length} trending, ${sources.length} fontes.`);
      return;
    } catch (erro) {
      ultimoErro = erro;
      console.warn(`${modelo}: ${erro.message}`);
    }
  }

  console.error(`Nenhum modelo respondeu. Último erro: ${ultimoErro?.message}`);
  process.exit(1);
}

await main();
