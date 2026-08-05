import type { ReactNode } from 'react';
import type { WeaponArchetype } from '@/data/types';
import { Block, COLOR, pts, Point, Rail, Crease } from './palette';

/**
 * Silhuetas base, uma por família de arma. Todas desenhadas no mesmo espaço
 * (520 × 220, arma apontando para a direita) e com o mesmo conjunto de âncoras,
 * para que qualquer peça sirva em qualquer silhueta.
 */

export const SVG_WIDTH = 520;
export const SVG_HEIGHT = 220;

export interface Anchors {
  /** Onde a mira é montada. */
  rail: Point;
  /** Onde um ampliador ou mira auxiliar é montado. */
  opticExtra: Point;
  /** Início do cano — a boca fica adiante, conforme o cano escolhido. */
  barrelBase: Point;
  /** Trilho inferior, para empunhaduras e bipé. */
  underbarrel: Point;
  /** Boca do poço do carregador. */
  magazine: Point;
  /** Lateral do guarda-mão, para laser e lanterna. */
  side: Point;
  /** Traseira do receiver, onde a coronha se acopla. */
  stock: Point;
}

export interface Silhouette {
  body: ReactNode;
  anchors: Anchors;
  /** Silhuetas sem coronha, cano ou carregador ignoram essas peças. */
  accepts: {
    cano: boolean;
    stock: boolean;
    magazine: boolean;
    mira: boolean;
    acoplamento: boolean;
  };
}

const ALL_MOUNTS = { cano: true, stock: true, magazine: true, mira: true, acoplamento: true };

/* ------------------------------ Peças comuns ------------------------------ */

function PistolGrip({ x, y, tilt = -8 }: { x: number; y: number; tilt?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <polygon points={pts(-9, 0, 9, 0, 6, 40, -8, 38)} fill={COLOR.polimero} />
      <polygon points={pts(-9, 0, 9, 0, 9, 6, -9, 6)} fill={COLOR.polimeroLuz} />
      <polygon points={pts(-8, 32, 6.4, 33, 6, 40, -8, 38)} fill={COLOR.polimeroSombra} />
      {[12, 20, 28].map((d) => (
        <Crease key={d} x={-8} y={d} width={16} />
      ))}
    </g>
  );
}

function TriggerGuard({ x, y, width = 34 }: { x: number; y: number; width?: number }) {
  return (
    <g>
      <path
        d={`M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + 6} Q ${x + width / 2} ${y + 20} ${x} ${y + 6} Z`}
        fill={COLOR.polimeroSombra}
      />
      <rect x={x + width * 0.42} y={y} width={4} height={11} fill={COLOR.metalSombra} />
    </g>
  );
}

/* ------------------------------- Arquétipos ------------------------------- */

function natoRifle(): Silhouette {
  return {
    body: (
      <g>
        <Block x={92} y={100} width={160} height={40} bevelLeft={5} />
        <Rail x={112} y={96} width={132} teeth={11} />
        <Block x={250} y={104} width={72} height={30} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        {[262, 276, 290, 304].map((x) => (
          <Crease key={x} x={x} y={110} width={4} height={18} />
        ))}
        <Rail x={256} y={134} width={60} teeth={5} />
        <PistolGrip x={206} y={140} />
        <TriggerGuard x={228} y={140} />
        <Block x={236} y={136} width={24} height={10} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 178, y: 96 },
      opticExtra: { x: 128, y: 96 },
      barrelBase: { x: 322, y: 119 },
      underbarrel: { x: 288, y: 138 },
      magazine: { x: 248, y: 143 },
      side: { x: 262, y: 122 },
      stock: { x: 94, y: 120 },
    },
    accepts: ALL_MOUNTS,
  };
}

