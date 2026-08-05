import type { Weapon, SlotId, AttachmentPart, WeaponCategory } from '@/data/types';

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
 * Âncoras padrão por arquétipo, em fração da imagem.
 *
 * São os pontos onde cada peça encosta na arma. Valem para as imagens em
 * `public/armas/`, que seguem o mesmo enquadramento — arma de perfil, apontando
 * para a direita, ocupando a largura do quadro 8:3.
 *
 * Quando uma imagem específica precisar de correção, use `WEAPON_ANCHOR_OVERRIDES`.
 */
const ARCHETYPE_ANCHORS: Record<string, ImageAnchors> = {
  'ar-otan': { rail: { x: 0.3577, y: 0.4273 }, opticExtra: { x: 0.2692, y: 0.4273 }, barrelBase: { x: 0.6154, y: 0.5409 }, underbarrel: { x: 0.5538, y: 0.6273 }, magazine: { x: 0.4769, y: 0.6500 }, side: { x: 0.5038, y: 0.5545 }, stock: { x: 0.1808, y: 0.5364 } },
  'ar-leste': { rail: { x: 0.3385, y: 0.4273 }, opticExtra: { x: 0.2538, y: 0.4273 }, barrelBase: { x: 0.6346, y: 0.5364 }, underbarrel: { x: 0.5385, y: 0.6364 }, magazine: { x: 0.4692, y: 0.6591 }, side: { x: 0.4962, y: 0.5545 }, stock: { x: 0.1885, y: 0.5455 } },
  'bullpup': { rail: { x: 0.3538, y: 0.4273 }, opticExtra: { x: 0.2500, y: 0.4273 }, barrelBase: { x: 0.6500, y: 0.5455 }, underbarrel: { x: 0.5923, y: 0.6273 }, magazine: { x: 0.3885, y: 0.6682 }, side: { x: 0.5615, y: 0.5636 }, stock: { x: 0.1692, y: 0.5455 } },
  'carabina-curta': { rail: { x: 0.3654, y: 0.4455 }, opticExtra: { x: 0.2846, y: 0.4455 }, barrelBase: { x: 0.5962, y: 0.5455 }, underbarrel: { x: 0.5423, y: 0.6273 }, magazine: { x: 0.4808, y: 0.6500 }, side: { x: 0.5154, y: 0.5636 }, stock: { x: 0.2308, y: 0.5455 } },
  'smg-compacta': { rail: { x: 0.3846, y: 0.4545 }, opticExtra: { x: 0.3192, y: 0.4545 }, barrelBase: { x: 0.5808, y: 0.5455 }, underbarrel: { x: 0.5385, y: 0.6182 }, magazine: { x: 0.4846, y: 0.6500 }, side: { x: 0.5154, y: 0.5636 }, stock: { x: 0.2731, y: 0.5455 } },
  'smg-pdw': { rail: { x: 0.4000, y: 0.4364 }, opticExtra: { x: 0.3308, y: 0.4364 }, barrelBase: { x: 0.6077, y: 0.5455 }, underbarrel: { x: 0.5192, y: 0.6273 }, magazine: { x: 0.4808, y: 0.6364 }, side: { x: 0.5308, y: 0.5545 }, stock: { x: 0.2846, y: 0.5364 } },
  'lmg-caixa': { rail: { x: 0.3308, y: 0.3818 }, opticExtra: { x: 0.2346, y: 0.4182 }, barrelBase: { x: 0.6385, y: 0.5364 }, underbarrel: { x: 0.5692, y: 0.6273 }, magazine: { x: 0.4346, y: 0.8364 }, side: { x: 0.5154, y: 0.5545 }, stock: { x: 0.1577, y: 0.5364 } },
  'lmg-leve': { rail: { x: 0.3462, y: 0.4364 }, opticExtra: { x: 0.2500, y: 0.4364 }, barrelBase: { x: 0.6385, y: 0.5409 }, underbarrel: { x: 0.5769, y: 0.6273 }, magazine: { x: 0.4788, y: 0.6500 }, side: { x: 0.5192, y: 0.5545 }, stock: { x: 0.1808, y: 0.5455 } },
  'dmr': { rail: { x: 0.3423, y: 0.4364 }, opticExtra: { x: 0.2385, y: 0.4364 }, barrelBase: { x: 0.6538, y: 0.5455 }, underbarrel: { x: 0.5885, y: 0.6273 }, magazine: { x: 0.4731, y: 0.6500 }, side: { x: 0.5269, y: 0.5636 }, stock: { x: 0.1654, y: 0.5455 } },
  'sniper-ferrolho': { rail: { x: 0.3846, y: 0.4273 }, opticExtra: { x: 0.2923, y: 0.4273 }, barrelBase: { x: 0.6462, y: 0.5409 }, underbarrel: { x: 0.5885, y: 0.6182 }, magazine: { x: 0.4692, y: 0.6591 }, side: { x: 0.5615, y: 0.5545 }, stock: { x: 0.1385, y: 0.5364 } },
  'escopeta': { rail: { x: 0.3577, y: 0.4545 }, opticExtra: { x: 0.2731, y: 0.4545 }, barrelBase: { x: 0.6115, y: 0.5182 }, underbarrel: { x: 0.5577, y: 0.6273 }, magazine: { x: 0.4692, y: 0.6455 }, side: { x: 0.5154, y: 0.5364 }, stock: { x: 0.2154, y: 0.5455 } },
  'pistola': { rail: { x: 0.4808, y: 0.4727 }, opticExtra: { x: 0.4231, y: 0.4727 }, barrelBase: { x: 0.6077, y: 0.5273 }, underbarrel: { x: 0.5615, y: 0.6091 }, magazine: { x: 0.4192, y: 0.6909 }, side: { x: 0.5538, y: 0.5545 }, stock: { x: 0.3885, y: 0.5364 } },
  'revolver': { rail: { x: 0.5269, y: 0.4818 }, opticExtra: { x: 0.4692, y: 0.4818 }, barrelBase: { x: 0.6154, y: 0.5273 }, underbarrel: { x: 0.5769, y: 0.6091 }, magazine: { x: 0.4846, y: 0.6818 }, side: { x: 0.5692, y: 0.5545 }, stock: { x: 0.4385, y: 0.5455 } },
  'faca': { rail: { x: 0.5000, y: 0.5000 }, opticExtra: { x: 0.4423, y: 0.5000 }, barrelBase: { x: 0.6692, y: 0.5364 }, underbarrel: { x: 0.5385, y: 0.6000 }, magazine: { x: 0.4615, y: 0.6182 }, side: { x: 0.5192, y: 0.5636 }, stock: { x: 0.2923, y: 0.5818 } },
  'contundente': { rail: { x: 0.5769, y: 0.5091 }, opticExtra: { x: 0.5000, y: 0.5091 }, barrelBase: { x: 0.7423, y: 0.5636 }, underbarrel: { x: 0.5769, y: 0.6000 }, magazine: { x: 0.5000, y: 0.6091 }, side: { x: 0.5577, y: 0.5636 }, stock: { x: 0.2731, y: 0.5682 } },
};

