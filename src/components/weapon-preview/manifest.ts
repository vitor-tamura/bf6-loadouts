import type { Weapon, SlotId, AttachmentPart } from '@/data/types';
import { SVG_HEIGHT, SVG_WIDTH, silhouetteFor } from '@/components/weapon-svg/silhouettes';

/**
 * Composição do preview a partir de imagens.
 *
 * Não existe uma imagem por combinação de acessórios — seriam milhões por arma.
 * O preview é montado em camadas: uma imagem da arma base e uma de cada peça,
 * todas com fundo transparente, posicionadas sobre pontos de ancoragem.
 *
 * Arquivos esperados (veja `IMAGENS.md` para a especificação completa):
 *   public/armas/<id-da-arma>.png
 *   public/acessorios/<id-do-acessorio>.png
 *
 * Enquanto uma imagem não existir, o preview cai automaticamente no desenho
 * vetorial — a aplicação nunca fica sem preview.
 */

export interface NormalizedAnchor {
  /** Posição horizontal, de 0 (borda esquerda) a 1 (borda direita) da imagem base. */
  x: number;
  /** Posição vertical, de 0 (topo) a 1 (base) da imagem base. */
  y: number;
}

export type ImageAnchors = Record<MountPoint, NormalizedAnchor>;

export type MountPoint =
  | 'rail'
  | 'opticExtra'
  | 'barrelBase'
  | 'underbarrel'
  | 'magazine'
  | 'side'
  | 'stock';

/** Em qual ponto de montagem cada slot encaixa. */
export const SLOT_MOUNT: Partial<Record<SlotId, MountPoint>> = {
  mira: 'rail',
  opticoExtra: 'opticExtra',
  cano: 'barrelBase',
  boca: 'barrelBase',
  acoplamento: 'underbarrel',
  carregador: 'magazine',
  ergonomia: 'stock',
  lateralEsquerda: 'side',
  lateralDireita: 'side',
};

/**
 * Ponto da imagem da PEÇA que encosta na âncora da arma, em fração da própria
 * imagem. Uma mira encaixa pela base, um cano pela ponta esquerda, uma coronha
 * pela direita.
 */
export const PART_REGISTRATION: Record<MountPoint, NormalizedAnchor> = {
  rail: { x: 0.5, y: 1 },
  opticExtra: { x: 0.5, y: 1 },
  barrelBase: { x: 0, y: 0.5 },
  underbarrel: { x: 0.5, y: 0 },
  magazine: { x: 0.5, y: 0 },
  side: { x: 0, y: 0.5 },
  stock: { x: 1, y: 0.5 },
};

/**
 * Largura de cada peça, em fração da largura da imagem da arma. Mantém a
 * proporção entre peça e arma independentemente do tamanho do PNG entregue.
 */
export const PART_WIDTH: Partial<Record<AttachmentPart, number>> = {
  supressor: 0.13,
  freio: 0.055,
  compensador: 0.065,
  'quebra-chamas': 0.07,
  'cano-curto': 0.08,
  'cano-longo': 0.21,
  'cano-pesado': 0.18,
  'ponto-vermelho': 0.065,
  holografica: 0.09,
  'luneta-media': 0.16,
  'luneta-longa': 0.23,
  ferro: 0.03,
  ampliador: 0.06,
  'empunhadura-vertical': 0.03,
  'empunhadura-angular': 0.045,
  'apoio-mao': 0.025,
  bipe: 0.1,
  'carregador-curto': 0.045,
  'carregador-longo': 0.045,
  tambor: 0.1,
  laser: 0.05,
  lanterna: 0.065,
  'coronha-leve': 0.11,
  'coronha-pesada': 0.13,
};

const DEFAULT_PART_WIDTH = 0.07;

export function partWidth(part: AttachmentPart): number {
  return PART_WIDTH[part] ?? DEFAULT_PART_WIDTH;
}

/**
 * Ajustes finos por arma, aplicados sobre as âncoras derivadas do arquétipo.
 * Preencha aqui quando uma imagem específica precisar de correção — os valores
 * são frações da imagem, então continuam válidos em qualquer resolução.
 */
export const WEAPON_ANCHOR_OVERRIDES: Record<string, Partial<ImageAnchors>> = {};

/**
 * Âncoras padrão de uma arma, derivadas da silhueta vetorial do seu arquétipo e
 * convertidas para fração. Servem de ponto de partida coerente para as imagens;
 * o ajuste fino, quando necessário, vai em `AJUSTES_POR_ARMA`.
 */
export function anchorsForWeapon(weapon: Weapon): ImageAnchors {
  const { anchors } = silhouetteFor(weapon.archetype);
  const toFraction = (p: { x: number; y: number }): NormalizedAnchor => ({
    x: p.x / SVG_WIDTH,
    y: p.y / SVG_HEIGHT,
  });

  const base: ImageAnchors = {
    rail: toFraction(anchors.rail),
    opticExtra: toFraction(anchors.opticExtra),
    barrelBase: toFraction(anchors.barrelBase),
    underbarrel: toFraction(anchors.underbarrel),
    magazine: toFraction(anchors.magazine),
    side: toFraction(anchors.side),
    stock: toFraction(anchors.stock),
  };

  return { ...base, ...WEAPON_ANCHOR_OVERRIDES[weapon.id] };
}

export function weaponImagePath(id: string): string {
  return `/armas/${id}.png`;
}

export function attachmentImagePath(id: string): string {
  return `/acessorios/${id}.png`;
}
