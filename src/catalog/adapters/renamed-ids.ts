/**
 * As renomeações que a normalização de id não pega.
 *
 * Chave: id do dataset do site (`src/data`). Valor: id do catálogo. Mora em
 * arquivo próprio, sem dependência nenhuma, porque dois lados precisam dela: a
 * tradução de `legacy-ids.ts`, dentro do site, e o pipeline do catálogo, que
 * roda fora do Next e grava o patch no dataset do site
 * (`scripts/catalog/aplicar-no-site.ts`).
 */
export const RENAMED: Record<string, string> = {
  // O nome mudou de lado: "18.5 KS-K" virou "KS-18K" na leitura do Analyzer.
  '18-5ks-k': 'ks18k',
  // O sufixo de modelo caiu no catálogo.
  'kts100-mk8': 'kts100',
  'sor-556-mk2': 'sor556',
};

const normalize = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '');

/** O id do site para um id do catálogo, entre os ids que o site tem. */
export function siteIdFor(catalogId: string, siteIds: string[]): string | null {
  const renamed = Object.entries(RENAMED).find(([, id]) => id === catalogId);
  if (renamed) return renamed[0];

  const target = normalize(catalogId);
  return siteIds.find((id) => normalize(id) === target) ?? null;
}
