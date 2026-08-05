import type { ReactNode } from 'react';
import type { PecaAcessorio } from '@/dados/tipos';
import { Bloco, COR, pts, Trilho, Vinco } from './paleta';

/**
 * Peças que se encaixam na silhueta da arma.
 *
 * Cada peça desenha com a origem (0,0) no seu ponto de montagem: as de boca e
 * cano crescem para a direita, as de mira para cima, as de acoplamento e
 * carregador para baixo. Assim o mesmo componente serve para qualquer arma —
 * basta a silhueta informar onde fica a âncora.
 */

/** Comprimento visual do cano por peça. Sem peça, vale `CANO_PADRAO`. */
export const CANO_PADRAO = 58;

export const COMPRIMENTO_CANO: Partial<Record<PecaAcessorio, number>> = {
  'cano-curto': 32,
  'cano-longo': 88,
  'cano-pesado': 74,
};

/* --------------------------------- Boca --------------------------------- */

function Supressor() {
  return (
    <g>
      <Bloco x={0} y={-9} largura={54} altura={18} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroDir={4} />
      {[10, 20, 30, 40].map((x) => (
        <Vinco key={x} x={x} y={-9} largura={2} altura={18} />
      ))}
      <rect x={50} y={-4} width={5} height={8} fill={COR.vinco} />
    </g>
  );
}

function Freio() {
  return (
    <g>
      <Bloco x={0} y={-8} largura={22} altura={16} cor={COR.aco} luz={COR.acoLuz} sombra={COR.acoSombra} chanfroDir={3} />
      <rect x={5} y={-8} width={4} height={5} fill={COR.vinco} />
      <rect x={12} y={-8} width={4} height={5} fill={COR.vinco} />
      <rect x={5} y={3} width={4} height={5} fill={COR.vinco} />
      <rect x={12} y={3} width={4} height={5} fill={COR.vinco} />
    </g>
  );
}

function Compensador() {
  return (
    <g>
      <Bloco x={0} y={-7} largura={26} altura={14} cor={COR.aco} luz={COR.acoLuz} sombra={COR.acoSombra} chanfroDir={5} />
      <polygon points={pts(4, -7, 22, -7, 20, -2, 6, -2)} fill={COR.vinco} opacity={0.7} />
    </g>
  );
}

function QuebraChamas() {
  return (
    <g>
      <Bloco x={0} y={-6} largura={20} altura={12} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} />
      <polygon points={pts(20, -8, 30, -6, 30, 6, 20, 8)} fill={COR.metal} />
      <polygon points={pts(22, -6, 29, -4.5, 29, -1, 22, -1)} fill={COR.metalLuz} />
    </g>
  );
}

/* --------------------------------- Cano --------------------------------- */

function CanoTubo({ comprimento, espessura }: { comprimento: number; espessura: number }) {
  const meio = espessura / 2;
  return (
    <g>
      <Bloco
        x={0}
        y={-meio}
        largura={comprimento}
        altura={espessura}
        cor={COR.metal}
        luz={COR.metalLuz}
        sombra={COR.metalSombra}
      />
      <rect x={comprimento - 6} y={-meio - 1.5} width={6} height={espessura + 3} fill={COR.acoSombra} />
    </g>
  );
}

function CanoCurto() {
  return <CanoTubo comprimento={COMPRIMENTO_CANO['cano-curto']!} espessura={11} />;
}

function CanoLongo() {
  return (
    <g>
      <CanoTubo comprimento={COMPRIMENTO_CANO['cano-longo']!} espessura={10} />
      {/* Estrias de alívio, marca visual do cano longo. */}
      {[18, 30, 42, 54].map((x) => (
        <Vinco key={x} x={x} y={-5} largura={3} altura={10} />
      ))}
    </g>
  );
}

function CanoPesado() {
  return (
    <g>
      <CanoTubo comprimento={COMPRIMENTO_CANO['cano-pesado']!} espessura={16} />
      <Bloco x={6} y={-10} largura={22} altura={20} cor={COR.aco} luz={COR.acoLuz} sombra={COR.acoSombra} chanfroDir={3} />
    </g>
  );
}

/* --------------------------------- Miras --------------------------------- */

function MiraFerro() {
  return (
    <g>
      <polygon points={pts(-3, 0, 3, 0, 2, -9, -2, -9)} fill={COR.metal} />
      <rect x={-6} y={-11} width={12} height={2.5} fill={COR.metalSombra} />
    </g>
  );
}

function PontoVermelho() {
  return (
    <g>
      <Bloco x={-13} y={-9} largura={26} altura={9} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} />
      <Bloco x={-10} y={-24} largura={20} altura={15} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroEsq={3} chanfroDir={3} />
      <rect x={-6} y={-21} width={12} height={9} fill={COR.lente} opacity={0.75} />
      <rect x={-6} y={-21} width={12} height={3} fill={COR.lenteBrilho} opacity={0.6} />
      <circle cx={0} cy={-16.5} r={1.6} fill={COR.laser} />
    </g>
  );
}

