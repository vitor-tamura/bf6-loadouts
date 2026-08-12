/**
 * A construção dos índices, separada do script que os escreve.
 *
 * O `validate` precisa recalcular os índices para conferir se os que estão no
 * disco batem com a compatibilidade, e o `build` precisa deles para montar o
 * artefato. Se essa conta morasse dentro do script executável, importá-la
 * dispararia a escrita dos arquivos como efeito colateral — conferir viraria
 * sobrescrever, e a checagem passaria sempre.
 */

import type { CatalogIndexes } from '../../../src/catalog/catalog.types.ts';
import { NOW } from './io.ts';
import { compatibility } from './store.ts';

const unique = (values: string[]) => [...new Set(values)].sort();

const sortMap = (map: Record<string, string[]>) =>
  Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((key) => [key, unique(map[key])]),
  );

/**
 * Só relação `active` entra.
 *
 * A `removed` é história — fica no arquivo da versão, para o diff enxergar — e
 * a `needs_review` é pendência. Nenhuma das duas descreve o que a arma aceita
 * hoje, que é a única pergunta que estes mapas respondem.
 */
export function buildIndexes(version: string, generatedAt: string = NOW): CatalogIndexes {
  const rows = compatibility(version).filter((row) => row.status === 'active');

  const attachmentsByWeapon: Record<string, string[]> = {};
  const weaponsByAttachment: Record<string, string[]> = {};
  const attachmentsByWeaponSlot: Record<string, Record<string, string[]>> = {};

  for (const row of rows) {
    (attachmentsByWeapon[row.weaponId] ??= []).push(row.attachmentId);
    (weaponsByAttachment[row.attachmentId] ??= []).push(row.weaponId);

    const slots = (attachmentsByWeaponSlot[row.weaponId] ??= {});
    (slots[row.slot] ??= []).push(row.attachmentId);
  }

  return {
    gameVersion: version,
    generatedAt,
    attachmentsByWeapon: sortMap(attachmentsByWeapon),
    weaponsByAttachment: sortMap(weaponsByAttachment),
    attachmentsByWeaponSlot: Object.fromEntries(
      Object.keys(attachmentsByWeaponSlot)
        .sort()
        .map((weaponId) => [weaponId, sortMap(attachmentsByWeaponSlot[weaponId])]),
    ),
  };
}
