#!/usr/bin/env node
/**
 * O catálogo que o site abre.
 *
 *   npm run catalog:build
 *
 * Junta identidade, estado da versão corrente, efeitos e índices num arquivo só
 * e o escreve em `public/data/catalog.current.json`. É o único arquivo do
 * catálogo que o site conhece: ele não lê patch note, não lê histórico, não lê
 * fonte e não lê conflito — essas camadas existem para o pipeline e para quem
 * revisa, e carregá-las no navegador seria despejar o arquivo de trabalho na
 * casa de quem só quer montar uma arma.
 *
 * Nada aqui é escrito à mão, e a recíproca vale: editar o arquivo gerado é
 * perder a edição no próximo build. O que se corrige é `data/`.
 *
 * ## O que fica de fora
 *
 * Relação `needs_review` não entra. Ela é uma pendência, não um fato — e uma
 * pendência publicada como compatibilidade vira, na tela, uma peça que o jogo
 * não deixa montar. O artefato guarda só a contagem, em `pending`, para a
 * interface poder dizer que há coisa em aberto sem fingir que sabe qual é.
 */

import { join } from 'node:path';
import type {
  BallisticsModel,
  CatalogCapabilities,
  CurrentCatalog,
  DataQuality,
  WeaponBallistics,
  WeaponDamageModel,
  WeaponRecoil,
  WeaponReload,
  WeaponSpread,
} from '../../src/catalog/catalog.types.ts';
import { readJsonIf, versionDir } from './lib/io.ts';
import { NOW, PUBLIC_CATALOG, log, writeJson } from './lib/io.ts';
import { buildIndexes } from './lib/indexes.ts';
import {
  attachments,
  categories,
  compatibility,
  currentVersion,
  effects,
  slots,
  stats,
  versionAttachments,
  versionWeapons,
  weapons,
} from './lib/store.ts';

const SCHEMA_VERSION = 1;

/**
 * As capacidades saem da conferência dos dados, não de uma lista escrita à mão.
 *
 * A regra é a mesma para todas: a capacidade só é verdadeira quando **todos** os
 * registros que ela cobre têm o campo. Meia cobertura fica falsa de propósito —
 * um gráfico que funciona em quarenta armas e falha em vinte e duas é um
 * gráfico quebrado, e a bandeira existe para impedir que ele seja publicado
 * assim.
 */
function capabilities(catalog: {
  weapons: { stats: Record<string, number | null> }[];
  attachments: { slot: string; cost: number | null; effects: Record<string, unknown> }[];
  compatibility: unknown[];
  ballistics: WeaponBallistics[];
  damageModels: WeaponDamageModel[];
  recoil: WeaponRecoil[];
}): CatalogCapabilities {
  const { weapons, attachments, ballistics, damageModels } = catalog;

  const everyWeaponHas = (field: string) =>
    weapons.length > 0 && weapons.every((weapon) => weapon.stats?.[field] != null);

  const bySlot = (slot: string) => attachments.filter((attachment) => attachment.slot === slot);

  /** Cobertura total: uma linha por arma, e nenhuma delas vazia. */
  const covers = <T>(list: T[], check: (entry: T) => boolean) =>
    list.length === weapons.length && weapons.length > 0 && list.every(check);

  const damageCurves = covers(damageModels, (entry) => entry.curve.length > 0);
  const velocity = covers(ballistics, (entry) => entry.muzzleVelocity != null);
  const drag = covers(ballistics, (entry) => entry.drag != null);
  const ads = everyWeaponHas('adsMs');
  const recoil = covers(catalog.recoil, (entry) => entry.recoil != null);

  return {
    weapons: weapons.length > 0,
    attachments: attachments.length > 0,
    compatibility: catalog.compatibility.length > 0,
    magazines: bySlot('magazine').length > 0,
    ammo: bySlot('ammo').length > 0,
    // Custo só conta como coberto quando nenhuma peça está sem preço: um
    // orçamento de 100 pontos com peça de custo desconhecido não fecha.
    costs: attachments.length > 0 && attachments.every((attachment) => attachment.cost != null),
    effects:
      attachments.length > 0 &&
      attachments.every((attachment) => Object.keys(attachment.effects ?? {}).length > 0),
    ballistics: damageCurves && velocity && drag,
    damageCurves,
    velocity,
    drag,
    ads,
    recoil,
    // TTK precisa da cadência e da escada de dano juntas — uma sem a outra não
    // produz tempo para abater, produz chute.
    ttk: damageCurves && everyWeaponHas('rpm'),
  };
}

