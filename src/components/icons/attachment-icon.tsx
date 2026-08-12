import type { Attachment, SlotId } from '@/data/types';

/**
 * Ícone de acessório.
 *
 * São 317 peças no catálogo, mas o desenho não precisa ser único: o que o
 * jogador reconhece é o TIPO — se aquilo é um supressor, uma luneta, um tambor.
 * Cada ícone cobre uma família, escolhida pelo slot e por palavras-chave do
 * nome original da peça.
 *
 * As silhuetas seguem as peças do próprio jogo: o freio mostra as janelas que
 * tem, o quebra-chamas mostra os dentes, a empunhadura angular é a cunha e a
 * vertical é o bloco em pé. É o que permite achar a peça pelo desenho antes de
 * ler o nome.
 *
 * Traço monocromático em `currentColor`, então o ícone acompanha o tema e o
 * destaque do bloco sem precisar de variante clara e escura.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  // Traço fino: com 24 unidades de lado, é o que deixa caber ranhura, parafuso
  // e anel de rosca sem que o desenho vire um borrão no tamanho do cartão.
  strokeWidth: 1.15,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Mais fino ainda, para textura e detalhe que não deve competir com a silhueta. */
const DETAIL = { strokeWidth: 0.7 };

/* ---------------------------------- Miras ---------------------------------- */

/** Trilho de montagem: toda mira se apoia nele, e é ele que dá o chão do desenho. */
const rail = <path d="M5 18h14" />;

const ironSights = (
  <>
    {rail}
    {/* Alça em U atrás, massa de mira fina à frente. */}
    <path d="M7 18v-4h1.6v2.2h2.8V14H13v4" />
    <path d="M17 18v-6" />
    <path d="M15.8 12h2.4" />
  </>
);

const apertureSight = (
  <>
    {rail}
    <circle cx="9.5" cy="12.5" r="3.2" />
    <path d="M9.5 15.7V18" />
    <path d="M17 18v-6.5M15.9 11.5h2.2" />
  </>
);

/** Alça CQB: janela pequena e aberta, para tiro rápido de perto. */
const cqbSight = (
  <>
    {rail}
    <path d="M8 18v-6h8v6" />
    <path d="M8 12h8" />
    <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
  </>
);

const redDot = (
  <>
    {rail}
    <rect x="6.5" y="7.5" width="11" height="9" rx="1.5" />
    {/* Protetores do vidro, em cima; janela e ponto, no meio. */}
    <path d="M9 7.5V6M15 7.5V6" />
    <rect x="8.2" y="9.2" width="7.6" height="5.6" rx="0.8" {...DETAIL} />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M8 18v-1.5M16 18v-1.5" {...DETAIL} />
  </>
);

/** Prismática: corpo curto e maciço, com torre em cima. */
const prism = (
  <>
    {rail}
    <rect x="6" y="7" width="12" height="9" rx="1.5" />
    <path d="M10 7V4.5h3V7" />
    <path d="M4 11.5h2M18 11.5h2" />
    <path d="M12 9.5v4M10 11.5h4" {...DETAIL} />
  </>
);

/**
 * Luneta.
 *
 * `long` estica o tubo e abre o para-sol da objetiva: é o que separa de relance
 * uma 3x de uma 8x na grade de peças.
 */
function scope(long: boolean) {
  const objetiva = long ? 2.5 : 4;
  const tuboX = long ? 5.5 : 6.5;
  const tuboW = long ? 12 : 10.5;
  return (
    <>
      {rail}
      {/* Objetiva à esquerda, ocular à direita, tubo no meio. */}
      <path d={`M${objetiva} 8.5h3v6h-3z`} />
      <rect x={tuboX} y="9.5" width={tuboW} height="4" rx="1" />
      <path d={long ? 'M17.5 8.5h3.5v6h-3.5z' : 'M17 9h3v5h-3z'} />
      {/* Torre de elevação em cima e a de vento atrás dela. */}
      <path d="M10.5 9.5V7h3v2.5" />
      <path d="M11.2 7V6h1.6v1" {...DETAIL} />
      {/* Lente e anéis do tubo. */}
      <path d={`M${objetiva + 0.9} 9.6v3.8`} {...DETAIL} />
      <path d={`M${tuboX + 2} 9.5v4M${tuboX + tuboW - 2} 9.5v4`} {...DETAIL} />
      <path d="M8 18v-1.5M15.5 18v-1.5" {...DETAIL} />
    </>
  );
}

