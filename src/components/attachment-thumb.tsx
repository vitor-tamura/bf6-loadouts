'use client';

import { useEffect, useRef, useState } from 'react';
import { drawPart } from '@/components/weapon-svg/parts';
import { attachmentImagePath } from '@/components/weapon-preview/manifest';
import { COLOR } from '@/components/weapon-svg/palette';
import type { Attachment, SlotId } from '@/data/types';

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
const VIEWBOX_BY_SLOT: Record<SlotId, string> = {
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
function AmmoIcon() {
  return (
    <g>
      <polygon points="-6,-16 6,-16 8,-6 -8,-6" fill={COLOR.acoLuz} />
      <rect x={-8} y={-6} width={16} height={22} fill={COLOR.metal} />
      <rect x={-8} y={-6} width={16} height={5} fill={COLOR.metalLuz} />
      <rect x={-8} y={11} width={16} height={5} fill={COLOR.metalSombra} />
      <rect x={-8} y={2} width={16} height={2} fill={COLOR.vinco} />
    </g>
  );
}

function EmptySlotIcon() {
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

export function AttachmentThumb({
  attachment,
  slot,
  size = 56,
}: {
  /** Sem acessório, mostra o marcador de slot vazio. */
  attachment: Attachment | null;
  slot: SlotId;
  size?: number;
}) {
  const [noImage, setNoImage] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => setNoImage(false), [attachment?.id]);

  // Ver a nota em weapon-preview: `onError` não dispara para a imagem que já
  // falhou antes de o React assumir o controle da página.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setNoImage(true);
  }, [attachment?.id]);

  const boxStyle = {
    width: size,
    height: size,
    color: 'var(--texto-fraco)',
  } as const;

  if (!attachment) {
    return (
      <svg viewBox="-20 -20 40 40" style={boxStyle} aria-hidden>
        <EmptySlotIcon />
      </svg>
    );
  }

  if (!noImage) {
    return (
      <img
        ref={imgRef}
        src={attachmentImagePath(attachment.id)}
        alt=""
        onError={() => setNoImage(true)}
        style={{ ...boxStyle, objectFit: 'contain' }}
      />
    );
  }

  if (!attachment.part) {
    const icon = attachment.slot === 'municao' ? <AmmoIcon /> : <EmptySlotIcon />;
    return (
      <svg viewBox="-20 -20 40 40" style={boxStyle} aria-hidden>
        {icon}
      </svg>
    );
  }

  return (
    <svg viewBox={VIEWBOX_BY_SLOT[slot] ?? '-40 -40 80 80'} style={boxStyle} aria-hidden>
      {drawPart(attachment.part)}
    </svg>
  );
}
