import type { Gadget } from '@/data/types';

/**
 * Ícone de gadget, equipamento e arremessável.
 *
 * Aqui são 43 itens, todos distintos entre si na função — então cada um tem o
 * seu próprio desenho, ao contrário dos acessórios, que se agrupam por família.
 * O traço é `currentColor`, como no [AttachmentIcon].
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Corpo de granada oval, base comum de vários arremessáveis. */
const grenadeBody = (
  <>
    <path d="M10.5 5h3v2h-3z" />
    <path d="M13.5 5.5c1 0 1.8.6 2 1.2" />
    <path d="M12 7c2.8 0 5 2.4 5 5.5S14.8 19 12 19s-5-2.9-5-6.5S9.2 7 12 7z" />
  </>
);

const GLYPHS: Record<string, React.ReactNode> = {
  /* ------------------------------- Assalto ------------------------------- */

  // Escada extensível.
  'tarantula-alx': (
    <>
      <path d="M8 3v18M16 3v18" />
      <path d="M8 7h8M8 11h8M8 15h8M8 19h8" />
    </>
  ),

  // Carga de brecha: parede que se abre.
  'x95-bre': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 9h5M16 9h5M3 15h4M17 15h4" />
      <path d="M12 5l-2.5 5h4L11 19" />
    </>
  ),

  // Farol de reaparecimento.
  'qlink-6': (
    <>
      <path d="M12 21V11" />
      <path d="M8 21h8" />
      <circle cx="12" cy="8" r="2" />
      <path d="M7.5 4.5a6 6 0 0 0 0 7M16.5 4.5a6 6 0 0 1 0 7" />
    </>
  ),

  // Lança-granadas HE.
  'm320a1-he': (
    <>
      <rect x="3" y="9" width="12" height="6" rx="3" />
      <path d="M15 12h3" />
      <circle cx="20" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M6 15v3h3" />
    </>
  ),

  // Termobárico: mesmo tubo, chama na saída.
  'm320a1-thrm': (
    <>
      <rect x="3" y="9" width="11" height="6" rx="3" />
      <path d="M6 15v3h3" />
      <path d="M17 16c-1.6-1-2-2.6-1.2-4 .3 1 .9 1.3 1.4 1 .2-1.4 0-2.4-.7-3.4 2.6 1 4 3 3.4 5-.3 1-1.3 1.6-2.9 1.4z" />
    </>
  ),

  // Escopeta incendiária acoplada.
  ss26: (
    <>
      <rect x="3" y="10" width="13" height="4" rx="1" />
      <path d="M6 14v3h2" />
      <path d="M18 15c-1.3-.8-1.6-2-1-3 .2.8.7 1 1.1.8.2-1 0-1.8-.5-2.5 2 .8 3 2.3 2.6 3.8-.3.8-1 1.2-2.2 1z" />
    </>
  ),

  // Chave: repara veículo, fere infantaria.
  'repair-tool': (
    <>
      <path d="M17.5 4a4 4 0 0 0-5 5L4 17.5 6.5 20 15 11.5a4 4 0 0 0 5-5l-2.4 2.4-2.1-2.1z" />
    </>
  ),

  /* ------------------------------ Engenheiro ----------------------------- */

  // Lançador guiado pela mira.
  'm136-at': (
    <>
      <rect x="2" y="10" width="16" height="5" rx="1" />
      <path d="M18 12.5h4" />
      <path d="M7 15v3M11 15v2" />
      <circle cx="20" cy="12.5" r="3" />
      <path d="M20 9.5v6M17 12.5h6" />
    </>
  ),

  // Trava sozinho e ataca por cima.
  'mbt-law': (
    <>
      <rect x="2" y="12" width="14" height="4.5" rx="1" />
      <path d="M16 14.2h3" />
      <path d="M19 3v6M17 7l2 2 2-2" />
    </>
  ),

  // Foguete sem trava, ogiva cônica.
  'rpg-7v2': (
    <>
      <path d="M3 11.5h11" />
      <path d="M2 10h2v4H2z" />
      <path d="M14 9.5l4 2.5-4 2.5z" />
      <path d="M18 12h4" />
      <path d="M8 13v3" />
    </>
  ),

  // Antiaéreo com trava por calor.
  'slm-93a-spire': (
    <>
      <path d="M12 20V9" />
      <path d="M12 3l2.5 6h-5z" />
      <path d="M9 16l-2 4M15 16l2 4" />
      <path d="M4 6l1.5 1.5M20 6l-1.5 1.5" />
    </>
  ),

  // Projétil com câmera no bico.
  'mas-148-glaive': (
    <>
      <path d="M3 12h12" />
      <path d="M15 8.5l5 3.5-5 3.5z" />
      <circle cx="17" cy="12" r="1.2" />
      <path d="M6 12v3.5M9 12v2.5" />
    </>
  ),

  // Mini-esteira por rádio.
  'eod-bot-csb-iv': (
    <>
      <rect x="3" y="13" width="18" height="5" rx="2.5" />
      <path d="M7 13V9h8v4" />
      <path d="M15 9l4-4" />
      <circle cx="19.5" cy="4.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="15.5" r="1" />
      <circle cx="17" cy="15.5" r="1" />
    </>
  ),

  // Mina de pressão em disco.
  m15: (
    <>
      <path d="M3 17h18" />
      <path d="M6 17v-3a6 6 0 0 1 12 0v3" />
      <path d="M10 10.5h4" />
    </>
  ),

  // Mina magnética direcional na parede.
  'm4a1-slam': (
    <>
      <path d="M5 3v18" />
      <rect x="5" y="8" width="5" height="8" rx="1" />
      <path d="M11 10.5h8M11 13.5h8" strokeDasharray="2 2" />
    </>
  ),

  // Escuta o motor e dispara para cima.
  'ptkm-1r': (
    <>
      <rect x="7" y="13" width="10" height="6" rx="1" />
      <path d="M12 13V6" />
      <path d="M9.5 8.5L12 6l2.5 2.5" />
      <path d="M4 16a4 4 0 0 1 3-3M20 16a4 4 0 0 0-3-3" />
    </>
  ),

  // Reabastece blindado aliado.
  'css-bundle': (
    <>
      <rect x="3" y="9" width="12" height="9" rx="1" />
      <path d="M3 12h12" />
      <path d="M7 9V7h4v2" />
      <path d="M17 6l4 3-4 3" />
      <path d="M21 9h-5" />
    </>
  ),

  /* -------------------------------- Suporte ------------------------------- */

  // Reanima o aliado: pás de desfibrilador.
  powerpulse: (
    <>
      <rect x="3" y="7" width="6" height="6" rx="1.5" />
      <rect x="15" y="7" width="6" height="6" rx="1.5" />
      <path d="M9 10h6" />
      <path d="M12.5 13l-3 4.5h3l-1 3.5 3.5-5h-3z" />
    </>
  ),

  // Pacote de munição arremessado.
  'goliath-compact': (
    <>
      <rect x="6" y="11" width="12" height="8" rx="1" />
      <path d="M6 14h12" />
      <path d="M10 11V9h4v2" />
      <path d="M4 8a10 10 0 0 1 8-4" strokeDasharray="2 2" />
    </>
  ),

  // Barricada balística.
  'maxguard-900': (
    <>
      <path d="M5 5h14v7c0 4-3.2 6.4-7 7.5C8.2 18.4 5 16 5 12z" />
      <path d="M12 5v14.5" />
    </>
  ),

  // APS contra granada.
  gpdis: (
    <>
      <path d="M4 18h16" />
      <path d="M6 18a6 6 0 0 1 12 0" />
      <circle cx="12" cy="6" r="2" />
      <path d="M9.5 3.5l5 5" />
    </>
  ),

  // APS pesado contra míssil.
  'mp-aps': (
    <>
      <path d="M2 19h20" />
      <path d="M5 19a7 7 0 0 1 14 0" />
      <path d="M12 3v5" />
      <path d="M10 5l2-2 2 2" />
      <path d="M8.5 8.5l7-5" />
    </>
  ),

  // Morteiro portátil.
  lwcms: (
    <>
      <path d="M7 19L17 6" />
      <path d="M15 4.5l3 2" />
      <path d="M9 16l-3 3M11 14l4 5" />
      <circle cx="12.5" cy="3.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),

  // Fumaça a distância.
  'm320a1-smk': (
    <>
      <rect x="3" y="12" width="9" height="5" rx="2.5" />
      <path d="M5 17v2.5h2.5" />
      <path d="M15 12a2 2 0 1 1 .5 3.9H14a2 2 0 0 1 0-4z" />
      <path d="M17.5 8a2 2 0 1 1 .5 3.9h-1.5a2 2 0 0 1 0-4z" />
    </>
  ),

  // Explode no ar e chove fogo.
  'sich-g1-wp': (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M12 2v2M7 4l1.4 1.4M17 4l-1.4 1.4" />
      <path d="M8 12v3M12 13v4M16 12v3" />
      <path d="M6 17v2M10 19v2M14 18v2M18 17v2" />
    </>
  ),

  /* ---------------------------- Reconhecimento --------------------------- */

  // Drone aéreo.
  'xfgm-6d': (
    <>
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
      <path d="M9 9L5 5M15 9l4-4M9 15l-4 4M15 15l4 4" />
      <path d="M3 5h4M17 5h4M3 19h4M17 19h4" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),

  // Claymore com fios de laser.
  m18a1: (
    <>
      <path d="M7 16c0-3 1.5-5 5-5s5 2 5 5z" />
      <path d="M9 16v3M15 16v3" />
      <path d="M5 8h14" strokeDasharray="2 2" />
    </>
  ),

  // C-4 com detonação remota.
  'c4-explosives': (
    <>
      <rect x="3" y="11" width="11" height="7" rx="1" />
      <path d="M6 11V9h5v2" />
      <path d="M14 14h3v-3" />
      <path d="M17 11V6" />
      <path d="M15.5 7.5L17 6l1.5 1.5" />
    </>
  ),

  // Sensor acústico enterrado.
  'acoustic-sensor': (
    <>
      <path d="M12 20v-9" />
      <path d="M9 20h6" />
      <path d="M9.5 9a3.5 3.5 0 0 1 5 0" />
      <path d="M7 6.5a7 7 0 0 1 10 0" />
    </>
  ),

  // Binóculo designador.
  'ltlm-ii': (
    <>
      <circle cx="7" cy="13" r="3.5" />
      <circle cx="17" cy="13" r="3.5" />
      <path d="M10.5 13h3" />
      <path d="M5 9V6.5h4V9M15 9V6.5h4V9" />
    </>
  ),

  // Dardo rastreador.
  trcrv2: (
    <>
      <path d="M4 20l8-8" />
      <path d="M12 12l3-3 3 3-3 3z" />
      <path d="M17 5.5a6 6 0 0 1 2 2" />
      <path d="M18.5 3a9 9 0 0 1 3 3" />
    </>
  ),

  // Alvo falso.
  'field-dummy-25': (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <path d="M12 8.5v7" />
      <path d="M7 11h10" />
      <path d="M12 15.5L9 21M12 15.5L15 21" />
      <path d="M16 4l3-1-1 3" />
    </>
  ),

  /* ----------------------------- Arremessáveis ---------------------------- */

  'm67-frag': grenadeBody,

  // Lâmina de arremesso.
  'steel-wing': (
    <>
      <path d="M4 20l6-6" />
      <path d="M10 14l4-9 6 4-8 7z" />
      <path d="M14 5l-2 8" />
    </>
  ),

  // Detona ao tocar.
  'aio-impact': (
    <>
      <path d="M12 4c2.5 0 4.5 2.2 4.5 5S14.5 15 12 15s-4.5-2.2-4.5-6S9.5 4 12 4z" />
      <path d="M10.5 2h3v2h-3z" />
      <path d="M6 18l2.5-1.5M18 18l-2.5-1.5M12 21v-3" />
    </>
  ),

  // Atordoante: ondas curtas.
  'mk-141-mod-0': (
    <>
      <rect x="9" y="6" width="6" height="12" rx="2" />
      <path d="M10 6V4.5h4V6" />
      <path d="M5.5 9a5 5 0 0 0 0 6M18.5 9a5 5 0 0 1 0 6" />
    </>
  ),

  // Cega: raios longos.
  'm84-flash': (
    <>
      <rect x="9.5" y="8" width="5" height="9" rx="1.5" />
      <path d="M10.5 8V6.5h3V8" />
      <path d="M12 4V2M5 6.5L3.5 5M19 6.5L20.5 5M4 12.5H2M22 12.5h-2" />
    </>
  ),

  // Paraquedas antitanque.
  'scg-24-at': (
    <>
      <path d="M4.5 9a7.5 7.5 0 0 1 15 0z" />
      <path d="M4.5 9l7 4M19.5 9l-7 4M12 9v4" />
      <rect x="10" y="13" width="4" height="7" rx="1" />
    </>
  ),

  // Duas unidades pequenas.
  'v40-mini-frag': (
    <>
      <path d="M8 8c1.8 0 3 1.5 3 3.5S9.8 15 8 15s-3-1.5-3-3.5S6.2 8 8 8z" />
      <path d="M7 6.5h2V8H7z" />
      <path d="M16 11c1.8 0 3 1.5 3 3.5S17.8 18 16 18s-3-1.5-3-3.5S14.2 11 16 11z" />
      <path d="M15 9.5h2V11h-2z" />
    </>
  ),

  // Cortina de fumaça.
  'm18-smoke': (
    <>
      <rect x="8" y="12" width="5" height="8" rx="1.5" />
      <path d="M9 12v-1.5h3V12" />
      <path d="M14 9a2 2 0 1 1 .5 3.9H13a2 2 0 0 1 0-4z" />
      <path d="M16.5 4.5a2.2 2.2 0 1 1 .5 4.3h-1.7a2.2 2.2 0 0 1 0-4.3z" />
    </>
  ),

  // Incendiária.
  'an-m14-incendiary': (
    <>
      <rect x="8.5" y="12" width="6" height="8" rx="1.5" />
      <path d="M9.5 12v-1.5h4V12" />
      <path d="M11.5 9c-2-1.4-2.5-3.5-1.5-5.5.4 1.5 1.2 1.9 1.9 1.4.3-2 0-3.3-1-4.6" transform="translate(1.5 1.5)" />
    </>
  ),

  // Sensor de movimento arremessável.
  'mtn-55-motion': (
    <>
      <circle cx="12" cy="14" r="3" />
      <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
      <path d="M8 9.5a6 6 0 0 1 8 0" />
      <path d="M5.5 6.5a10 10 0 0 1 13 0" />
    </>
  ),

  // Nuvem tóxica.
  'biohazard-gas': (
    <>
      <path d="M6.5 18a3.2 3.2 0 0 1-.3-6.4A4.5 4.5 0 0 1 15 10a3.5 3.5 0 0 1 2.5 8z" />
      <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
      <path d="M12 13l-1.6-2.6M12 15l-2 .6M12.6 14.6l1.8 1.6" />
    </>
  ),
};

/** Reserva por tipo, se algum item novo entrar no dataset antes do desenho. */
const BY_KIND: Record<Gadget['kind'], React.ReactNode> = {
  gadget: (
    <>
      <rect x="4" y="7" width="16" height="11" rx="1.5" />
      <path d="M9 7V5h6v2" />
    </>
  ),
  throwable: grenadeBody,
  equipment: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
};

export function GadgetIcon({ gadget, size = 32 }: { gadget: Gadget; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
      {...STROKE}
    >
      {GLYPHS[gadget.id] ?? BY_KIND[gadget.kind]}
    </svg>
  );
}