/** LPVO: a coroa de zoom no tubo é a marca da mira de ampliação variável. */
const variableScope = (
  <>
    {rail}
    <path d="M3 8.5h3v6H3z" />
    <rect x="6" y="9.5" width="11.5" height="4" rx="1" />
    <path d="M17.5 8.5h3.5v6h-3.5z" />
    <path d="M9.5 9.5V7h3v2.5" />
    <path d="M10.2 7V6h1.6v1" {...DETAIL} />
    {/* Coroa de zoom: as marcas de ampliação que só a variável tem. */}
    <path d="M14 9.5v4M15.2 9.5v4M16.4 9.5v4" {...DETAIL} />
    <path d="M3.9 9.6v3.8" {...DETAIL} />
    <path d="M8 18v-1.5M15.5 18v-1.5" {...DETAIL} />
  </>
);

/* ---------------------------------- Bocas ---------------------------------- */

/** Rosca do cano — a ponta por onde toda boca se enrosca. */
const thread = (
  <>
    <path d="M2.5 12h3" />
    <path d="M4 10.8v2.4" {...DETAIL} />
  </>
);

/**
 * Freio de porta: o bloco com as janelas laterais que jogam o gás para os lados.
 * O número de janelas é o próprio nome da peça — única, dupla, tripla.
 */
function portBrake(ports: number) {
  const width = 3.2;
  const gap = 0.9;
  const total = ports * width + (ports - 1) * gap;
  const startX = 12 - total / 2;
  return (
    <>
      {thread}
      <rect x="5.5" y="8.5" width="13" height="7" rx="1" />
      <path d="M8 8.5v7" />
      {Array.from({ length: ports }, (_, i) => (
        <rect
          key={i}
          x={startX + i * (width + gap)}
          y="10"
          width={width}
          height="4"
          rx="0.8"
          {...DETAIL}
        />
      ))}
    </>
  );
}

/** Freio inclinado: a boca cortada em diagonal. */
const slantBrake = (
  <>
    {thread}
    <path d="M5.5 8.5h9l4 3.5-4 3.5h-9z" />
    <path d="M8 8.5v7" />
    <path d="M10.5 10.5l2.5 3M13 10.5l2.5 3" {...DETAIL} />
  </>
);

/** Freio compensado: janelas nas laterais e fendas em cima, contra o coice. */
const compensatedBrake = (
  <>
    {thread}
    <rect x="5.5" y="9" width="13" height="6.5" rx="1" />
    <path d="M8 9v6.5" />
    <path d="M10 11h2.2M13.2 11h2.2M10 13.5h5.4" {...DETAIL} />
    <path d="M10 9V7.5M12.5 9V7.5M15 9V7.5" {...DETAIL} />
  </>
);

/** Quebra-chamas: os dentes na ponta, que é o que se vê da peça. */
const flashHider = (
  <>
    {thread}
    <rect x="5.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M10.5 10h9M10.5 14h9" />
    <path d="M13 10v4M16 10v4M19 10v4" />
  </>
);

/** Compensador com quebra-chamas: corpo de compensador terminando em dentes. */
const flashComp = (
  <>
    {thread}
    <rect x="5.5" y="9.5" width="8" height="5" rx="1" />
    <path d="M7.5 9.5v5" />
    <path d="M13.5 10h6M13.5 14h6" />
    <path d="M16 10v4M19 10v4" />
  </>
);

