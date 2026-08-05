'use client';

import { useEffect, useRef, useState } from 'react';
import { hasPhoto, WeaponPhoto } from '@/components/weapon-photo';
import type { Attachment, Weapon } from '@/data/types';
import { weaponImagePath } from './manifest';

/**
 * Preview da arma, em imagens.
 *
 * Ordem das fontes:
 *
 * 1. `public/armas/<id>.png` — arte própria, se alguém tiver colocado uma.
 * 2. Foto do jogo, de fonte externa (ver `weapon-images.ts`).
 * 3. Nenhuma das duas — aparece um marcador com o nome da arma.
 *
 * Qualquer uma delas mostra a arma inteira e já montada de fábrica, então o
 * quadro não muda quando um acessório é encaixado: quem responde à montagem é
 * o ícone de cada peça no painel de slots, e os números e gráficos ao lado.
 */

interface Props {
  weapon: Weapon;
  withLabel?: boolean;
  className?: string;
}

/** Proporção do quadro, igual à esperada das imagens. */
const ASPECT_RATIO = '8 / 3';

export function WeaponPreview({ weapon, withLabel = false, className }: Props) {
  const [noOwnImage, setNoOwnImage] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setNoOwnImage(false);
    setPhotoFailed(false);
  }, [weapon.id]);

  /*
   * `onError` sozinho não basta: a página é pré-renderizada, e quando o React
   * assume o controle a imagem já pode ter falhado — o evento não dispara de
   * novo. Uma imagem quebrada é a que terminou de carregar sem largura nenhuma.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setNoOwnImage(true);
  }, [weapon.id]);

  // Sem arte própria: foto do jogo, que não aceita camadas.
  if (noOwnImage) {
    if (!photoFailed && hasPhoto(weapon)) {
      return (
        <div className={className} style={{ position: 'relative', aspectRatio: ASPECT_RATIO }}>
          <WeaponPhoto weapon={weapon} onUnavailable={() => setPhotoFailed(true)} />
          {withLabel && <Label weapon={weapon} />}
        </div>
      );
    }
    return <Placeholder weapon={weapon} className={className} />;
  }

  return (
    <div className={className} style={{ position: 'relative', aspectRatio: ASPECT_RATIO }}>
      <img
        ref={imgRef}
        src={weaponImagePath(weapon.id)}
        alt={weapon.name}
        onError={() => setNoOwnImage(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {withLabel && <Label weapon={weapon} />}
    </div>
  );
}

function Label({ weapon }: { weapon: Weapon }) {
  return (
    <span
      className="rotulo"
      style={{ position: 'absolute', right: 8, bottom: 6, color: 'var(--destaque)', opacity: 0.6 }}
    >
      {weapon.name}
    </span>
  );
}

/** Nem arte própria nem foto — o quadro precisa dizer o que deveria estar ali. */
function Placeholder({ weapon, className }: { weapon: Weapon; className?: string }) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        aspectRatio: ASPECT_RATIO,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--superficie-alta)',
        border: '1px dashed var(--borda)',
      }}
    >
      <span className="rotulo text-center">
        {weapon.name}
        <br />
        <span style={{ opacity: 0.7 }}>sem imagem</span>
      </span>
    </div>
  );
}
