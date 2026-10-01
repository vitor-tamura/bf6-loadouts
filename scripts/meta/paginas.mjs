/**
 * O material da leitura do meta, baixado pelo próprio script.
 *
 * A leitura diária dependia de um modelo com busca na web: ele procurava as
 * páginas, abria e resumia. Busca é a parte que custa — no OpenRouter ela é
 * cobrada por consulta até em modelo gratuito —, e é também a parte que menos
 * precisava de modelo: os endereços das páginas que medem estão em
 * `src/data/meta.ts` desde sempre, e a conversa da semana tem endereço fixo no
 * Reddit.
 *
 * Então a rotina se divide em duas. Aqui o script baixa: as páginas que medem
 * arma por arma (para os picks) e as threads da semana que citam arma do
 * arsenal (para o trending). O modelo só lê o que recebeu — e ler um texto
 * dado é o que os gratuitos fazem sem busca nenhuma.
 *
 * O ganho não é só de custo. O modelo com busca podia citar página que não
 * abriu; aqui a lista de fontes sai do que o script baixou de fato, e endereço
 * que não está nela não sustenta arma nenhuma (ver `ancorarFontes`).
 *
 * Nada aqui é garantido: site muda de layout, o Reddit recusa rastreador
 * quando quer. Cada função devolve o que conseguiu, e lista vazia é resposta
 * válida — quem chama cai para a leitura com busca.
 */

import { WEAPONS } from '../../src/data/weapons.ts';
import { htmlToText } from '../catalog/lib/http.ts';
import { chavePagina, confiabilidade, ehPaginaDeOutroModo } from './leitura.mjs';

/** O mesmo agente do catálogo: robô que se identifica, com endereço para reclamação. */
const USER_AGENT =
  'bf6-loadouts-catalog/1.0 (+https://github.com/vitortamura/bf6-loadouts) leitura diária do meta';

/** Quanto de cada página de ranking vai para o prompt. Uma tabela de 63 armas cabe com folga. */
const MAX_POR_PAGINA = 7000;

/** Quantas threads vão para o prompt, e quanto de cada uma. */
const MAX_THREADS = 24;
const MAX_POR_THREAD = 500;

/**
 * Páginas de análise que não vão para o prompt.
 *
 * O bf6balancelog transcreve o changelog inteiro — meio milhão de caracteres —,
 * e o que ele diz do patch em vigor já chega ao modelo pelo briefing do
 * catálogo (`patch-atual.mjs`).
 */
const GRANDES_DEMAIS = new Set(['bf6balancelog.com']);

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normal = (valor) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/*
 * O nome de cada arma, como expressão que acha "SG 553R", "sg553r" e "SG-553R".
 *
 * Só nome inteiro, entre espaços: "M4A1" não pode casar dentro de "M4A1S", e
 * "PSR" não pode casar dentro de palavra nenhuma.
 */
const NOMES = WEAPONS.filter((arma) => arma.category !== 'melee').map((arma) => ({
  nome: arma.name,
  padrao: new RegExp(`(^| )${normal(arma.name).replace(/ /g, ' ?')}( |$)`),
  // O mesmo nome no texto cru, para achar *onde* ele aparece.
  noTexto: new RegExp(`(?<![a-z0-9])${normal(arma.name).replace(/ /g, '[^a-z0-9]{0,2}')}(?![a-z0-9])`, 'i'),
}));

/** As armas do arsenal que um texto cita, pelo nome do site. */
export function armasCitadas(textoLivre) {
  const texto = normal(textoLivre);
  return NOMES.filter(({ padrao }) => padrao.test(texto)).map(({ nome }) => nome);
}

/**
 * O miolo de uma página de ranking, sem o menu que vem antes.
 *
 * O texto de uma página dessas começa com centenas de linhas de navegação —
 * outros jogos, idiomas, patrocinadores — e só então a tabela. O corte começa
 * um pouco antes da primeira arma citada, que é onde a tabela começa, e
 * termina logo depois da última — o rodapé dessas páginas lista as armas de
 * outros jogos do mesmo rastreador, e nome de arma de Warzone no meio do
 * material é convite a erro.
 */
