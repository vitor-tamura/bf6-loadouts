import type { ReactNode } from 'react';
import type { AttachmentPart } from '@/data/types';
import { Block, COLOR, Crease, MlokSlots, pts, Rail, VentHoles } from './palette';

/**
 * Peças que se encaixam na silhueta da arma.
 *
 * Cada peça desenha com a origem (0,0) no seu ponto de montagem: as de boca e
 * cano crescem para a direita, as de mira para cima, as de acoplamento e
 * carregador para baixo. Assim o mesmo componente serve para qualquer arma —
 * basta a silhueta informar onde fica a âncora.
 */

/** Comprimento visual do cano por peça. Sem peça, vale `CANO_PADRAO`. */
export const DEFAULT_BARREL_LENGTH = 58;

export const BARREL_LENGTH: Partial<Record<AttachmentPart, number>> = {
  'cano-curto': 32,
  'cano-longo': 88,
  'cano-pesado': 74,
};

/* --------------------------------- Boca --------------------------------- */

function Suppressor() {
  return (
    <g>
      {/* Colar de rosca, corpo e as câmaras internas. */}
      <Block x={-4} y={-7} width={8} height={14} color={COLOR.aco} light={COLOR.acoLuz} shadow={COLOR.acoSombra} />
      <Block x={4} y={-9} width={50} height={18} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={4} />
      {[10, 17, 24, 31, 38, 45].map((x) => (
        <Crease key={x} x={x} y={-9} width={2} height={18} />
      ))}
      <rect x={6} y={-6} width={46} height={2} fill={COLOR.metalLuz} opacity={0.5} />
      <rect x={50} y={-4} width={5} height={8} fill={COLOR.vinco} />
    </g>
  );
}

function MuzzleBrake() {
  return (
    <g>
      <Block x={0} y={-8} width={22} height={16} color={COLOR.aco} light={COLOR.acoLuz} shadow={COLOR.acoSombra} bevelRight={3} />
      <rect x={5} y={-8} width={4} height={5} fill={COLOR.vinco} />
      <rect x={12} y={-8} width={4} height={5} fill={COLOR.vinco} />
      <rect x={5} y={3} width={4} height={5} fill={COLOR.vinco} />
      <rect x={12} y={3} width={4} height={5} fill={COLOR.vinco} />
    </g>
  );
}

function Compensator() {
  return (
    <g>
      <Block x={0} y={-7} width={26} height={14} color={COLOR.aco} light={COLOR.acoLuz} shadow={COLOR.acoSombra} bevelRight={5} />
      <polygon points={pts(4, -7, 22, -7, 20, -2, 6, -2)} fill={COLOR.vinco} opacity={0.7} />
    </g>
  );
}

function FlashHider() {
  return (
    <g>
      <Block x={0} y={-6} width={20} height={12} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} />
      <polygon points={pts(20, -8, 30, -6, 30, 6, 20, 8)} fill={COLOR.metal} />
      <polygon points={pts(22, -6, 29, -4.5, 29, -1, 22, -1)} fill={COLOR.metalLuz} />
    </g>
  );
}

/* --------------------------------- Cano --------------------------------- */

function BarrelTube({ length, thickness }: { length: number; thickness: number }) {
  const midpoint = thickness / 2;
  return (
    <g>
      <Block
        x={0}
        y={-midpoint}
        width={length}
        height={thickness}
        color={COLOR.metal}
        light={COLOR.metalLuz}
        shadow={COLOR.metalSombra}
      />
      <rect x={length - 6} y={-midpoint - 1.5} width={6} height={thickness + 3} fill={COLOR.acoSombra} />
    </g>
  );
}

function ShortBarrel() {
  return <BarrelTube length={BARREL_LENGTH['cano-curto']!} thickness={11} />;
}