function easternRifle(): Silhouette {
  return {
    body: (
      <g>
        {/* Receiver mais alto e a alça de ferro característica da família AK. */}
        <Block x={96} y={98} width={150} height={44} bevelLeft={6} />
        <polygon points={pts(150, 98, 246, 98, 240, 88, 158, 88)} fill={COLOR.polimeroLuz} />
        <Rail x={120} y={94} width={112} teeth={9} />
        <Block x={244} y={104} width={66} height={32} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelRight={6} />
        <polygon points={pts(246, 104, 300, 104, 296, 96, 250, 96)} fill={COLOR.polimeroLuz} />
        <Rail x={250} y={136} width={54} teeth={5} />
        <PistolGrip x={202} y={142} tilt={-12} />
        <TriggerGuard x={224} y={142} />
        <Block x={232} y={138} width={22} height={10} color={COLOR.polimeroSombra} />
        {/* Bloco de gás inclinado, assinatura visual do AK. */}
        <polygon points={pts(310, 106, 330, 100, 334, 112, 312, 116)} fill={COLOR.metal} />
      </g>
    ),
    anchors: {
      rail: { x: 176, y: 94 },
      opticExtra: { x: 132, y: 94 },
      barrelBase: { x: 330, y: 118 },
      underbarrel: { x: 280, y: 140 },
      magazine: { x: 244, y: 145 },
      side: { x: 258, y: 122 },
      stock: { x: 98, y: 120 },
    },
    accepts: ALL_MOUNTS,
  };
}

function bullpup(): Silhouette {
  return {
    body: (
      <g>
        {/* No bullpup o carregador fica atrás da empunhadura. */}
        <Block x={86} y={98} width={196} height={46} bevelLeft={10} bevelRight={2} />
        <polygon points={pts(86, 118, 96, 98, 96, 144, 86, 138)} fill={COLOR.polimeroSombra} />
        <Rail x={110} y={94} width={150} teeth={12} />
        <Block x={280} y={106} width={58} height={28} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <Rail x={286} y={134} width={46} teeth={4} />
        <PistolGrip x={252} y={142} tilt={-6} />
        <TriggerGuard x={272} y={142} width={30} />
        <Block x={190} y={140} width={26} height={10} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 184, y: 94 },
      opticExtra: { x: 130, y: 94 },
      barrelBase: { x: 338, y: 120 },
      underbarrel: { x: 308, y: 138 },
      magazine: { x: 202, y: 147 },
      side: { x: 292, y: 124 },
      stock: { x: 88, y: 120 },
    },
    accepts: ALL_MOUNTS,
  };
}

function shortCarbine(): Silhouette {
  return {
    body: (
      <g>
        <Block x={118} y={102} width={140} height={38} bevelLeft={5} />
        <Rail x={136} y={98} width={116} teeth={10} />
        <Block x={256} y={106} width={54} height={28} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        {[266, 280, 294].map((x) => (
          <Crease key={x} x={x} y={112} width={4} height={16} />
        ))}
        <Rail x={260} y={134} width={44} teeth={4} />
        <PistolGrip x={208} y={140} />
        <TriggerGuard x={230} y={140} />
        <Block x={238} y={136} width={22} height={10} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 190, y: 98 },
      opticExtra: { x: 148, y: 98 },
      barrelBase: { x: 310, y: 120 },
      underbarrel: { x: 282, y: 138 },
      magazine: { x: 250, y: 143 },
      side: { x: 268, y: 124 },
      stock: { x: 120, y: 120 },
    },
    accepts: ALL_MOUNTS,
  };
}

function compactSmg(): Silhouette {
  return {
    body: (
      <g>
        <Block x={140} y={104} width={122} height={36} bevelLeft={4} />
        <Rail x={156} y={100} width={100} teeth={8} />
        <Block x={260} y={108} width={42} height={24} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={3} />
        <Rail x={264} y={132} width={34} teeth={3} />
        <PistolGrip x={216} y={140} />
        <TriggerGuard x={236} y={140} width={28} />
        <Block x={242} y={136} width={20} height={9} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 200, y: 100 },
      opticExtra: { x: 166, y: 100 },
      barrelBase: { x: 302, y: 120 },
      underbarrel: { x: 280, y: 136 },
      magazine: { x: 252, y: 143 },
      side: { x: 268, y: 124 },
      stock: { x: 142, y: 120 },
    },
    accepts: ALL_MOUNTS,
  };
}

