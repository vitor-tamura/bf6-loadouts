'use client';

import { useEffect, useRef, useState } from 'react';
import { hasPhoto, WeaponPhoto } from '@/components/weapon-photo';
import type { Weapon } from '@/data/types';
import { weaponImagePath } from './manifest';

/**
 * Preview da arma, em imagens.
 *
 * Ordem das fontes:
 *
 * 1. `public/weapons/<id>.png` — arte própria, se alguém tiver colocado uma.
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
  /*
   * As duas falhas guardam de qual arma são, em vez de sim/não.
   *
   * O preview fica no mesmo lugar da tela enquanto a arma muda por baixo — é o
   * componente que menos desmonta do montador —, e dois booleanos precisariam
   * ser desligados a cada troca. Desligá-los num efeito custa um quadro: a arma
   * nova estrearia mostrando o marcador de "sem imagem" da anterior.
   */
  const [semArtePropria, setSemArtePropria] = useState<string | null>(null);
  const [semFoto, setSemFoto] = useState<string | null>(null);
  const noOwnImage = semArtePropria === weapon.id;
  const photoFailed = semFoto === weapon.id;
  const imgRef = useRef<HTMLImageElement>(null);

  /*
   * `onError` sozinho não basta: a página é pré-renderizada, e quando o React
   * assume o controle a imagem já pode ter falhado — o evento não dispara de
   * novo. Uma imagem quebrada é a que terminou de carregar sem largura nenhuma.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setSemArtePropria(weapon.id);
  }, [weapon.id]);

  // Sem arte própria: foto do jogo, que não aceita camadas.
  if (noOwnImage) {
    if (!photoFailed && hasPhoto(weapon)) {
      return (
        <div className={className} style={{ position: 'relative', aspectRatio: ASPECT_RATIO }}>
          <WeaponPhoto weapon={weapon} onUnavailable={() => setSemFoto(weapon.id)} />
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
        onError={() => setSemArtePropria(weapon.id)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {withLabel && <Label weapon={weapon} />}
    </div>
  );
}

function Label({ weapon }: { weapon: Weapon }) {
  return (
    <span
      className="label"
      style={{ position: 'absolute', right: 8, bottom: 6, color: 'var(--accent)', opacity: 0.6 }}
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
        background: 'var(--surface-raised)',
        border: '1px dashed var(--border)',
      }}
    >
      <span className="label text-center">
        {weapon.name}
        <br />
        <span style={{ opacity: 0.7 }}>sem imagem</span>
      </span>
    </div>
  );
}
