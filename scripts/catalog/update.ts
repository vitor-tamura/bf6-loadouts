#!/usr/bin/env node
/**
 * O pipeline inteiro, de ponta a ponta.
 *
 *   npm run catalog:update                      # descobre e processa o que faltar
 *   npm run catalog:update -- --version 1.4.2.0 # uma versão específica
 *   npm run catalog:update -- --dry-run         # mostra o que faria, sem escrever
 *
 * É o mesmo comando que o GitHub Actions executa. Rodar localmente e rodar no
 * CI produzem o mesmo resultado — se divergissem, o workflow viraria uma caixa
 * preta que só falha em produção.
 *
 * ## Seguro por padrão
 *
 * A regra que governa cada passo: com certeza, automatiza; com dúvida, para e
 * pede revisão. Nunca inventa dado para conseguir terminar. Um patch que a EA
 * publicou pela metade produz uma versão pela metade, marcada, e não uma versão
 * completa com números adivinhados.
 *
 * ## Idempotente
 *
 * Rodar duas vezes não duplica nada: versão que já existe em `data/versions` é
 * pulada, patch note já baixado não é rebaixado. É o que permite ao workflow
 * rodar de seis em seis horas sem acumular lixo.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PATCHES, ROOT, log, readJson, versionDir } from './lib/io.ts';
import { discover, type DiscoveredUpdate } from './discover-updates.ts';
import { fetchPatchNote, type PatchNote } from './fetch-patch-note.ts';
import { knownEntities, parseNote, registroDe, type PatchChange } from './parse-patch-note.ts';
import { writeJson } from './lib/io.ts';

interface Options {
  version: string | null;
  dryRun: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const at = argv.indexOf('--version');
  return {
    version: at >= 0 ? (argv[at + 1] ?? null) : null,
    dryRun: argv.includes('--dry-run'),
    json: argv.includes('--json'),
  };
}

/**
 * Roda um passo do pipeline como processo próprio.
 *
 * Cada script já sabe falhar do seu jeito — código de saída, mensagem, arquivo
 * escrito. Chamá-los por fora preserva isso e mantém cada um utilizável
 * sozinho, que é como se depura um pipeline quando ele quebra.
 */
function run(script: string, args: string[] = []): { ok: boolean; output: string } {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', join(ROOT, 'scripts', 'catalog', script), ...args],
    { encoding: 'utf8', cwd: ROOT },
  );

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (output.trim()) process.stdout.write(output);
  return { ok: result.status === 0, output };
}

/** O resumo por nível de automação, que vai para o corpo do Pull Request. */
function summarize(changes: PatchChange[]) {
  const count = (level: string) => changes.filter((change) => change.automation === level).length;
  return { total: changes.length, auto: count('auto'), review: count('review'), blocked: count('blocked') };
}

