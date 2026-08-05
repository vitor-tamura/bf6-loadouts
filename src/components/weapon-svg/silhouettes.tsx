import type { ReactNode } from 'react';
import type { WeaponArchetype } from '@/data/types';
import {
  Block,
  Bolts,
  ChargingHandle,
  COLOR,
  Crease,
  EjectionPort,
  FireSelector,
  FoldingSight,
  GripTexture,
  MlokSlots,
  PanelLines,
  Pins,
  Plate,
  pts,
  Point,
  Rail,
  VentHoles,
} from './palette';

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
        {/* Tubo da coronha, atrás do receiver. */}
        <Block x={92} y={108} width={34} height={20} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} />
        <Crease x={104} y={108} width={2} height={20} />

        {/* Receiver inferior e superior. */}
        <Block x={124} y={100} width={128} height={40} bevelLeft={4} />
        <Plate x={140} y={98} width={104} height={16} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={126} y={94} width={122} teeth={11} />
        <EjectionPort x={196} y={106} width={30} height={12} />
        <ChargingHandle x={128} y={100} length={20} />
        <FireSelector x={214} y={132} />
        <Pins x={150} y={132} gap={78} />
        <Bolts x={134} y={116} count={3} gap={10} />
        <PanelLines x={132} y={122} width={112} lines={2} gap={7} />

        {/* Guarda-mão com rasgos M-LOK. */}
        <Block x={250} y={104} width={72} height={30} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <MlokSlots x={256} y={112} width={60} slots={4} />
        <MlokSlots x={256} y={122} width={60} slots={4} />
        <Rail x={256} y={134} width={60} teeth={5} />
        <Crease x={250} y={104} width={2} height={30} />

        {/* Bloco de gás e mira dobrável. */}
        <Block x={306} y={100} width={14} height={16} color={COLOR.aco} light={COLOR.acoLuz} shadow={COLOR.acoSombra} />
        <FoldingSight x={313} y={100} />

        <PistolGrip x={206} y={140} />
        <GripTexture x={198} y={150} width={16} height={18} rows={3} />
        <TriggerGuard x={228} y={140} />
        <Block x={236} y={136} width={24} height={10} color={COLOR.polimeroSombra} />
      </g>
    ),
    anchors: {
      rail: { x: 186, y: 94 },
      opticExtra: { x: 140, y: 94 },
      barrelBase: { x: 320, y: 119 },
      underbarrel: { x: 288, y: 138 },
      magazine: { x: 248, y: 143 },
      side: { x: 262, y: 122 },
      stock: { x: 94, y: 118 },
    },
    accepts: ALL_MOUNTS,
  };
}