function main(): void {
  const version = currentVersion();

  /*
   * O instantâneo da versão manda no que aparece.
   *
   * As entidades são a lista de tudo que já existiu; o instantâneo é o que
   * existia naquele patch. Sem este filtro, uma arma retirada do jogo em
   * 1.5.0.0 continuaria na tela por estar em `entities/weapons.json`.
   */
  const liveWeapons = new Map(versionWeapons(version).map((w) => [w.id, w]));
  const liveAttachments = new Map(versionAttachments(version).map((a) => [a.id, a]));

  const statsOf = new Map(stats(version).map((s) => [s.weaponId, s.stats]));
  const effectsOf = new Map(effects(version).map((e) => [e.attachmentId, e]));

  const rows = compatibility(version);
  const active = rows.filter((row) => row.status === 'active');

  /*
   * Os dados de simulação são opcionais na leitura e obrigatórios na conta.
   *
   * Uma versão importada antes de eles existirem simplesmente não os tem, e
   * ausência vira lista vazia — nunca erro. A consequência aparece nas
   * capacidades: sem curva de dano, `ttk` fica falso, e o domínio que depende
   * dele não migra. É assim que a falta de dado se propaga em vez de ser
   * disfarçada.
   */
  const dir = versionDir(version);
  const ballisticsFile = readJsonIf<{ model: BallisticsModel | null; ballistics: WeaponBallistics[] }>(
    join(dir, 'ballistics.json'),
    { model: null, ballistics: [] },
  );
  const ballistics = ballisticsFile.ballistics;
  const damageModels = readJsonIf<{ models: WeaponDamageModel[] }>(
    join(dir, 'damage-models.json'),
    { models: [] },
  ).models;
  const recoil = readJsonIf<{ recoil: WeaponRecoil[] }>(join(dir, 'recoil.json'), {
    recoil: [],
  }).recoil;
  const spread = readJsonIf<{ spread: WeaponSpread[] }>(join(dir, 'spread.json'), {
    spread: [],
  }).spread;
  const reload = readJsonIf<{ reload: WeaponReload[] }>(join(dir, 'reload.json'), {
    reload: [],
  }).reload;

  /** Quantas armas em cada nível de confiança, por domínio. */
  const quality = (list: { status: DataQuality }[]): Record<DataQuality, number> => {
    const count: Record<DataQuality, number> = {
      verified: 0,
      provisional: 0,
      estimated: 0,
      unavailable: 0,
    };
    for (const entry of list) count[entry.status] = (count[entry.status] ?? 0) + 1;
    return count;
  };

  const catalog: CurrentCatalog = {
    schemaVersion: SCHEMA_VERSION,
    gameVersion: version,
    generatedAt: NOW,
    capabilities: {
      weapons: false,
      attachments: false,
      compatibility: false,
      magazines: false,
      ammo: false,
      costs: false,
      effects: false,
      ballistics: false,
      damageCurves: false,
      velocity: false,
      drag: false,
      ads: false,
      recoil: false,
      ttk: false,
    },
    categories: categories(),
    slots: slots(),

    weapons: weapons()
      .filter((weapon) => liveWeapons.get(weapon.id)?.status !== 'removed')
      .filter((weapon) => liveWeapons.has(weapon.id))
      .map((weapon) => ({
        ...weapon,
        // O nome em vigor naquela versão, que pode não ser o de hoje.
        name: liveWeapons.get(weapon.id)?.name ?? weapon.name,
        stats: statsOf.get(weapon.id) ?? {},
      })),

    attachments: attachments()
      .filter((attachment) => liveAttachments.get(attachment.id)?.status !== 'removed')
      .filter((attachment) => liveAttachments.has(attachment.id))
      .map((attachment) => ({
        ...attachment,
        name: liveAttachments.get(attachment.id)?.name ?? attachment.name,
        cost: effectsOf.get(attachment.id)?.cost ?? null,
        effects: effectsOf.get(attachment.id)?.effects ?? {},
      })),

    compatibility: active.map((row) => ({
      weaponId: row.weaponId,
      attachmentId: row.attachmentId,
      slot: row.slot,
    })),

    ballisticsModel: ballisticsFile.model,
    ballistics,
    damageModels,
    recoil,
    spread,
    reload,

    indexes: buildIndexes(version, NOW),

    dataQuality: {
      ballistics: quality(ballistics),
      damage: quality(damageModels),
      recoil: quality(recoil),
      spread: quality(spread),
      reload: quality(reload),
    },

    pending: {
      compatibilityNeedsReview: rows.filter((row) => row.status === 'needs_review').length,
      attachmentsWithoutWeapon: attachments().filter(
        (attachment) =>
          liveAttachments.has(attachment.id) &&
          !active.some((row) => row.attachmentId === attachment.id),
      ).length,
      attachmentsWithoutCost: effects(version).filter((effect) => effect.cost === null).length,
    },
  };

  // Calculadas depois de o catálogo estar montado, sobre o que ele realmente
  // tem — e não sobre o que se esperava que tivesse.
  catalog.capabilities = capabilities({ ...catalog, ballistics, damageModels, recoil });

  writeJson(PUBLIC_CATALOG, catalog);

  const cobertos = Object.entries(catalog.capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key);

  log('catálogo', {
    'versão': version,
    armas: catalog.weapons.length,
    'acessórios': catalog.attachments.length,
    compatibilidade: catalog.compatibility.length,
    pendências: catalog.pending,
  });
  log('capacidades', cobertos.length ? cobertos.join(', ') : 'nenhuma');
}

main();
