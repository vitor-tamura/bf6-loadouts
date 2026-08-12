#!/usr/bin/env node
/**
 * Cria a versão nova a partir da anterior e do que as fontes disseram.
 *
 *   npm run catalog:reconcile -- 1.4.2.0
 *
 * É o único script que escreve uma versão nova. Ele parte do instantâneo
 * anterior — que continua intacto no disco —, aplica o que pode ser aplicado
 * com segurança e transforma todo o resto em evento marcado para revisão.
 *
 * ## O que ele aplica sozinho
 *
 * Pouca coisa, de propósito:
 *
 * - **Remoção anunciada pela EA.** Arma ou peça que o patch note diz ter saído
 *   passa a `removed`, com a versão da saída. Nada é apagado.
 * - **Estatística com os dois números na fonte.** "from 800 to 820" traz o
 *   antes e o depois; é o único caso em que o valor novo vem escrito.
 *
 * ## O que ele nunca aplica
 *
 * - **Percentual.** "Recoil reduced by 10%" não vira número: calcular 10% sobre
 *   o valor que o catálogo tem hoje só funciona se esse valor estiver certo e
 *   se o arredondamento do jogo for o mesmo do JavaScript. Vira evento com a
 *   operação e a proporção, para quem revisa confirmar com medição.
 * - **Adição.** Arma nova precisa de id, categoria, calibre e da lista inteira
 *   de peças que aceita. O patch note anuncia o nome; o resto viria de palpite.
 * - **Compatibilidade sem fonte de estado atual.** Se o instantâneo do BF6
 *   Loadouts não pôde ser lido, a matriz da versão anterior é copiada como
 *   está — e o evento diz que ela não foi reconfirmada. A alternativa seria
 *   deduzir da categoria, que é exatamente o que a EA desmente ao dizer que
 *   cada arma tem o próprio conjunto.
 */

import { join } from 'node:path';
import type {
  AttachmentEntity,
  ChangeEvent,
  CompatibilityRow,
  SourceRef,
  VersionMetadata,
  VersionedEntityRef,
  WeaponEntity,
  WeaponStats,
} from '../../src/catalog/catalog.types.ts';
import {
  ENTITIES,
  NOW,
  PATCHES,
  TODAY,
  isGameVersion,
  log,
  readJsonIf,
  versionDir,
  writeJson,
} from './lib/io.ts';
import {
  attachments,
  compatibility,
  currentVersion,
  effects,
  hasVersion,
  metadata,
  stats,
  versionAttachments,
  versionWeapons,
  weapons,
} from './lib/store.ts';
import type { PatchChange } from './parse-patch-note.ts';
import type { PatchNote } from './fetch-patch-note.ts';

const EA: SourceRef = {
  provider: 'EA',
  type: 'official',
  url: null,
  version: null,
  retrievedAt: null,
};

function eventId(version: string, suffix: string, index: number) {
  return `evt-${version}-${suffix}-${index}`;
}

