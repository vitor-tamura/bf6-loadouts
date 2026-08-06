import type { Attachment, SlotId } from '@/data/types';

/**
 * Ícone de acessório.
 *
 * São 317 peças no catálogo, mas o desenho não precisa ser único: o que o
 * jogador reconhece é o TIPO — se aquilo é um supressor, uma luneta, um tambor.
 * Cada ícone cobre uma família, escolhida pelo slot e por palavras-chave do
 * nome original da peça.
 *
 * Traço monocromático em `currentColor`, então o ícone acompanha o tema e o
 * destaque do bloco sem precisar de variante clara e escura.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/* ---------------------------------- Miras ---------------------------------- */

/*
 * As miras são as únicas peças desenhadas com volume, e não só em contorno.
 *
 * Elas são o que o jogador escolhe primeiro e reconhece de longe, e a diferença
 * entre um ponto vermelho aberto e uma luneta de 8× está no formato do corpo —
 * algo que o contorno sozinho achata.
 *
 * Duas regras seguram o desenho: traço mais fino que o dos outros ícones (`SIGHT`
 * abaixo), porque aqui há muita linha em pouco espaço, e preenchimento só onde
 * ele significa alguma coisa — a face de cima, que pega luz, e a lente. Encher
 * o corpo inteiro transformaria a peça em mancha.
 *
 * Quarenta miras, oito silhuetas — ver [SIGHT_SHAPE].
 */

/** Traço fino, para o desenho não fechar sobre si mesmo. */
const SIGHT = { strokeWidth: 1.05 } as const;

/** Face superior: onde bate a luz. */
const TOP = { fill: 'currentColor', fillOpacity: 0.45, stroke: 'none' } as const;
/** Lente: cheia, o ponto mais escuro ou mais aceso da peça. */
const LENS = { fill: 'currentColor', fillOpacity: 0.75, stroke: 'currentColor' } as const;

/** Trilho de montagem, comum a todas. */
const rail = (
  <>
    <path d="M7 18.6h10v1.6H7z" {...TOP} />
    <path d="M7 18.6h10v1.6H7z" />
    <path d="M8.6 20.2v1M15.4 20.2v1" />
  </>
);

// Alça de ferro: poste fino entre as duas orelhas.
const ironSights = (
  <>
    {rail}
    <path d="M7.6 18.6v-5.4h1.6v5.4M14.8 18.6v-5.4h1.6v5.4" />
    <path d="M7.6 13.2h1.6l-.4-.7h-.8zM14.8 13.2h1.6l-.4-.7h-.8z" {...TOP} />
    <path d="M11.6 18.6V8.4h.9v10.2z" />
    <path d="M11.2 8.4h1.7l-.5-1.1h-.7z" {...TOP} />
  </>
);

// Alça de abertura: anel de visada sobre a base.
const apertureSights = (
  <>
    {rail}
    <path d="M6.8 18.6v-3.4a5.2 5.2 0 0 1 10.4 0v3.4" />
    <path d="M7.4 13.4a5.2 5.2 0 0 1 9.2 0l-1.2.9a3.8 3.8 0 0 0-6.8 0z" {...TOP} />
    <circle cx="12" cy="14.6" r="2.6" {...LENS} />
    <circle cx="12" cy="14.6" r="1.1" fill="var(--bg)" stroke="none" />
  </>
);

// Alça CQB: bloco baixo com a aba dobrada à frente.
const cqbSights = (
  <>
    {rail}
    <path d="M5.8 18.6v-3.2h12.4v3.2z" />
    <path d="M5.8 15.4h12.4l-1.3-1h-9.8z" {...TOP} />
    <path d="M8.8 14.4V9.6h3.4v4.8z" />
    <path d="M8.8 9.6h3.4l-.9-1h-1.6z" {...TOP} />
    <path d="M14 14.4v-2.6h2.4v2.6z" />
  </>
);

// Ponto vermelho aberto: corpo em L com a janela inclinada à frente.
const reflexOpen = (
  <>
    {rail}
    <path d="M5.8 18.6v-4h12.4v4z" />
    <path d="M5.8 14.6h12.4l-1.2-1H7z" {...TOP} />
    <path d="M6.4 13.6V8.2h2.2v5.4" />
    <path d="M6.4 8.2h2.2l-.5-.8h-1.2z" {...TOP} />
    <path d="M8.6 8.6l9 1.5v3.5h-9z" {...LENS} />
    <path d="M8.6 8.6l9 1.5.7-.7-8.9-1.5z" {...TOP} />
    <circle cx="13.4" cy="11.4" r=".9" fill="var(--bg)" stroke="none" />
  </>
);

