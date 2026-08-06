#!/usr/bin/env node
/**
 * Sincroniza o dataset com o catálogo público, sem atropelar a curadoria.
 *
 *   node scripts/sync.mjs              relatório, não escreve nothing
 *   node scripts/sync.mjs --apply    grava o que dá para gravar
 *   node scripts/sync.mjs --record  adota o estado atual como base
 *
 * ## Por que não é só "baixar e sobrescrever"
 *
 * Parte dos números do dataset foi corrigida à mão — escadas de damage medidas no
 * jogo, valores que a fonte errou, traduções. Sobrescrever tudo a cada
 * atualização desfaria esse trabalho em silêncio, e ninguém perceberia até
 * alguém reclamar que o TTK está errado.
 *
 * A saída é compare **três** valores por field:
 *
 * | fonte mudou? | local mudou? | o que acontece |
 * | --- | --- | --- |
 * | não | — | nothing a fazer |
 * | sim | não | atualiza: ninguém tinha opinião sobre esse field |
 * | sim | sim | conflict: relata e **não toca** |
 * | — | sim | curadoria local, preservada |
 *
 * O "local mudou?" sai da comparação com `sync-snapshot.json`, que guarda o que
 * a fonte dizia na última sincronização. Sem ele não há como distinguir um
 * número curado de um número que simplesmente ainda não foi atualizado — por
 * isso a primeira execução só registra a base, sem escrever no dataset.
 *
 * Item novo entra inteiro, marcado para tradução. Item que sumiu da fonte é
 * relatado e mantido: weapon removida do jogo é rara, e apagá-la quebraria todo
 * link compartilhado que a use.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { externalCatalog } from './sync/source.mjs';
import { DataFile, damageLadder, idList, number } from './sync/data-file.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'scripts', 'sync-snapshot.json');
const WEAPONS_FILE = join(ROOT, 'src', 'data', 'weapons.ts');
const ATTACHMENTS_FILE = join(ROOT, 'src', 'data', 'attachments.ts');

/** Campos de arma que a fonte governa, com o formato de cada um. */
const WEAPON_FIELDS = [
  { field: 'rpm', format: (v) => number(v, 0) },
  { field: 'velocity', format: (v) => number(v, 0) },
  { field: 'magazine', format: (v) => number(v, 0) },
  { field: 'reload', format: (v) => number(v, 2) },
  { field: 'emptyReload', format: (v) => number(v, 2) },
  { field: 'adsMs', format: (v) => number(v, 0) },
  { field: 'accuracy', format: (v) => number(v, 0) },
  { field: 'control', format: (v) => number(v, 0) },
  { field: 'mobility', format: (v) => number(v, 0) },
  { field: 'hipfire', format: (v) => number(v, 0) },
  // A damageLadder é lida como objeto e escrita como par; compare exige um format só.
  {
    field: 'damage',
    format: damageLadder,
    compare: (v) =>
      JSON.stringify(
        (v ?? []).map((d) => (Array.isArray(d) ? d : [d.damage, d.distance]).map((n) => Number(n.toFixed(2)))),
      ),
  },
];

const ATTACHMENT_FIELDS = [
  { field: 'cost', format: (v) => number(v, 0) },
];

const paint = {
  title: (t) => `\x1b[1m${t}\x1b[0m`,
  added: (t) => `\x1b[32m${t}\x1b[0m`,
  muda: (t) => `\x1b[36m${t}\x1b[0m`,
  conflict: (t) => `\x1b[33m${t}\x1b[0m`,
  some: (t) => `\x1b[31m${t}\x1b[0m`,
};

function asText(value, compare) {
  return compare ? compare(value) : String(value);
}

/**
 * Classifica um campo. `base` é o que a fonte dizia na última sincronização.
 */
function classify(local, incoming, base, compare) {
  if (incoming == null) return { action: 'ignore' };
  const f = asText(incoming, compare);
  const l = asText(local, compare);
  const b = base === undefined ? null : asText(base, compare);

  if (b !== null && f === b) return { action: 'ignore' };
  if (f === l) return { action: 'ignore' };
  if (b === null) return { action: 'conflict', reason: 'sem base' };
  if (l === b) return { action: 'update' };
  return { action: 'conflict', reason: 'curado localmente' };
}

