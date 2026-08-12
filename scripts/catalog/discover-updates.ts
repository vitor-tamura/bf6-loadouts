#!/usr/bin/env node
/**
 * Existe patch novo?
 *
 *   npm run catalog:discover
 *   npm run catalog:discover -- --json
 *
 * Lê a página de novidades da EA, recolhe os números de versão que aparecem lá
 * e devolve os que ainda não existem em `data/versions`. É o primeiro passo do
 * workflow automático: se a resposta for vazia — o caso comum, já que patch não
 * sai todo dia —, nada mais roda e nenhum Pull Request é aberto.
 *
 * ## Por que só números de versão
 *
 * Porque é o que dá para afirmar lendo uma página que muda de layout sem aviso.
 * Um extrator que dependesse da estrutura do HTML — "o terceiro card da segunda
 * seção" — passaria a colher lixo silenciosamente na primeira reforma do site.
 * Número de versão tem forma reconhecível e é conferível contra o que já existe
 * no repositório; o resto do trabalho é do `fetch-patch-note`, que vai buscar a
 * página daquela versão especificamente.
 *
 * Saída em ordem cronológica: quando aparecem três versões de uma vez, elas são
 * processadas da mais antiga para a mais nova, senão o estado novo seria
 * reescrito pelo velho.
 */

import { ENDPOINTS, fetchText, htmlToText } from './lib/http.ts';
import { compareVersions, isGameVersion, listVersions, log } from './lib/io.ts';

/**
 * A cara de uma versão da EA.
 *
 * Quatro grupos de dígitos — `1.4.2.0`. Três também aparecem em texto de
 * marketing, e é justamente por isso que a captura exige os quatro: `2.0.1` num
 * parágrafo é quase sempre outra coisa, e um falso positivo aqui manda o
 * pipeline inventar uma versão que não existe.
 */
const VERSION_PATTERN = /\b(\d+\.\d+\.\d+\.\d+)\b/g;

export function extractVersions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VERSION_PATTERN)) {
    if (isGameVersion(match[1])) found.add(match[1]);
  }
  return [...found].sort(compareVersions);
}

export async function discover(): Promise<{
  known: string[];
  published: string[];
  missing: string[];
}> {
  const html = await fetchText(ENDPOINTS.eaNews);
  const published = extractVersions(htmlToText(html));
  const known = listVersions();

  return {
    known,
    published,
    missing: published.filter((version) => !known.includes(version)).sort(compareVersions),
  };
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');

  try {
    const result = await discover();

    if (asJson) {
      // O workflow lê esta linha: uma só, para caber num output de step.
      console.log(JSON.stringify(result));
    } else {
      log('versões conhecidas', result.known);
      log('versões publicadas', result.published);
      log('faltando', result.missing.length ? result.missing : 'nenhuma');
    }

    if (!result.published.length) {
      /*
       * A página respondeu e nenhuma versão apareceu.
       *
       * Isso não é "não há patch novo" — é sinal de que a página mudou de forma
       * ou de endereço, e seguir em frente diria ao workflow que está tudo em
       * dia justamente quando ele parou de enxergar. Melhor falhar e ser
       * consertado.
       */
      console.error(
        'nenhum número de versão encontrado na página da EA — confira CATALOG_EA_NEWS_URL e o extrator',
      );
      process.exit(2);
    }
  } catch (error) {
    console.error(`[catalog] descoberta falhou: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('discover-updates.ts')) await main();
