#!/usr/bin/env node
/**
 * Saiu patch novo?
 *
 *   npm run catalog:discover
 *   npm run catalog:discover -- --json
 *
 * Lê a página de novidades da EA e devolve os Game Updates que ainda não estão
 * em `data/versions`. É o gatilho de todo o pipeline: sem versão nova aqui,
 * nada mais roda.
 *
 * ## Por que a versão sai do endereço, e não do texto
 *
 * Porque o texto mente. A página tem números de quatro grupos por toda parte —
 * `2.926.379.084`, `069.342.055.185` — que são identificadores de componente, e
 * um extrator que varresse o corpo atrás de `\d+\.\d+\.\d+\.\d+` colheria isso
 * como se fosse versão do jogo. O pipeline então baixaria um patch note que não
 * existe e abriria um Pull Request para uma versão inventada.
 *
 * O endereço não tem esse problema. A EA publica cada atualização em
 * `/news/battlefield-6-game-update-1-4-1-5`, e o que está depois de
 * `game-update-` é a versão, escrita com hífen. Um link com essa forma é uma
 * afirmação da própria EA de que aquela versão existe.
 */

import { EA_NEWS, fetchText } from './lib/http.ts';
import { compareVersions, isGameVersion, listVersions, log } from './lib/io.ts';

/**
 * `/news/battlefield-6-game-update-1-4-1-5` → `1.4.1.5`.
 *
 * O jogo no meio do endereço é curinga de propósito. A EA publica o mesmo Game
 * Update ora sob `battlefield-6`, ora sob `redsec` — a 1.4.2.5 saiu em
 * `/games/battlefield/redsec/news/battlefield-6-game-update-1-4-2-5`, e a versão
 * ficou invisível para este extrator por doze dias enquanto o padrão estava
 * fixo em `battlefield-6`. Quem afirma que a versão existe é o `game-update-` do
 * slug do artigo, não a seção do site em que a EA resolveu pendurá-lo.
 */
const UPDATE_LINK =
  /href="((?:https:\/\/www\.ea\.com)?\/games\/battlefield\/[a-z0-9-]+\/news\/[a-z0-9-]*game-update-([\d-]+))"/gi;

/** A data do card, no formato que a EA escreve: `August 3, 2026`. */
const CARD_DATE = />([A-Z][a-z]+ \d{1,2}, \d{4})</;

/** O título fica num contêiner de recorte de linhas. */
const CARD_TITLE = /--line-clamp:\d+">([^<]{5,160})</;

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** `August 3, 2026` → `2026-08-03`. Sem reconhecer o mês, devolve o texto. */
export function toIsoDate(text: string): string {
  const match = text.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  if (!match) return text;

  const month = MONTHS[match[1].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[2].padStart(2, '0')}` : text;
}

export interface DiscoveredUpdate {
  version: string;
  url: string;
  title: string | null;
  publishedAt: string | null;
}

/**
 * Os Game Updates que a página anuncia.
 *
 * Cada link vive dentro de um cartão que termina no primeiro `</a>` seguinte —
 * é lá que estão o título e a data, e limitar a busca a esse pedaço evita
 * colher a data do cartão vizinho.
 */
export function extractUpdates(html: string): DiscoveredUpdate[] {
  const found = new Map<string, DiscoveredUpdate>();

  for (const match of html.matchAll(UPDATE_LINK)) {
    const version = match[2].replace(/-/g, '.');
    if (!isGameVersion(version) || found.has(version)) continue;

    const href = match[1];
    const card = html.slice(match.index + match[0].length).split('</a>')[0];
    const date = card.match(CARD_DATE);
    const title = card.match(CARD_TITLE);

    found.set(version, {
      version,
      url: href.startsWith('http') ? href : `https://www.ea.com${href}`,
      title: title ? title[1].trim() : null,
      publishedAt: date ? toIsoDate(date[1]) : null,
    });
  }

  return [...found.values()].sort((a, b) => compareVersions(a.version, b.version));
}

export async function discover(): Promise<{
  known: string[];
  published: DiscoveredUpdate[];
  updates: DiscoveredUpdate[];
}> {
  const html = await fetchText(EA_NEWS);
  const published = extractUpdates(html);
  const known = listVersions();

  return {
    known,
    published,
    // Da mais antiga para a mais nova: processar 1.4.2.0 antes de 1.4.1.0
    // faria o estado novo ser reescrito pelo velho.
    updates: published.filter((update) => !known.includes(update.version)),
  };
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');

  try {
    const result = await discover();

    if (asJson) {
      console.log(JSON.stringify(result));
    } else {
      log('versões no catálogo', result.known);
      log('game updates publicados', result.published.map((u) => u.version));
      log('a processar', result.updates.length ? result.updates.map((u) => u.version) : 'nenhuma');
      for (const update of result.updates) {
        log(`  ${update.version}`, { título: update.title, publicado: update.publishedAt, url: update.url });
      }
    }

    if (!result.published.length) {
      /*
       * A página respondeu e nenhum Game Update apareceu.
       *
       * Isso não é "não há patch novo" — é sinal de que a página mudou de forma
       * ou de endereço. Seguir em frente diria ao workflow que está tudo em dia
       * justamente quando ele parou de enxergar.
       */
      console.error(
        'nenhum Game Update encontrado na página da EA — confira CATALOG_EA_NEWS_URL e o extrator de links',
      );
      process.exit(2);
    }
  } catch (error) {
    console.error(`[catalog] descoberta falhou: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('discover-updates.ts')) await main();
