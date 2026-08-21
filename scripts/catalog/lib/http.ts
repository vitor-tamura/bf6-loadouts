/**
 * As idas à internet do pipeline.
 *
 * Três fontes, três formatos, o mesmo cuidado: a rede falha, o site muda de
 * layout e a API do GitHub limita quem pede demais. O que não pode acontecer é
 * qualquer uma dessas falhas virar dado — um HTML de página de erro parseado
 * como patch note produz um catálogo cheio de nada, e o pipeline segue adiante
 * satisfeito.
 *
 * Por isso tudo aqui devolve erro alto e claro. Quem chama decide se aquilo é
 * `blocked` (não mexe no catálogo, abre issue) ou motivo para parar.
 */

import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Um agente que se identifica.
 *
 * Robô que se apresenta como navegador é robô que vai ser bloqueado quando o
 * dono do site perceber, e com razão. Este diz o que é e para onde apontar a
 * reclamação.
 */
const USER_AGENT =
  'bf6-loadouts-catalog/1.0 (+https://github.com/vitortamura/bf6-loadouts) atualizador de catálogo';

const TIMEOUT_MS = Number(process.env.CATALOG_HTTP_TIMEOUT_MS ?? 30_000);
const RETRIES = Number(process.env.CATALOG_HTTP_RETRIES ?? 3);

/*
 * Os campos são declarados e atribuídos um a um.
 *
 * A forma curta do TypeScript — `constructor(public url: string)` — não passa
 * pelo Node em modo strip-only: ele apaga tipos, não gera código, e a atribuição
 * implícita que essa forma promete nunca chega a existir. Todo script que
 * importasse este arquivo morreria antes da primeira linha.
 */
export class FetchFailed extends Error {
  url: string;
  status: number | null;

  constructor(url: string, status: number | null, message: string) {
    super(`${url} → ${message}`);
    this.name = 'FetchFailed';
    this.url = url;
    this.status = status;
  }
}

async function once(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: { 'user-agent': USER_AGENT, ...headers },
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new FetchFailed(url, null, `sem resposta em ${Math.round(TIMEOUT_MS / 1000)} s`);
    }
    throw new FetchFailed(url, null, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Insiste só onde insistir resolve.
 *
 * Falha de rede e 5xx são temporárias e merecem outra tentativa. 404 não muda
 * de ideia: repetir seis vezes um endereço que não existe só atrasa o
 * diagnóstico.
 */
async function request(url: string, headers: Record<string, string> = {}): Promise<Response> {
  let last: unknown = null;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await once(url, headers);
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) {
        throw new FetchFailed(url, response.status, `${response.status} ${response.statusText}`);
      }
      last = new FetchFailed(url, response.status, `${response.status} ${response.statusText}`);
    } catch (error) {
      if (error instanceof FetchFailed && error.status && error.status < 500) throw error;
      last = error;
    }

    if (attempt < RETRIES) await sleep(1000 * 2 ** (attempt - 1));
  }

  throw last;
}

export async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  return (await request(url, headers)).text();
}

export async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await request(url, { accept: 'application/json', ...headers });
  return (await response.json()) as T;
}

/**
 * O HTML reduzido a texto.
 *
 * Suficiente para achar números de versão e ler parágrafos de patch note, e
 * deliberadamente burro: nada de interpretar estrutura, porque estrutura de
 * página muda toda temporada e um parser que depende dela quebra calado.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Os endereços que o pipeline conhece, todos sobrescrevíveis por ambiente. */
export const ENDPOINTS = {
  eaNews: process.env.CATALOG_EA_NEWS_URL ?? 'https://www.ea.com/games/battlefield/battlefield-6/news',
  loadouts: process.env.CATALOG_LOADOUTS_URL ?? 'https://bf6loadouts.com',
  githubRepo: process.env.CATALOG_GITHUB_REPO ?? 'raymdl/BF6-Weapon-Analyzer',
  githubBranch: process.env.CATALOG_GITHUB_BRANCH ?? 'main',
  /**
   * A ficha por arma do rnkd.gg, que enumera o slot inteiro.
   *
   * É a única fonte alcançável daqui que lista, arma por arma, todos os
   * acessórios de cada slot — inclusive os que a temporada acrescentou. Enumerar
   * é o que a separa das outras: quando a peça não está lá, isso é evidência
   * contrária, e não silêncio.
   */
  arsenal: process.env.CATALOG_ARSENAL_URL ?? 'https://rnkd.gg/battlefield6/weapons',
};
