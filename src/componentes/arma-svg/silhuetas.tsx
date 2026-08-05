import type { ReactNode } from 'react';
import type { ArquetipoArma } from '@/dados/tipos';
import { Bloco, COR, pts, Ponto, Trilho, Vinco } from './paleta';

/**
 * Silhuetas base, uma por família de arma. Todas desenhadas no mesmo espaço
 * (520 × 220, arma apontando para a direita) e com o mesmo conjunto de âncoras,
 * para que qualquer peça sirva em qualquer silhueta.
 */

export const LARGURA_SVG = 520;
export const ALTURA_SVG = 220;

export interface Ancoras {
  /** Onde a mira é montada. */
  trilho: Ponto;
  /** Onde um ampliador ou mira auxiliar é montado. */
  opticoExtra: Ponto;
  /** Início do cano — a boca fica adiante, conforme o cano escolhido. */
  canoBase: Ponto;
  /** Trilho inferior, para empunhaduras e bipé. */
  inferior: Ponto;
  /** Boca do poço do carregador. */
  carregador: Ponto;
  /** Lateral do guarda-mão, para laser e lanterna. */
  lateral: Ponto;
  /** Traseira do receiver, onde a coronha se acopla. */
  coronha: Ponto;
}

export interface Silhueta {
  corpo: ReactNode;
  ancoras: Ancoras;
  /** Silhuetas sem coronha, cano ou carregador ignoram essas peças. */
  aceita: {
    cano: boolean;
    coronha: boolean;
    carregador: boolean;
    mira: boolean;
    acoplamento: boolean;
  };
}

const TUDO = { cano: true, coronha: true, carregador: true, mira: true, acoplamento: true };

/* ------------------------------ Peças comuns ------------------------------ */

