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
import { DIFFS, NOW, log, readJsonIf, versionDir, writeJson } from './lib/io.ts';
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

/**
 * Os arquivos de simulação, que são o único lugar onde o número exato mora.
 *
 * O patch note diz "VSSM limb damage multipliers have been adjusted" e não diz
 * de quanto para quanto — a EA não publica o valor interno. Quem publica é o
 * dataset da comunidade, e o que transforma o texto em número é comparar o
 * instantâneo de antes com o de depois. Sem esta parte, o Pull Request anuncia
 * que algo mudou e não sabe dizer o quê.
 */
const SIMULATION: { file: string; key: string; label: string }[] = [
  { file: 'damage-models.json', key: 'models', label: 'damage' },
  { file: 'ballistics.json', key: 'ballistics', label: 'ballistics' },
  { file: 'recoil.json', key: 'recoil', label: 'recoil' },
  { file: 'spread.json', key: 'spread', label: 'spread' },
  { file: 'reload.json', key: 'reload', label: 'reload' },
];

/**
 * Campos que mudam sem o jogo ter mudado.
 *
 * `source` carrega o instante da importação e `gameVersion` é reescrito em toda
 * conciliação: comparados, acusariam 62 armas alteradas em todo patch e o
 * resumo perderia a serventia.
 */
const NOT_A_CHANGE = new Set(['source', 'gameVersion', 'weaponId']);

/**
 * Um objeto aninhado vira pares `caminho → valor`.
 *
 * `zones.limb` e `drag.coefficient` precisam aparecer com esse nome no diff:
 * quem revisa quer ler "damage.zones.limb: 0,91 → 0,84", e não "zones mudou".
 * A curva de dano é o caso especial — ela é lista, e comparar a lista inteira
 * diria que mudou sem dizer onde. Cada ponto entra pela distância que ele
 * descreve, de modo que o degrau alterado aparece sozinho.
 */
function flatten(value: unknown, prefix: string, into: Record<string, unknown>): void {
  if (value === null || typeof value !== 'object') {
    into[prefix] = value;
    return;
  }

  if (Array.isArray(value)) {
    const curve = value.every(
      (point) => point && typeof point === 'object' && 'distance' in point && 'damage' in point,
    );

    if (!curve) {
      into[prefix] = JSON.stringify(value);
      return;
    }

    for (const point of value as { distance: number; damage: number }[]) {
      into[`${prefix}@${point.distance}m`] = point.damage;
    }
    return;
  }

  for (const [field, inner] of Object.entries(value as Record<string, unknown>)) {
    if (NOT_A_CHANGE.has(field)) continue;
    flatten(inner, prefix ? `${prefix}.${field}` : field, into);
  }
}

/** As linhas de um arquivo de simulação, por arma. */
function simulationRows(version: string, file: string, key: string) {
  const content = readJsonIf<Record<string, unknown>>(join(versionDir(version), file), {});
  const rows = (content[key] as { weaponId?: string }[] | undefined) ?? [];
  return new Map(rows.filter((row) => row.weaponId).map((row) => [row.weaponId!, row]));
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

  /* ------------------------------- simulação ------------------------------- */

  const simulation: Change[] = [];

  for (const { file, key, label } of SIMULATION) {
    const rowsBefore = simulationRows(from, file, key);

    for (const [weaponId, row] of simulationRows(to, file, key)) {
      const old = rowsBefore.get(weaponId);
      if (!old) continue;

      const antes: Record<string, unknown> = {};
      const depois: Record<string, unknown> = {};
      flatten(old, '', antes);
      flatten(row, '', depois);

      for (const [field, value] of Object.entries(depois)) {
        if (antes[field] === value) continue;
        simulation.push({
          id: weaponId,
          field: `${label}.${field}`,
          from: antes[field] ?? null,
          to: value,
        });
      }
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
    simulation: simulation.sort(
      (a, b) => a.id.localeCompare(b.id) || (a.field ?? '').localeCompare(b.field ?? ''),
    ),
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
    `Simulation:\n~ ${diff.simulation.length}`,
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