function personalDefenseWeapon(): Silhouette {
  return {
    body: (
      <g>
        {/* Corpo único de polímero, com o carregador embutido por cima. */}
        <polygon points={pts(146, 100, 288, 100, 296, 112, 296, 138, 154, 138, 146, 124)} fill={COLOR.polimero} />
        <polygon points={pts(146, 100, 288, 100, 292, 108, 148, 108)} fill={COLOR.polimeroLuz} />
        <polygon points={pts(154, 132, 296, 132, 296, 138, 154, 138)} fill={COLOR.polimeroSombra} />
        <Rail x={162} y={96} width={112} teeth={9} />
        <Block x={286} y={110} width={30} height={20} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={3} />
        <PistolGrip x={210} y={138} tilt={-4} />
        <TriggerGuard x={228} y={138} width={26} />
      </g>
    ),
    anchors: {
      rail: { x: 208, y: 96 },
      opticExtra: { x: 172, y: 96 },
      barrelBase: { x: 316, y: 120 },
      underbarrel: { x: 270, y: 138 },
      magazine: { x: 250, y: 140 },
      side: { x: 276, y: 122 },
      stock: { x: 148, y: 118 },
    },
    accepts: ALL_MOUNTS,
  };
}

function beltFedLmg(): Silhouette {
  return {
    body: (
      <g>
        <Block x={80} y={96} width={176} height={44} bevelLeft={6} />
        <Rail x={104} y={92} width={140} teeth={12} />
        {/* Caixa de munição sob o receiver. */}
        <Block x={190} y={140} width={72} height={44} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelLeft={5} bevelRight={5} />
        <Crease x={196} y={152} width={60} height={3} />
        <Block x={254} y={102} width={78} height={32} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        {[264, 280, 296, 312].map((x) => (
          <Crease key={x} x={x} y={108} width={5} height={20} />
        ))}
        <Rail x={258} y={134} width={68} teeth={6} />
        <PistolGrip x={178} y={140} />
        <TriggerGuard x={198} y={140} width={26} />
        {/* Alça de transporte, típica das metralhadoras. */}
        <polygon points={pts(150, 92, 208, 92, 208, 86, 150, 86)} fill={COLOR.metal} />
      </g>
    ),
    anchors: {
      rail: { x: 172, y: 84 },
      opticExtra: { x: 122, y: 92 },
      barrelBase: { x: 332, y: 118 },
      underbarrel: { x: 296, y: 138 },
      magazine: { x: 226, y: 184 },
      side: { x: 268, y: 122 },
      stock: { x: 82, y: 118 },
    },
    accepts: ALL_MOUNTS,
  };
}

function lightLmg(): Silhouette {
  return {
    body: (
      <g>
        <Block x={92} y={100} width={162} height={40} bevelLeft={5} />
        <Rail x={114} y={96} width={132} teeth={11} />
        <Block x={252} y={104} width={80} height={30} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        {[262, 278, 294, 310].map((x) => (
          <Crease key={x} x={x} y={110} width={4} height={18} />
        ))}
        <Rail x={258} y={134} width={68} teeth={6} />
        <PistolGrip x={206} y={140} />
        <TriggerGuard x={228} y={140} />
        <Block x={236} y={136} width={26} height={10} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 180, y: 96 },
      opticExtra: { x: 130, y: 96 },
      barrelBase: { x: 332, y: 119 },
      underbarrel: { x: 300, y: 138 },
      magazine: { x: 249, y: 143 },
      side: { x: 270, y: 122 },
      stock: { x: 94, y: 120 },
    },
    accepts: ALL_MOUNTS,
  };
}

function dmr(): Silhouette {
  return {
    body: (
      <g>
        <Block x={84} y={100} width={172} height={40} bevelLeft={6} />
        <Rail x={106} y={96} width={144} teeth={12} />
        <Block x={254} y={106} width={86} height={28} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={5} />
        {[266, 284, 302, 320].map((x) => (
          <Crease key={x} x={x} y={112} width={4} height={16} />
        ))}
        <Rail x={260} y={134} width={72} teeth={6} />
        <PistolGrip x={204} y={140} />
        <TriggerGuard x={226} y={140} />
        <Block x={234} y={136} width={22} height={10} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 178, y: 96 },
      opticExtra: { x: 124, y: 96 },
      barrelBase: { x: 340, y: 120 },
      underbarrel: { x: 306, y: 138 },
      magazine: { x: 246, y: 143 },
      side: { x: 274, y: 124 },
      stock: { x: 86, y: 120 },
    },
    accepts: ALL_MOUNTS,
  };
}