function Empunhadura({ x, y, inclinacao = -8 }: { x: number; y: number; inclinacao?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${inclinacao})`}>
      <polygon points={pts(-9, 0, 9, 0, 6, 40, -8, 38)} fill={COR.polimero} />
      <polygon points={pts(-9, 0, 9, 0, 9, 6, -9, 6)} fill={COR.polimeroLuz} />
      <polygon points={pts(-8, 32, 6.4, 33, 6, 40, -8, 38)} fill={COR.polimeroSombra} />
      {[12, 20, 28].map((d) => (
        <Vinco key={d} x={-8} y={d} largura={16} />
      ))}
    </g>
  );
}

function GuardaMato({ x, y, largura = 34 }: { x: number; y: number; largura?: number }) {
  return (
    <g>
      <path
        d={`M ${x} ${y} L ${x + largura} ${y} L ${x + largura} ${y + 6} Q ${x + largura / 2} ${y + 20} ${x} ${y + 6} Z`}
        fill={COR.polimeroSombra}
      />
      <rect x={x + largura * 0.42} y={y} width={4} height={11} fill={COR.metalSombra} />
    </g>
  );
}

/* ------------------------------- Arquétipos ------------------------------- */

function arOtan(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={92} y={100} largura={160} altura={40} chanfroEsq={5} />
        <Trilho x={112} y={96} largura={132} dentes={11} />
        <Bloco x={250} y={104} largura={72} altura={30} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={4} />
        {[262, 276, 290, 304].map((x) => (
          <Vinco key={x} x={x} y={110} largura={4} altura={18} />
        ))}
        <Trilho x={256} y={134} largura={60} dentes={5} />
        <Empunhadura x={206} y={140} />
        <GuardaMato x={228} y={140} />
        <Bloco x={236} y={136} largura={24} altura={10} cor={COR.polimeroSombra} />
      </g>
    ),
    ancoras: {
      trilho: { x: 178, y: 96 },
      opticoExtra: { x: 128, y: 96 },
      canoBase: { x: 322, y: 119 },
      inferior: { x: 288, y: 138 },
      carregador: { x: 248, y: 143 },
      lateral: { x: 262, y: 122 },
      coronha: { x: 94, y: 120 },
    },
    aceita: TUDO,
  };
}

function arLeste(): Silhueta {
  return {
    corpo: (
      <g>
        {/* Receiver mais alto e a alça de ferro característica da família AK. */}
        <Bloco x={96} y={98} largura={150} altura={44} chanfroEsq={6} />
        <polygon points={pts(150, 98, 246, 98, 240, 88, 158, 88)} fill={COR.polimeroLuz} />
        <Trilho x={120} y={94} largura={112} dentes={9} />
        <Bloco x={244} y={104} largura={66} altura={32} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroDir={6} />
        <polygon points={pts(246, 104, 300, 104, 296, 96, 250, 96)} fill={COR.polimeroLuz} />
        <Trilho x={250} y={136} largura={54} dentes={5} />
        <Empunhadura x={202} y={142} inclinacao={-12} />
        <GuardaMato x={224} y={142} />
        <Bloco x={232} y={138} largura={22} altura={10} cor={COR.polimeroSombra} />
        {/* Bloco de gás inclinado, assinatura visual do AK. */}
        <polygon points={pts(310, 106, 330, 100, 334, 112, 312, 116)} fill={COR.metal} />
      </g>
    ),
    ancoras: {
      trilho: { x: 176, y: 94 },
      opticoExtra: { x: 132, y: 94 },
      canoBase: { x: 330, y: 118 },
      inferior: { x: 280, y: 140 },
      carregador: { x: 244, y: 145 },
      lateral: { x: 258, y: 122 },
      coronha: { x: 98, y: 120 },
    },
    aceita: TUDO,
  };
}

function bullpup(): Silhueta {
  return {
    corpo: (
      <g>
        {/* No bullpup o carregador fica atrás da empunhadura. */}
        <Bloco x={86} y={98} largura={196} altura={46} chanfroEsq={10} chanfroDir={2} />
        <polygon points={pts(86, 118, 96, 98, 96, 144, 86, 138)} fill={COR.polimeroSombra} />
        <Trilho x={110} y={94} largura={150} dentes={12} />
        <Bloco x={280} y={106} largura={58} altura={28} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={4} />
        <Trilho x={286} y={134} largura={46} dentes={4} />
        <Empunhadura x={252} y={142} inclinacao={-6} />
        <GuardaMato x={272} y={142} largura={30} />
        <Bloco x={190} y={140} largura={26} altura={10} cor={COR.polimeroSombra} />
      </g>
    ),
    ancoras: {
      trilho: { x: 184, y: 94 },
      opticoExtra: { x: 130, y: 94 },
      canoBase: { x: 338, y: 120 },
      inferior: { x: 308, y: 138 },
      carregador: { x: 202, y: 147 },
      lateral: { x: 292, y: 124 },
      coronha: { x: 88, y: 120 },
    },
    aceita: TUDO,
  };
}

function carabinaCurta(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={118} y={102} largura={140} altura={38} chanfroEsq={5} />
        <Trilho x={136} y={98} largura={116} dentes={10} />
        <Bloco x={256} y={106} largura={54} altura={28} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={4} />
        {[266, 280, 294].map((x) => (
          <Vinco key={x} x={x} y={112} largura={4} altura={16} />
        ))}
        <Trilho x={260} y={134} largura={44} dentes={4} />
        <Empunhadura x={208} y={140} />
        <GuardaMato x={230} y={140} />
        <Bloco x={238} y={136} largura={22} altura={10} cor={COR.polimeroSombra} />
      </g>
    ),
    ancoras: {
      trilho: { x: 190, y: 98 },
      opticoExtra: { x: 148, y: 98 },
      canoBase: { x: 310, y: 120 },
      inferior: { x: 282, y: 138 },
      carregador: { x: 250, y: 143 },
      lateral: { x: 268, y: 124 },
      coronha: { x: 120, y: 120 },
    },
    aceita: TUDO,
  };
}

function smgCompacta(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={140} y={104} largura={122} altura={36} chanfroEsq={4} />
        <Trilho x={156} y={100} largura={100} dentes={8} />
        <Bloco x={260} y={108} largura={42} altura={24} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={3} />
        <Trilho x={264} y={132} largura={34} dentes={3} />
        <Empunhadura x={216} y={140} />
        <GuardaMato x={236} y={140} largura={28} />
        <Bloco x={242} y={136} largura={20} altura={9} cor={COR.polimeroSombra} />
      </g>
    ),
    ancoras: {
      trilho: { x: 200, y: 100 },
      opticoExtra: { x: 166, y: 100 },
      canoBase: { x: 302, y: 120 },
      inferior: { x: 280, y: 136 },
      carregador: { x: 252, y: 143 },
      lateral: { x: 268, y: 124 },
      coronha: { x: 142, y: 120 },
    },
    aceita: TUDO,
  };
}

function smgPdw(): Silhueta {
  return {
    corpo: (
      <g>
        {/* Corpo único de polímero, com o carregador embutido por cima. */}
        <polygon points={pts(146, 100, 288, 100, 296, 112, 296, 138, 154, 138, 146, 124)} fill={COR.polimero} />
        <polygon points={pts(146, 100, 288, 100, 292, 108, 148, 108)} fill={COR.polimeroLuz} />
        <polygon points={pts(154, 132, 296, 132, 296, 138, 154, 138)} fill={COR.polimeroSombra} />
        <Trilho x={162} y={96} largura={112} dentes={9} />
        <Bloco x={286} y={110} largura={30} altura={20} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroDir={3} />
        <Empunhadura x={210} y={138} inclinacao={-4} />
        <GuardaMato x={228} y={138} largura={26} />
      </g>
    ),
    ancoras: {
      trilho: { x: 208, y: 96 },
      opticoExtra: { x: 172, y: 96 },
      canoBase: { x: 316, y: 120 },
      inferior: { x: 270, y: 138 },
      carregador: { x: 250, y: 140 },
      lateral: { x: 276, y: 122 },
      coronha: { x: 148, y: 118 },
    },
    aceita: TUDO,
  };
}

function lmgCaixa(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={80} y={96} largura={176} altura={44} chanfroEsq={6} />
        <Trilho x={104} y={92} largura={140} dentes={12} />
        {/* Caixa de munição sob o receiver. */}
        <Bloco x={190} y={140} largura={72} altura={44} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroEsq={5} chanfroDir={5} />
        <Vinco x={196} y={152} largura={60} altura={3} />
        <Bloco x={254} y={102} largura={78} altura={32} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={4} />
        {[264, 280, 296, 312].map((x) => (
          <Vinco key={x} x={x} y={108} largura={5} altura={20} />
        ))}
        <Trilho x={258} y={134} largura={68} dentes={6} />
        <Empunhadura x={178} y={140} />
        <GuardaMato x={198} y={140} largura={26} />
        {/* Alça de transporte, típica das metralhadoras. */}
        <polygon points={pts(150, 92, 208, 92, 208, 86, 150, 86)} fill={COR.metal} />
      </g>
    ),
    ancoras: {
      trilho: { x: 172, y: 84 },
      opticoExtra: { x: 122, y: 92 },
      canoBase: { x: 332, y: 118 },
      inferior: { x: 296, y: 138 },
      carregador: { x: 226, y: 184 },
      lateral: { x: 268, y: 122 },
      coronha: { x: 82, y: 118 },
    },
    aceita: TUDO,
  };
}

function lmgLeve(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={92} y={100} largura={162} altura={40} chanfroEsq={5} />
        <Trilho x={114} y={96} largura={132} dentes={11} />
        <Bloco x={252} y={104} largura={80} altura={30} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={4} />
        {[262, 278, 294, 310].map((x) => (
          <Vinco key={x} x={x} y={110} largura={4} altura={18} />
        ))}
        <Trilho x={258} y={134} largura={68} dentes={6} />
        <Empunhadura x={206} y={140} />
        <GuardaMato x={228} y={140} />
        <Bloco x={236} y={136} largura={26} altura={10} cor={COR.polimeroSombra} />
      </g>
    ),
    ancoras: {
      trilho: { x: 180, y: 96 },
      opticoExtra: { x: 130, y: 96 },
      canoBase: { x: 332, y: 119 },
      inferior: { x: 300, y: 138 },
      carregador: { x: 249, y: 143 },
      lateral: { x: 270, y: 122 },
      coronha: { x: 94, y: 120 },
    },
    aceita: TUDO,
  };
}

function dmr(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={84} y={100} largura={172} altura={40} chanfroEsq={6} />
        <Trilho x={106} y={96} largura={144} dentes={12} />
        <Bloco x={254} y={106} largura={86} altura={28} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={5} />
        {[266, 284, 302, 320].map((x) => (
          <Vinco key={x} x={x} y={112} largura={4} altura={16} />
        ))}
        <Trilho x={260} y={134} largura={72} dentes={6} />
        <Empunhadura x={204} y={140} />
        <GuardaMato x={226} y={140} />
        <Bloco x={234} y={136} largura={22} altura={10} cor={COR.polimeroSombra} />
      </g>
    ),
    ancoras: {
      trilho: { x: 178, y: 96 },
      opticoExtra: { x: 124, y: 96 },
      canoBase: { x: 340, y: 120 },
      inferior: { x: 306, y: 138 },
      carregador: { x: 246, y: 143 },
      lateral: { x: 274, y: 124 },
      coronha: { x: 86, y: 120 },
    },
    aceita: TUDO,
  };
}

function sniperFerrolho(): Silhueta {
  return {
    corpo: (
      <g>
        {/* Coronha de chassi, com apoio de bochecha e punho integrado. */}
        <polygon points={pts(70, 104, 210, 100, 210, 146, 96, 150, 70, 132)} fill={COR.polimero} />
        <polygon points={pts(70, 104, 210, 100, 210, 110, 74, 114)} fill={COR.polimeroLuz} />
        <polygon points={pts(96, 140, 210, 138, 210, 146, 96, 150)} fill={COR.polimeroSombra} />
        <Bloco x={206} y={98} largura={70} altura={40} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} />
        <Trilho x={140} y={94} largura={128} dentes={11} />
        {/* Ferrolho e manete. */}
        <rect x={244} y={106} width={30} height={12} fill={COR.acoLuz} />
        <polygon points={pts(268, 112, 288, 122, 292, 132, 274, 124)} fill={COR.aco} />
        <Bloco x={274} y={106} largura={62} altura={26} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} chanfroDir={4} />
        <Trilho x={280} y={132} largura={50} dentes={4} />
        <Empunhadura x={206} y={140} inclinacao={-2} />
        <GuardaMato x={226} y={140} largura={28} />
        <Bloco x={232} y={136} largura={20} altura={9} cor={COR.polimeroSombra} />
      </g>
    ),
    ancoras: {
      trilho: { x: 200, y: 94 },
      opticoExtra: { x: 152, y: 94 },
      canoBase: { x: 336, y: 119 },
      inferior: { x: 306, y: 136 },
      carregador: { x: 244, y: 145 },
      lateral: { x: 292, y: 122 },
      coronha: { x: 72, y: 118 },
    },
    aceita: TUDO,
  };
}

function escopeta(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={110} y={104} largura={140} altura={36} chanfroEsq={5} />
        <Trilho x={130} y={100} largura={112} dentes={9} />
        {/* Tubo de cartuchos sob o cano — a marca da escopeta. */}
        <Bloco x={248} y={122} largura={92} altura={16} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroDir={4} />
        <Bloco x={248} y={104} largura={70} altura={20} cor={COR.polimeroLuz} luz={COR.metalLuz} sombra={COR.polimero} />
        {[258, 272, 286, 300].map((x) => (
          <Vinco key={x} x={x} y={108} largura={4} altura={12} />
        ))}
        <Empunhadura x={200} y={140} />
        <GuardaMato x={220} y={140} largura={30} />
      </g>
    ),
    ancoras: {
      trilho: { x: 186, y: 100 },
      opticoExtra: { x: 142, y: 100 },
      canoBase: { x: 318, y: 114 },
      inferior: { x: 290, y: 138 },
      carregador: { x: 244, y: 142 },
      lateral: { x: 268, y: 118 },
      coronha: { x: 112, y: 120 },
    },
    aceita: { ...TUDO, carregador: false },
  };
}

function pistola(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={200} y={104} largura={116} altura={26} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroDir={4} />
        {[214, 224, 234].map((x) => (
          <Vinco key={x} x={x} y={110} largura={4} altura={14} />
        ))}
        <Bloco x={204} y={128} largura={72} altura={14} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} />
        <Empunhadura x={222} y={140} inclinacao={-14} />
        <GuardaMato x={240} y={140} largura={26} />
        <Trilho x={276} y={130} largura={34} dentes={3} />
      </g>
    ),
    ancoras: {
      trilho: { x: 250, y: 104 },
      opticoExtra: { x: 220, y: 104 },
      canoBase: { x: 316, y: 116 },
      inferior: { x: 292, y: 134 },
      carregador: { x: 218, y: 152 },
      lateral: { x: 288, y: 122 },
      coronha: { x: 202, y: 118 },
    },
    aceita: { cano: true, coronha: false, carregador: true, mira: true, acoplamento: false },
  };
}

function revolver(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={228} y={106} largura={92} altura={20} cor={COR.metal} luz={COR.metalLuz} sombra={COR.metalSombra} chanfroDir={3} />
        {/* Tambor. */}
        <circle cx={252} cy={130} r={19} fill={COR.aco} />
        <path d="M 233 130 A 19 19 0 0 1 252 111 L 252 130 Z" fill={COR.acoLuz} />
        <path d="M 252 149 A 19 19 0 0 0 271 130 L 252 130 Z" fill={COR.acoSombra} />
        <circle cx={252} cy={130} r={5} fill={COR.vinco} />
        <Bloco x={228} y={126} largura={20} altura={12} cor={COR.metalSombra} />
        <Empunhadura x={226} y={144} inclinacao={-18} />
        <GuardaMato x={244} y={144} largura={26} />
      </g>
    ),
    ancoras: {
      trilho: { x: 274, y: 106 },
      opticoExtra: { x: 244, y: 106 },
      canoBase: { x: 320, y: 116 },
      inferior: { x: 300, y: 134 },
      carregador: { x: 252, y: 150 },
      lateral: { x: 296, y: 122 },
      coronha: { x: 228, y: 120 },
    },
    aceita: { cano: true, coronha: false, carregador: false, mira: true, acoplamento: false },
  };
}

function faca(): Silhueta {
  return {
    corpo: (
      <g>
        <polygon points={pts(190, 128, 214, 118, 330, 106, 348, 118, 330, 128, 214, 134)} fill={COR.aco} />
        <polygon points={pts(214, 118, 330, 106, 348, 118, 330, 116, 216, 124)} fill={COR.acoLuz} />
        <polygon points={pts(216, 126, 330, 120, 330, 128, 214, 134)} fill={COR.acoSombra} />
        <Bloco x={150} y={120} largura={44} altura={18} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroEsq={4} />
        <rect x={190} y={116} width={6} height={26} fill={COR.metalSombra} />
        {[158, 168, 178].map((x) => (
          <Vinco key={x} x={x} y={122} largura={4} altura={14} />
        ))}
      </g>
    ),
    ancoras: {
      trilho: { x: 260, y: 110 },
      opticoExtra: { x: 230, y: 110 },
      canoBase: { x: 348, y: 118 },
      inferior: { x: 280, y: 132 },
      carregador: { x: 240, y: 136 },
      lateral: { x: 270, y: 124 },
      coronha: { x: 152, y: 128 },
    },
    aceita: { cano: false, coronha: false, carregador: false, mira: false, acoplamento: false },
  };
}

function contundente(): Silhueta {
  return {
    corpo: (
      <g>
        <Bloco x={140} y={118} largura={188} altura={14} cor={COR.polimero} luz={COR.polimeroLuz} sombra={COR.polimeroSombra} chanfroEsq={4} />
        {[152, 166, 180].map((x) => (
          <Vinco key={x} x={x} y={118} largura={4} altura={14} />
        ))}
        <Bloco x={322} y={98} largura={44} altura={54} cor={COR.aco} luz={COR.acoLuz} sombra={COR.acoSombra} chanfroEsq={6} chanfroDir={6} />
        <polygon points={pts(366, 108, 386, 118, 386, 132, 366, 142)} fill={COR.metal} />
        <polygon points={pts(366, 108, 386, 118, 372, 120, 366, 116)} fill={COR.metalLuz} />
      </g>
    ),
    ancoras: {
      trilho: { x: 300, y: 112 },
      opticoExtra: { x: 260, y: 112 },
      canoBase: { x: 386, y: 124 },
      inferior: { x: 300, y: 132 },
      carregador: { x: 260, y: 134 },
      lateral: { x: 290, y: 124 },
      coronha: { x: 142, y: 125 },
    },
    aceita: { cano: false, coronha: false, carregador: false, mira: false, acoplamento: false },
  };
}

const CONSTRUTORES: Record<ArquetipoArma, () => Silhueta> = {
  'ar-otan': arOtan,
  'ar-leste': arLeste,
  bullpup,
  'carabina-curta': carabinaCurta,
  'smg-compacta': smgCompacta,
  'smg-pdw': smgPdw,
  'lmg-caixa': lmgCaixa,
  'lmg-leve': lmgLeve,
  dmr,
  'sniper-ferrolho': sniperFerrolho,
  escopeta,
  pistola,
  revolver,
  faca,
  contundente,
};

export function silhuetaDe(arquetipo: ArquetipoArma): Silhueta {
  return CONSTRUTORES[arquetipo]();
}
