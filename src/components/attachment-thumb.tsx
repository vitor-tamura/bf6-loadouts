'use client';

import { useEffect, useRef, useState } from 'react';
import { attachmentImagePath } from '@/components/weapon-preview/manifest';
import type { Attachment, SlotId, WeaponCategory } from '@/data/types';

/**
 * Miniatura da peça encaixada no slot.
 *
 * Usa a imagem em `public/acessorios/<id>.png`. Sem ela, mostra um marcador
 * neutro com a sigla do slot — o bloco continua legível, e fica claro que o que
 * falta ali é a arte da peça, não a peça em si.
 */

/** Duas letras que identificam o slot no marcador. */
const SLOT_INITIALS: Record<SlotId, string> = {
  mira: 'MI',
  boca: 'BO',
  cano: 'CA',
  acoplamento: 'AC',
  carregador: 'CR',
  municao: 'MU',
  ergonomia: 'ER',
  opticoExtra: 'OP',
  lateralEsquerda: 'LE',
  lateralDireita: 'LD',
};

export function AttachmentThumb({
  attachment,
  slot,
  size = 56,
  category,
}: {
  /** Sem acessório, mostra o marcador de slot vazio. */
  attachment: Attachment | null;
  slot: SlotId;
  size?: number;
  /** Categoria da arma: define a variante do cartucho de munição. */
  category?: WeaponCategory;
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

  if (attachment && !noImage) {
    return (
      <img
        ref={imgRef}
        src={attachmentImagePath(attachment.id, category)}
        alt=""
        onError={() => setNoImage(true)}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="chanfro-sm flex items-center justify-center"
      style={{
        width: size,
        height: size,
        border: `1px dashed ${attachment ? 'var(--destaque)' : 'var(--borda)'}`,
        color: attachment ? 'var(--destaque)' : 'var(--texto-fraco)',
        opacity: attachment ? 0.8 : 0.45,
        fontFamily: 'var(--font-display)',
        fontSize: size * 0.26,
        letterSpacing: '0.1em',
      }}
    >
      {SLOT_INITIALS[slot] ?? '—'}
    </span>
  );
}