// Holográfico em caixa: janela ampla sob a capa.
const reflexBoxed = (
  <>
    {rail}
    <path d="M4.8 18.6V8.4h14.4v10.2z" />
    <path d="M4.8 8.4h14.4l-1.4-1.2H6.2z" {...TOP} />
    <path d="M6.6 16.8v-6h10.8v6z" {...LENS} />
    <path d="M6.6 10.8h10.8l-.8-.8H7.4z" {...TOP} />
    <path d="M12 12.4v2.8M10.6 13.8h2.8" stroke="var(--bg)" />
  </>
);

// Tubo curto prismático: lente frontal cheia e torre de ajuste em cima.
const tubeShort = (
  <>
    {rail}
    <path d="M6.4 10.4h10.2v8.2H6.4z" />
    <path d="M6.4 10.4h10.2l-1.2-1.1H7.6z" {...TOP} />
    <ellipse cx="16.6" cy="14.5" rx="1.9" ry="4.1" {...LENS} />
    <path d="M6.4 10.4a1.4 4.1 0 0 0 0 8.2" />
    <path d="M4.2 14.5h2.2" />
    <path d="M10.2 9.3V6.6h3v2.7z" />
    <path d="M10.2 6.6h3l-.6-.8h-1.8z" {...TOP} />
  </>
);

// Luneta longa: corpo estreito, ocular estreita e lente objetiva grande.
const scopeLong = (
  <>
    {rail}
    <path d="M5.4 11.6h13.2v6H5.4z" />
    <path d="M5.4 11.6h13.2l-1-1H6.4z" {...TOP} />
    <ellipse cx="18.6" cy="14.6" rx="1.7" ry="3.8" {...LENS} />
    <ellipse cx="5.4" cy="14.6" rx="1.2" ry="3" />
    <path d="M2.8 14.6h1.4" />
    <path d="M10.6 10.6V7.4h2.8v3.2z" />
    <path d="M10.6 7.4h2.8l-.6-.9h-1.6z" {...TOP} />
    <path d="M8.6 11.6v6M15.2 11.6v6" />
  </>
);

// Variável: o anel de ampliação com a alavanca é o que a distingue.
const variableScope = (
  <>
    {rail}
    <path d="M5.4 11.6h13.2v6H5.4z" />
    <path d="M5.4 11.6h13.2l-1-1H6.4z" {...TOP} />
    <ellipse cx="18.6" cy="14.6" rx="1.7" ry="3.8" {...LENS} />
    <ellipse cx="5.4" cy="14.6" rx="1.2" ry="3" />
    <path d="M2.8 14.6h1.4" />
    <path d="M8.8 10.8V7.8h2.4v3z" />
    <path d="M8.8 7.8h2.4l-.5-.8H9.2z" {...TOP} />
    <path d="M13 11h2.6v7.6H13z" />
    <path d="M13 11h2.6l-.7-.9h-1.2z" {...TOP} />
    <path d="M15.6 12l2.6-1.9" />
  </>
);

/**
 * Que silhueta cada mira usa.
 *
 * Vai por nome, e não por ampliação, porque o formato não segue o aumento: a
 * SF-G2 é 5× e é uma caixa holográfica, a CCO é 2× e é um tubo. Uma mira que
 * não esteja aqui cai na regra por ampliação de [glyphFor].
 */
