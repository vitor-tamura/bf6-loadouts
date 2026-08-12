/**
 * Leitura e escrita dos arquivos do catálogo.
 *
 * Tudo passa por aqui para que todo JSON do repositório saia igual: dois
 * espaços, chaves na ordem em que foram montadas, quebra de linha no fim. Não é
 * capricho — o catálogo é revisado em Pull Request, e um escritor que ordena
 * chaves de outro jeito a cada execução produz um diff de mil linhas quando o
 * que mudou foi uma. O diff é a revisão; ilegível, ele deixa de ser.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A raiz do repositório, a partir deste arquivo. */
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export const DATA = join(ROOT, 'data');
export const ENTITIES = join(DATA, 'entities');
export const VERSIONS = join(DATA, 'versions');
export const PATCHES = join(DATA, 'patches');
export const SOURCES = join(DATA, 'sources');
export const IMPORTS = join(SOURCES, 'imports');
export const INDEXES = join(DATA, 'indexes');
export const DIFFS = join(DATA, 'diffs');

/** O artefato público: é o único arquivo do catálogo que o site abre. */
export const PUBLIC_CATALOG = join(ROOT, 'public', 'data', 'catalog.current.json');

export const versionDir = (version: string) => join(VERSIONS, version);

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Lê o que existir; devolve o padrão quando o arquivo ainda não foi criado. */
export function readJsonIf<T>(path: string, fallback: T): T {
  return existsSync(path) ? readJson<T>(path) : fallback;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

/** As versões que existem em `data/versions`, da mais antiga para a mais nova. */
export function listVersions(): string[] {
  if (!existsSync(VERSIONS)) return [];
  return readdirSync(VERSIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersions);
}

/**
 * Compara `1.4.10.0` com `1.4.2.0` como a EA numera, e não como texto.
 *
 * Em ordem alfabética `1.4.10.0` vem antes de `1.4.2.0`, o que faria o pipeline
 * processar patches fora de ordem e reescrever um estado novo com um velho.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * O formato que a EA usa: quatro grupos de dígitos.
 *
 * `1.4.2.0` passa; `Season 4`, `1.4` e `1.4.2` não. A exigência é a mesma que o
 * extrator da página de novidades aplica — se as duas pontas discordassem, o
 * pipeline colheria uma versão que ele mesmo recusaria adiante, e a falha
 * apareceria três passos depois da causa.
 */
export function isGameVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(value);
}

/**
 * O relógio do pipeline.
 *
 * Uma execução inteira usa o mesmo instante, senão os arquivos de uma mesma
 * importação saem com carimbos diferentes por segundos de diferença e o diff
 * acusa mudança onde não houve.
 */
export const NOW = new Date().toISOString();
export const TODAY = NOW.slice(0, 10);

/** Mensagem de progresso. Vai para o log do workflow, então é curta. */
export function log(step: string, detail?: unknown): void {
  if (detail === undefined) console.log(`[catalog] ${step}`);
  else console.log(`[catalog] ${step}`, detail);
}
