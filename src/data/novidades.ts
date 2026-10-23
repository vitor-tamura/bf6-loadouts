import type { Attachment, Weapon, WeaponArchetype, WeaponCategory } from './types';
import arquivo from './novidades.json' with { type: 'json' };

/**
 * Armas e acessórios que o jogo ganhou e a curadoria ainda não cadastrou.
 *
 * Quem escreve `novidades.json` é `npm run catalog:novidades` (ver o cabeçalho
 * de `scripts/catalog/novidades.ts`): armas todo dia, pelo BF6-Weapon-Analyzer;
 * acessórios quando a rotina roda de um computador que alcança o rnkd.gg.
 * Aqui só se lê: `weapons.ts`, `attachments.ts` e `weapon-images.ts` juntam
 * estas listas ao cadastro, e item que a curadoria levar para lá tem
 * precedência — o daqui é ignorado e some do arquivo na rodada seguinte.
 *
 * Tudo vem marcado `curated`, que acende o aviso de valor aproximado: os
 * números da arma saem de uma ficha pública e de uma arma parecida, e o efeito
 * da peça não sai de fonte nenhuma.
 */

export interface ArmaDasNovidades {
  id: string;
  name: string;
  category: WeaponCategory;
  archetype: WeaponArchetype;
  summary: string;
  damage: [number, number][];
  pellets?: number;
  rpm: number;
  velocity: number;
  drag: number;
  headshot: number;
  magazine: number;
  reload: number;
  emptyReload: number;
  adsMs: number;
  swapMs: number;
  accuracy: number;
  control: number;
  mobility: number;
  hipfire: number;
  verticalRecoil: number;
  horizontalRecoil: number;
  fireModes: Weapon['fireModes'];
  season: number;
  provenance: 'curated';
}

interface ArquivoDeNovidades {
  armas: (ArmaDasNovidades & { origem?: unknown })[];
  acessorios: (Attachment & { origem?: unknown })[];
  compatExtra: Record<string, string[]>;
  imagens: Record<string, { render: string }>;
}

const dados = arquivo as unknown as ArquivoDeNovidades;

/** As armas novas, no formato de entrada de `weapons.ts`, sem o registro de origem. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `origem` sai de propósito.
export const ARMAS_NOVAS: ArmaDasNovidades[] = (dados.armas ?? []).map(({ origem: _origem, ...arma }) => arma);

/** As peças novas, sem o registro de origem. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `origem` sai de propósito.
export const PECAS_NOVAS: Attachment[] = (dados.acessorios ?? []).map(({ origem: _origem, ...peca }) => peca);

/** Peça já cadastrada que passa a valer numa arma nova: id da peça → ids de arma. */
export const COMPAT_EXTRA: Record<string, string[]> = dados.compatExtra ?? {};

/** A foto de cada arma nova, enquanto `weapon-images.ts` não tem uma. */
export const IMAGENS_NOVAS: Record<string, { render: string }> = dados.imagens ?? {};