function LongBarrel() {
  return (
    <g>
      <BarrelTube length={BARREL_LENGTH['cano-longo']!} thickness={10} />
      {/* Estrias de alívio, marca visual do cano longo. */}
      {[18, 30, 42, 54].map((x) => (
        <Crease key={x} x={x} y={-5} width={3} height={10} />
      ))}
    </g>
  );
}

function HeavyBarrel() {
  return (
    <g>
      <BarrelTube length={BARREL_LENGTH['cano-pesado']!} thickness={16} />
      <Block x={6} y={-10} width={22} height={20} color={COLOR.aco} light={COLOR.acoLuz} shadow={COLOR.acoSombra} bevelRight={3} />
    </g>
  );
}

/* --------------------------------- Miras --------------------------------- */

function IronSight() {
  return (
    <g>
      <polygon points={pts(-3, 0, 3, 0, 2, -9, -2, -9)} fill={COLOR.metal} />
      <rect x={-6} y={-11} width={12} height={2.5} fill={COLOR.metalSombra} />
    </g>
  );
}

function RedDot() {
  return (
    <g>
      <Block x={-13} y={-9} width={26} height={9} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} />
      <Block x={-10} y={-24} width={20} height={15} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelLeft={3} bevelRight={3} />
      <rect x={-6} y={-21} width={12} height={9} fill={COLOR.lente} opacity={0.75} />
      <rect x={-6} y={-21} width={12} height={3} fill={COLOR.lenteBrilho} opacity={0.6} />
      <circle cx={0} cy={-16.5} r={1.6} fill={COLOR.laser} />
    </g>
  );
}

function HoloSight() {
  return (
    <g>
      <Block x={-18} y={-9} width={36} height={9} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} />
      <Block x={-16} y={-26} width={32} height={17} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelRight={4} />
      <rect x={-12} y={-23} width={17} height={11} fill={COLOR.lente} opacity={0.7} />
      <rect x={-12} y={-23} width={17} height={3.5} fill={COLOR.lenteBrilho} opacity={0.55} />
      <circle cx={-3.5} cy={-17.5} r={1.4} fill={COLOR.laser} />
    </g>
  );
}

function MidScope() {
  return (
    <g>
      {/* Base, anéis de montagem, tubo, torres de ajuste e as duas lentes. */}
      <Block x={-22} y={-9} width={44} height={8} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} />
      <rect x={-18} y={-16} width={7} height={8} fill={COLOR.metalSombra} />
      <rect x={11} y={-16} width={7} height={8} fill={COLOR.metalSombra} />
      <Block x={-24} y={-24} width={48} height={15} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelLeft={4} bevelRight={4} />
      <rect x={-30} y={-25} width={9} height={17} fill={COLOR.metalSombra} />
      <rect x={-29} y={-23} width={7} height={13} fill={COLOR.lente} opacity={0.4} />
      <rect x={21} y={-26} width={11} height={19} fill={COLOR.metalSombra} />
      <rect x={22} y={-24} width={8} height={15} fill={COLOR.lente} opacity={0.75} />
      <rect x={22} y={-24} width={8} height={4} fill={COLOR.lenteBrilho} opacity={0.5} />
      {/* Torre de elevação e anel de ampliação. */}
      <rect x={-6} y={-30} width={11} height={7} fill={COLOR.metal} />
      <rect x={-4} y={-32} width={7} height={3} fill={COLOR.metalLuz} />
      {[14, 17].map((x) => (
        <Crease key={x} x={x} y={-24} width={2} height={15} />
      ))}
    </g>
  );
}

function LongScope() {
  return (
    <g>
      <Block x={-30} y={-9} width={60} height={8} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} />
      <Block x={-34} y={-27} width={68} height={18} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelLeft={5} bevelRight={5} />
      <rect x={-44} y={-29} width={12} height={22} fill={COLOR.metalSombra} />
      <rect x={32} y={-31} width={15} height={26} fill={COLOR.metalSombra} />
      <rect x={33} y={-28} width={12} height={20} fill={COLOR.lente} opacity={0.75} />
      <rect x={33} y={-28} width={12} height={5} fill={COLOR.lenteBrilho} opacity={0.5} />
      {/* Torres de ajuste, a marca de uma luneta de longo alcance. */}
      <rect x={-6} y={-34} width={12} height={8} fill={COLOR.metal} />
      <rect x={-4} y={-36} width={8} height={3} fill={COLOR.metalLuz} />
    </g>
  );
}

