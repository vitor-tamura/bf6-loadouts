#!/usr/bin/env node
/**
 * O que mudou de uma versão para a outra.
 *
 *   npm run catalog:diff -- 1.4.0.0 1.4.1.0
 *
 * Compara dois instantâneos e escreve o resultado em `data/diffs/`. É o que vai
 * no corpo do Pull Request: quem revisa não lê 2376 linhas de compatibilidade
 * para descobrir que um patch mexeu em três, e sem um resumo confiável a
 * revisão vira aprovação no escuro — que é o mesmo que não revisar.
 *
 * O diff não altera nada. Ele lê dois diretórios e escreve um terceiro arquivo,
 * então pode rodar quantas vezes for preciso, inclusive sobre versões antigas,
 * para reconstruir a história de uma arma específica.
 */

import { join } from 'node:path';
import { DIFFS, NOW, log, writeJson } from './lib/io.ts';
import {
  compatibility,
  effects,
  hasVersion,
  metadata,
  stats,
  versionAttachments,
  versionWeapons,
} from './lib/store.ts';

interface Change {
  id: string;
  field?: string;
  from?: unknown;
  to?: unknown;
}

interface EntityDiff {
  added: string[];
  removed: string[];
  renamed: Change[];
}

/** Entidades que entraram, saíram e foram renomeadas entre dois instantâneos. */
function diffEntities(
  before: { id: string; name: string; status: string }[],
  after: { id: string; name: string; status: string }[],
): EntityDiff {
  const previous = new Map(before.map((entity) => [entity.id, entity]));
  const next = new Map(after.map((entity) => [entity.id, entity]));

  const added = [...next.keys()].filter((id) => !previous.has(id)).sort();
  const removed = [...previous.keys()].filter((id) => !next.has(id)).sort();

  const renamed: Change[] = [];
  for (const [id, entity] of next) {
    const old = previous.get(id);
    if (old && old.name !== entity.name) {
      renamed.push({ id, field: 'name', from: old.name, to: entity.name });
    }
  }

  return { added, removed, renamed: renamed.sort((a, b) => a.id.localeCompare(b.id)) };
}

const relationKey = (row: { weaponId: string; attachmentId: string }) =>
  `${row.weaponId}|${row.attachmentId}`;

export function diffVersions(from: string, to: string) {
  for (const version of [from, to]) {
    if (!hasVersion(version)) throw new Error(`versão ${version} não existe em data/versions`);
  }

  const weapons = diffEntities(versionWeapons(from), versionWeapons(to));
  const attachments = diffEntities(versionAttachments(from), versionAttachments(to));

  /*
   * Só relação ativa conta como relação.
   *
   * Uma linha que passou de `active` para `needs_review` aparece aqui como
   * removida, e é o que se quer: do ponto de vista de quem monta a arma, a peça
   * deixou de estar disponível — o motivo está no arquivo da versão.
   */
  const before = new Map(
    compatibility(from)
      .filter((row) => row.status === 'active')
      .map((row) => [relationKey(row), row]),
  );
  const after = new Map(
    compatibility(to)
      .filter((row) => row.status === 'active')
      .map((row) => [relationKey(row), row]),
  );

  const compatibilityAdded = [...after.keys()].filter((key) => !before.has(key)).sort();
  const compatibilityRemoved = [...before.keys()].filter((key) => !after.has(key)).sort();

  /* ------------------------------ estatísticas ------------------------------ */

  const statsBefore = new Map(stats(from).map((entry) => [entry.weaponId, entry.stats]));
  const statChanges: Change[] = [];

  for (const entry of stats(to)) {
    const old = statsBefore.get(entry.weaponId);
    if (!old) continue;

    for (const [field, value] of Object.entries(entry.stats)) {
      if (old[field] !== value) {
        statChanges.push({ id: entry.weaponId, field, from: old[field] ?? null, to: value });
      }
    }
  }

  /* -------------------------------- efeitos -------------------------------- */

  const effectsBefore = new Map(effects(from).map((entry) => [entry.attachmentId, entry]));
  const effectChanges: Change[] = [];
  const costChanges: Change[] = [];

  for (const entry of effects(to)) {
    const old = effectsBefore.get(entry.attachmentId);
    if (!old) continue;

    if (old.cost !== entry.cost) {
      costChanges.push({ id: entry.attachmentId, field: 'cost', from: old.cost, to: entry.cost });
    }
    if (JSON.stringify(old.effects) !== JSON.stringify(entry.effects)) {
      effectChanges.push({
        id: entry.attachmentId,
        field: 'effects',
        from: old.effects,
        to: entry.effects,
      });
    }
  }

  return {
    from,
    to,
    generatedAt: NOW,
    weapons,
    attachments,
    compatibility: { added: compatibilityAdded, removed: compatibilityRemoved },
    stats: statChanges.sort((a, b) => a.id.localeCompare(b.id)),
    effects: effectChanges.sort((a, b) => a.id.localeCompare(b.id)),
    costs: costChanges.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** O resumo em texto, do jeito que ele aparece no corpo do Pull Request. */
export function summarize(diff: ReturnType<typeof diffVersions>): string {
  const line = (label: string, added: number, removed: number, changed?: number) =>
    `${label}:\n+ ${added}\n- ${removed}${changed === undefined ? '' : `\n~ ${changed}`}`;

  return [
    line('Weapons', diff.weapons.added.length, diff.weapons.removed.length, diff.weapons.renamed.length),
    line(
      'Attachments',
      diff.attachments.added.length,
      diff.attachments.removed.length,
      diff.attachments.renamed.length,
    ),
    line('Compatibility', diff.compatibility.added.length, diff.compatibility.removed.length),
    `Stats:\n~ ${diff.stats.length}`,
    `Effects:\n~ ${diff.effects.length}`,
    `Costs:\n~ ${diff.costs.length}`,
  ].join('\n\n');
}

function main(): void {
  const [from, to] = process.argv.slice(2);

  if (!from || !to) {
    console.error('uso: npm run catalog:diff -- <versão anterior> <versão nova>');
    process.exit(1);
  }

  const diff = diffVersions(from, to);
  const path = join(DIFFS, `${from}-to-${to}.json`);
  writeJson(path, diff);

  console.log(summarize(diff));
  log('diff', {
    de: from,
    para: to,
    arquivo: path.replace(`${process.cwd()}/`, ''),
    anterior: metadata(from).label,
  });
}

// Rodar `diff.ts` pela linha de comando escreve o arquivo; importá-lo, não.
// `reconcile` e os testes usam `diffVersions` sem produzir efeito no disco.
if (process.argv[1] && process.argv[1].endsWith('diff.ts')) main();