/** Compensador linear: tubo liso que joga o gás para a frente. */
const linearComp = (
  <>
    {thread}
    <rect x="5.5" y="10" width="14" height="4" rx="1" />
    <path d="M8 10v4" />
    <path d="M19.5 10.8v2.4" {...DETAIL} />
  </>
);

const threadProtector = (
  <>
    {thread}
    <rect x="5.5" y="9.5" width="5.5" height="5" rx="1.2" />
    <path d="M7 9.5v5M9 9.5v5" {...DETAIL} />
  </>
);

/**
 * Supressor.
 *
 * `length` é o que distingue o CQB curto do longo de precisão; `lightened`
 * abre as estrias longitudinais que aliviam o peso.
 */
function suppressor(length: 'curto' | 'padrao' | 'longo', lightened = false) {
  const endsAt = length === 'curto' ? 14.5 : length === 'longo' ? 21 : 18;
  return (
    <>
      {thread}
      <rect x="5.5" y="9" width="2" height="6" rx="0.8" />
      <rect x="7.5" y="9.5" width={endsAt - 7.5} height="5" rx="1.2" />
      {lightened ? (
        <path d={`M9.5 11h${endsAt - 11}M9.5 13h${endsAt - 11}`} {...DETAIL} />
      ) : (
        <path d={`M${endsAt - 2} 9.5v5`} {...DETAIL} />
      )}
    </>
  );
}

/* ---------------------------------- Canos ---------------------------------- */

/**
 * O cano sai sempre da mesma base — o bloco do receiver, à esquerda — e o que
 * muda é até onde o tubo vai e quão grosso ele é. Assim dois canos de
 * comprimentos diferentes se comparam de relance, sem vão entre as peças.
 */
function barrelGlyph(endsAt: number, profile: 'padrao' | 'pesado' | 'estriado' | 'fino' = 'padrao') {
  const height = profile === 'pesado' ? 5 : profile === 'fino' ? 1.8 : 3;
  const top = 12 - height / 2;
  const flutes = [];
  if (profile === 'estriado') {
    for (let x = 9.5; x < endsAt - 3; x += 1.8) flutes.push(`M${x} ${top + 0.6}v${height - 1.2}`);
  }
  return (
    <>
      {/* Bloco da culatra, sempre no mesmo lugar: é dele que o cano cresce. */}
      <rect x="2" y="9" width="4.5" height="6" rx="0.8" />
      <path d="M3.4 9v6" {...DETAIL} />
      <rect x="6.5" y={top} width={endsAt - 6.5} height={height} rx={height / 2} />
      {/* Bloco de gás em cima do tubo e a rosca da ponta — o acabamento que
          diferencia um cano de um tubo qualquer. */}
      <rect x={endsAt - 6} y={top - 2} width="2.6" height="2" rx="0.4" {...DETAIL} />
      <path d={`M${endsAt - 2.6} ${top}v${height}M${endsAt - 1.4} ${top}v${height}`} {...DETAIL} />
      {flutes.length > 0 && <path d={flutes.join('')} {...DETAIL} />}
    </>
  );
}

/* ------------------------------- Acoplamento ------------------------------- */

/** O trilho inferior onde a empunhadura se prende. */
const underRail = <path d="M4 7h16" />;

/**
 * Empunhadura vertical: o bloco em pé sob o cano.
 *
 * `texture` desenha as ranhuras da versão estriada; `waist` afina o meio, que
 * é o perfil da vertical de liga e da 6H64.
 */
function verticalGrip(texture: 'liso' | 'ranhurado' = 'liso', waist = false) {
  return (
    <>
      {underRail}
      {waist ? (
        // Cintura marcada: a silhueta em ampulheta da vertical de liga e da 6H64.
        <path d="M9.2 7h5.6l-1.1 5 1.1 6.5H9.2l1.1-6.5z" />
      ) : (
        <rect x="9" y="7" width="6" height="11.5" rx="1.6" />
      )}
      {texture === 'ranhurado' && (
        <path d="M10 10h4M10 12.2h4M10 14.4h4M10 16.6h4" {...DETAIL} />
      )}
    </>
  );
}