const SIGHT_SHAPE: Record<string, React.ReactNode> = {
  'iron sights': ironSights,
  'aperture sights': apertureSights,
  'cqb sights': cqbSights,

  // Ponto vermelho aberto, corpo pequeno.
  'rmr 1.00x': reflexOpen,
  'r-mr 1.00x': reflexOpen,
  'mini flex 1.00x': reflexOpen,
  'osa-7 1.00x': reflexOpen,
  'th-rds 1.00x': reflexOpen,
  'cq rds 1.25x': reflexOpen,
  'r4t 2.00x': reflexOpen,
  'ro-s 1.25x': reflexOpen,

  // Janela grande em caixa.
  'rox 1.50x': reflexBoxed,
  'a-p2 1.75x': reflexBoxed,
  '3vzr 1.75x': reflexBoxed,
  'ro-m 1.75x': reflexBoxed,
  'bf-2m 2.50x': reflexBoxed,
  'sf-g2 5.00x': reflexBoxed,

  // Tubo curto.
  '2pro 1.25x': tubeShort,
  '1p87 1.50x': tubeShort,
  'su-123 1.50x': tubeShort,
  'grim 1.50x': tubeShort,
  'cco 2.00x': tubeShort,
  'baker 3.00x': tubeShort,
  'pas-35 3.00x': tubeShort,
  'sdo 3.50x': tubeShort,
  'st prism 5.00x': tubeShort,

  // Luneta longa.
  'pvq-31 4.00x': scopeLong,
  'lds 4.50x': scopeLong,
  's-vps 6.00x': scopeLong,
  'ssds 6.00x': scopeLong,
  'ts-hd 6.00x': scopeLong,
  'lert 8.00x': scopeLong,
  'nfx 8.00x': scopeLong,

  // Ampliação variável.
  'su-230 lpvo': variableScope,
  'dvo lpvo': variableScope,
  'mars-f lpvo': variableScope,
  'mc-co lpvo': variableScope,
  'ngfc lpvo': variableScope,
  '1p88 variable': variableScope,
  'sm rifle variable': variableScope,
};

/* ---------------------------------- Bocas ---------------------------------- */

const suppressor = (
  <>
    <rect x="4" y="9" width="15" height="7" rx="1.5" />
    <path d="M8 9v7M11 9v7M14 9v7" />
    <path d="M19 11.5h2" />
  </>
);

const brake = (
  <>
    <rect x="6" y="9" width="10" height="7" rx="1" />
    <path d="M8.5 9v2.5M11.5 9v2.5M8.5 13.5V16M11.5 13.5V16" />
    <path d="M16 11.5h4M3 12.5h3" />
  </>
);

const compensator = (
  <>
    <rect x="6" y="9" width="11" height="7" rx="1" />
    <path d="M8 9.8h7" />
    <path d="M17 12.5h3M3 12.5h3" />
  </>
);

const flashHider = (
  <>
    <path d="M8 16V9M11 16V8M14 16V9" />
    <rect x="6" y="16" width="10" height="3" rx="1" />
    <path d="M3 17.5h3M16 17.5h3" />
  </>
);

const threadProtector = (
  <>
    <rect x="8" y="9" width="7" height="7" rx="1.5" />
    <path d="M8 11h7M8 14h7" />
    <path d="M4 12.5h4M15 12.5h5" />
  </>
);

/* ---------------------------------- Canos ---------------------------------- */

/**
 * O cano sai sempre da mesma base — o bloco do receiver, à esquerda — e o que
 * muda é até onde o tubo vai e quão grosso ele é. Assim dois canos de
 * comprimentos diferentes se comparam de relance, sem vão entre as peças.
 */
function barrelGlyph(endsAt: number, profile: 'padrao' | 'pesado' | 'estriado' | 'fino' = 'padrao') {
  const height = profile === 'pesado' ? 7 : profile === 'fino' ? 2.6 : 4.4;
  const top = 12 - height / 2;
  const flutes = [];
  if (profile === 'estriado') {
    for (let x = 10; x < endsAt - 1; x += 2.6) flutes.push(`M${x} ${top + 0.8}v${height - 1.6}`);
  }
  return (
    <>
      <rect x="2" y="8" width="6" height="8" rx="1" />
      <rect x="7" y={top} width={endsAt - 7} height={height} rx={height / 3} />
      {flutes.length > 0 && <path d={flutes.join('')} />}
    </>
  );
}

/* ------------------------------- Acoplamento ------------------------------- */

const verticalGrip = (
  <>
    <path d="M4 8h16" />
    <rect x="10" y="8" width="4" height="10" rx="1.5" />
    <path d="M10 11h4M10 14h4" />
  </>
);

const angularGrip = (
  <>
    <path d="M4 8h16" />
    <path d="M9 8l-3 8h4l3-8z" />
  </>
);