export function recortarPagina(textoDaPagina, max = MAX_POR_PAGINA) {
  const texto = String(textoDaPagina ?? '')
    // O rótulo do botão de cada linha da wzstats: repete o nome e não diz nada.
    .replace(/Get all the best .{1,40}? builds/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let primeira = -1;
  for (const { noTexto } of NOMES) {
    const onde = texto.search(noTexto);
    if (onde !== -1 && (primeira === -1 || onde < primeira)) primeira = onde;
  }
  if (primeira === -1) return '';

  const inicio = Math.max(0, primeira - 200);
  const janela = texto.slice(inicio, inicio + max);

  let ultima = 0;
  for (const { noTexto } of NOMES) {
    const todas = new RegExp(noTexto.source, 'gi');
    for (const achado of janela.matchAll(todas)) ultima = Math.max(ultima, achado.index + achado[0].length);
  }

  // A folga cobre o que vem colado na última arma: "#11 Assault Rifle".
  return janela.slice(0, ultima + 24).trim();
}

/**
 * O trecho de uma thread que vai para o prompt.
 *
 * Post curto vai inteiro. Em post longo — comunicado do estúdio, desabafo de
 * dez parágrafos — o começo raramente é onde a arma aparece, e mandar só ele
 * seria mandar uma thread que "cita" a arma sem mostrar o que se disse dela.
 * Aí o trecho é a vizinhança da primeira arma citada.
 */
export function trechoDaThread(texto, max = MAX_POR_THREAD) {
  if (texto.length <= max) return texto;

  let primeira = -1;
  for (const { noTexto } of NOMES) {
    const onde = texto.search(noTexto);
    if (onde !== -1 && (primeira === -1 || onde < primeira)) primeira = onde;
  }
  if (primeira < max / 2) return `${texto.slice(0, max).trim()}…`;

  const inicio = Math.max(0, primeira - Math.floor(max / 3));
  return `…${texto.slice(inicio, inicio + max).trim()}…`;
}

const semEntidades = (valor) =>
  String(valor ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#32;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * As threads de um feed Atom do Reddit.
 *
 * O feed traz título, endereço, data e o corpo do post — em HTML escapado
 * dentro do XML, com a assinatura "submitted by /u/…" no fim, que sai.
 */
export function parsearRss(xml) {
  return [...String(xml ?? '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entrada]) => {
    const url = /<link[^>]*href="([^"]+)"/.exec(entrada)?.[1];
    const title = semEntidades(/<title>([\s\S]*?)<\/title>/.exec(entrada)?.[1]).trim();
    if (!url || !title) return [];

    const date = (/<published>([^<]+)</.exec(entrada) ?? /<updated>([^<]+)</.exec(entrada))?.[1]?.slice(0, 10);
    const text = htmlToText(semEntidades(semEntidades(/<content[^>]*>([\s\S]*?)<\/content>/.exec(entrada)?.[1])))
      .replace(/submitted by\s+\/u\/\S+.*$/s, '')
      .replace(/\s+/g, ' ')
      .trim();

    return [{ url: semEntidades(url), title, date: date ?? null, text }];
  });
}

/** Thread de battle royale: o trending é do multiplayer, e a conversa do REDSEC é outra. */
const DE_OUTRO_MODO = /redsec|battle royale|gauntlet/i;

/**
 * Das threads baixadas, as que servem de evidência de conversa.
 *
 * Só thread que cita arma do arsenal — é o que o trending mede —, desta
 * temporada, e uma vez cada. A lista sai da mais recente para a mais antiga:
 * a janela do trending é a semana, e o que é de ontem pesa mais.
 */
export function filtrarConversa(threads, { desde = null, max = MAX_THREADS } = {}) {
  const vistas = new Set();
  const uteis = [];

  for (const thread of threads ?? []) {
    if (DE_OUTRO_MODO.test(thread.title)) continue;
    if (desde && thread.date && thread.date < desde) continue;

    const armas = armasCitadas(`${thread.title} ${thread.text}`);
    if (!armas.length) continue;

    let pagina;
    try {
      pagina = chavePagina(thread.url);
    } catch {
      continue;
    }
    if (vistas.has(pagina)) continue;
    vistas.add(pagina);

    uteis.push({ ...thread, armas, text: trechoDaThread(thread.text) });
  }

  return uteis.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))).slice(0, max);
}

/**
 * As páginas que medem, baixadas e recortadas.
 *
 * Recebe a curadoria do site (`SOURCES`) e fica com o que é análise de
 * multiplayer. Página que não responde, ou que respondeu sem arma nenhuma no
 * texto — layout novo, página de erro com status 200 —, fica de fora.
 */
