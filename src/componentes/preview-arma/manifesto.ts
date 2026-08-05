import type { Arma, IdSlot, PecaAcessorio } from '@/dados/tipos';
import { ALTURA_SVG, LARGURA_SVG, silhuetaDe } from '@/componentes/arma-svg/silhuetas';

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

export interface AncoraNormalizada {
  /** Posição horizontal, de 0 (borda esquerda) a 1 (borda direita) da imagem base. */
  x: number;
  /** Posição vertical, de 0 (topo) a 1 (base) da imagem base. */
  y: number;
}

export type AncorasImagem = Record<PontoMontagem, AncoraNormalizada>;

export type PontoMontagem =
  | 'trilho'
  | 'opticoExtra'
  | 'canoBase'
  | 'inferior'
  | 'carregador'
  | 'lateral'
  | 'coronha';

/** Em qual ponto de montagem cada slot encaixa. */
export const MONTAGEM_DO_SLOT: Partial<Record<IdSlot, PontoMontagem>> = {
  mira: 'trilho',
  opticoExtra: 'opticoExtra',
  cano: 'canoBase',
  boca: 'canoBase',
  acoplamento: 'inferior',
  carregador: 'carregador',
  ergonomia: 'coronha',
  lateralEsquerda: 'lateral',
  lateralDireita: 'lateral',
};

/**
 * Ponto da imagem da PEÇA que encosta na âncora da arma, em fração da própria
 * imagem. Uma mira encaixa pela base, um cano pela ponta esquerda, uma coronha
 * pela direita.
 */
export const REGISTRO_DA_PECA: Record<PontoMontagem, AncoraNormalizada> = {
  trilho: { x: 0.5, y: 1 },
  opticoExtra: { x: 0.5, y: 1 },
  canoBase: { x: 0, y: 0.5 },
  inferior: { x: 0.5, y: 0 },
  carregador: { x: 0.5, y: 0 },
  lateral: { x: 0, y: 0.5 },
  coronha: { x: 1, y: 0.5 },
};

/**
 * Largura de cada peça, em fração da largura da imagem da arma. Mantém a
 * proporção entre peça e arma independentemente do tamanho do PNG entregue.
 */
export const LARGURA_DA_PECA: Partial<Record<PecaAcessorio, number>> = {
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

const LARGURA_PADRAO_PECA = 0.07;

export function larguraDaPeca(peca: PecaAcessorio): number {
  return LARGURA_DA_PECA[peca] ?? LARGURA_PADRAO_PECA;
}

/**
 * Ajustes finos por arma, aplicados sobre as âncoras derivadas do arquétipo.
 * Preencha aqui quando uma imagem específica precisar de correção — os valores
 * são frações da imagem, então continuam válidos em qualquer resolução.
 */
export const AJUSTES_POR_ARMA: Record<string, Partial<AncorasImagem>> = {};

/**
 * Âncoras padrão de uma arma, derivadas da silhueta vetorial do seu arquétipo e
 * convertidas para fração. Servem de ponto de partida coerente para as imagens;
 * o ajuste fino, quando necessário, vai em `AJUSTES_POR_ARMA`.
 */
export function ancorasDaArma(arma: Arma): AncorasImagem {
  const { ancoras } = silhuetaDe(arma.arquetipo);
  const norm = (p: { x: number; y: number }): AncoraNormalizada => ({
    x: p.x / LARGURA_SVG,
    y: p.y / ALTURA_SVG,
  });

  const base: AncorasImagem = {
    trilho: norm(ancoras.trilho),
    opticoExtra: norm(ancoras.opticoExtra),
    canoBase: norm(ancoras.canoBase),
    inferior: norm(ancoras.inferior),
    carregador: norm(ancoras.carregador),
    lateral: norm(ancoras.lateral),
    coronha: norm(ancoras.coronha),
  };

  return { ...base, ...AJUSTES_POR_ARMA[arma.id] };
}

export function caminhoImagemArma(id: string): string {
  return `/armas/${id}.png`;
}

export function caminhoImagemAcessorio(id: string): string {
  return `/acessorios/${id}.png`;
}
