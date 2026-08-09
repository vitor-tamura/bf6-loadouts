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
  /*
   * A tentativa carrega junto de que arma ela é.
   *
   * O componente sobrevive à troca de arma, e um índice solto apontaria a
   * terceira fonte da arma anterior para a arma nova — que talvez tenha só
   * uma. Guardando o par, a arma nova já nasce na primeira fonte, sem precisar
   * de um efeito para zerar o índice depois do primeiro quadro.
   */
  const [tentativa, setTentativa] = useState({ weapon: weapon.id, index: 0 });
  const index = tentativa.weapon === weapon.id ? tentativa.index : 0;
  const imgRef = useRef<HTMLImageElement>(null);

  // Uma imagem que já falhou antes da hidratação não dispara `onError` de novo.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weapon.id, index]);

  function advance() {
    if (index + 1 < sources.length) setTentativa({ weapon: weapon.id, index: index + 1 });
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
      onError={advance}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}

export function hasPhoto(weapon: Weapon): boolean {
  return externalImageSources(weapon.id).length > 0;
}