/** Bloco de arma nova, com o que a fonte sabe e o resto marcado para revisão. */
function weaponBlock(weapon) {
  return `  {
    id: '${weapon.id}',
    name: '${weapon.name.replace(/'/g, "\\'")}',
    category: '${weapon.category ?? 'ar'}',
    archetype: 'ar-nato',
    summary: 'TODO: descrever em português.',
    damage: ${weapon.damage ? damageLadder(weapon.damage) : '[[25, 0]]'},
    rpm: ${number(weapon.rpm ?? 600, 0)},
    velocity: ${number(weapon.velocity ?? 700, 0)},
    drag: 1.0,
    headshot: 1.5,
    magazine: ${number(weapon.magazine ?? 30, 0)},
    reload: ${number(weapon.reload ?? 2.5, 2)},
    emptyReload: ${number(weapon.emptyReload ?? 3.2, 2)},
    adsMs: ${number(weapon.adsMs ?? 300, 0)},
    swapMs: 600,
    accuracy: ${number(weapon.accuracy ?? 50, 0)},
    control: ${number(weapon.control ?? 50, 0)},
    mobility: ${number(weapon.mobility ?? 50, 0)},
    hipfire: ${number(weapon.hipfire ?? 40, 0)},
    verticalRecoil: 0.7,
    horizontalRecoil: 0.4,
    fireModes: ['auto'],
    provenance: 'game',
  },
`;
}