const handstopGrip = (
  <>
    <path d="M4 8h16" />
    <path d="M11 8v4c0 1.5 1 2 2 2" />
  </>
);

const stubbyGrip = (
  <>
    <path d="M4 8h16" />
    <rect x="10" y="8" width="4.5" height="6" rx="1.5" />
  </>
);

const bipod = (
  <>
    <path d="M4 7h16" />
    <path d="M12 7v3" />
    <path d="M12 10L7 18M12 10l5 8" />
    <path d="M5.5 18h3M15.5 18h3" />
  </>
);

const underbarrelMount = (
  <>
    <path d="M4 9h16" />
    <rect x="7" y="9" width="10" height="4" rx="1" />
    <path d="M10 9v4M13 9v4" />
  </>
);

/* -------------------------------- Carregador -------------------------------- */

const shortMag = (
  <>
    <path d="M8 5h8v3H8z" />
    <path d="M9 8h6v8H9z" />
  </>
);

const longMag = (
  <>
    <path d="M8 4h8v3H8z" />
    <path d="M9 7h6v13H9z" />
    <path d="M9 11h6M9 15h6" />
  </>
);

const drumMag = (
  <>
    <path d="M9 4h6v4H9z" />
    <circle cx="12" cy="14" r="5.5" />
    <circle cx="12" cy="14" r="1.5" />
  </>
);

const ammoBelt = (
  <>
    <path d="M3 12h18" />
    <path d="M5 12V9M8 12V9M11 12V9M14 12V9M17 12V9M19.5 12V9" />
    <path d="M4 12v4h16v-4" />
  </>
);

const beltBox = (
  <>
    <rect x="4" y="9" width="16" height="10" rx="1.5" />
    <path d="M8 9V7h8v2" />
    <path d="M8 13h8" />
  </>
);

const speedloader = (
  <>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="8.5" r="1.3" />
    <circle cx="15" cy="13.5" r="1.3" />
    <circle cx="9" cy="13.5" r="1.3" />
  </>
);

const shellTube = (
  <>
    <rect x="3" y="10" width="18" height="5" rx="2.5" />
    <path d="M7 10v5M11 10v5M15 10v5" />
  </>
);

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
  sight: reflexOpen,
  muzzle: brake,
  barrel: barrelGlyph(12),
  underbarrel: verticalGrip,
  magazine: shortMag,
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
    case 'sight': {
      const known = SIGHT_SHAPE[n];
      if (known) return known;
      // Mira nova, ainda sem silhueta própria: a ampliação dá o palpite.
      if (n.includes('lpvo') || n.includes('variable')) return variableScope;
      if (amp >= 4) return scopeLong;
      if (amp >= 1.5) return tubeShort;
      return reflexOpen;
    }

    case 'muzzle':
      if (n.includes('suppressor')) return suppressor;
      if (n.includes('thread')) return threadProtector;
      if (n.includes('flash hider')) return flashHider;
      if (n.includes('comp')) return compensator;
      if (n.includes('brake')) return brake;
      return brake;

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
      if (n.includes('bipod') || n.includes('grip pod')) return bipod;
      if (n.includes('vertical')) return verticalGrip;
      if (n.includes('angled')) return angularGrip;
      if (n.includes('handstop')) return handstopGrip;
      if (n.includes('stubby')) return stubbyGrip;
      if (n.includes('mount')) return underbarrelMount;
      if (n.includes('mw') || n.includes('laser')) return laser;
      if (n.includes('flashlight')) return flashlight;
      return verticalGrip;

    case 'magazine':
      if (n.includes('shell')) return shellTube;
      if (n.includes('speedloader')) return speedloader;
      if (n.includes('drum')) return drumMag;
      if (n.includes('belt box')) return beltBox;
      if (n.includes('belt')) return ammoBelt;
      return (attachment.magazineSize ?? 0) >= 35 ? longMag : shortMag;

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
      if (n.includes('flashlight')) return flashlight;
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
      {attachment?.slot === 'sight' || (!attachment && slot === 'sight') ? (
        <g {...SIGHT}>{attachment ? glyphFor(attachment) : BY_SLOT[slot]}</g>
      ) : (
        (attachment ? glyphFor(attachment) : BY_SLOT[slot])
      )}
    </svg>
  );
}
