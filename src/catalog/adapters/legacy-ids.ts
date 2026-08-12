/**
 * A correspondência entre os ids do catálogo e os do dataset antigo.
 *
 * Existe porque as duas fontes nomeiam as mesmas armas de formas diferentes —
 * `ak205` aqui, `ak-205` lá — e porque, durante a migração, as duas convivem: a
 * tela que já migrou fala em id de catálogo, e a que ainda não migrou fala em id
 * antigo. Sem uma tradução única, cada tela inventaria a sua.
 *
 * ## Como a correspondência é feita
 *
 * Primeiro por normalização: tirando hífens e pontuação, 59 dos 68 ids antigos
 * caem exatamente sobre um id do catálogo. Isso é casamento, não palpite — as
 * duas fontes descendem do mesmo levantamento.
 *
 * Os que sobram estão listados à mão abaixo, um a um, porque cada um é uma
 * afirmação: alguém olhou e disse que `18-5ks-k` e `ks18k` são a mesma arma. Um
 * casamento por semelhança de texto acertaria esses três e erraria em silêncio
 * no dia em que a EA lançasse uma arma de nome parecido.
 *
 * ## Isto é temporário
 *
 * Some quando o dataset antigo sair. Enquanto existir, é o único lugar do
 * código que sabe que há dois vocabulários — nenhuma tela deve conhecer os dois.
 */

import { getWeapons } from '../catalog.service';

/**
 * As renomeações que a normalização não pega.
 *
 * Chave: id do dataset antigo. Valor: id do catálogo.
 */
const RENAMED: Record<string, string> = {
  // O nome mudou de lado: "18.5 KS-K" virou "KS-18K" na leitura do Analyzer.
  '18-5ks-k': 'ks18k',
  // O sufixo de modelo caiu no catálogo.
  'kts100-mk8': 'kts100',
  'sor-556-mk2': 'sor556',
};

/**
 * As armas que o catálogo não tem.
 *
 * Corpo a corpo e algumas secundárias ficaram de fora do levantamento que
 * originou o catálogo. Elas não têm equivalente, e é isso que a tradução
 * devolve — `null`, e não a arma mais parecida.
 */
const ABSENT = new Set([
  'bighorn-hk-16',
  'interdictor',
  'kbr-mark-ii',
  'nomad-cx-12',
  'ripper-14',
  'sledgehammer-14lb',
]);

const normalize = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '');

let byNormalized: Map<string, string> | null = null;

function index(): Map<string, string> {
  if (!byNormalized) {
    byNormalized = new Map(getWeapons().map((weapon) => [normalize(weapon.id), weapon.id]));
  }
  return byNormalized;
}

/** O id de catálogo correspondente a um id antigo, ou `null` se não houver. */
export function toCatalogId(legacyId: string): string | null {
  if (ABSENT.has(legacyId)) return null;
  if (RENAMED[legacyId]) return RENAMED[legacyId];
  return index().get(normalize(legacyId)) ?? null;
}

/** O caminho inverso, para quem já está no catálogo e precisa falar com o antigo. */
export function toLegacyId(catalogId: string, legacyIds: string[]): string | null {
  const renamed = Object.entries(RENAMED).find(([, id]) => id === catalogId);
  if (renamed) return renamed[0];

  const target = normalize(catalogId);
  return legacyIds.find((id) => normalize(id) === target) ?? null;
}

/** As armas antigas que sabidamente não existem no catálogo. */
export const absentFromCatalog = (): string[] => [...ABSENT];
