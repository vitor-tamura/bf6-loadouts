/**
 * O material das montagens, baixado pelo próprio script.
 *
 * É o mesmo desenho de `paginas.mjs`, que tirou a busca da leitura do trending:
 * o script abre as páginas, e um modelo gratuito do OpenRouter só lê o que
 * recebeu. A varredura de montagens perguntava a um modelo com busca, lote por
 * lote — onze buscas por dia, que no OpenRouter são cobradas por consulta até
 * em modelo gratuito e que no Gemini dependiam de uma cota que já zerou no meio
 * da varredura.
 *
 * A página que responde "o que se monta nesta arma" tem endereço fixo: o
 * wzstats publica uma por arma, em `/battlefield-6/best-loadouts/<arma>`, e a
 * página de meta do multiplayer aponta para todas. Cada uma traz as montagens
 * por modo — Battle Royale, Ranqueado, mapa grande, mapa pequeno — com a peça
 * de cada slot. Só as duas últimas são do multiplayer; as outras são REDSEC e
 * ficam de fora do recorte, antes de o modelo ver o texto.
 *
 * Nada aqui é garantido: o site muda de layout quando quer. Cada função
 * devolve o que conseguiu, e arma sem material volta para a pergunta com busca.
 */

import { WEAPONS } from '../../src/data/weapons.ts';
import { htmlToText } from '../catalog/lib/http.ts';
import { chave } from './leitura.mjs';

const USER_AGENT =
  'bf6-loadouts-catalog/1.0 (+https://github.com/vitortamura/bf6-loadouts) leitura diária das montagens';

/** A página que lista todas as armas do multiplayer, com o link de montagem de cada uma. */
export const PAGINA_DO_META = 'https://wzstats.gg/battlefield-6/multiplayer/meta';
const BASE_DAS_MONTAGENS = 'https://wzstats.gg/battlefield-6/best-loadouts';

/** Quantas páginas abrir ao mesmo tempo. Baixo de propósito: é o site de outra pessoa. */
const EM_PARALELO = 4;

/** Quanto de cada montagem vai para o prompt. Uma montagem são sete slots e o cabeçalho. */
const MAX_POR_MONTAGEM = 700;
const MAX_POR_ARMA = 1600;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `/battlefield-6/best-loadouts/kord-6p67` → a arma do arsenal, pelo slug.
 *
 * O slug segue o nome — "kord-6p67", "pp-19" —, e por isso a comparação é pela
 * mesma chave sem pontuação que casa nomes no resto da leitura: contra o id e
 * contra o nome.
 */
export function linksDeMontagem(html, armas = WEAPONS) {
  const porChave = new Map();
  for (const arma of armas) {
    porChave.set(chave(arma.id), arma);
    porChave.set(chave(arma.name), arma);
  }

  const links = new Map();
  for (const [, slug] of String(html ?? '').matchAll(/\/battlefield-6\/best-loadouts\/([a-z0-9-]+)/gi)) {
    const arma = porChave.get(chave(slug));
    if (arma && !links.has(arma.id)) links.set(arma.id, `${BASE_DAS_MONTAGENS}/${slug}`);
  }
  return links;
}

/** O endereço que a página teria se seguir o padrão — para arma que a página de meta não listou. */
export const enderecoPresumido = (arma) => `${BASE_DAS_MONTAGENS}/${arma.id}`;

/**
 * Os cabeçalhos de montagem, como o wzstats os escreve:
 * "Best M16A4 Loadout for Battlefield 6 Big Maps in Season 1".
 */
const CABECALHO = /Best .{1,40}? Loadout for Battlefield 6 (.{1,30}?) in Season \d+/gi;

/** O modo do cabeçalho é do multiplayer? Battle Royale e Ranqueado são REDSEC. */
export const ehModoDoMultiplayer = (modo) => !/battle royale|ranked|redsec|resurgence|gauntlet/i.test(modo);

/**
 * As montagens do multiplayer de uma página, em texto.
 *
 * Corta a página nos cabeçalhos de montagem e fica só com os de modo do
 * multiplayer. Página sem cabeçalho nenhum — layout novo, página de erro com
 * status 200 — devolve lista vazia: sem o cabeçalho não há como saber de que
 * modo a montagem é, e montagem de battle royale lida como de multiplayer é
 * exatamente o erro que as travas do meta existem para impedir.
 */
export function recortarMontagens(textoDaPagina) {
  const texto = String(textoDaPagina ?? '').replace(/\s+/g, ' ').trim();
  const cabecalhos = [...texto.matchAll(CABECALHO)];

  return cabecalhos
    .map((achado, i) => {
      const fim = cabecalhos[i + 1]?.index ?? Math.min(texto.length, achado.index + MAX_POR_MONTAGEM);
      return { modo: achado[1].trim(), texto: texto.slice(achado.index, fim).slice(0, MAX_POR_MONTAGEM).trim() };
    })
    .filter(({ modo }) => ehModoDoMultiplayer(modo));
}

async function baixar(url) {
  const resposta = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!resposta.ok) throw new Error(`${resposta.status} ${resposta.statusText}`);
  return resposta.text();
}

/**
 * As montagens do multiplayer de cada arma pedida, por id.
 *
 * Arma cuja página não abriu, ou abriu sem montagem do multiplayer, fica fora
 * do mapa — e quem chama a manda para a pergunta com busca.
 */
export async function lerMontagens(armas, { hoje }) {
  let links = new Map();
  try {
    links = linksDeMontagem(await baixar(PAGINA_DO_META));
  } catch (erro) {
    console.warn(`[builds] página de meta fora — ${erro.message}; vale o endereço presumido.`);
  }

  const material = new Map();
  for (let i = 0; i < armas.length; i += EM_PARALELO) {
    await Promise.all(
      armas.slice(i, i + EM_PARALELO).map(async (arma) => {
        const url = links.get(arma.id) ?? enderecoPresumido(arma);
        try {
          const montagens = recortarMontagens(htmlToText(await baixar(url)));
          if (!montagens.length) throw new Error('nenhuma montagem do multiplayer na página');
          const texto = montagens.map((m) => m.texto).join('\n').slice(0, MAX_POR_ARMA);
          material.set(arma.id, { url, name: `wzstats.gg — montagens da ${arma.name}`, date: hoje, texto });
        } catch (erro) {
          console.warn(`[builds] sem material para ${arma.name} — ${url}: ${erro.message}`);
        }
      }),
    );
    // Um respiro entre as levas, para não martelar o site.
    if (i + EM_PARALELO < armas.length) await esperar(400);
  }

  return material;
}
