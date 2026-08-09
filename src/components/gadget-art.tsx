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
  /*
   * Guarda de qual gadget a arte falhou, e não um sim/não.
   *
   * O componente é reaproveitado quando a lista troca de item, então um booleano
   * precisaria ser desligado a cada troca — e desligar estado dentro de efeito
   * custa um quadro mostrando a resposta do gadget anterior. Comparando o id, a
   * resposta certa já sai na primeira renderização.
   */
  const [falhouEm, setFalhouEm] = useState<string | null>(null);
  const broken = falhouEm === gadget.id;
  const ref = useRef<HTMLImageElement>(null);

  // Ver a nota em weapon-preview: `onError` não dispara de novo para a imagem
  // que já falhou antes de o React assumir a página.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFalhouEm(gadget.id);
  }, [gadget.id]);

  if (!src || broken) return <GadgetIcon gadget={gadget} size={size} />;

  return (
    <img
      ref={ref}
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFalhouEm(gadget.id)}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}