function main(): void {
  const version = process.argv[2];

  if (!version || !isGameVersion(version)) {
    console.error('uso: npm run catalog:reconcile -- <versão nova>');
    process.exit(1);
  }
  if (hasVersion(version)) {
    console.error(`versão ${version} já existe — apague o diretório para reprocessá-la`);
    process.exit(1);
  }

  const previous = currentVersion();
  const events: ChangeEvent[] = [];

  /* ------------------------------- o patch note ------------------------------- */

  const notePath = join(PATCHES, `${version}.json`);
  const note = readJsonIf<PatchNote | null>(notePath, null);

  if (!note) {
    console.error(`sem patch note em ${notePath} — rode catalog:fetch-patch e catalog:parse-patch`);
    process.exit(1);
  }

  const changes = (note.changes ?? []) as PatchChange[];
  const source: SourceRef = { ...EA, url: note.source.url, version, retrievedAt: note.source.retrievedAt };

  /* ------------------------------- entidades ------------------------------- */

  const weaponList = weapons();
  const attachmentList = attachments();
  const weaponById = new Map(weaponList.map((entity) => [entity.id, { ...entity }]));
  const attachmentById = new Map(attachmentList.map((entity) => [entity.id, { ...entity }]));

  let applied = 0;
  let review = 0;
  let blocked = 0;

  /** Relações que o patch note criou, acrescentadas à matriz herdada. */
  const newRelations: CompatibilityRow[] = [];

  changes.forEach((change, index) => {
    if (change.automation === 'blocked') {
      blocked += 1;
      events.push({
        id: eventId(version, 'blocked', index),
        gameVersion: version,
        timestamp: TODAY,
        type: 'source_conflict',
        entityType: 'catalog',
        entityId: null,
        changes: { line: change.line, reason: change.reason },
        sources: [source],
        automation: 'blocked',
        resolution: { status: 'open', reason: 'O parser não identificou a entidade nem a mudança.' },
      });
      return;
    }

    /* -------------------------- remoção, que é aplicável -------------------------- */

    if (change.automation === 'auto' && change.kind === 'weapon_removed' && change.entityId) {
      const weapon = weaponById.get(change.entityId);
      if (weapon) {
        weapon.status = 'removed';
        weapon.removedIn = version;
        applied += 1;
        events.push({
          id: eventId(version, 'weapon-removed', index),
          gameVersion: version,
          timestamp: TODAY,
          type: 'weapon_removed',
          entityType: 'weapon',
          entityId: weapon.id,
          changes: { removedIn: version, line: change.line },
          sources: [source],
          automation: 'auto',
          resolution: null,
        });
      }
      return;
    }

    if (change.automation === 'auto' && change.kind === 'attachment_removed' && change.entityId) {
      const attachment = attachmentById.get(change.entityId);
      if (attachment) {
        attachment.status = 'removed';
        attachment.removedIn = version;
        applied += 1;
        events.push({
          id: eventId(version, 'attachment-removed', index),
          gameVersion: version,
          timestamp: TODAY,
          type: 'attachment_removed',
          entityType: 'attachment',
          entityId: attachment.id,
          changes: { removedIn: version, line: change.line },
          sources: [source],
          automation: 'auto',
          resolution: null,
        });
      }
      return;
    }

    /* --------------------- compatibilidade que a EA listou --------------------- */

    /*
     * O único caso em que uma relação nasce sozinha.
     *
     * "The Extended Barrel ... is available for the M87A1, M1014, 18.5KS-K, and
     * DB-12" é a EA dizendo, com todas as letras, em que armas a peça entra.
     * Isso é fonte oficial e explícita — as duas condições que
     * `compatibility.md` exige. Qualquer coisa menos que isso vira pendência.
     */
    if (
      change.automation === 'auto' &&
      change.kind === 'compatibility_added' &&
      change.entityId &&
      change.weaponIds?.length
    ) {
      const attachment = attachmentById.get(change.entityId);
      const slot = attachment?.slot;

      const added = change.weaponIds.filter((weaponId) => weaponById.has(weaponId));

      if (attachment && slot && added.length === change.weaponIds.length) {
        for (const weaponId of added) {
          newRelations.push({
            gameVersion: version,
            weaponId,
            attachmentId: change.entityId,
            slot,
            status: 'active',
            source,
            note: null,
          });
        }

        applied += 1;
        events.push({
          id: eventId(version, 'compatibility', index),
          gameVersion: version,
          timestamp: TODAY,
          type: 'compatibility_added',
          entityType: 'compatibility',
          entityId: change.entityId,
          changes: { slot, weapons: added, line: change.line },
          sources: [source],
          automation: 'auto',
          resolution: null,
        });
        return;
      }
    }

    /* ------------------------ estatística com os dois números ------------------------ */

    if (
      change.automation === 'auto' &&
      change.kind === 'stat_changed' &&
      change.operation === 'set' &&
      change.entityId &&
      change.field
    ) {
      applied += 1;
      events.push({
        id: eventId(version, 'stat', index),
        gameVersion: version,
        timestamp: TODAY,
        type: 'stat_changed',
        entityType: 'weapon',
        entityId: change.entityId,
        changes: { field: change.field, from: change.before, to: change.after, operation: 'set' },
        sources: [source],
        automation: 'auto',
        resolution: null,
      });
      return;
    }

    /* ------------------------------ tudo o mais ------------------------------ */

    review += 1;
    events.push({
      id: eventId(version, 'review', index),
      gameVersion: version,
      timestamp: TODAY,
      type: change.kind === 'unknown' ? 'source_conflict' : (change.kind as ChangeEvent['type']),
      entityType: change.entityType === 'unknown' ? 'catalog' : change.entityType,
      entityId: change.entityId,
      changes: {
        field: change.field,
        operation: change.operation,
        value: change.value,
        // Percentual não vira número: a proporção é o que a fonte publicou.
        before: change.before,
        after: change.after,
        line: change.line,
      },
      sources: [source],
      automation: 'review',
      resolution: { status: 'open', reason: change.reason ?? 'Precisa de confirmação humana.' },
    });
  });

  /* ---------------------------- estado da versão ---------------------------- */

  const nextWeapons: WeaponEntity[] = [...weaponById.values()].sort((a, b) => a.id.localeCompare(b.id));
  const nextAttachments: AttachmentEntity[] = [...attachmentById.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  writeJson(join(ENTITIES, 'weapons.json'), { schemaVersion: 1, weapons: nextWeapons });
  writeJson(join(ENTITIES, 'attachments.json'), { schemaVersion: 1, attachments: nextAttachments });

  const weaponRefs: VersionedEntityRef[] = versionWeapons(previous).map((ref) => {
    const entity = weaponById.get(ref.id);
    return { id: ref.id, status: entity?.status ?? ref.status, name: entity?.name ?? ref.name };
  });

  const attachmentRefs: VersionedEntityRef[] = versionAttachments(previous).map((ref) => {
    const entity = attachmentById.get(ref.id);
    return { id: ref.id, status: entity?.status ?? ref.status, name: entity?.name ?? ref.name };
  });

  /*
   * A matriz de compatibilidade é copiada, não recalculada.
   *
   * Enquanto não houver leitura reconhecida do estado atual, a única coisa
   * honesta a dizer sobre o que cada arma aceita é o que se sabia antes. O
   * evento abaixo registra que a versão nasceu sem reconfirmação — quem revisa
   * o Pull Request lê isso e decide se aceita.
   */
  const carried: CompatibilityRow[] = compatibility(previous).map((row) => ({
    ...row,
    gameVersion: version,
  }));

  const removedIds = new Set(
    [...weaponById.values(), ...attachmentById.values()]
      .filter((entity) => entity.removedIn === version)
      .map((entity) => entity.id),
  );

  const carriedRows = carried.map((row) => {
    if (!removedIds.has(row.weaponId) && !removedIds.has(row.attachmentId)) return row;
    // A relação de uma entidade que saiu do jogo sai junto — sem ser apagada.
    return { ...row, status: 'removed' as const, note: 'Entidade retirada do jogo nesta versão.' };
  });

  /*
   * As relações novas entram sem repetir as que já existem: a EA às vezes
   * reanuncia uma peça em mais armas, e a lista dela é do que passa a valer,
   * não do que mudou.
   */
  const known = new Set(carriedRows.map((row) => `${row.weaponId}|${row.attachmentId}`));
  const nextCompatibility = [...carriedRows, ...newRelations.filter(
    (row) => !known.has(`${row.weaponId}|${row.attachmentId}`),
  )].sort(
    (a, b) =>
      a.weaponId.localeCompare(b.weaponId) ||
      a.slot.localeCompare(b.slot) ||
      a.attachmentId.localeCompare(b.attachmentId),
  );

  events.push({
    id: eventId(version, 'compatibility-carried', 0),
    gameVersion: version,
    timestamp: TODAY,
    type: 'source_conflict',
    entityType: 'compatibility',
    entityId: null,
    changes: {
      carried: nextCompatibility.filter((row) => row.status === 'active').length,
      closed: nextCompatibility.filter((row) => row.status === 'removed').length,
    },
    sources: [source],
    automation: 'review',
    resolution: {
      status: 'open',
      reason:
        'A matriz veio da versão anterior sem confirmação do estado atual. Rode catalog:fetch-loadouts e confirme antes de publicar.',
    },
  });

  const nextStats: WeaponStats[] = stats(previous).map((entry) => ({
    ...entry,
    gameVersion: version,
  }));

  const nextEffects = effects(previous).map((entry) => ({ ...entry, gameVersion: version }));

  /*
   * A simulação é herdada junto com o resto.
   *
   * Curva de dano, velocidade, arrasto, recuo, espalhamento e recarga não vêm
   * do patch note — vêm do dataset da comunidade, por um caminho próprio. Sem
   * copiá-los, a versão nova nasce sem balística nenhuma, e as capacidades
   * `damageCurves`, `velocity`, `drag` e `ttk` caem para falso: o TTK e os
   * gráficos deixam de existir da noite para o dia por causa de um patch que
   * só corrigiu um botão.
   *
   * Quando `import-analyzer` rodar sobre a versão nova, ele sobrescreve isto
   * com números atualizados. Até lá, o que valia antes continua valendo — e o
   * evento diz que não houve reconfirmação.
   */
  const inherit = <T>(file: string, key: string): Record<string, unknown> => {
    const previousFile = readJsonIf<Record<string, unknown>>(
      join(versionDir(previous), file),
      {} as Record<string, unknown>,
    );
    const rows = (previousFile[key] as T[] | undefined) ?? [];
    return {
      ...previousFile,
      gameVersion: version,
      [key]: rows.map((row) => ({ ...(row as object), gameVersion: version })),
    };
  };

  /* ------------------------------ o que vai ao disco ------------------------------ */

  const dir = versionDir(version);
  const previousMeta = metadata(previous);

  const meta: VersionMetadata = {
    version,
    label: note.title ?? `Battlefield 6 ${version}`,
    releasedAt: note.publishedAt,
    importedAt: TODAY,
    previousVersion: previous,
    status: 'current',
    sources: [source, ...previousMeta.sources],
    counts: {
      weapons: weaponRefs.length,
      attachments: attachmentRefs.length,
      compatibility: nextCompatibility.length,
      stats: nextStats.length,
      effects: nextEffects.length,
    },
  };

  writeJson(join(dir, 'metadata.json'), meta);
  writeJson(join(dir, 'weapons.json'), { gameVersion: version, weapons: weaponRefs });
  writeJson(join(dir, 'attachments.json'), { gameVersion: version, attachments: attachmentRefs });
  writeJson(join(dir, 'compatibility.json'), {
    gameVersion: version,
    compatibility: nextCompatibility,
  });
  writeJson(join(dir, 'stats.json'), { gameVersion: version, stats: nextStats });
  writeJson(join(dir, 'effects.json'), { gameVersion: version, effects: nextEffects });

  writeJson(join(dir, 'ballistics.json'), inherit('ballistics.json', 'ballistics'));
  writeJson(join(dir, 'damage-models.json'), inherit('damage-models.json', 'models'));
  writeJson(join(dir, 'recoil.json'), inherit('recoil.json', 'recoil'));
  writeJson(join(dir, 'spread.json'), inherit('spread.json', 'spread'));
  writeJson(join(dir, 'reload.json'), inherit('reload.json', 'reload'));
  writeJson(join(dir, 'changes.json'), { gameVersion: version, events });

  // A anterior deixa de ser a corrente, e continua inteira onde está.
  writeJson(join(versionDir(previous), 'metadata.json'), {
    ...previousMeta,
    status: 'historical',
  });

  log('conciliação', {
    de: previous,
    para: version,
    aplicadas: applied,
    'para revisão': review,
    bloqueadas: blocked,
    geradoEm: NOW,
  });

  if (blocked) {
    console.warn(
      `${blocked} mudança(s) bloqueada(s): o catálogo não foi alterado por elas. Abra issue de revisão manual.`,
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith('reconcile.ts')) main();