/** Âncoras de uma arma: as do arquétipo, com o ajuste fino da arma por cima. */
export function anchorsForWeapon(weapon: Weapon): ImageAnchors {
  const base = ARCHETYPE_ANCHORS[weapon.archetype] ?? ARCHETYPE_ANCHORS['ar-otan'];
  return { ...base, ...WEAPON_ANCHOR_OVERRIDES[weapon.id] };
}

export function weaponImagePath(id: string): string {
  return `/armas/${id}.png`;
}

/**
 * Categorias que disparam cartucho de estojo reto — 9 mm e .45 — em vez do
 * cartucho garrafa dos fuzis.
 */
const CATEGORIAS_ESTOJO_RETO: WeaponCategory[] = ['pistola', 'smg'];

/**
 * Munições que existem nas duas versões. Escopeta fica de fora: o cartucho dela
 * já é reto e tem desenho próprio.
 */
const MUNICOES_COM_VARIANTE = new Set([
  'municao-fmj',
  'municao-tungsten-core',
  'municao-polymer-case',
  'municao-match-grade',
  'municao-frangible',
  'municao-hollow-point',
  'municao-synthetic-tip',
]);

/**
 * Caminho da imagem da peça.
 *
 * Quando a arma é pistola ou submetralhadora, a munição usa a variante de estojo
 * reto: o mesmo cartucho desenhado sem o gargalo, mais curto e com o projétil
 * assentado direto sobre o corpo.
 */
export function attachmentImagePath(id: string, category?: WeaponCategory): string {
  const reto = category && CATEGORIAS_ESTOJO_RETO.includes(category);
  const sufixo = reto && MUNICOES_COM_VARIANTE.has(id) ? '--pistola' : '';
  return `/acessorios/${id}${sufixo}.png`;
}