function Holografica() {
  return (
    <g>
      <Bloco x={-18} y={-9} largura={36} altura={9} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} />
      <Bloco x={-16} y={-26} largura={32} altura={17} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroDir={4} />
      <rect x={-12} y={-23} width={17} height={11} fill={COR.lente} opacity={0.7} />
      <rect x={-12} y={-23} width={17} height={3.5} fill={COR.lenteBrilho} opacity={0.55} />
      <circle cx={-3.5} cy={-17.5} r={1.4} fill={COR.laser} />
    </g>
  );
}

function LunetaMedia() {
  return (
    <g>
      <Bloco x={-22} y={-9} largura={44} altura={8} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} />
      <Bloco x={-24} y={-24} largura={48} altura={15} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroEsq={4} chanfroDir={4} />
      <rect x={-30} y={-25} width={9} height={17} fill={COR.metalSombra} />
      <rect x={21} y={-26} width={11} height={19} fill={COR.metalSombra} />
      <rect x={22} y={-24} width={8} height={15} fill={COR.lente} opacity={0.75} />
      <rect x={22} y={-24} width={8} height={4} fill={COR.lenteBrilho} opacity={0.5} />
    </g>
  );
}

function LunetaLonga() {
  return (
    <g>
      <Bloco x={-30} y={-9} largura={60} altura={8} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} />
      <Bloco x={-34} y={-27} largura={68} altura={18} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroEsq={5} chanfroDir={5} />
      <rect x={-44} y={-29} width={12} height={22} fill={COR.metalSombra} />
      <rect x={32} y={-31} width={15} height={26} fill={COR.metalSombra} />
      <rect x={33} y={-28} width={12} height={20} fill={COR.lente} opacity={0.75} />
      <rect x={33} y={-28} width={12} height={5} fill={COR.lenteBrilho} opacity={0.5} />
      {/* Torres de ajuste, a marca de uma luneta de longo alcance. */}
      <rect x={-6} y={-34} width={12} height={8} fill={COR.metal} />
      <rect x={-4} y={-36} width={8} height={3} fill={COR.metalLuz} />
    </g>
  );
}

function Ampliador() {
  return (
    <g>
      <Bloco x={-12} y={-8} largura={24} altura={8} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} />
      <Bloco x={-11} y={-23} largura={22} altura={15} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroDir={3} />
      <rect x={-7} y={-20} width={12} height={9} fill={COR.lente} opacity={0.6} />
    </g>
  );
}

/* ----------------------------- Acoplamento ----------------------------- */

function EmpunhaduraVertical() {
  return (
    <g>
      <Bloco x={-5} y={0} largura={11} altura={26} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroEsq={2} chanfroDir={4} />
      {[7, 13, 19].map((y) => (
        <Vinco key={y} x={-5} y={y} largura={11} />
      ))}
    </g>
  );
}

function EmpunhaduraAngular() {
  return (
    <g>
      <polygon points={pts(-7, 0, 7, 0, 12, 20, 2, 20)} fill={COR.polimero} />
      <polygon points={pts(-7, 0, 7, 0, 8, 6, -6, 6)} fill={COR.polimeroLuz} />
      <polygon points={pts(1, 15, 11, 15, 12, 20, 2, 20)} fill={COR.polimeroSombra} />
    </g>
  );
}

function ApoioMao() {
  return (
    <g>
      <polygon points={pts(-5, 0, 5, 0, 4, 12, 0, 14, -4, 12)} fill={COR.polimero} />
      <polygon points={pts(-5, 0, 5, 0, 5, 4, -5, 4)} fill={COR.polimeroLuz} />
    </g>
  );
}

function Bipe() {
  return (
    <g>
      <rect x={-4} y={0} width={8} height={7} fill={COR.metalSombra} />
      <polygon points={pts(-2, 5, 1, 5, -12, 30, -16, 29)} fill={COR.metal} />
      <polygon points={pts(2, 5, 5, 5, 18, 29, 14, 30)} fill={COR.metal} />
      <rect x={-19} y={28} width={9} height={3.5} fill={COR.polimeroSombra} />
      <rect x={13} y={28} width={9} height={3.5} fill={COR.polimeroSombra} />
    </g>
  );
}

/* ------------------------------ Carregador ------------------------------ */

