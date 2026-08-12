/**
 * As perguntas que as telas fazem.
 *
 * O serviço entrega os dados como eles estão no arquivo; aqui eles viram
 * resposta: que peças esta arma aceita, nesta ordem, com este custo; qual é a
 * curva de dano desta arma e o quanto se pode confiar nela.
 *
 * A separação paga por si na hora de migrar uma tela: o seletor é o contrato, e
 * ele pode continuar igual enquanto a origem por baixo muda.
 */

import {
  getAttachment,
  getCurrentCatalog,
  getWeapon,
  type CatalogAttachment,
  type CatalogWeapon,
} from './catalog.service';
import type {
  BallisticsModel,
  DataQuality,
  WeaponBallistics,
  WeaponDamageModel,
  WeaponRecoil,
  WeaponReload,
  WeaponSpread,
} from './catalog.types';

/* ------------------------------ compatibilidade ------------------------------ */

/**
 * As peças que uma arma aceita.
 *
 * Sai do índice, que sai da compatibilidade — nunca da categoria da arma. Uma
 * arma sem nenhuma relação registrada devolve lista vazia, e isso é a resposta
 * certa: significa que nenhuma fonte confirmou peça alguma para ela, não que
 * ela aceite o que as outras da categoria aceitam.
 */
export function getWeaponAttachments(weaponId: string): CatalogAttachment[] {
  const ids = getCurrentCatalog().indexes.attachmentsByWeapon[weaponId] ?? [];
  return ids.map((id) => getAttachment(id)).filter((a): a is CatalogAttachment => Boolean(a));
}

/** As mesmas peças, separadas por slot e na ordem em que a tela as mostra. */
export function getWeaponAttachmentsBySlot(weaponId: string): Map<string, CatalogAttachment[]> {
  const bySlot = getCurrentCatalog().indexes.attachmentsByWeaponSlot[weaponId] ?? {};
  const result = new Map<string, CatalogAttachment[]>();

  for (const slot of Object.keys(bySlot)) {
    const list = bySlot[slot]
      .map((id) => getAttachment(id))
      .filter((a): a is CatalogAttachment => Boolean(a))
      .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));

    if (list.length) result.set(slot, list);
  }

  return result;
}

/** As armas que aceitam uma peça — a mesma relação, lida do outro lado. */
export function getAttachmentWeapons(attachmentId: string): CatalogWeapon[] {
  const ids = getCurrentCatalog().indexes.weaponsByAttachment[attachmentId] ?? [];
  return ids.map((id) => getWeapon(id)).filter((w): w is CatalogWeapon => Boolean(w));
}

/** Se a arma aceita a peça. Pergunta ao índice, sem nenhuma regra por trás. */
export function isCompatible(weaponId: string, attachmentId: string): boolean {
  return (getCurrentCatalog().indexes.attachmentsByWeapon[weaponId] ?? []).includes(attachmentId);
}

/* --------------------------------- acessórios --------------------------------- */

/**
 * O que a peça faz, no vocabulário da fonte.
 *
 * As chaves são as que o dataset publica — `adsTimeTierMod`, `hipSpreadTierMod`
 * —, em degraus e não em porcentagem. Traduzi-las para uma escala numérica
 * exigiria uma tabela de conversão que nenhuma fonte publica; quem exibir isto
 * deve exibir o degrau.
 */
export const getAttachmentEffects = (attachmentId: string): Record<string, unknown> =>
  getAttachment(attachmentId)?.effects ?? {};

export const getAttachmentCost = (attachmentId: string): number | null =>
  getAttachment(attachmentId)?.cost ?? null;

/* --------------------------------- simulação --------------------------------- */

export const getWeaponStats = (weaponId: string): Record<string, number | null> =>
  getWeapon(weaponId)?.stats ?? {};

/** O modelo de voo do projétil, comum a todas as armas. */
export const getBallisticsModel = (): BallisticsModel | null =>
  getCurrentCatalog().ballisticsModel;

export const getWeaponBallistics = (weaponId: string): WeaponBallistics | undefined =>
  getCurrentCatalog().ballistics.find((entry) => entry.weaponId === weaponId);

export const getWeaponDamageModel = (weaponId: string): WeaponDamageModel | undefined =>
  getCurrentCatalog().damageModels.find((entry) => entry.weaponId === weaponId);

export const getWeaponRecoil = (weaponId: string): WeaponRecoil | undefined =>
  getCurrentCatalog().recoil.find((entry) => entry.weaponId === weaponId);

export const getWeaponSpread = (weaponId: string): WeaponSpread | undefined =>
  getCurrentCatalog().spread.find((entry) => entry.weaponId === weaponId);

export const getWeaponReload = (weaponId: string): WeaponReload | undefined =>
  getCurrentCatalog().reload.find((entry) => entry.weaponId === weaponId);

/*
 * Não há conta de dano aqui.
 *
 * "Quanto dano a 40 metros" é pergunta de simulação, não de catálogo — o
 * catálogo entrega a curva, e `src/simulation/damage.ts` a interpreta. A
 * primeira versão deste arquivo tinha essa conta, e ela estava errada de um
 * jeito instrutivo: lia o degrau ao contrário, devolvendo o dano de depois na
 * distância exata da queda. O erro só apareceu ao comparar com a fonte, o que
 * é mais fácil de fazer quando a matemática mora num lugar só.
 */

/**
 * O quanto se pode confiar nos dados de simulação de uma arma.
 *
 * A tela precisa disto para escrever "dados provisórios" em vez de apresentar
 * estimativa como medição. O pior nível manda: uma arma com balística
 * verificada e dano provisório é uma arma com TTK provisório.
 */
export function getWeaponDataQuality(weaponId: string): DataQuality {
  const levels: DataQuality[] = [
    getWeaponDamageModel(weaponId)?.status ?? 'unavailable',
    getWeaponBallistics(weaponId)?.status ?? 'unavailable',
  ];

  const order: DataQuality[] = ['unavailable', 'estimated', 'provisional', 'verified'];
  return levels.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}
