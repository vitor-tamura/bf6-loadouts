/**
 * O acesso de leitura ao `data/`, para os scripts do pipeline.
 *
 * Um lugar só para abrir os arquivos: validate, build, diff e reconcile leem os
 * mesmos JSONs, e cada um abrindo à sua maneira era o caminho curto para dois
 * scripts discordarem sobre qual é a versão corrente.
 *
 * A camada que o site usa é outra — `src/catalog` —, e ela lê apenas o artefato
 * gerado. Esta aqui enxerga o repositório inteiro, incluindo histórico, fontes
 * e pendências, que é o que o site não precisa ver.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  AttachmentEffects,
  AttachmentEntity,
  CategoryEntity,
  ChangeEvent,
  CompatibilityRow,
  SlotEntity,
  VersionMetadata,
  VersionedEntityRef,
  WeaponEntity,
  WeaponStats,
} from '../../../src/catalog/catalog.types.ts';
import { ENTITIES, listVersions, readJson, versionDir } from './io.ts';

export const weapons = () =>
  readJson<{ weapons: WeaponEntity[] }>(join(ENTITIES, 'weapons.json')).weapons;

export const attachments = () =>
  readJson<{ attachments: AttachmentEntity[] }>(join(ENTITIES, 'attachments.json')).attachments;

export const categories = () =>
  readJson<{ categories: CategoryEntity[] }>(join(ENTITIES, 'categories.json')).categories;

export const slots = () => readJson<{ slots: SlotEntity[] }>(join(ENTITIES, 'slots.json')).slots;

export const metadata = (version: string) =>
  readJson<VersionMetadata>(join(versionDir(version), 'metadata.json'));

export const compatibility = (version: string) =>
  readJson<{ compatibility: CompatibilityRow[] }>(join(versionDir(version), 'compatibility.json'))
    .compatibility;

export const stats = (version: string) =>
  readJson<{ stats: WeaponStats[] }>(join(versionDir(version), 'stats.json')).stats;

export const effects = (version: string) =>
  readJson<{ effects: AttachmentEffects[] }>(join(versionDir(version), 'effects.json')).effects;

export const changes = (version: string) =>
  readJson<{ events: ChangeEvent[] }>(join(versionDir(version), 'changes.json')).events;

export const versionWeapons = (version: string) =>
  readJson<{ weapons: VersionedEntityRef[] }>(join(versionDir(version), 'weapons.json')).weapons;

export const versionAttachments = (version: string) =>
  readJson<{ attachments: VersionedEntityRef[] }>(join(versionDir(version), 'attachments.json'))
    .attachments;

export const hasVersion = (version: string) =>
  existsSync(join(versionDir(version), 'metadata.json'));

/**
 * Qual versão o catálogo serve hoje.
 *
 * Quem decide é o `status: "current"` do metadata, e não a ordem dos números:
 * uma versão importada mas ainda em revisão existe em `data/versions` sem estar
 * no ar, e é justamente essa diferença que permite preparar um patch em Pull
 * Request sem publicá-lo.
 */
export function currentVersion(): string {
  const all = listVersions();
  if (!all.length) throw new Error('nenhuma versão em data/versions — rode catalog:migrate');

  const current = all.filter((version) => metadata(version).status === 'current');
  if (current.length > 1) {
    throw new Error(`mais de uma versão marcada como current: ${current.join(', ')}`);
  }

  // Sem marcação explícita, a mais recente responde — é o que acontece logo
  // depois de uma importação que ainda não passou pelo build.
  return current[0] ?? all[all.length - 1];
}

/** A versão anterior a uma dada, quando existe. */
export function previousVersion(version: string): string | null {
  const all = listVersions();
  const index = all.indexOf(version);
  return index > 0 ? all[index - 1] : null;
}
