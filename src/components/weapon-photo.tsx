'use client';

import { useEffect, useRef, useState } from 'react';
import { externalImageSources } from '@/data/weapon-images';
import type { Weapon } from '@/data/types';

/**
 * Foto da arma no jogo.
 *
 * Percorre as fontes externas na ordem de preferência (captura do jogo, depois
 * render de catálogo) e avisa o pai quando nenhuma carrega, para que ele mostre
 * o esquema vetorial no lugar.
 *
 * A foto mostra a arma inteira e montada, então ela não recebe camadas de
 * acessório — quem responde à montagem é o esquema.
 */

export function WeaponPhoto({
  weapon,
  className,
  onUnavailable,
}: {
  weapon: Weapon;
  className?: string;
  /** Chamado quando todas as fontes falharam. */
  onUnavailable?: () => void;
}) {
  const sources = externalImageSources(weapon.id);
  const [index, setIndex] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => setIndex(0), [weapon.id]);

  // Uma imagem que já falhou antes da hidratação não dispara `onError` de novo.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) avancar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weapon.id, index]);

  function avancar() {
    if (index + 1 < sources.length) setIndex(index + 1);
    else onUnavailable?.();
  }

  if (sources.length === 0 || index >= sources.length) return null;

  return (
    <img
      ref={imgRef}
      key={sources[index]}
      src={sources[index]}
      alt={`${weapon.name} no jogo`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={avancar}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}

export function hasPhoto(weapon: Weapon): boolean {
  return externalImageSources(weapon.id).length > 0;
}
