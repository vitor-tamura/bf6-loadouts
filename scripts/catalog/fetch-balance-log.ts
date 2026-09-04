#!/usr/bin/env node
/**
 * O changelog oficial, já separado por categoria e ligado às armas que nomeia.
 *
 *   npm run catalog:fetch-balance-log
 *
 * O BF6 Balance Log transcreve cada linha de cada Game Update da EA — nas
 * palavras da própria EA — e faz duas coisas que a página da EA não faz:
 * agrupa por categoria (`WEAPONS`, `VEHICLES`, `GADGETS`…) e marca, em cada
 * linha, que armas e peças ela cita.
 *
 * ## Por que esta fonte entrou
 *
 * A 1.4.2.5 mexeu em exatamente uma coisa de arma:
 *
 *     The Match Trigger attachment no longer affects fully automatic fire on
 *     the BROD and EF88.
 *
 * O parser do patch note largou essa linha. Ela não tem número, não tem
 * "added" nem "removed", e nenhum dos campos que ele reconhece — o que sobrava
 * era a última regra, que exige campo. Sem mudança nenhuma reconhecida e com o
 * texto tendo cara de patch note, o pipeline concluiu "patch de correções" e
 * escreveu a 1.4.2.5 como cópia da 1.4.2.0. Uma peça saiu de duas armas e o
 * catálogo não ficou sabendo.
 *
 * O Balance Log já resolve, do outro lado, os dois problemas que derrubaram
 * essa linha:
 *
 * - **a categoria.** A linha está sob `WEAPONS`, dito pela fonte. Não é preciso
 *   inferir do texto se a frase fala de arma.
 * - **as entidades.** `data-item="brod-3 ef88 match-trigger"` nomeia as três.
 *   O parser não achava a BROD 3 porque a EA escreveu "BROD"; aqui o casamento
 *   já vem feito por quem lê o jogo, e o normalizador do catálogo transforma
 *   `brod-3` em `brod3` sem margem para erro.
 *
 * ## O que ele não faz
 *
 * Não aplica nada. Escreve `data/sources/balance-log.json` e para — é fonte,
 * não decisão. Quem cruza com o catálogo é `reconcile`, e quem lê para montar o
 * briefing da leitura do meta é `scripts/meta/patch-atual.mjs`.
 *
 * E não substitui a EA. Segue sendo um terceiro transcrevendo: quando os dois
 * discordarem, quem vale é a página oficial, que está guardada inteira em
 * `data/patches/<versão>.json`.
 */

import { join } from 'node:path';
import { fetchText } from './lib/http.ts';
import { NOW, SOURCES, compareVersions, isGameVersion, log, writeJson } from './lib/io.ts';
import { fonteAtiva } from './lib/sources.ts';

/** Uma linha do changelog, como a fonte a publica. */
export interface BalanceLine {
  /** O texto da EA, sem marcação. */
  text: string;
  /** O subtítulo em que a fonte a agrupou — `WEAPONS`, `ATTACHMENTS`… */
  group: string | null;
  /** As armas e peças que a linha nomeia, nos identificadores da fonte. */
  items: string[];
}

export interface BalancePatch {
  version: string;
  /** `Aug 31, 2026` já em `2026-08-31`. */
  publishedAt: string | null;
  /** A página da EA que a fonte cita — a canônica, sem o desvio por `redsec`. */
  url: string | null;
  /** As categorias em que este patch tem linha, para quem quiser o quadro. */
  categories: string[];
  /** As linhas de arma e acessório. É o que este catálogo consome. */
  weaponLines: BalanceLine[];
}

export interface BalanceLog {
  source: {
    provider: string;
    type: 'community';
    url: string;
    retrievedAt: string;
  };
  patches: BalancePatch[];
}

/*
 * A página marca cada categoria com um comentário de HTML, e cada patch com um
 * `<details>`. Depender de estrutura é frágil por natureza — por isso o parser
 * conta o que achou e quem chama recusa resultado vazio, em vez de gravar um
 * arquivo sem patch nenhum como se fosse a resposta.
 */
const SECTION = /<!-- PATCHES:([a-z]+):START -->([\s\S]*?)<!-- PATCHES:\1:END -->/g;
const PATCH = /<details class="patch"[^>]*>([\s\S]*?)<\/details>/g;
const VERSION = /<span class="ver">([^<]+)<\/span>/;
const DATE = /<span class="date">([^<]+)<\/span>/;
const SOURCE_LINK = /<div class="src">[\s\S]*?href="([^"]+)"/;
const GROUP = /<p class="grp">\s*<b>([^<]+)<\/b>/g;
const ITEM = /<li([^>]*)>([\s\S]*?)<\/li>/g;
const DATA_ITEM = /data-item="([^"]*)"/;

