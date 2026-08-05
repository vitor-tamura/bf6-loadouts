'use client';

import { useEffect, useState } from 'react';
import { desenharPeca } from '@/componentes/arma-svg/pecas';
import { caminhoImagemAcessorio } from '@/componentes/preview-arma/manifesto';
import { COR } from '@/componentes/arma-svg/paleta';
import type { Acessorio, IdSlot } from '@/dados/tipos';

/**
 * Miniatura de um acessório, para o jogador reconhecer a peça antes de encaixar.
 *
 * Usa a imagem do acessório quando ela existe e cai no desenho vetorial da peça
 * quando não. Slots sem peça desenhável — munição, por exemplo — recebem um
 * ícone próprio, porque um quadro vazio não diz nada.
 */

/**
 * Enquadramento por slot: as peças são desenhadas a partir do ponto de encaixe,
 * cada família crescendo para um lado. Uma mira sobe, um cano vai para a
 * direita, um carregador desce.
 */
const CAIXA_POR_SLOT: Record<IdSlot, string> = {
  mira: '-44 -44 88 50',
  opticoExtra: '-44 -44 88 50',
  boca: '-8 -26 116 52',
  cano: '-8 -26 116 52',
  acoplamento: '-28 -8 56 48',
  carregador: '-26 -8 52 60',
  municao: '-20 -20 40 40',
  ergonomia: '-58 -26 66 52',
  lateralEsquerda: '-8 -20 76 40',
  lateralDireita: '-8 -20 76 40',
};

/** Ícones para os slots cujo acessório não aparece no desenho da arma. */
function IconeMunicao() {
  return (
    <g>
      <polygon points="-6,-16 6,-16 8,-6 -8,-6" fill={COR.acoLuz} />
      <rect x={-8} y={-6} width={16} height={22} fill={COR.metal} />
      <rect x={-8} y={-6} width={16} height={5} fill={COR.metalLuz} />
      <rect x={-8} y={11} width={16} height={5} fill={COR.metalSombra} />
      <rect x={-8} y={2} width={16} height={2} fill={COR.vinco} />
    </g>
  );
}

function IconeVazio() {
  return (
    <g>
      <rect
        x={-14}
        y={-14}
        width={28}
        height={28}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="4 4"
        opacity={0.5}
      />
    </g>
  );
}

export function MiniaturaAcessorio({
  acessorio,
  slot,
  tamanho = 56,
}: {
  /** Sem acessório, mostra o marcador de slot vazio. */
  acessorio: Acessorio | null;
  slot: IdSlot;
  tamanho?: number;
}) {
  const [semImagem, setSemImagem] = useState(false);

  useEffect(() => setSemImagem(false), [acessorio?.id]);

  const estiloCaixa = {
    width: tamanho,
    height: tamanho,
    color: 'var(--texto-fraco)',
  } as const;

  if (!acessorio) {
    return (
      <svg viewBox="-20 -20 40 40" style={estiloCaixa} aria-hidden>
        <IconeVazio />
      </svg>
    );
  }

  if (!semImagem) {
    return (
      <img
        src={caminhoImagemAcessorio(acessorio.id)}
        alt=""
        onError={() => setSemImagem(true)}
        style={{ ...estiloCaixa, objectFit: 'contain' }}
      />
    );
  }

  if (!acessorio.peca) {
    const icone = acessorio.slot === 'municao' ? <IconeMunicao /> : <IconeVazio />;
    return (
      <svg viewBox="-20 -20 40 40" style={estiloCaixa} aria-hidden>
        {icone}
      </svg>
    );
  }

  return (
    <svg viewBox={CAIXA_POR_SLOT[slot] ?? '-40 -40 80 80'} style={estiloCaixa} aria-hidden>
      {desenharPeca(acessorio.peca)}
    </svg>
  );
}