/**
 * Empunhadura angular: a cunha apoiada no trilho.
 *
 * `slim` é a versão fina, quase um dedo de apoio; `full` desce mais e fecha o
 * triângulo — o mesmo contraste que o jogo mostra entre a Angular Fina e a
 * Angular Completa.
 */
function angledGrip(size: 'fina' | 'padrao' | 'completa') {
  // A cunha nasce cheia no trilho e afina para a frente: fundo à esquerda,
  // ponta à direita. É o que separa a angular da vertical num relance.
  const depth = size === 'fina' ? 3.5 : size === 'completa' ? 8 : 6;
  return (
    <>
      {underRail}
      <path d={`M6.5 7h11L6.5 ${7 + depth}z`} />
      {size !== 'fina' && <path d={`M8.5 7v${depth * 0.45}`} {...DETAIL} />}
    </>
  );
}

/** Apoio de mão: só o batente que trava a mão, sem punho. */
function handstop(slim: boolean) {
  return (
    <>
      {underRail}
      {/* Um degrau, não um punho: a mão para no dente da frente. */}
      {slim ? (
        <path d="M7.5 7h8.5v2.2h-6.3c-1.1 0-1.9 0.8-1.9 1.9V12H7.5z" />
      ) : (
        <path d="M8.5 7h5.8v2.6c0 1.7-1.3 2.9-3 2.9H8.5z" />
      )}
      <path d={slim ? 'M9.5 8.1h5.4' : 'M9.6 8.2h3.6'} {...DETAIL} />
    </>
  );
}

/**
 * Empunhadura curta.
 *
 * `canted` inclina o corpo, `low` encolhe, `texture` escolhe entre as ranhuras
 * e o pontilhado da versão texturizada, e `folding` mostra a dobradiça.
 */