function CarregadorCurto() {
  return (
    <g>
      <polygon points={pts(-9, 0, 9, 0, 7, 24, -7, 24)} fill={COR.polimero} />
      <polygon points={pts(-9, 0, 9, 0, 9, 5, -9, 5)} fill={COR.polimeroLuz} />
      <polygon points={pts(-7.4, 19, 7.4, 19, 7, 24, -7, 24)} fill={COR.polimeroSombra} />
    </g>
  );
}

function CarregadorLongo() {
  return (
    <g>
      <polygon points={pts(-9, 0, 9, 0, 6, 44, -6, 44)} fill={COR.polimero} />
      <polygon points={pts(-9, 0, 9, 0, 9, 5, -9, 5)} fill={COR.polimeroLuz} />
      <polygon points={pts(-6.6, 37, 6.6, 37, 6, 44, -6, 44)} fill={COR.polimeroSombra} />
      {[14, 24, 34].map((y) => (
        <Vinco key={y} x={-8} y={y} largura={16} />
      ))}
    </g>
  );
}

function Tambor() {
  return (
    <g>
      <polygon points={pts(-9, 0, 9, 0, 8, 12, -8, 12)} fill={COR.polimero} />
      <circle cx={0} cy={30} r={19} fill={COR.polimero} />
      <path d="M -19 30 A 19 19 0 0 1 0 11 L 0 30 Z" fill={COR.polimeroLuz} />
      <path d="M 0 49 A 19 19 0 0 0 19 30 L 0 30 Z" fill={COR.polimeroSombra} />
      <circle cx={0} cy={30} r={6} fill={COR.metalSombra} />
    </g>
  );
}

/* -------------------------------- Laterais -------------------------------- */

function Laser() {
  return (
    <g>
      <Bloco x={0} y={-5} largura={20} altura={10} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroDir={2} />
      <circle cx={19} cy={0} r={2.6} fill={COR.laserFrio} />
      <rect x={21} y={-1} width={26} height={2} fill={COR.laserFrio} opacity={0.5} />
    </g>
  );
}

function Lanterna() {
  return (
    <g>
      <Bloco x={0} y={-6} largura={26} altura={12} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroDir={2} />
      <circle cx={25} cy={0} r={4.5} fill="#f4f1d8" opacity={0.9} />
      <polygon points={pts(28, -6, 52, -13, 52, 13, 28, 6)} fill="#f4f1d8" opacity={0.14} />
    </g>
  );
}

/* -------------------------------- Coronhas -------------------------------- */

function CoronhaLeve() {
  return (
    <g>
      <polygon points={pts(0, -14, -18, -14, -40, -8, -40, 6, -22, 6, 0, 14)} fill={COR.polimero} />
      <polygon points={pts(0, -14, -18, -14, -40, -8, -40, -3, -18, -9, 0, -9)} fill={COR.polimeroLuz} />
      {/* Vazado que caracteriza a coronha aliviada. */}
      <polygon points={pts(-33, -4, -12, -8, -12, 1, -33, 2)} fill={COR.vinco} opacity={0.55} />
    </g>
  );
}

function CoronhaPesada() {
  return (
    <g>
      <polygon points={pts(0, -16, -20, -16, -46, -12, -46, 12, -20, 10, 0, 16)} fill={COR.polimero} />
      <polygon points={pts(0, -16, -20, -16, -46, -12, -46, -6, -20, -10, 0, -10)} fill={COR.polimeroLuz} />
      <polygon points={pts(-46, 6, -20, 4, 0, 10, 0, 16, -20, 10, -46, 12)} fill={COR.polimeroSombra} />
      <rect x={-48} y={-12} width={5} height={24} fill={COR.vinco} opacity={0.7} />
    </g>
  );
}

/* -------------------------------------------------------------------------- */

const PECAS: Record<PecaAcessorio, () => ReactNode> = {
  supressor: Supressor,
  freio: Freio,
  compensador: Compensador,
  'quebra-chamas': QuebraChamas,
  'cano-curto': CanoCurto,
  'cano-longo': CanoLongo,
  'cano-pesado': CanoPesado,
  'ponto-vermelho': PontoVermelho,
  holografica: Holografica,
  'luneta-media': LunetaMedia,
  'luneta-longa': LunetaLonga,
  ferro: MiraFerro,
  'empunhadura-vertical': EmpunhaduraVertical,
  'empunhadura-angular': EmpunhaduraAngular,
  bipe: Bipe,
  'apoio-mao': ApoioMao,
  'carregador-curto': CarregadorCurto,
  'carregador-longo': CarregadorLongo,
  tambor: Tambor,
  laser: Laser,
  lanterna: Lanterna,
  'coronha-leve': CoronhaLeve,
  'coronha-pesada': CoronhaPesada,
  ampliador: Ampliador,
};

export function desenharPeca(peca: PecaAcessorio): ReactNode {
  const Componente = PECAS[peca];
  return Componente ? <Componente /> : null;
}

export { Trilho };