function boltActionSniper(): Silhouette {
  return {
    body: (
      <g>
        {/* Coronha de chassi, com apoio de bochecha e punho integrado. */}
        <polygon points={pts(70, 104, 210, 100, 210, 146, 96, 150, 70, 132)} fill={COLOR.polimero} />
        <polygon points={pts(70, 104, 210, 100, 210, 110, 74, 114)} fill={COLOR.polimeroLuz} />
        <polygon points={pts(96, 140, 210, 138, 210, 146, 96, 150)} fill={COLOR.polimeroSombra} />
        <Block x={206} y={98} width={70} height={40} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} />
        <Rail x={140} y={94} width={128} teeth={11} />
        {/* Ferrolho e manete. */}
        <rect x={244} y={106} width={30} height={12} fill={COLOR.acoLuz} />
        <polygon points={pts(268, 112, 288, 122, 292, 132, 274, 124)} fill={COLOR.aco} />
        <Block x={274} y={106} width={62} height={26} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <Rail x={280} y={132} width={50} teeth={4} />
        <PistolGrip x={206} y={140} tilt={-2} />
        <TriggerGuard x={226} y={140} width={28} />
        <Block x={232} y={136} width={20} height={9} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 200, y: 94 },
      opticExtra: { x: 152, y: 94 },
      barrelBase: { x: 336, y: 119 },
      underbarrel: { x: 306, y: 136 },
      magazine: { x: 244, y: 145 },
      side: { x: 292, y: 122 },
      stock: { x: 72, y: 118 },
    },
    accepts: ALL_MOUNTS,
  };
}

function shotgun(): Silhouette {
  return {
    body: (
      <g>
        <Block x={110} y={104} width={140} height={36} bevelLeft={5} />
        <Rail x={130} y={100} width={112} teeth={9} />
        {/* Tubo de cartuchos sob o cano — a marca da escopeta. */}
        <Block x={248} y={122} width={92} height={16} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={4} />
        <Block x={248} y={104} width={70} height={20} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} />
        {[258, 272, 286, 300].map((x) => (
          <Crease key={x} x={x} y={108} width={4} height={12} />
        ))}
        <PistolGrip x={200} y={140} />
        <TriggerGuard x={220} y={140} width={30} />
      </g>
    ),
    anchors: {
      rail: { x: 186, y: 100 },
      opticExtra: { x: 142, y: 100 },
      barrelBase: { x: 318, y: 114 },
      underbarrel: { x: 290, y: 138 },
      magazine: { x: 244, y: 142 },
      side: { x: 268, y: 118 },
      stock: { x: 112, y: 120 },
    },
    accepts: { ...ALL_MOUNTS, magazine: false },
  };
}

function pistol(): Silhouette {
  return {
    body: (
      <g>
        <Block x={200} y={104} width={116} height={26} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={4} />
        {[214, 224, 234].map((x) => (
          <Crease key={x} x={x} y={110} width={4} height={14} />
        ))}
        <Block x={204} y={128} width={72} height={14} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} />
        <PistolGrip x={222} y={140} tilt={-14} />
        <TriggerGuard x={240} y={140} width={26} />
        <Rail x={276} y={130} width={34} teeth={3} />
      </g>
    ),
    anchors: {
      rail: { x: 250, y: 104 },
      opticExtra: { x: 220, y: 104 },
      barrelBase: { x: 316, y: 116 },
      underbarrel: { x: 292, y: 134 },
      magazine: { x: 218, y: 152 },
      side: { x: 288, y: 122 },
      stock: { x: 202, y: 118 },
    },
    accepts: { cano: true, stock: false, magazine: true, mira: true, acoplamento: false },
  };
}

