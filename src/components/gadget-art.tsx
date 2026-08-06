'use client';

import { useEffect, useRef, useState } from 'react';
import { GadgetIcon } from '@/components/icons/gadget-icon';
import { gadgetImagePath } from '@/data/gadget-images';
import type { Gadget } from '@/data/types';

/**
 * Arte do gadget: a foto do item no jogo, com o ícone vetorial de reserva.
 *
 * Quatro dos 43 não têm foto — Repair Tool, AIO Impact, Biohazard Gas e
 * Acoustic Sensor —, então o ícone continua existindo e não é um enfeite: ele é
 * o que aparece nesses quatro e em qualquer gadget novo antes de a arte chegar.
 */
export function GadgetArt({ gadget, size = 32 }: { gadget: Gadget; size?: number }) {
  const src = gadgetImagePath(gadget.id);
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => setBroken(false), [gadget.id]);

  // Ver a nota em weapon-preview: `onError` não dispara de novo para a imagem
  // que já falhou antes de o React assumir a página.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, [gadget.id]);

  if (!src || broken) return <GadgetIcon gadget={gadget} size={size} />;

  return (
    <img
      ref={ref}
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setBroken(true)}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}