async function processVersion(update: DiscoveredUpdate, options: Options): Promise<boolean> {
  const { version } = update;

  if (existsSync(join(versionDir(version), 'metadata.json'))) {
    log(`${version} já está no catálogo — nada a fazer`);
    return true;
  }

  /* ------------------------------ patch note ------------------------------ */

  const patchPath = join(PATCHES, `${version}.json`);

  if (existsSync(patchPath)) {
    log(`${version}: patch note já baixado`);
  } else if (options.dryRun) {
    log(`${version}: baixaria o patch note de ${update.url}`);
  } else {
    const note = await fetchPatchNote(version, update.url);
    // A data vem da página de novidades: o artigo nem sempre a declara em
    // formato de máquina, e o cartão da listagem sempre traz.
    writeJson(patchPath, { ...note, publishedAt: note.publishedAt ?? update.publishedAt });
    log(`${version}: patch note guardado`, { caracteres: note.rawContent.length });
  }

  if (options.dryRun && !existsSync(patchPath)) {
    log(`${version}: sem patch note local, a leitura não pode ser simulada`);
    return true;
  }

  /* -------------------------------- leitura -------------------------------- */

  /*
   * O registro de patch vem antes da leitura, e não depois.
   *
   * Ele é o que diz a categoria de cada linha e quais armas ela nomeia — e é
   * disso que o parser precisa para não largar uma frase como "The Match
   * Trigger attachment no longer affects fully automatic fire on the BROD and
   * EF88", que não tem número, não tem "removed" e não cita campo nenhum que
   * ele reconheça. Sem esta atualização, ele lê o registro da execução
   * anterior; sem arquivo nenhum, lê só o texto da EA, como sempre leu.
   *
   * Falhar aqui não derruba a versão. É fonte de terceiro, e a oficial já está
   * baixada — o que se perde é a conferência, não o patch.
   */
  if (!options.dryRun && !run('fetch-balance-log.ts').ok) {
    log(`${version}: o registro de patch não pôde ser lido — vale o texto da EA sozinho`);
  }

  const note = readJson<PatchNote>(patchPath);
  const changes = parseNote(note, knownEntities(), registroDe(version));
  const summary = summarize(changes);

  log(`${version}: mudanças reconhecidas`, summary);
  for (const change of changes) {
    const mark = change.automation === 'auto' ? '🟢' : change.automation === 'review' ? '🟡' : '🔴';
    log(`  ${mark} ${change.kind}`, change.entityId ?? change.weaponIds?.join(', ') ?? '—');
  }

  if (options.dryRun) {
    log(`${version}: nenhum arquivo foi modificado (--dry-run)`);
    return true;
  }

  if (!run('parse-patch-note.ts', [version]).ok) {
    console.error(`${version}: o patch note não pôde ser lido — catálogo intacto`);
    return false;
  }

  /* ------------------------------ conciliação ------------------------------ */

  if (!run('reconcile.ts', [version]).ok) {
    console.error(`${version}: conciliação falhou`);
    return false;
  }

  /* --------------------------- números da simulação --------------------------- */

  /*
   * A conciliação herda curva de dano, velocidade e recuo da versão anterior,
   * porque o patch note não os publica: a EA escreve "limb damage multipliers
   * have been adjusted" e não diz de quanto para quanto. Quem diz é o dataset
   * da comunidade, quando ele alcança o patch — e é isto aqui que vai perguntar,
   * a cada execução, se ele já alcançou.
   *
   * Nada disso é obrigatório. Sem rede, com o dataset atrasado ou com o
   * repositório fora do ar, o passo não escreve nada e a versão segue com os
   * números herdados, que é o estado anterior e não uma perda. O que muda é que,
   * no dia em que a fonte publicar, o `diff` mostra o número exato no Pull
   * Request em vez de repetir a frase do patch note.
   */
  if (run('fetch-github-data.ts').ok) {
    if (!run('import-analyzer.ts').ok) {
      log(`${version}: a importação dos números falhou — eles seguem herdados`);
    }

    /*
     * A compatibilidade de ergonomia é passo próprio, e roda mesmo quando a
     * importação dos números não roda.
     *
     * As duas travas são diferentes de propósito: número velho sobrescrevendo
     * número novo é regressão, e por isso o `import-analyzer` para quando o
     * dataset está atrasado; "que armas aceitam Gatilho" não regride com o
     * patch, e segurar isso pela mesma trava deixaria treze peças sem arma por
     * tempo indeterminado. Ver `import-analyzer-compat.ts`.
     */
    if (!run('import-analyzer-compat.ts').ok) {
      log(`${version}: a ergonomia não pôde ser ligada às armas — segue como pendência`);
    }
  } else {
    log(`${version}: o dataset da comunidade não pôde ser lido — números herdados`);
  }

  if (!run('generate-indexes.ts').ok) return false;
  if (!run('validate.ts').ok) {
    console.error(`${version}: o catálogo gerado não passou na validação`);
    return false;
  }

  const previous = readJson<{ previousVersion: string | null }>(
    join(versionDir(version), 'metadata.json'),
  ).previousVersion;

  if (previous) run('diff.ts', [previous, version]);

  if (!run('build.ts').ok) return false;
  run('coverage.ts');

  log(`${version}: pronto`, summary);
  return true;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  let updates: DiscoveredUpdate[];

  if (options.version) {
    /*
     * Versão na mão: quem pediu sabe que ela existe, e não se consulta a EA
     * para confirmar isso.
     *
     * O que se consulta é o endereço. A EA pendura o mesmo Game Update ora em
     * `battlefield-6`, ora em `redsec` — a 1.4.2.5 saiu na segunda —, e o
     * endereço montado aqui só chega lá porque hoje há redirecionamento. Se a
     * página de novidades anunciar a versão, o endereço dela é o que vale; o
     * montado fica de reserva, para quando a listagem estiver fora do ar ou a
     * versão ainda não tiver aparecido nela.
     */
    const built = `https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-game-update-${options.version.replace(/\./g, '-')}`;
    let announced: DiscoveredUpdate | undefined;

    try {
      announced = (await discover()).published.find((u) => u.version === options.version);
    } catch (error) {
      log('a página de novidades não respondeu — seguindo com o endereço padrão', {
        erro: error instanceof Error ? error.message : String(error),
      });
    }

    updates = [
      announced ?? { version: options.version, url: built, title: null, publishedAt: null },
    ];
    log(`${options.version}: patch note em`, updates[0].url);
  } else {
    const found = await discover();
    updates = found.updates;

    log('versões no catálogo', found.known);
    log('publicadas pela EA', found.published.map((u) => u.version));

    if (!updates.length) {
      log('nenhuma versão nova — nada a fazer');
      if (options.json) console.log(JSON.stringify({ updates: [] }));
      return;
    }
  }

  log('a processar', updates.map((u) => u.version));

  /*
   * Em ordem, e parando no primeiro erro.
   *
   * Cada versão parte do estado deixada pela anterior. Processar 1.4.2.1 depois
   * de 1.4.2.0 ter falhado produziria um instantâneo apoiado num estado que
   * ninguém revisou.
   */
  for (const update of updates) {
    const ok = await processVersion(update, options);
    if (!ok) {
      console.error(`pipeline interrompido em ${update.version}`);
      process.exit(1);
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ updates: updates.map((u) => u.version) }));
  }
}

if (process.argv[1] && process.argv[1].endsWith('update.ts')) await main();