function revolver(): Silhouette {
  return {
    body: (
      <g>
        <Block x={228} y={106} width={92} height={20} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={3} />
        {/* Tambor. */}
        <circle cx={252} cy={130} r={19} fill={COLOR.aco} />
        <path d="M 233 130 A 19 19 0 0 1 252 111 L 252 130 Z" fill={COLOR.acoLuz} />
        <path d="M 252 149 A 19 19 0 0 0 271 130 L 252 130 Z" fill={COLOR.acoSombra} />
        <circle cx={252} cy={130} r={5} fill={COLOR.vinco} />
        <Block x={228} y={126} width={20} height={12} color={COLOR.metalSombra} />
        <PistolGrip x={226} y={144} tilt={-18} />
        <TriggerGuard x={244} y={144} width={26} />
      </g>
    ),
    anchors: {
      rail: { x: 274, y: 106 },
      opticExtra: { x: 244, y: 106 },
      barrelBase: { x: 320, y: 116 },
      underbarrel: { x: 300, y: 134 },
      magazine: { x: 252, y: 150 },
      side: { x: 296, y: 122 },
      stock: { x: 228, y: 120 },
    },
    accepts: { cano: true, stock: false, magazine: false, mira: true, acoplamento: false },
  };
}

function knife(): Silhouette {
  return {
    body: (
      <g>
        <polygon points={pts(190, 128, 214, 118, 330, 106, 348, 118, 330, 128, 214, 134)} fill={COLOR.aco} />
        <polygon points={pts(214, 118, 330, 106, 348, 118, 330, 116, 216, 124)} fill={COLOR.acoLuz} />
        <polygon points={pts(216, 126, 330, 120, 330, 128, 214, 134)} fill={COLOR.acoSombra} />
        <Block x={150} y={120} width={44} height={18} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelLeft={4} />
        <rect x={190} y={116} width={6} height={26} fill={COLOR.metalSombra} />
        {[158, 168, 178].map((x) => (
          <Crease key={x} x={x} y={122} width={4} height={14} />
        ))}
      </g>
    ),
    anchors: {
      rail: { x: 260, y: 110 },
      opticExtra: { x: 230, y: 110 },
      barrelBase: { x: 348, y: 118 },
      underbarrel: { x: 280, y: 132 },
      magazine: { x: 240, y: 136 },
      side: { x: 270, y: 124 },
      stock: { x: 152, y: 128 },
    },
    accepts: { cano: false, stock: false, magazine: false, mira: false, acoplamento: false },
  };
}

function bluntWeapon(): Silhouette {
  return {
    body: (
      <g>
        <Block x={140} y={118} width={188} height={14} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelLeft={4} />
        {[152, 166, 180].map((x) => (
          <Crease key={x} x={x} y={118} width={4} height={14} />
        ))}
        <Block x={322} y={98} width={44} height={54} color={COLOR.aco} light={COLOR.acoLuz} shadow={COLOR.acoSombra} bevelLeft={6} bevelRight={6} />
        <polygon points={pts(366, 108, 386, 118, 386, 132, 366, 142)} fill={COLOR.metal} />
        <polygon points={pts(366, 108, 386, 118, 372, 120, 366, 116)} fill={COLOR.metalLuz} />
      </g>
    ),
    anchors: {
      rail: { x: 300, y: 112 },
      opticExtra: { x: 260, y: 112 },
      barrelBase: { x: 386, y: 124 },
      underbarrel: { x: 300, y: 132 },
      magazine: { x: 260, y: 134 },
      side: { x: 290, y: 124 },
      stock: { x: 142, y: 125 },
    },
    accepts: { cano: false, stock: false, magazine: false, mira: false, acoplamento: false },
  };
}

const BUILDERS: Record<WeaponArchetype, () => Silhouette> = {
  'ar-otan': natoRifle,
  'ar-leste': easternRifle,
  bullpup,
  'carabina-curta': shortCarbine,
  'smg-compacta': compactSmg,
  'smg-pdw': personalDefenseWeapon,
  'lmg-caixa': beltFedLmg,
  'lmg-leve': lightLmg,
  dmr,
  'sniper-ferrolho': boltActionSniper,
  escopeta: shotgun,
  pistola: pistol,
  revolver,
  faca: knife,
  contundente: bluntWeapon,
};

export function silhouetteFor(archetype: WeaponArchetype): Silhouette {
  return BUILDERS[archetype]();
}
