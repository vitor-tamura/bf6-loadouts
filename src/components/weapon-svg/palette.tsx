import type { ReactNode } from 'react';

/**
 * Paleta e primitivas do desenho das armas.
 *
 * Não existe fonte legal para a arte oficial do jogo, então cada arma é
 * desenhada aqui — silhueta reconhecível em poucos polígonos, com três tons por
 * material para dar volume sem sair do estilo low-poly.
 */

export const COLOR = {
  polimero: '#2b2f28',
  polimeroLuz: '#3f453a',
  polimeroSombra: '#1b1e18',

  metal: '#4a5045',
  metalLuz: '#6a7160',
  metalSombra: '#31352d',

  aco: '#5a6154',
  acoLuz: '#7b836f',
  acoSombra: '#3c4137',

  vinco: '#14170f',
  lente: '#22c3d6',
  lenteBrilho: '#8df0fb',
  laser: '#ff5c47',
  laserFrio: '#5fe3f0',
  highlighted: '#ff8a00',
} as const;

export interface Point {
  x: number;
  y: number;
}

/** Converte pares de coordenadas em atributo `points`. */
export function pts(...coords: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < coords.length; i += 2) out.push(`${coords[i]},${coords[i + 1]}`);
  return out.join(' ');
}

/**
 * Bloco com faceta de luz no topo e de sombra na base — o tijolo básico de
 * quase toda peça deste arquivo.
 */
export function Block({
  x,
  y,
  width,
  height,
  color = COLOR.polimero,
  light = COLOR.polimeroLuz,
  shadow = COLOR.polimeroSombra,
  bevelLeft = 0,
  bevelRight = 0,
  facet = 0.28,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  light?: string;
  shadow?: string;
  /** Corte diagonal no canto esquerdo. */
  bevelLeft?: number;
  /** Corte diagonal no canto direito. */
  bevelRight?: number;
  /** Fração da altura ocupada pela faceta de luz. */
  facet?: number;
}): ReactNode {
  const x2 = x + width;
  const y2 = y + height;
  const hLuz = height * facet;

  return (
    <g>
      <polygon
        points={pts(
          x + bevelLeft,
          y,
          x2 - bevelRight,
          y,
          x2,
          y + bevelRight,
          x2,
          y2 - bevelRight,
          x2 - bevelRight,
          y2,
          x + bevelLeft,
          y2,
          x,
          y2 - bevelLeft,
          x,
          y + bevelLeft,
        )}
        fill={color}
      />
      <polygon
        points={pts(x + bevelLeft, y, x2 - bevelRight, y, x2 - bevelRight, y + hLuz, x + bevelLeft, y + hLuz)}
        fill={light}
      />
      <polygon
        points={pts(
          x + bevelLeft,
          y2 - hLuz * 0.7,
          x2 - bevelRight,
          y2 - hLuz * 0.7,
          x2 - bevelRight,
          y2,
          x + bevelLeft,
          y2,
        )}
        fill={shadow}
      />
    </g>
  );
}

/** Vinco fino, para sugerir junção entre peças. */
export function Crease({ x, y, width, height = 1.6 }: { x: number; y: number; width: number; height?: number }) {
  return <rect x={x} y={y} width={width} height={height} fill={COLOR.vinco} opacity={0.55} />;
}

/** Trilho picatinny: base contínua com dentes por cima. */
export function Rail({ x, y, width, teeth = 8 }: { x: number; y: number; width: number; teeth?: number }) {
  const stepSize = width / teeth;
  return (
    <g>
      <rect x={x} y={y} width={width} height={4} fill={COLOR.metalSombra} />
      {Array.from({ length: teeth }, (_, i) => (
        <rect key={i} x={x + i * stepSize + stepSize * 0.2} y={y - 2.5} width={stepSize * 0.5} height={3} fill={COLOR.metal} />
      ))}
    </g>
  );
}
