'use client';

import { useEffect, useRef, useState } from 'react';
import { hasPhoto, WeaponPhoto } from '@/components/weapon-photo';
import type { Attachment, Weapon } from '@/data/types';
import {
  anchorsForWeapon,
  attachmentImagePath,
  weaponImagePath,
  partWidth,
  SLOT_MOUNT,
  PART_REGISTRATION,
} from './manifest';

/**
 * Preview da arma, em imagens.
 *
 * Ordem das fontes:
 *
 * 1. `public/armas/<id>.png` — arte própria. Só ela permite compor as peças por
 *    cima, porque a imagem é da arma nua e os pontos de ancoragem valem para
 *    ela. É o único caminho em que o preview reage aos acessórios.
 * 2. Foto do jogo, de fonte externa. Mostra a arma inteira e já montada de
 *    fábrica, então não recebe camadas: encaixar um acessório não muda a imagem.
 * 3. Nenhuma das duas — aparece um marcador com o nome da arma.
 */

interface Props {
  weapon: Weapon;
  attachments: Attachment[];
  withLabel?: boolean;
  className?: string;
}

/** Proporção do quadro, igual à esperada das imagens. */
const ASPECT_RATIO = '8 / 3';

export function WeaponPreview({ weapon, attachments, withLabel = false, className }: Props) {
  const [noOwnImage, setNoOwnImage] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [brokenParts, setBrokenParts] = useState<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setNoOwnImage(false);
    setPhotoFailed(false);
    setBrokenParts(new Set());
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

  const anchors = anchorsForWeapon(weapon);

  return (
    <div className={className} style={{ position: 'relative', aspectRatio: ASPECT_RATIO }}>
      <img
        ref={imgRef}
        src={weaponImagePath(weapon.id)}
        alt={`${weapon.name} sem acessórios`}
        onError={() => setNoOwnImage(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {attachments.map((attachment) => {
        if (!attachment.part) return null;
        if (brokenParts.has(attachment.id)) return null;

        const mount = SLOT_MOUNT[attachment.slot];
        if (!mount) return null;

        const anchor = anchors[mount];
        const registration = PART_REGISTRATION[mount];
        const width = partWidth(attachment.part);

        return (
          // O deslocamento de ancoragem fica no wrapper; a animação de encaixe
          // fica na imagem, senão uma sobrescreveria o `transform` da outra.
          <span
            key={attachment.id}
            style={{
              position: 'absolute',
              left: `${anchor.x * 100}%`,
              top: `${anchor.y * 100}%`,
              width: `${width * 100}%`,
              transform: `translate(${-registration.x * 100}%, ${-registration.y * 100}%)`,
              lineHeight: 0,
            }}
          >
            <img
              src={attachmentImagePath(attachment.id)}
              alt={attachment.name}
              className="peca-encaixe"
              onError={() =>
                setBrokenParts((current) => {
                  const next = new Set(current);
                  next.add(attachment.id);
                  return next;
                })
              }
              style={{ width: '100%', display: 'block' }}
            />
          </span>
        );
      })}

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
