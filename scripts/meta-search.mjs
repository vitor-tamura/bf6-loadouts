#!/usr/bin/env node
/**
 * Relê o meta a partir de uma busca, uma vez por dia.
 *
 *   GOOGLE_GENERATIVE_AI_API_KEY=... node --experimental-strip-types scripts/meta-search.mjs
 *
 * Pergunta ao Gemini, com a busca do Google ligada, quais armas a comunidade
 * está apontando como as melhores do multiplayer — dando peso ao Reddit, que é
 * onde a discussão acontece e onde as ferramentas de busca comuns não chegam
 * para robôs. O resultado vai para `src/data/meta-live.json`, que a tela lê.
 *
 * ## Por que aqui e não no site
 *
 * A primeira versão fazia esta chamada na própria página, uma vez a cada 24
 * horas. Funcionava, mas dividia a cota gratuita com a leitura do confronto —
 * são vinte requisições, e um punhado de comparações novas esgotava o dia
 * inteiro, derrubando as duas coisas de uma vez.
 *
 * Rodando aqui, é uma chamada por dia, sempre, independente de visita. A cota
 * do site fica livre para o confronto, o resultado é um arquivo versionado —
 * dá para ver no diff o que a busca respondeu e reverter se vier bobagem — e a
 * tela do meta volta a ser estática.
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

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const DESTINO = new URL('../src/data/meta-live.json', import.meta.url);

/*
 * A fila de modelos, e o que a conta revelou sobre ela.
 *
 * A ideia era usar aqui um modelo diferente do que o site usa na leitura do
 * confronto, para que um não gastasse a cota do outro. Ela vale pela metade: a
 * cota gratuita é mesmo contada por modelo, mas nem todo modelo tem cota. O
 * `gemini-2.0-flash` responde `limit: 0` — não há free tier nenhum nele —,
 * enquanto o `gemini-3.6-flash` traz `limit: 20`.
 *
 * Então a fila tenta primeiro os candidatos a cota própria e termina no
 * `gemini-3.6-flash`, que sabidamente tem. Na pior hipótese, este script gasta
 * uma das vinte requisições do dia — uma, porque roda uma vez —, e as outras
 * dezenove sobram para o site.
 */
const MODELOS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.6-flash'];

const PROMPT = `Pesquise o que a comunidade de Battlefield 6 está dizendo agora sobre as melhores armas do MULTIPLAYER na temporada em curso. Dê peso às discussões do Reddit (r/Battlefield6 e afins) e a guias publicados depois do patch mais recente.

Responda SOMENTE com um JSON neste formato, sem cercas de código e sem texto antes ou depois:

{"picks":[{"weapon":"NOME EXATO DA ARMA","reason":"uma frase curta, em português do Brasil, dizendo por que ela está forte"}]}

Regras:
- No máximo 8 armas, da mais citada para a menos citada.
- O nome tem de ser o nome exato da arma no jogo, sem apelido e sem acessório junto.
- Só multiplayer. Arma que só se destaca no REDSEC, o battle royale, fica de fora.
- Se não achar consenso sobre alguma, deixe-a de fora em vez de chutar.`;

/** Sem acentos e sem pontuação: "SG 553R" e "sg553r" viram a mesma coisa. */
const chave = (nome) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const PORCHAVE = new Map(WEAPONS.map((w) => [chave(w.name), w]));

async function perguntar(modelo) {
  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );

  const corpo = await resposta.json();
  if (corpo.error) throw new Error(`${corpo.error.code} ${corpo.error.message}`);

  const candidato = corpo.candidates?.[0];
  const texto = (candidato?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const fontes = candidato?.groundingMetadata?.groundingChunks ?? [];
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

async function main() {
  if (!API_KEY) {
    console.error('Falta GOOGLE_GENERATIVE_AI_API_KEY.');
    process.exit(1);
  }

  let ultimoErro = null;

  for (const modelo of MODELOS) {
    try {
      console.log(`Perguntando ao ${modelo}…`);
      const { texto, fontes } = await perguntar(modelo);

      const bruto = extrairJson(texto);
      if (!bruto?.picks?.length) throw new Error('resposta sem lista de armas');

      const vistas = new Set();
      const picks = [];
      const descartadas = [];
      for (const pick of bruto.picks) {
        const arma = pick.weapon ? PORCHAVE.get(chave(pick.weapon)) : undefined;
        if (!arma) {
          descartadas.push(pick.weapon);
          continue;
        }
        if (vistas.has(arma.id)) continue;
        vistas.add(arma.id);
        picks.push({
          weapon: arma.id,
          reason: (pick.reason ?? '').trim() || 'Citada entre as mais fortes da temporada.',
          sources: [picks.length],
        });
      }

      if (descartadas.length) {
        console.warn(`Descartadas por não existirem no dataset: ${descartadas.join(', ')}`);
      }
      if (!picks.length) throw new Error('nenhuma arma reconhecida');

      const sources = fontes
        .map((f) => f.web)
        .filter((web) => web?.uri)
        .slice(0, 8)
        .map((web) => ({
          name: web.title ?? new URL(web.uri).hostname,
          url: web.uri,
          date: new Date().toISOString().slice(0, 10),
          country: 'INT',
          mode: 'multiplayer',
          scope: 'Página consultada pela busca que montou esta lista.',
          timeframe: 'season-4',
        }));

      if (!sources.length) throw new Error('busca não devolveu fonte nenhuma');

      // Cada arma aponta para uma fonte existente; sobrando armas, todas caem
      // na primeira, que é a mais citada pela busca.
      for (const pick of picks) {
        if (pick.sources[0] >= sources.length) pick.sources = [0];
      }

      const conteudo = {
        readAt: new Date().toISOString().slice(0, 10),
        model: modelo,
        picks,
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
      console.log(`Gravado: ${picks.length} armas, ${sources.length} fontes.`);
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