function Magnifier() {
  return (
    <g>
      <Block x={-12} y={-8} width={24} height={8} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} />
      <Block x={-11} y={-23} width={22} height={15} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={3} />
      <rect x={-7} y={-20} width={12} height={9} fill={COLOR.lente} opacity={0.6} />
    </g>
  );
}

/* ----------------------------- Acoplamento ----------------------------- */

function VerticalGrip() {
  return (
    <g>
      <Block x={-8} y={-2} width={17} height={5} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} />
      <Block x={-5} y={2} width={11} height={26} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelLeft={2} bevelRight={4} />
      {[7, 11, 15, 19, 23].map((y) => (
        <Crease key={y} x={-5} y={y} width={11} />
      ))}
    </g>
  );
}

function AngledGrip() {
  return (
    <g>
      <polygon points={pts(-7, 0, 7, 0, 12, 20, 2, 20)} fill={COLOR.polimero} />
      <polygon points={pts(-7, 0, 7, 0, 8, 6, -6, 6)} fill={COLOR.polimeroLuz} />
      <polygon points={pts(1, 15, 11, 15, 12, 20, 2, 20)} fill={COLOR.polimeroSombra} />
    </g>
  );
}

function Handstop() {
  return (
    <g>
      <polygon points={pts(-5, 0, 5, 0, 4, 12, 0, 14, -4, 12)} fill={COLOR.polimero} />
      <polygon points={pts(-5, 0, 5, 0, 5, 4, -5, 4)} fill={COLOR.polimeroLuz} />
    </g>
  );
}

function Bipod() {
  return (
    <g>
      <rect x={-4} y={0} width={8} height={7} fill={COLOR.metalSombra} />
      <polygon points={pts(-2, 5, 1, 5, -12, 30, -16, 29)} fill={COLOR.metal} />
      <polygon points={pts(2, 5, 5, 5, 18, 29, 14, 30)} fill={COLOR.metal} />
      <rect x={-19} y={28} width={9} height={3.5} fill={COLOR.polimeroSombra} />
      <rect x={13} y={28} width={9} height={3.5} fill={COLOR.polimeroSombra} />
    </g>
  );
}

/* ------------------------------ Carregador ------------------------------ */

function ShortMagazine() {
  return (
    <g>
      <polygon points={pts(-9, 0, 9, 0, 7, 24, -7, 24)} fill={COLOR.polimero} />
      <polygon points={pts(-9, 0, 9, 0, 9, 5, -9, 5)} fill={COLOR.polimeroLuz} />
      <polygon points={pts(-7.4, 19, 7.4, 19, 7, 24, -7, 24)} fill={COLOR.polimeroSombra} />
    </g>
  );
}

function ExtendedMagazine() {
  return (
    <g>
      <polygon points={pts(-9, 0, 9, 0, 6, 44, -6, 44)} fill={COLOR.polimero} />
      <polygon points={pts(-9, 0, 9, 0, 9, 5, -9, 5)} fill={COLOR.polimeroLuz} />
      <polygon points={pts(-6.6, 37, 6.6, 37, 6, 44, -6, 44)} fill={COLOR.polimeroSombra} />
      {[14, 24, 34].map((y) => (
        <Crease key={y} x={-8} y={y} width={16} />
      ))}
    </g>
  );
}

