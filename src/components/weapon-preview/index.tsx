'use client';

import { useEffect, useRef, useState } from 'react';
import { WeaponSvg } from '@/components/weapon-svg';
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
 * Preview da arma montada.
 *
 * Prefere as imagens em `public/armas` e `public/acessorios`, compostas em
 * camadas sobre pontos de ancoragem. Se a imagem da arma ainda não existir, cai
 * no desenho vetorial — assim o montador funciona desde já e vai ganhando as
 * imagens conforme elas forem entrando, sem mudar uma linha de código.
 */

interface Props {
  weapon: Weapon;
  attachments: Attachment[];
  withLabel?: boolean;
  className?: string;
}

/** Proporção do quadro do preview, igual à esperada das imagens. */
const ASPECT_RATIO = '8 / 3';

export function WeaponPreview({ weapon, attachments, withLabel = false, className }: Props) {
  const [noImage, setNoImage] = useState(false);
  const [brokenParts, setBrokenParts] = useState<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);

  // Ao trocar de arma, volta a tentar a imagem: a próxima pode existir.
  useEffect(() => {
    setNoImage(false);
    setBrokenParts(new Set());
  }, [weapon.id]);

  /*
   * `onError` sozinho não basta: a página é pré-renderizada, e quando o React
   * assume o controle a imagem já pode ter falhado — o evento não dispara de
   * novo e o quadro ficaria vazio. Uma imagem quebrada é a que terminou de
   * carregar sem largura nenhuma.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setNoImage(true);
  }, [weapon.id]);

  if (noImage) {
    return <WeaponSvg weapon={weapon} attachments={attachments} withLabel={withLabel} className={className} />;
  }

  const anchors = anchorsForWeapon(weapon);

  return (
    <div className={className} style={{ position: 'relative', aspectRatio: ASPECT_RATIO }}>
      <img
        ref={imgRef}
        src={weaponImagePath(weapon.id)}
        alt={`${weapon.name} sem acessórios`}
        onError={() => setNoImage(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {attachments.map((attachment) => {
        if (!attachment.part) return null;
        if (brokenParts.has(attachment.id)) return null;

        const montagem = SLOT_MOUNT[attachment.slot];
        if (!montagem) return null;

        const ancora = anchors[montagem];
        const registro = PART_REGISTRATION[montagem];
        const width = partWidth(attachment.part);

        return (
          // O deslocamento de ancoragem fica no wrapper; a animação de encaixe
          // fica na imagem, senão uma sobrescreveria o `transform` da outra.
          <span
            key={attachment.id}
            style={{
              position: 'absolute',
              left: `${ancora.x * 100}%`,
              top: `${ancora.y * 100}%`,
              width: `${width * 100}%`,
              transform: `translate(${-registro.x * 100}%, ${-registro.y * 100}%)`,
              lineHeight: 0,
            }}
          >
            <img
              src={attachmentImagePath(attachment.id)}
              alt={attachment.name}
              className="peca-encaixe"
              onError={() =>
                setBrokenParts((current) => {
                  const novo = new Set(current);
                  novo.add(attachment.id);
                  return novo;
                })
              }
              style={{ width: '100%', display: 'block' }}
            />
          </span>
        );
      })}

      {withLabel && (
        <span
          className="rotulo"
          style={{ position: 'absolute', right: 8, bottom: 6, color: 'var(--destaque)', opacity: 0.6 }}
        >
          {weapon.name}
        </span>
      )}
    </div>
  );
}