function stubbyGrip({
  canted = false,
  low = false,
  texture = 'liso',
  folding = false,
}: {
  canted?: boolean;
  low?: boolean;
  texture?: 'liso' | 'ranhurado' | 'pontilhado';
  folding?: boolean;
} = {}) {
  const height = low ? 4.5 : 7;
  const body = (
    <rect x="9.8" y="7" width="4.6" height={height} rx="1.3" transform={canted ? 'rotate(16 12 10)' : undefined} />
  );
  return (
    <>
      {underRail}
      {body}
      {texture === 'ranhurado' && <path d="M10.4 9.5h3.4M10.4 11.5h3.4" {...DETAIL} />}
      {texture === 'pontilhado' && (
        <path d="M11 9.5h0.01M13 9.5h0.01M11 11.5h0.01M13 11.5h0.01" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {folding && <circle cx="15.4" cy="8.4" r="1" {...DETAIL} />}
    </>
  );
}

const bipod = (
  <>
    {underRail}
    <path d="M12 7v3" />
    <path d="M12 10L7.5 17.5M12 10l4.5 7.5" />
    <path d="M6 17.5h3M15 17.5h3" />
  </>
);

/** Empunhadura com bipé: o punho que abre em duas pernas. */
const gripPod = (
  <>
    {underRail}
    <rect x="10.2" y="7" width="3.6" height="6" rx="1.2" />
    <path d="M11 13L8 18M13 13l3 5" />
    <path d="M6.8 18h2.6M14.6 18h2.6" />
  </>
);

const underbarrelMount = (
  <>
    {underRail}
    <rect x="6.5" y="7" width="11" height="4.5" rx="1" />
    <path d="M9 7v4.5M12 7v4.5M15 7v4.5" {...DETAIL} />
  </>
);

/* -------------------------------- Carregador -------------------------------- */

/**
 * Carregador de caixa.
 *
 * `curved` desenha a barriga dos carregadores de fuzil, `fast` acrescenta a
 * aba da base por onde a mão puxa — é ela que identifica o Fast Mag no jogo.
 */
function boxMag({ tall = false, curved = false, fast = false } = {}) {
  const bottom = tall ? 19 : 15.5;
  return (
    <>
      {/* Boca do carregador, onde ele entra na arma. */}
      <path d="M9 4.5h6v2.5H9z" />
      {curved ? (
        <path d={`M9.4 7h5.2l1.1 ${bottom - 8}-1.3 1H10.2l-0.9-1z`} />
      ) : (
        <path d={`M9.4 7h5.2v${bottom - 7}H9.4z`} />
      )}
      {fast && <path d={`M8.2 ${bottom}h7.6v1.6H8.2z`} />}
      {/* Ressaltos da carcaça e a janela por onde se vê a munição. */}
      <path d={`M10 ${(7 + bottom) / 2 - 2}h4M10 ${(7 + bottom) / 2}h4M10 ${(7 + bottom) / 2 + 2}h4`} {...DETAIL} />
      <path d={`M9.4 8.4h5.2`} {...DETAIL} />
    </>
  );
}

const drumMag = (
  <>
    <path d="M9.5 3h5v3.5h-5z" />
    <path d="M10.5 6.5h3v2h-3z" />
    <circle cx="12" cy="14" r="5.5" />
    <circle cx="12" cy="14" r="1.6" />
    <path d="M12 8.5v1.5M17.5 14h-1.5M12 19.5v-1.5M6.5 14H8" {...DETAIL} />
  </>
);

/** Fita solta de munição. */
const looseBelt = (
  <>
    <path d="M3 13.5h18" />
    <path d="M4.5 13.5V10M7.5 13.5V10M10.5 13.5V10M13.5 13.5V10M16.5 13.5V10M19.5 13.5V10" />
    <path d="M3 13.5v3h18v-3" />
  </>
);

/** Bolsa de fita: o saco de lona com a fita saindo por cima. */
const beltPouch = (
  <>
    <path d="M5 10h14l-1 9H6z" />
    <path d="M5 10c2-2 5-3 7-3s5 1 7 3" />
    <path d="M8 8.5v-2M11 7.5v-2M14 7.5v-2M17 8.5v-2" {...DETAIL} />
  </>
);

const beltBox = (
  <>
    <rect x="4" y="9.5" width="16" height="9.5" rx="1.2" />
    <path d="M9.5 9.5V8h5v1.5" />
    <path d="M4 13h16" {...DETAIL} />
    <path d="M17 9.5V6.5M19 9.5V6.5" {...DETAIL} />
  </>
);

const speedloader = (
  <>
    <circle cx="12" cy="13" r="6" />
    <circle cx="12" cy="13" r="1.3" />
    <path d="M12 5.5V7" />
    <circle cx="12" cy="9.6" r="1.1" {...DETAIL} />
    <circle cx="14.9" cy="11.7" r="1.1" {...DETAIL} />
    <circle cx="13.8" cy="15.2" r="1.1" {...DETAIL} />
    <circle cx="10.2" cy="15.2" r="1.1" {...DETAIL} />
    <circle cx="9.1" cy="11.7" r="1.1" {...DETAIL} />
  </>
);

/**
 * Tubo de cartuchos da escopeta.
 *
 * As divisões mostram quantos cartuchos cabem; `dual` empilha os dois tubos da
 * versão de cano duplo.
 */
function shellTube(shells: number, dual = false) {
  /** Divisórias entre um cartucho e outro, na altura pedida. */
  const divisions = (top: number, height: number) =>
    Array.from({ length: shells - 1 }, (_, i) => `M${4 + (i + 1) * (16 / shells)} ${top}v${height}`).join('');

  if (dual) {
    return (
      <>
        <rect x="3" y="8" width="18" height="3.5" rx="1.75" />
        <rect x="3" y="13" width="18" height="3.5" rx="1.75" />
        <path d={divisions(8, 3.5) + divisions(13, 3.5)} {...DETAIL} />
      </>
    );
  }
  return (
    <>
      <rect x="3" y="9.5" width="18" height="5" rx="2.5" />
      <path d={divisions(9.5, 5)} {...DETAIL} />
    </>
  );
}

/* --------------------------------- Munição --------------------------------- */

function cartridge(tip: 'cheia' | 'oca' | 'plana' | 'serrilhada') {
  return (
    <>
      {tip === 'cheia' && <path d="M12 3l3 5H9l3-5z" />}
      {tip === 'oca' && (
        <>
          <path d="M12 3.5l3 4.5H9l3-4.5z" />
          <path d="M10.8 5.5h2.4" />
        </>
      )}
      {tip === 'plana' && <path d="M9.5 8V5h5v3" />}
      {tip === 'serrilhada' && <path d="M9 8l1-2.5L11 7l1-3.5L13 7l1-1.5L15 8z" />}
      <rect x="9" y="8" width="6" height="10" rx="0.8" />
      <path d="M8.5 18h7v2h-7z" />
    </>
  );
}

const shotgunShell = (
  <>
    <rect x="8.5" y="4" width="7" height="11" rx="1" />
    <path d="M8 15h8v5H8z" />
    <path d="M10 4.5h4" />
  </>
);

/* -------------------------------- Ergonomia -------------------------------- */

const trigger = (
  <>
    <path d="M6 7h9a3 3 0 0 1 3 3v1" />
    <path d="M12 11c0 3-1 5-2.5 6.5" />
  </>
);

const bolt = (
  <>
    <rect x="4" y="10" width="13" height="5" rx="2.5" />
    <path d="M17 12.5h3" />
    <path d="M7 10v5M10 10v5M13 10v5" />
  </>
);

const magCatch = (
  <>
    <rect x="7" y="6" width="10" height="6" rx="1" />
    <path d="M10 12v5M14 12v5" />
    <path d="M9 17h6" />
  </>
);

const magwell = (
  <>
    <path d="M5 7h14l-3.5 5H8.5z" />
    <path d="M8.5 12v6h7v-6" />
  </>
);

const railCover = (
  <>
    <rect x="3" y="10" width="18" height="4" rx="1" />
    <path d="M6 10v4M9 10v4M12 10v4M15 10v4M18 10v4" />
  </>
);

const receiver = (
  <>
    <path d="M4 9h16v6H4z" />
    <path d="M4 9V7h6v2" />
    <path d="M13 11h4v2h-4z" />
  </>
);

/**
 * O seletor de disparo, apontado para automático.
 *
 * É o ícone do "Auto" — a peça que o dataset chamava de receiver e desenhava
 * como uma caixa. O que ela faz é virar a chave para o fogo contínuo, e um
 * seletor com a agulha na última posição diz isso; uma caixa não diz nada.
 */
const fireSelector = (
  <>
    <circle cx="12" cy="13" r="3.5" />
    <path d="M12 13l3.6-3.6" />
    <path d="M5.5 13H8M12 6.5V9M18.5 13H16" />
  </>
);

/**
 * O tubo amortecedor, com a mola dentro.
 *
 * Precisa se distinguir do ferrolho, que também é um cilindro deitado — daí a
 * mola em ziguezague, que é o que se vê quando o buffer é aberto.
 */
const buffer = (
  <>
    <path d="M3 8.5h3v7H3z" />
    <path d="M6.5 9.5l2.2 5 2.2-5 2.2 5 2.2-5 2.2 5" />
    <path d="M18 8.5v7" />
    <path d="M18 12h3" />
  </>
);

/* ----------------------------- Acessório óptico ----------------------------- */

const magnifier = (
  <>
    <rect x="7" y="8" width="10" height="8" rx="1.5" />
    <path d="M7 12H4M20 12h-3" />
    <path d="M12 8V5" />
  </>
);

const antiGlare = (
  <>
    <circle cx="12" cy="12" r="6" />
    <path d="M8 8l8 8" />
  </>
);

const cantedMount = (
  <>
    <path d="M4 17h9" />
    <rect x="12" y="6" width="7" height="6" rx="1.5" transform="rotate(35 15.5 9)" />
  </>
);

/* --------------------------------- Laterais --------------------------------- */

const laser = (
  <>
    <rect x="4" y="9" width="9" height="6" rx="1.5" />
    <circle cx="13" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M15 12h6" strokeDasharray="2 2" />
  </>
);

const flashlight = (
  <>
    <rect x="4" y="9" width="9" height="6" rx="1.5" />
    <path d="M14 9l6-2.5v11L14 15z" />
  </>
);

const rangeFinder = (
  <>
    <rect x="4" y="8" width="12" height="8" rx="1.5" />
    <path d="M16 12h4" />
    <path d="M7 12h6M10 9.5v5" />
  </>
);

/* ------------------------------- Resolução ------------------------------- */

/** Ícone genérico do slot, quando nada mais específico se aplica. */
const BY_SLOT: Record<SlotId, React.ReactNode> = {
  sight: redDot,
  muzzle: portBrake(2),
  barrel: barrelGlyph(12),
  underbarrel: verticalGrip(),
  magazine: boxMag(),
  ammo: cartridge('cheia'),
  ergonomics: trigger,
  opticAccessory: magnifier,
  leftRail: laser,
  rightRail: laser,
};

/**
 * Escolhe o desenho pela palavra-chave do nome original. A ordem importa: o
 * termo mais específico vem antes ('flash hider' antes de 'flash').
 */
function glyphFor(attachment: Attachment): React.ReactNode {
  const n = attachment.originalName.toLowerCase();
  const amp = Number(n.match(/(\d+(?:\.\d+)?)x/)?.[1] ?? 0);

  switch (attachment.slot) {
    case 'sight':
      if (n.includes('iron')) return ironSights;
      if (n.includes('aperture')) return apertureSight;
      if (n.includes('cqb')) return cqbSight;
      if (n.includes('lpvo') || n.includes('variable')) return variableScope;
      if (n.includes('prism')) return prism;
      // A ampliação separa os formatos de corpo, como no jogo: pontual,
      // prismático curto, luneta média e luneta longa de precisão.
      if (amp >= 4) return scope(true);
      if (amp >= 2.5) return scope(false);
      if (amp >= 1.5) return prism;
      return redDot;

    case 'muzzle':
      if (n.includes('suppressor')) {
        const length = n.includes('cqb') ? 'curto' : n.includes('long') ? 'longo' : 'padrao';
        return suppressor(length, n.includes('lightened'));
      }
      if (n.includes('thread')) return threadProtector;
      if (n.includes('flash hider')) return flashHider;
      if (n.includes('flash comp')) return flashComp;
      if (n.includes('linear')) return linearComp;
      if (n.includes('compensated')) return compensatedBrake;
      if (n.includes('slant')) return slantBrake;
      if (n.includes('triple')) return portBrake(3);
      if (n.includes('double')) return portBrake(2);
      if (n.includes('single')) return portBrake(1);
      if (n.includes('comp')) return linearComp;
      return portBrake(2);

    case 'barrel': {
      // O comprimento vem em polegadas ou em milímetros, conforme a arma.
      const mm = Number(n.match(/(\d+)\s*mm/)?.[1] ?? 0);
      const inches = mm ? mm / 25.4 : Number(n.match(/(\d+(?:[.,]\d+)?)"/)?.[1]?.replace(',', '.') ?? 14);
      const endsAt = inches >= 20 ? 22 : inches >= 16 ? 20 : inches >= 13 ? 17.5 : inches >= 11 ? 15 : 12.5;

      if (n.includes('heavy') || n.includes('hbar') || n.includes('lsw')) return barrelGlyph(endsAt, 'pesado');
      if (n.includes('fluted')) return barrelGlyph(endsAt, 'estriado');
      if (n.includes('pencil') || n.includes('light')) return barrelGlyph(endsAt, 'fino');
      return barrelGlyph(endsAt);
    }

    case 'underbarrel':
      if (n.includes('grip pod')) return gripPod;
      if (n.includes('bipod')) return bipod;
      if (n.includes('handstop')) return handstop(n.includes('slim'));
      if (n.includes('stubby')) {
        return stubbyGrip({
          canted: n.includes('canted'),
          low: n.includes('low-profile'),
          folding: n.includes('folding'),
          texture: n.includes('ribbed') ? 'ranhurado' : n.includes('stippled') ? 'pontilhado' : 'liso',
        });
      }
      if (n.includes('angled')) {
        return angledGrip(n.includes('slim') ? 'fina' : n.includes('full') ? 'completa' : 'padrao');
      }
      if (n.includes('vertical')) {
        // A de liga e a 6H64 têm a cintura marcada; as demais são o bloco reto.
        return verticalGrip(n.includes('ribbed') ? 'ranhurado' : 'liso', n.includes('alloy') || n.includes('6h64'));
      }
      if (n.includes('mount')) return underbarrelMount;
      if (n.includes('mw') || n.includes('laser')) return laser;
      if (n.includes('flashlight')) return flashlight;
      return verticalGrip();

    case 'magazine': {
      const shells = Number(n.match(/(\d+)\s*shell/)?.[1] ?? 0);
      if (shells) return shellTube(shells, n.includes('dual'));
      if (n.includes('speedloader')) return speedloader;
      if (n.includes('drum')) return drumMag;
      if (n.includes('belt box')) return beltBox;
      if (n.includes('belt pouch')) return beltPouch;
      if (n.includes('belt')) return looseBelt;

      const rounds = attachment.magazineSize ?? 0;
      return boxMag({
        tall: rounds >= 40,
        // Carregador de fuzil tem barriga; o de pistola e o de PDW são retos.
        curved: rounds >= 25,
        fast: n.includes('fast'),
      });
    }

    case 'ammo':
      if (n.includes('buck') || n.includes('flechette') || n.includes('slug')) return shotgunShell;
      if (n.includes('hollow')) return cartridge('oca');
      if (n.includes('frangible')) return cartridge('serrilhada');
      if (n.includes('polymer') || n.includes('match')) return cartridge('plana');
      return cartridge('cheia');

    case 'ergonomics':
      if (n.includes('trigger')) return trigger;
      if (n.includes('bolt')) return bolt;
      if (n.includes('mag catch')) return magCatch;
      if (n.includes('magwell')) return magwell;
      if (n.includes('rail cover')) return railCover;
      if (n.includes('buffer')) return buffer;
      /*
       * O "A3 Receiver" é o Auto da tela do jogo: ele converte a arma para
       * disparo totalmente automático. O ícone segue a função, não a peça
       * física — quem escolhe está escolhendo o modo de tiro.
       */
      if (n.includes('a3 receiver')) return fireSelector;
      if (n.includes('receiver')) return receiver;
      return trigger;

    case 'opticAccessory':
      if (n.includes('magnification')) return magnifier;
      if (n.includes('anti-glare')) return antiGlare;
      if (n.includes('canted') || n.includes('piggyback')) return cantedMount;
      return magnifier;

    case 'leftRail':
    case 'rightRail':
      if (n.includes('range finder')) return rangeFinder;
      if (n.includes('flashlight') || n.includes('combo')) return flashlight;
      return laser;

    default:
      return BY_SLOT[attachment.slot];
  }
}

export function AttachmentIcon({
  attachment,
  slot,
  size = 40,
}: {
  /** Sem peça, desenha o ícone genérico do slot. */
  attachment: Attachment | null;
  slot: SlotId;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      style={{ display: 'block' }}
      {...STROKE}
    >
      {attachment ? glyphFor(attachment) : BY_SLOT[slot]}
    </svg>
  );
}