function easternRifle(): Silhouette {
  return {
    body: (
      <g>
        {/* Coronha de polímero, mais alta que a do padrão OTAN. */}
        <polygon points={pts(96, 104, 128, 100, 128, 138, 96, 142)} fill={COLOR.polimero} />
        <polygon points={pts(96, 104, 128, 100, 128, 108, 96, 112)} fill={COLOR.polimeroLuz} />
        <polygon points={pts(102, 126, 124, 123, 124, 132, 102, 135)} fill={COLOR.vinco} opacity={0.4} />

        {/* Receiver e a tampa superior nervurada — assinatura da família AK. */}
        <Block x={126} y={98} width={122} height={44} bevelLeft={4} />
        <polygon points={pts(150, 98, 246, 98, 240, 88, 158, 88)} fill={COLOR.polimeroLuz} />
        {[166, 178, 190, 202, 214, 226].map((x) => (
          <Crease key={x} x={x} y={89} width={3} height={9} />
        ))}
        <Rail x={152} y={86} width={86} teeth={7} />
        <EjectionPort x={196} y={104} width={30} height={13} />
        <ChargingHandle x={228} y={102} length={16} />
        {/* Alavanca de segurança externa, no lado direito. */}
        <polygon points={pts(238, 108, 250, 106, 250, 116, 238, 122)} fill={COLOR.metalSombra} />
        <Pins x={144} y={132} gap={72} />
        <Bolts x={136} y={116} count={3} gap={11} />
        <PanelLines x={134} y={124} width={106} lines={2} gap={7} />

        {/* Guarda-mão de polímero com furos de refrigeração. */}
        <Block x={244} y={104} width={66} height={32} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelRight={6} />
        <polygon points={pts(246, 104, 300, 104, 296, 96, 250, 96)} fill={COLOR.polimeroLuz} />
        <VentHoles x={256} y={118} count={6} radius={2.4} />
        <Rail x={250} y={136} width={54} teeth={5} />

        <PistolGrip x={202} y={142} tilt={-12} />
        <GripTexture x={194} y={152} width={16} height={18} rows={3} />
        <TriggerGuard x={224} y={142} />
        <Block x={232} y={138} width={22} height={10} color={COLOR.polimeroSombra} />

        {/* Bloco de gás inclinado e tomada de gás. */}
        <polygon points={pts(310, 106, 330, 100, 334, 112, 312, 116)} fill={COLOR.metal} />
        <polygon points={pts(313, 103, 326, 99, 327, 104, 314, 108)} fill={COLOR.metalLuz} />
        <FoldingSight x={322} y={100} />
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
        {/* No bullpup o mecanismo fica atrás da empunhadura, junto ao ombro. */}
        <Block x={86} y={98} width={196} height={46} bevelLeft={10} bevelRight={2} />
        <polygon points={pts(86, 118, 96, 98, 96, 144, 86, 138)} fill={COLOR.polimeroSombra} />
        <Plate x={104} y={102} width={70} height={18} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={110} y={94} width={150} teeth={12} />
        <EjectionPort x={150} y={106} width={26} height={12} />
        <ChargingHandle x={228} y={100} length={18} />
        <FireSelector x={244} y={134} />
        <Pins x={120} y={134} gap={60} />
        <Bolts x={196} y={124} count={4} gap={13} />
        <PanelLines x={104} y={126} width={168} lines={2} gap={7} />
        {/* Apoio de bochecha moldado na carcaça. */}
        <polygon points={pts(112, 98, 176, 98, 172, 92, 118, 92)} fill={COLOR.polimeroLuz} />

        <Block x={280} y={106} width={58} height={28} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <MlokSlots x={286} y={112} width={46} slots={3} />
        <MlokSlots x={286} y={122} width={46} slots={3} />
        <Rail x={286} y={134} width={46} teeth={4} />

        <PistolGrip x={252} y={142} tilt={-6} />
        <GripTexture x={244} y={152} width={16} height={18} rows={3} />
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
        {/* Coronha telescópica sobre o tubo. */}
        <Block x={118} y={110} width={30} height={18} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} />
        <Crease x={130} y={110} width={2} height={18} />

        <Block x={146} y={102} width={112} height={38} bevelLeft={4} />
        <Plate x={160} y={100} width={88} height={14} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={148} y={96} width={106} teeth={9} />
        <EjectionPort x={204} y={108} width={28} height={11} />
        <ChargingHandle x={150} y={102} length={18} />
        <FireSelector x={218} y={132} />
        <Pins x={168} y={132} gap={66} />
        <Bolts x={158} y={118} count={3} gap={10} />
        <PanelLines x={156} y={124} width={94} lines={2} gap={6} />

        <Block x={256} y={106} width={54} height={28} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <MlokSlots x={262} y={112} width={44} slots={3} />
        <MlokSlots x={262} y={121} width={44} slots={3} />
        <Rail x={260} y={134} width={44} teeth={4} />
        <FoldingSight x={303} y={104} />
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
        {/* Coronha retrátil de haste. */}
        <rect x={140} y={112} width={26} height={6} fill={COLOR.metal} />
        <rect x={138} y={106} width={8} height={20} rx={2} fill={COLOR.polimero} />

        <Block x={164} y={104} width={98} height={36} bevelLeft={4} />
        <Plate x={176} y={102} width={76} height={13} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={166} y={98} width={92} teeth={8} />
        <EjectionPort x={210} y={109} width={24} height={10} />
        <ChargingHandle x={168} y={104} length={16} />
        <FireSelector x={224} y={132} />
        <Pins x={182} y={132} gap={56} />
        <Bolts x={174} y={118} count={3} gap={10} />
        <PanelLines x={172} y={124} width={80} lines={2} gap={6} />

        <Block x={260} y={108} width={42} height={24} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={3} />
        <MlokSlots x={264} y={113} width={34} slots={2} />
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
        {/* Carregador embutido por cima, marca do PDW. */}
        <rect x={196} y={102} width={62} height={7} rx={2} fill={COLOR.polimeroSombra} opacity={0.7} />
        {[202, 214, 226, 238, 250].map((x) => (
          <Crease key={x} x={x} y={110} width={3} height={9} />
        ))}
        <EjectionPort x={264} y={112} width={20} height={9} />
        <FireSelector x={216} y={130} />
        <Block x={286} y={110} width={30} height={20} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={3} />
        <VentHoles x={290} y={120} count={3} radius={1.8} />
        <PistolGrip x={210} y={138} tilt={-4} />
        <GripTexture x={202} y={148} width={16} height={16} rows={3} />
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
        {/* Coronha esqueletada, com apoio de ombro largo. */}
        <polygon points={pts(80, 100, 116, 96, 116, 140, 80, 144)} fill={COLOR.polimero} />
        <polygon points={pts(80, 100, 116, 96, 116, 104, 80, 108)} fill={COLOR.polimeroLuz} />
        <polygon points={pts(88, 112, 110, 109, 110, 126, 88, 129)} fill={COLOR.vinco} opacity={0.45} />

        <Block x={114} y={96} width={142} height={44} bevelLeft={4} />
        <Plate x={130} y={94} width={112} height={16} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={116} y={90} width={132} teeth={11} />
        <EjectionPort x={196} y={102} width={34} height={14} />
        <ChargingHandle x={120} y={100} length={22} />
        <Pins x={140} y={130} gap={84} />
        <Bolts x={128} y={116} count={4} gap={12} />
        <PanelLines x={126} y={122} width={122} lines={3} gap={6} />

        {/* Caixa de munição sob o receiver, com a tira de cartuchos. */}
        <Block x={190} y={140} width={72} height={44} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelLeft={5} bevelRight={5} />
        <Crease x={196} y={152} width={60} height={3} />
        <Crease x={196} y={166} width={60} height={3} />
        {[198, 210, 222, 234, 246].map((x) => (
          <rect key={x} x={x} y={136} width={7} height={6} fill={COLOR.acoLuz} opacity={0.75} />
        ))}

        <Block x={254} y={102} width={78} height={32} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <VentHoles x={264} y={118} count={7} radius={2.6} />
        <Rail x={258} y={134} width={68} teeth={6} />

        <PistolGrip x={178} y={140} />
        <GripTexture x={170} y={150} width={16} height={18} rows={3} />
        <TriggerGuard x={198} y={140} width={26} />

        {/* Alça de transporte, típica das metralhadoras. */}
        <polygon points={pts(150, 88, 208, 88, 208, 82, 150, 82)} fill={COLOR.metal} />
        <polygon points={pts(150, 82, 208, 82, 208, 84, 150, 84)} fill={COLOR.metalLuz} />
        <rect x={148} y={84} width={5} height={8} fill={COLOR.metalSombra} />
        <rect x={205} y={84} width={5} height={8} fill={COLOR.metalSombra} />
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
        <Block x={92} y={108} width={32} height={20} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} />
        <Block x={122} y={100} width={132} height={40} bevelLeft={4} />
        <Plate x={138} y={98} width={106} height={15} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={124} y={94} width={124} teeth={11} />
        <EjectionPort x={198} y={106} width={32} height={13} />
        <ChargingHandle x={128} y={100} length={20} />
        <FireSelector x={216} y={132} />
        <Pins x={148} y={132} gap={78} />
        <Bolts x={136} y={116} count={3} gap={11} />
        <PanelLines x={134} y={123} width={112} lines={2} gap={7} />

        <Block x={252} y={104} width={80} height={30} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <MlokSlots x={258} y={111} width={68} slots={4} />
        <VentHoles x={262} y={124} count={6} radius={2.2} />
        <Rail x={258} y={134} width={68} teeth={6} />
        <FoldingSight x={324} y={102} />
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
        {/* Coronha com apoio de bochecha regulável. */}
        <polygon points={pts(84, 104, 122, 100, 122, 140, 84, 144)} fill={COLOR.polimero} />
        <polygon points={pts(84, 104, 122, 100, 122, 108, 84, 112)} fill={COLOR.polimeroLuz} />
        <rect x={92} y={94} width={30} height={8} rx={2} fill={COLOR.polimeroLuz} />

        <Block x={120} y={100} width={136} height={40} bevelLeft={4} />
        <Plate x={136} y={98} width={110} height={15} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={122} y={94} width={128} teeth={11} />
        <EjectionPort x={200} y={106} width={32} height={13} />
        <ChargingHandle x={126} y={100} length={20} />
        <FireSelector x={218} y={132} />
        <Pins x={146} y={132} gap={80} />
        <Bolts x={134} y={117} count={3} gap={11} />
        <PanelLines x={132} y={124} width={116} lines={2} gap={7} />

        <Block x={254} y={106} width={86} height={28} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={5} />
        <MlokSlots x={260} y={112} width={72} slots={4} />
        <MlokSlots x={260} y={121} width={72} slots={4} />
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
        <Plate x={214} y={96} width={54} height={12} fill={COLOR.acoLuz} bevel={2} />
        <Rail x={140} y={94} width={128} teeth={11} />

        {/* Ferrolho, manete e janela de ejeção. */}
        <rect x={244} y={106} width={30} height={12} fill={COLOR.acoLuz} />
        <rect x={246} y={108} width={26} height={3} fill={COLOR.metalSombra} opacity={0.6} />
        <polygon points={pts(268, 112, 288, 122, 292, 132, 274, 124)} fill={COLOR.aco} />
        <circle cx={290} cy={128} r={4.5} fill={COLOR.acoLuz} />
        <EjectionPort x={222} y={104} width={20} height={10} />
        <Pins x={216} y={130} gap={44} />
        <Bolts x={212} y={118} count={3} gap={13} />
        <PanelLines x={122} y={122} width={80} lines={2} gap={7} />

        {/* Chassi do guarda-mão, com rasgos de montagem. */}
        <Block x={274} y={106} width={62} height={26} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} bevelRight={4} />
        <MlokSlots x={280} y={112} width={50} slots={3} />
        <MlokSlots x={280} y={121} width={50} slots={3} />
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
        {/* Coronha de escopeta, com queda acentuada. */}
        <polygon points={pts(110, 108, 146, 104, 146, 140, 110, 148)} fill={COLOR.polimero} />
        <polygon points={pts(110, 108, 146, 104, 146, 112, 110, 116)} fill={COLOR.polimeroLuz} />

        <Block x={144} y={104} width={106} height={36} bevelLeft={4} />
        <Plate x={158} y={102} width={82} height={13} fill={COLOR.polimeroLuz} bevel={3} />
        <Rail x={146} y={98} width={100} teeth={8} />
        <EjectionPort x={196} y={110} width={26} height={11} />
        <Pins x={166} y={132} gap={62} />
        <Bolts x={156} y={118} count={3} gap={11} />
        <PanelLines x={154} y={124} width={86} lines={2} gap={6} />

        {/* Tubo de cartuchos sob o cano — a marca da escopeta. */}
        <Block x={248} y={122} width={92} height={16} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={4} />
        {[254, 268, 282, 296, 310, 324].map((x) => (
          <Crease key={x} x={x} y={122} width={2} height={16} />
        ))}
        <Block x={248} y={104} width={70} height={20} color={COLOR.polimeroLuz} light={COLOR.metalLuz} shadow={COLOR.polimero} />
        <MlokSlots x={254} y={110} width={58} slots={3} />
        {/* Bomba de acionamento. */}
        <Block x={266} y={118} width={40} height={12} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} bevelLeft={3} bevelRight={3} />
        <GripTexture x={270} y={120} width={32} height={8} rows={2} />
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
        {/* Ferrolho com estrias de manejo e janela de ejeção. */}
        <Block x={200} y={104} width={116} height={26} color={COLOR.metal} light={COLOR.metalLuz} shadow={COLOR.metalSombra} bevelRight={4} />
        {[206, 212, 218, 224, 230].map((x) => (
          <Crease key={x} x={x} y={108} width={3} height={18} />
        ))}
        <EjectionPort x={254} y={106} width={22} height={9} />
        <FoldingSight x={210} y={104} />
        <rect x={306} y={106} width={4} height={5} fill={COLOR.metalSombra} />
        <Block x={204} y={128} width={72} height={14} color={COLOR.polimero} light={COLOR.polimeroLuz} shadow={COLOR.polimeroSombra} />
        <circle cx={218} cy={135} r={2.6} fill={COLOR.metalSombra} />
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