function DrumMagazine() {
  return (
    <g>
      <polygon points={pts(-9, 0, 9, 0, 8, 12, -8, 12)} fill={COLOR.polimero} />
      <circle cx={0} cy={30} r={19} fill={COLOR.polimero} />
      <path d="M -19 30 A 19 19 0 0 1 0 11 L 0 30 Z" fill={COLOR.polimeroLuz} />
      <path d="M 0 49 A 19 19 0 0 0 19 30 L 0 30 Z" fill={COLOR.polimeroSombra} />
      <circle cx={0} cy={30} r={6} fill={COLOR.metalSombra} />
      <circle cx={0} cy={30} r={13} fill="none" stroke={COLOR.vinco} strokeWidth={1.4} opacity={0.6} />
      <rect x={-3} y={14} width={6} height={7} rx={2} fill={COLOR.vinco} opacity={0.7} />
    </g>
  );
}

/* -------------------------------- Laterais -------------------------------- */

function LaserModule() {
  return (
    <g>
      <Block x={0} y={-5} width={20} height={10} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelRight={2} />
      <circle cx={19} cy={0} r={2.6} fill={COLOR.laserFrio} />
      <rect x={21} y={-1} width={26} height={2} fill={COLOR.laserFrio} opacity={0.5} />
    </g>
  );
}

function Flashlight() {
  return (
    <g>
      <Block x={0} y={-6} width={26} height={12} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={2} />
      <circle cx={25} cy={0} r={4.5} fill="#f4f1d8" opacity={0.9} />
      <polygon points={pts(28, -6, 52, -13, 52, 13, 28, 6)} fill="#f4f1d8" opacity={0.14} />
    </g>
  );
}

/* -------------------------------- Coronhas -------------------------------- */

function LightStock() {
  return (
    <g>
      <polygon points={pts(0, -14, -18, -14, -40, -8, -40, 6, -22, 6, 0, 14)} fill={COLOR.polimero} />
      <polygon points={pts(0, -14, -18, -14, -40, -8, -40, -3, -18, -9, 0, -9)} fill={COLOR.polimeroLuz} />
      {/* Vazado que caracteriza a coronha aliviada. */}
      <polygon points={pts(-33, -4, -12, -8, -12, 1, -33, 2)} fill={COLOR.vinco} opacity={0.55} />
    </g>
  );
}

function HeavyStock() {
  return (
    <g>
      <polygon points={pts(0, -16, -20, -16, -46, -12, -46, 12, -20, 10, 0, 16)} fill={COLOR.polimero} />
      <polygon points={pts(0, -16, -20, -16, -46, -12, -46, -6, -20, -10, 0, -10)} fill={COLOR.polimeroLuz} />
      <polygon points={pts(-46, 6, -20, 4, 0, 10, 0, 16, -20, 10, -46, 12)} fill={COLOR.polimeroSombra} />
      <rect x={-48} y={-12} width={5} height={24} fill={COLOR.vinco} opacity={0.7} />
    </g>
  );
}

/* -------------------------------------------------------------------------- */

const PARTS: Record<AttachmentPart, () => ReactNode> = {
  supressor: Suppressor,
  freio: MuzzleBrake,
  compensador: Compensator,
  'quebra-chamas': FlashHider,
  'cano-curto': ShortBarrel,
  'cano-longo': LongBarrel,
  'cano-pesado': HeavyBarrel,
  'ponto-vermelho': RedDot,
  holografica: HoloSight,
  'luneta-media': MidScope,
  'luneta-longa': LongScope,
  ferro: IronSight,
  'empunhadura-vertical': VerticalGrip,
  'empunhadura-angular': AngledGrip,
  bipe: Bipod,
  'apoio-mao': Handstop,
  'carregador-curto': ShortMagazine,
  'carregador-longo': ExtendedMagazine,
  tambor: DrumMagazine,
  laser: LaserModule,
  lanterna: Flashlight,
  'coronha-leve': LightStock,
  'coronha-pesada': HeavyStock,
  ampliador: Magnifier,
};

export function drawPart(part: AttachmentPart): ReactNode {
  const Componente = PARTS[part];
  return Componente ? <Componente /> : null;
}

export { Rail };