export async function lerPaginasQueMedem(fontes, { hoje }) {
  const alvos = fontes.filter((fonte) => {
    if (confiabilidade(fonte.url) !== 'analise' || ehPaginaDeOutroModo(fonte.url)) return false;
    return !GRANDES_DEMAIS.has(new URL(fonte.url).hostname.replace(/^www\./, ''));
  });

  const lidas = await Promise.all(
    alvos.map(async (fonte) => {
      try {
        const resposta = await fetch(fonte.url, {
          headers: { 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        });
        if (!resposta.ok) throw new Error(`${resposta.status} ${resposta.statusText}`);

        const texto = recortarPagina(htmlToText(await resposta.text()));
        // Meia dúzia de armas é o mínimo para chamar aquilo de ranking.
        if (armasCitadas(texto).length < 6) throw new Error('a página não trouxe ranking de armas');

        return { name: fonte.name, url: fonte.url, scope: fonte.scope, date: hoje, texto };
      } catch (erro) {
        console.warn(`Página fora — ${fonte.url}: ${erro.message}`);
        return null;
      }
    }),
  );

  return lidas.filter(Boolean);
}

/**
 * As buscas no Reddit, em feed Atom.
 *
 * O `.json` responde 403 a rastreador; o `.rss` responde, com limite de taxa
 * apertado — perto de um pedido por minuto —, e por isso são só duas: o que a
 * semana mais votou e o que acabou de chegar. As palavras são as de quem fala
 * de arma; quem decide se a thread serve é `filtrarConversa`, pelo arsenal.
 */
const TERMOS = 'meta OR nerf OR buff OR loadout OR build OR gun OR weapon';
const BUSCAS_NO_REDDIT = ['top', 'new'].map(
  (ordem) =>
    `https://www.reddit.com/r/Battlefield6/search.rss?q=${encodeURIComponent(TERMOS)}&restrict_sr=1&sort=${ordem}&t=week&limit=100`,
);

/** Quanto esperar pela janela do Reddit. Mais que isso, a busca fica para amanhã. */
const ESPERA_MAXIMA_MS = 70_000;

async function baixarFeed(url) {
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    const resposta = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    const janela = Number(resposta.headers.get('x-ratelimit-reset'));
    const sobrou = Number(resposta.headers.get('x-ratelimit-remaining'));
    const esperaMs = Number.isFinite(janela) && janela > 0 ? (janela + 2) * 1000 : 0;

    if (resposta.ok) {
      const xml = await resposta.text();
      // A janela gasta por este pedido é paga agora, para o próximo não bater nela.
      return { xml, esperaMs: sobrou < 1 ? esperaMs : 0 };
    }
    if (resposta.status !== 429 || tentativa === 2 || esperaMs > ESPERA_MAXIMA_MS) {
      throw new Error(`${resposta.status} ${resposta.statusText}`);
    }
    await esperar(esperaMs || 30_000);
  }
  throw new Error('sem resposta');
}

/**
 * A conversa da semana que cita arma do arsenal.
 *
 * Devolve lista vazia quando o Reddit recusa — o que ele faz com frequência a
 * endereço de datacenter. Não é erro da rotina: sem conversa baixada, o
 * trending fica para a leitura com busca.
 */
export async function lerConversa({ desde = null } = {}) {
  const threads = [];

  for (const [indice, url] of BUSCAS_NO_REDDIT.entries()) {
    try {
      const { xml, esperaMs } = await baixarFeed(url);
      threads.push(...parsearRss(xml));
      if (indice < BUSCAS_NO_REDDIT.length - 1 && esperaMs) await esperar(Math.min(esperaMs, ESPERA_MAXIMA_MS));
    } catch (erro) {
      console.warn(`Reddit fora — ${erro.message}`);
    }
  }

  return filtrarConversa(threads, { desde });
}

/**
 * As fontes da resposta, presas ao que o script baixou.
 *
 * O modelo recebeu as páginas no prompt e aponta, em cada arma, o endereço que
 * a sustenta. A lista `sources` da resposta é descartada e refeita aqui: entra
 * só o que foi baixado **e** citado por alguma arma, com o nome, a data e o
 * escopo que o script conhece — não os que o modelo declarar. Endereço de fora
 * do material não vira fonte, e a arma que dependia dele cai nas travas de
 * `leitura.mjs` por não ter fonte que resolva.
 *
 * As páginas que medem vêm primeiro: são elas que sustentam os picks, e a
 * lista de fontes tem teto.
 */
export function ancorarFontes(bruto, { paginas = [], conversa = [] }) {
  const citadas = new Set();
  for (const lista of [bruto?.picks, bruto?.trending]) {
    for (const item of Array.isArray(lista) ? lista : []) {
      try {
        citadas.add(chavePagina(item?.source ?? item?.sources?.[0]));
      } catch {
        // Endereço inválido: a arma cai sozinha, mais adiante.
      }
    }
  }

  const fornecidas = [
    ...paginas.map((pagina) => ({ name: pagina.name, url: pagina.url, date: pagina.date, scope: pagina.scope })),
    ...conversa.map((thread) => ({
      name: `Reddit — ${thread.title}`.slice(0, 80),
      url: thread.url,
      date: thread.date,
      scope: `Thread do r/Battlefield6 que cita ${thread.armas.join(', ')}. Mostra do que se fala, não mede força.`,
    })),
  ];

  return { ...bruto, sources: fornecidas.filter((fonte) => citadas.has(chavePagina(fonte.url))) };
}
