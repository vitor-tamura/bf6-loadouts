#!/usr/bin/env node
/**
 * O dataset da comunidade, preso a um commit.
 *
 *   npm run catalog:fetch-github
 *   GITHUB_TOKEN=... npm run catalog:fetch-github
 *
 * Baixa os JSONs de `raymdl/BF6-Weapon-Analyzer` e guarda o instantâneo em
 * `data/sources/imports/`, junto com o SHA do commit de onde ele veio.
 *
 * O SHA não é enfeite. "Baixei do main" é uma frase que envelhece: o main de
 * hoje não é o de semana que vem, e uma importação que só diz o nome do branch
 * não pode ser refeita nem conferida depois. Com o SHA, qualquer pessoa repete
 * exatamente a mesma leitura daqui a um ano — e, quando duas importações
 * discordarem, dá para ver o que mudou entre elas.
 *
 * A fonte é auxiliar por definição: ela confere e recupera, nunca decide. O que
 * o jogo aceita hoje quem diz é o estado atual; o que mudou, quem diz é a EA.
 */

import { join } from 'node:path';
import { ENDPOINTS, fetchJson } from './lib/http.ts';
import { IMPORTS, NOW, SOURCES, log, readJsonIf, writeJson } from './lib/io.ts';

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

interface Commit {
  sha: string;
  commit: { committer: { date: string } };
}

const API = 'https://api.github.com';

/** O token é opcional, e sem ele a API corta em 60 pedidos por hora. */
function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchDataset(): Promise<{
  repository: string;
  commit: string;
  committedAt: string;
  files: Record<string, unknown>;
  skipped: string[];
}> {
  const repo = ENDPOINTS.githubRepo;
  const branch = ENDPOINTS.githubBranch;

  const [head] = await fetchJson<Commit[]>(
    `${API}/repos/${repo}/commits?sha=${branch}&per_page=1`,
    headers(),
  );
  if (!head?.sha) throw new Error(`não consegui ler o commit de ${repo}@${branch}`);

  const tree = await fetchJson<{ tree: TreeEntry[]; truncated: boolean }>(
    `${API}/repos/${repo}/git/trees/${head.sha}?recursive=1`,
    headers(),
  );

  if (tree.truncated) {
    // Árvore cortada devolve uma lista parcial sem avisar quem lê o resultado.
    throw new Error(`a árvore de ${repo} veio truncada — importe por diretório`);
  }

  /*
   * Só o dataset, não o arquivo de trabalho do outro projeto.
   *
   * O repositório guarda, além dos dados, a auditoria inteira que os produziu:
   * OCR de custo, mapas visuais de recuo, manifestos de renomeação — 48
   * arquivos que somam 41 MB e que este pipeline nunca lê. Guardar tudo isso a
   * cada importação encheria o Git de dezenas de megabytes por patch, e o diff
   * de revisão ficaria impossível de abrir.
   *
   * O que entra é `data/`, que é de onde o `import-analyzer` lê — 260 KB. Os
   * demais ficam registrados pelo nome, e o SHA do commit continua no
   * instantâneo: quem precisar de um deles sabe exatamente onde buscá-lo.
   */
  const all = tree.tree.filter(
    (entry) => entry.type === 'blob' && /\.json$/i.test(entry.path) && !entry.path.includes('node_modules'),
  );

  const prefix = process.env.CATALOG_GITHUB_PREFIX ?? 'data/';
  const wanted = all.filter((entry) => entry.path.startsWith(prefix));
  const skipped = all.filter((entry) => !entry.path.startsWith(prefix)).map((entry) => entry.path);

  if (!wanted.length) {
    throw new Error(
      `nenhum .json sob "${prefix}" em ${repo}@${head.sha.slice(0, 7)} — confira CATALOG_GITHUB_PREFIX`,
    );
  }

  const files: Record<string, unknown> = {};
  for (const entry of wanted) {
    const raw = `https://raw.githubusercontent.com/${repo}/${head.sha}/${entry.path}`;
    try {
      files[entry.path] = await fetchJson<unknown>(raw);
    } catch (error) {
      // Um arquivo ilegível não invalida a importação inteira; ele se declara.
      files[entry.path] = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    repository: repo,
    commit: head.sha,
    committedAt: head.commit.committer.date,
    files,
    /** O que ficou de fora, pelo nome — o commit diz onde encontrá-los. */
    skipped,
  };
}

async function main(): Promise<void> {
  try {
    const dataset = await fetchDataset();
    const short = dataset.commit.slice(0, 7);
    const path = join(IMPORTS, `github-${short}.json`);

    writeJson(path, { ...dataset, retrievedAt: NOW });

    /* O registro da fonte cresce por acréscimo: cada leitura vira uma linha. */
    const registryPath = join(SOURCES, 'github.json');
    const registry = readJsonIf<{ snapshots: unknown[] }>(registryPath, {
      provider: dataset.repository,
      url: `https://github.com/${dataset.repository}`,
      type: 'community',
      snapshots: [],
    } as never);

    registry.snapshots = [
      ...registry.snapshots,
      {
        snapshot: `github-${short}`,
        commit: dataset.commit,
        committedAt: dataset.committedAt,
        retrievedAt: NOW,
        files: Object.keys(dataset.files).length,
        skipped: dataset.skipped.length,
        file: path.replace(`${process.cwd()}/`, ''),
      },
    ];

    writeJson(registryPath, registry);

    log('dataset da comunidade', {
      repo: dataset.repository,
      commit: short,
      arquivos: Object.keys(dataset.files).length,
      'fora do recorte': dataset.skipped.length,
    });
  } catch (error) {
    console.error(`[catalog] github falhou: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('fetch-github-data.ts')) await main();