/** A categoria em que moram as linhas de arma e acessório. */
const WEAPONS = 'weapons';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** `Aug 31, 2026` → `2026-08-31`. Mês que não se reconhece devolve nulo. */
export function toIsoDate(text: string): string | null {
  const match = text.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[2].padStart(2, '0')}` : null;
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * As linhas de um patch, com o subtítulo em que cada uma estava.
 *
 * O agrupamento importa: dentro de `weapons` a fonte ainda separa `WEAPONS` de
 * `ATTACHMENTS`, e é o que permite a quem consome dizer de que a linha trata
 * sem reler o texto.
 */
function linesOf(body: string): BalanceLine[] {
  const groups: { at: number; name: string }[] = [];
  for (const match of body.matchAll(GROUP)) groups.push({ at: match.index, name: text(match[1]) });

  const lines: BalanceLine[] = [];
  for (const match of body.matchAll(ITEM)) {
    const content = text(match[2]);
    if (!content) continue;

    const items = match[1].match(DATA_ITEM)?.[1].split(/\s+/).filter(Boolean) ?? [];
    const group = groups.filter((candidate) => candidate.at < match.index).at(-1)?.name ?? null;

    lines.push({ text: content, group, items });
  }

  return lines;
}

/**
 * O que a página inteira diz.
 *
 * Um patch aparece em várias categorias — a 1.4.2.0 tem linha em quase todas —
 * e aqui ele vira um registro só: a data e a página da EA saem de qualquer
 * ocorrência, e as linhas de arma, só da categoria de armas. É o que permite
 * saber que uma versão existe mesmo quando ela não encostou em arma nenhuma,
 * que é a informação de que a descoberta precisa.
 */
export function parseBalanceLog(html: string): BalancePatch[] {
  const found = new Map<string, BalancePatch>();

  for (const [, category, section] of html.matchAll(SECTION)) {
    for (const [, body] of section.matchAll(PATCH)) {
      const version = body.match(VERSION)?.[1].trim();
      if (!version || !isGameVersion(version)) continue;

      const patch = found.get(version) ?? {
        version,
        publishedAt: null,
        url: null,
        categories: [],
        weaponLines: [],
      };

      patch.publishedAt ??= toIsoDate(body.match(DATE)?.[1] ?? '');

      /*
       * O endereço vem daqui, e não do que a EA mostra na listagem.
       *
       * A 1.4.2.5 foi baixada de `/games/battlefield/redsec/news/…` porque foi
       * onde a EA pendurou o cartão naquele dia — página mais curta, com o
       * mesmo changelog. A fonte aponta a canônica, em `battlefield-6`, e ter
       * as duas registradas é o que permite conferir uma contra a outra.
       */
      patch.url ??= body.match(SOURCE_LINK)?.[1] ?? null;

      if (!patch.categories.includes(category)) patch.categories.push(category);
      if (category === WEAPONS) patch.weaponLines = linesOf(body);

      found.set(version, patch);
    }
  }

  return [...found.values()].sort((a, b) => compareVersions(b.version, a.version));
}

export async function fetchBalanceLog(url?: string): Promise<BalanceLog> {
  const fonte = fonteAtiva('registro_de_patch');
  const address = url ?? fonte.url;
  const patches = parseBalanceLog(await fetchText(address));

  /*
   * Página que responde 200 e não rende patch nenhum é layout novo, não
   * "nenhuma atualização". Deixar passar gravaria uma lista vazia por cima da
   * boa, e o cruzamento seguinte diria que a EA não publicou nada — em silêncio,
   * que é o modo de falhar que este pipeline não aceita.
   */
  if (!patches.length) {
    throw new Error(
      `nenhum patch reconhecido em ${address} — a página respondeu, então o layout mudou`,
    );
  }

  return {
    source: {
      provider: fonte.id,
      type: 'community',
      url: address,
      retrievedAt: NOW,
    },
    patches,
  };
}

export const BALANCE_LOG_PATH = join(SOURCES, 'balance-log.json');

async function main(): Promise<void> {
  try {
    const balanceLog = await fetchBalanceLog(process.argv[2]);
    writeJson(BALANCE_LOG_PATH, balanceLog);

    const recente = balanceLog.patches[0];
    log('balance log', {
      patches: balanceLog.patches.length,
      'mais recente': `${recente.version} (${recente.publishedAt ?? 'sem data'})`,
      'linhas de arma': recente.weaponLines.length,
    });
  } catch (error) {
    console.error(
      `[catalog] balance log falhou: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('fetch-balance-log.ts')) await main();