function attachmentBlock(acessorio) {
  return `  {
    id: '${acessorio.id}',
    name: 'TODO: traduzir',
    originalName: '${acessorio.originalName.replace(/'/g, "\\'")}',
    slot: '${acessorio.slot}',
    cost: ${number(acessorio.cost ?? 0, 0)},
    description: 'TODO: descrever em português.',
    mods: {},
    compat: { weapons: ${idList(acessorio.weapons)} },
    provenance: 'game',
  },
`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const record = process.argv.includes('--record');

  const [{ WEAPONS }, { ATTACHMENTS }] = await Promise.all([
    import('../src/data/weapons.ts'),
    import('../src/data/attachments.ts'),
  ]);
  const catalog = await externalCatalog();

  const base = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null;
  if (!base) {
    console.log(
      'Sem base de comparação: esta execução apenas registra o que a fonte diz hoje.\n' +
        'A partir da próxima, o script consegue distinguir número curado de número desatualizado.\n',
    );
  }

  const localWeapons = new Map(WEAPONS.map((w) => [w.id, w]));
  const localAttachments = new Map(ATTACHMENTS.map((a) => [a.id, a]));
  /*
   * O mesmo acessório pode viver em outro slot aqui — os lasers, por exemplo,
   * que a fonte trata como acoplamento e o jogo mostra na lateral. O nome
   * original é o que identifica a peça de verdade, então ele serve de segunda
   * chave: sem isso, cada peça reclassificada voltaria como "novidade".
   */
  const byOriginalName = new Map(ATTACHMENTS.map((a) => [a.originalName.toLowerCase(), a]));

  const report = { update: [], conflict: [], added: [], gone: [] };

  // ------------------------------------------------------------------ weapons
  const weaponsFile = new DataFile(WEAPONS_FILE);
  let newWeapons = 0;

  for (const [id, incoming] of catalog.weapons) {
    const local = localWeapons.get(id);
    if (!local) {
      report.added.push(`arma ${id} — ${incoming.name}`);
      if (apply) {
        weaponsFile.append(weaponBlock(incoming));
        newWeapons++;
      }
      continue;
    }

    for (const { field, format, compare } of WEAPON_FIELDS) {
      const { action, reason } = classify(local[field], incoming[field], base?.weapons?.[id]?.[field], compare);
      if (action === 'update') {
        report.update.push(
          `arma ${id}.${field}: ${asText(local[field], compare)} → ${asText(incoming[field], compare)}`,
        );
        if (apply) weaponsFile.setField(id, field, format(incoming[field]));
      } else if (action === 'conflict') {
        report.conflict.push(
          `arma ${id}.${field}: local ${asText(local[field], compare)} · source ${asText(incoming[field], compare)} (${reason})`,
        );
      }
    }
  }

  /*
   * Corpo a corpo nunca esteve na fonte — ela só cataloga arma de fogo. O que
   * sobra aqui é conteúdo recente que a fonte ainda não cadastrou, e vale
   * saber: é o inverso do fluxo normal, este projeto na frente dela.
   */
  for (const [id, local] of localWeapons) {
    if (!catalog.weapons.has(id) && local.category !== 'melee') report.gone.push(`arma ${id}`);
  }

  // ------------------------------------------------------------- acessórios
  const attachmentsFile = new DataFile(ATTACHMENTS_FILE);
  let newAttachments = 0;

  for (const [sourceId, incoming] of catalog.attachments) {
    const local = localAttachments.get(sourceId) ?? byOriginalName.get(incoming.originalName.toLowerCase());
    const id = local?.id ?? sourceId;
    if (!local) {
      report.added.push(`acessório ${id} — ${incoming.originalName}`);
      if (apply) {
        attachmentsFile.append(attachmentBlock(incoming));
        newAttachments++;
      }
      continue;
    }

    for (const { field, format } of ATTACHMENT_FIELDS) {
      const { action, reason } = classify(local[field], incoming[field], base?.attachments?.[id]?.[field]);
      if (action === 'update') {
        report.update.push(`acessório ${id}.${field}: ${local[field]} → ${incoming[field]}`);
        if (apply) attachmentsFile.setField(id, field, format(incoming[field]));
      } else if (action === 'conflict') {
        report.conflict.push(
          `acessório ${id}.${field}: local ${local[field]} · source ${incoming[field]} (${reason})`,
        );
      }
    }

    /*
     * Compatibilidade, pela mesma regra de três vias — e aqui ela importa mais
     * que em qualquer outro campo. A lista local não é a da fonte: ela passou
     * pelo filtro por categoria da planilha do Gunsmith (mira de sniper precisa
     * de 2,5× para cima, escopeta não aceita supressor). Comparar direto com a
     * source proporia desfazer esse filtro inteiro, toda vez.
     *
     * O que interessa é o que a fonte **mudou** desde a última sincronização.
     */
    const inBase = base?.attachments?.[sourceId]?.weapons;
    if (inBase) {
      const before = new Set(inBase);
      const localOnes = new Set(local.compat?.weapons ?? []);
      const gained = incoming.weapons.filter((w) => !before.has(w) && !localOnes.has(w) && localWeapons.has(w));
      const lost = [...localOnes].filter((w) => before.has(w) && !incoming.weapons.includes(w));

      if (gained.length > 0 || lost.length > 0) {
        const change = [gained.length ? `+ ${gained.join(', ')}` : '', lost.length ? `− ${lost.join(', ')}` : '']
          .filter(Boolean)
          .join(' · ');
        report.update.push(`acessório ${id}.compat: ${change}`);
        if (apply) {
          const list = [...localOnes, ...gained].filter((w) => !lost.includes(w)).sort();
          attachmentsFile.setField(id, 'compat', `{ weapons: ${idList(list)} }`);
        }
      }
    }
  }

  // ------------------------------------------------------------- relatório
  const sections = [
    ['Novidades', report.added, paint.added],
    ['Estatísticas a update', report.update, paint.muda],
    ['Conflitos — resolver à mão', report.conflict, paint.conflict],
    ['Sumiram da fonte — mantidos', report.gone, paint.some],
  ];

  for (const [title, items, paintIt] of sections) {
    if (items.length === 0) continue;
    console.log(paint.title(`\n${title} · ${items.length}`));

    /*
     * Na primeira execução tudo que difere vira "conflito por falta de base", e
     * listar centenas de lines esconderia o que importa. O número basta: ele é
     * a distância entre este dataset e a source, e ela é grande de propósito.
     */
    if (!base && title.startsWith('Conflitos')) {
      console.log(
        `  ${paintIt(`${items.length} campos diferem da fonte e ficam como estão.`)}\n` +
          '  Boa parte é curadoria deliberada — damage medido no jogo, valores corrigidos à mão.\n' +
          '  A partir da próxima execução, só aparece aqui o que a fonte mudar de verdade.',
      );
      continue;
    }

    for (const item of items.slice(0, 40)) console.log(`  ${paintIt(item)}`);
    if (items.length > 40) console.log(`  … e mais ${items.length - 40}`);
  }

  if (apply) {
    const wroteWeapons = weaponsFile.save({ expectedItems: WEAPONS.length + newWeapons });
    const wroteAttachments = attachmentsFile.save({
      expectedItems: ATTACHMENTS.length + newAttachments,
    });
    console.log(
      paint.title('\nGravado') +
        `\n  weapons.ts     ${wroteWeapons ? `${weaponsFile.changes.length} alterações` : 'sem mudança'}` +
        `\n  attachments.ts ${wroteAttachments ? `${attachmentsFile.changes.length} alterações` : 'sem mudança'}`,
    );
    if (report.added.length > 0) {
      console.log(
        paint.conflict('\n  Itens novos entraram com campos marcados TODO — traduza before de publicar.'),
      );
    }
  }

  if (apply || record || !base) {
    writeFileSync(
      SNAPSHOT,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString().slice(0, 10),
          weapons: Object.fromEntries(catalog.weapons),
          attachments: Object.fromEntries(catalog.attachments),
        },
        null,
        1,
      ) + '\n',
      'utf8',
    );
    console.log('\nBase de comparação registrada em scripts/sync-snapshot.json');
  }

  const nothing = Object.values(report).every((list) => list.length === 0);
  if (nothing) console.log('\nO dataset está em dia com a fonte.');
  else if (!apply) console.log('\nNada foi gravado. Rode com --apply para escrever.');

  // Conflito não é erro: é trabalho humano pendente, e o CI deve seguir.
  return 0;
}

main().then((code) => process.exit(code));
