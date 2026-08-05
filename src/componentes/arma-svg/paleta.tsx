import type { ReactNode } from 'react';

/**
 * Paleta e primitivas do desenho das armas.
 *
 * Não existe fonte legal para a arte oficial do jogo, então cada arma é
 * desenhada aqui — silhueta reconhecível em poucos polígonos, com três tons por
 * material para dar volume sem sair do estilo low-poly.
 */

export const COR = {
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
  destaque: '#ff8a00',
} as const;

export interface Ponto {
  x: number;
  y: number;
}

/** Converte pares de coordenadas em atributo `points`. */
export function pts(...coords: number[]): string {
  const saida: string[] = [];
  for (let i = 0; i < coords.length; i += 2) saida.push(`${coords[i]},${coords[i + 1]}`);
  return saida.join(' ');
}

/**
 * Bloco com faceta de luz no topo e de sombra na base — o tijolo básico de
 * quase toda peça deste arquivo.
 */
export function Bloco({
  x,
  y,
  largura,
  altura,
  cor = COR.polimero,
  luz = COR.polimeroLuz,
  sombra = COR.polimeroSombra,
  chanfroEsq = 0,
  chanfroDir = 0,
  faceta = 0.28,
}: {
  x: number;
  y: number;
  largura: number;
  altura: number;
  cor?: string;
  luz?: string;
  sombra?: string;
  /** Corte diagonal no canto esquerdo. */
  chanfroEsq?: number;
  /** Corte diagonal no canto direito. */
  chanfroDir?: number;
  /** Fração da altura ocupada pela faceta de luz. */
  faceta?: number;
}): ReactNode {
  const x2 = x + largura;
  const y2 = y + altura;
  const hLuz = altura * faceta;

  return (
    <g>
      <polygon
        points={pts(
          x + chanfroEsq,
          y,
          x2 - chanfroDir,
          y,
          x2,
          y + chanfroDir,
          x2,
          y2 - chanfroDir,
          x2 - chanfroDir,
          y2,
          x + chanfroEsq,
          y2,
          x,
          y2 - chanfroEsq,
          x,
          y + chanfroEsq,
        )}
        fill={cor}
      />
      <polygon
        points={pts(x + chanfroEsq, y, x2 - chanfroDir, y, x2 - chanfroDir, y + hLuz, x + chanfroEsq, y + hLuz)}
        fill={luz}
      />
      <polygon
        points={pts(
          x + chanfroEsq,
          y2 - hLuz * 0.7,
          x2 - chanfroDir,
          y2 - hLuz * 0.7,
          x2 - chanfroDir,
          y2,
          x + chanfroEsq,
          y2,
        )}
        fill={sombra}
      />
    </g>
  );
}

/** Vinco fino, para sugerir junção entre peças. */
export function Vinco({ x, y, largura, altura = 1.6 }: { x: number; y: number; largura: number; altura?: number }) {
  return <rect x={x} y={y} width={largura} height={altura} fill={COR.vinco} opacity={0.55} />;
}

/** Trilho picatinny: base contínua com dentes por cima. */
export function Trilho({ x, y, largura, dentes = 8 }: { x: number; y: number; largura: number; dentes?: number }) {
  const passo = largura / dentes;
  return (
    <g>
      <rect x={x} y={y} width={largura} height={4} fill={COR.metalSombra} />
      {Array.from({ length: dentes }, (_, i) => (
        <rect key={i} x={x + i * passo + passo * 0.2} y={y - 2.5} width={passo * 0.5} height={3} fill={COR.metal} />
      ))}
    </g>
  );
}
