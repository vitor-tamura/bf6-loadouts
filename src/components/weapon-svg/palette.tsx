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

/* -------------------------------------------------------------------------- *
 * Peças de detalhe
 *
 * O esquema não precisa ser um render — precisa ser reconhecível. Estas peças
 * são os traços que o olho usa para identificar uma arma: os rasgos do M-LOK, a
 * janela de ejeção, o seletor de tiro, os pinos do receiver. Ficam aqui porque
 * repetem em quase todos os arquétipos.
 * -------------------------------------------------------------------------- */

/** Rasgos M-LOK ao longo do guarda-mão. */
export function MlokSlots({
  x,
  y,
  width,
  slots = 4,
  height = 3,
}: {
  x: number;
  y: number;
  width: number;
  slots?: number;
  height?: number;
}) {
  const stepSize = width / slots;
  return (
    <g>
      {Array.from({ length: slots }, (_, i) => (
        <rect
          key={i}
          x={x + i * stepSize + stepSize * 0.18}
          y={y}
          width={stepSize * 0.64}
          height={height}
          rx={height / 2}
          fill={COLOR.vinco}
          opacity={0.72}
        />
      ))}
    </g>
  );
}

/** Furos de refrigeração, típicos de guarda-mão metálico. */
export function VentHoles({ x, y, count = 5, radius = 2.1 }: { x: number; y: number; count?: number; radius?: number }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} cx={x + i * radius * 3.1} cy={y} r={radius} fill={COLOR.vinco} opacity={0.62} />
      ))}
    </g>
  );
}

/** Janela de ejeção com a tampa antipoeira logo abaixo. */
export function EjectionPort({ x, y, width = 26, height = 11 }: { x: number; y: number; width?: number; height?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={1.5} fill={COLOR.vinco} opacity={0.85} />
      <rect x={x + 1.5} y={y + 1.5} width={width - 3} height={height * 0.42} fill={COLOR.acoSombra} />
      <rect x={x - 1} y={y + height + 1.5} width={width + 2} height={3} rx={1.5} fill={COLOR.metalSombra} />
    </g>
  );
}

/** Seletor de tiro: eixo e alavanca. */
export function FireSelector({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.4} fill={COLOR.metalSombra} />
      <circle cx={x} cy={y} r={1.4} fill={COLOR.metalLuz} />
      <rect x={x - 1.4} y={y - 8} width={2.8} height={6} rx={1.4} fill={COLOR.metal} />
    </g>
  );
}

/** Pinos de montagem do receiver. */
export function Pins({ x, y, gap = 0, count = 2 }: { x: number; y: number; gap?: number; count?: number }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <g key={i}>
          <circle cx={x + i * gap} cy={y} r={2.6} fill={COLOR.metalSombra} />
          <circle cx={x + i * gap} cy={y - 0.5} r={1.2} fill={COLOR.metalLuz} opacity={0.8} />
        </g>
      ))}
    </g>
  );
}

/** Alavanca de manejo do ferrolho. */
export function ChargingHandle({ x, y, length = 18 }: { x: number; y: number; length?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={length} height={5} rx={2} fill={COLOR.aco} />
      <rect x={x + length - 5} y={y - 3} width={5} height={11} rx={1.5} fill={COLOR.acoLuz} />
    </g>
  );
}

/** Alça de mira dobrável — a silhueta que denuncia um fuzil sem luneta. */
export function FoldingSight({ x, y, flipped = false }: { x: number; y: number; flipped?: boolean }) {
  const dir = flipped ? -1 : 1;
  return (
    <g>
      <rect x={x - 3} y={y - 2} width={6} height={4} fill={COLOR.metalSombra} />
      <polygon points={pts(x - 2, y - 2, x + 2, y - 2, x + 1.2 * dir, y - 9, x - 1.2 * dir, y - 9)} fill={COLOR.metal} />
    </g>
  );
}

/** Textura de aderência no punho ou no guarda-mão. */
export function GripTexture({
  x,
  y,
  width,
  height,
  rows = 3,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  rows?: number;
}) {
  const stepSize = height / rows;
  return (
    <g opacity={0.5}>
      {Array.from({ length: rows }, (_, i) => (
        <rect key={i} x={x} y={y + i * stepSize} width={width} height={stepSize * 0.34} fill={COLOR.vinco} />
      ))}
    </g>
  );
}

/** Placa com chanfro nos dois cantos — base de várias peças de receiver. */
export function Plate({
  x,
  y,
  width,
  height,
  fill = COLOR.polimero,
  bevel = 4,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  bevel?: number;
}) {
  return (
    <polygon
      points={pts(x + bevel, y, x + width - bevel, y, x + width, y + bevel, x + width, y + height - bevel, x + width - bevel, y + height, x + bevel, y + height, x, y + height - bevel, x, y + bevel)}
      fill={fill}
    />
  );
}

/** Parafusos ao longo de uma aresta — quebram superfícies grandes e chapadas. */
export function Bolts({
  x,
  y,
  count = 3,
  gap = 12,
  radius = 1.5,
}: {
  x: number;
  y: number;
  count?: number;
  gap?: number;
  radius?: number;
}) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <g key={i}>
          <circle cx={x + i * gap} cy={y} r={radius} fill={COLOR.metalSombra} />
          <circle cx={x + i * gap} cy={y - radius * 0.3} r={radius * 0.45} fill={COLOR.metalLuz} opacity={0.85} />
        </g>
      ))}
    </g>
  );
}

/** Linhas de painel: sugerem chapas separadas em vez de um bloco só. */
export function PanelLines({
  x,
  y,
  width,
  lines = 2,
  gap = 6,
}: {
  x: number;
  y: number;
  width: number;
  lines?: number;
  gap?: number;
}) {
  return (
    <g opacity={0.45}>
      {Array.from({ length: lines }, (_, i) => (
        <rect key={i} x={x} y={y + i * gap} width={width} height={1} fill={COLOR.vinco} />
      ))}
    </g>
  );
}
