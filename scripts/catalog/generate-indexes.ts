#!/usr/bin/env node
/**
 * Os índices de leitura rápida, regerados do zero.
 *
 *   node --experimental-strip-types scripts/catalog/generate-indexes.ts
 *
 * "Que peças esta arma aceita" e "que armas aceitam esta peça" são a mesma
 * pergunta feita dos dois lados, e as duas se respondem varrendo
 * `compatibility.json`. Varrer 2376 linhas a cada clique de tela seria bobagem,
 * então elas viram mapa aqui.
 *
 * O mapa não é fonte de verdade. Este script apaga o que havia e reconstrói
 * inteiro a partir da compatibilidade — índice que se edita à mão vira uma
 * segunda versão dos fatos, e duas versões dos fatos divergem sempre.
 */

import { join } from 'node:path';
import type { VersionsIndex } from '../../src/catalog/catalog.types.ts';
import { INDEXES, listVersions, log, writeJson } from './lib/io.ts';
import { buildIndexes } from './lib/indexes.ts';
import { currentVersion, metadata } from './lib/store.ts';

function versionsIndex(current: string): VersionsIndex {
  return {
    current,
    versions: listVersions().map((version) => {
      const meta = metadata(version);
      return {
        version,
        label: meta.label,
        releasedAt: meta.releasedAt,
        importedAt: meta.importedAt,
        status: meta.status,
      };
    }),
  };
}

function main(): void {
  const version = currentVersion();
  const indexes = buildIndexes(version);

  writeJson(join(INDEXES, 'current.json'), indexes);
  writeJson(join(INDEXES, 'versions.json'), versionsIndex(version));

  log('índices', {
    'versão': version,
    armas: Object.keys(indexes.attachmentsByWeapon).length,
    'acessórios': Object.keys(indexes.weaponsByAttachment).length,
  });
}

main();
