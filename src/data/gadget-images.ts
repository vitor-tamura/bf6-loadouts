/**
 * Origem das artes de gadget.
 *
 * Como em `weapon-images.ts`, este arquivo é a **origem**: as imagens são
 * baixadas uma vez por `scripts/download_images.py` e passam a morar em
 * `public/gadgets/<id>.webp`, que é de onde a aplicação lê.
 *
 * A coleção vem de um template público do TierMaker, cujos nomes de arquivo
 * descrevem a função ("smoke-nade", "recon-drone") em vez da designação militar
 * que este projeto usa ("M18 Smoke", "XFGM-6D") — daí o mapa explícito abaixo,
 * item por item. Quatro gadgets não estão lá e continuam só com o ícone
 * vetorial: Repair Tool, AIO Impact, Biohazard Gas e Acoustic Sensor.
 */

const TIERMAKER =
  'https://tiermaker.com/images/media/template_images/2024/481235/battlefield-6-gadgets-481235';

/** Id do gadget → nome do arquivo na origem. */
const FILE_BY_GADGET: Record<string, string> = {
  // Assalto
  'tarantula-alx': 'assault-ladder',
  'x95-bre': 'x95-bre',
  'qlink-6': 'redeploy-beacon',
  'm320a1-he': 'nade-launchert',
  'm320a1-thrm': 'thermo-launcher',
  ss26: 'incin-shotgun',

  // Engenheiro
  'm136-at': 'm136-at',
  'mbt-law': 'mbt-law',
  'rpg-7v2': 'rpg',
  'slm-93a-spire': 'slm-93a',
  'mas-148-glaive': 'mas',
  'eod-bot-csb-iv': 'eod-bot',
  m15: 'mines',
  'm4a1-slam': 'slam-mine',
  'ptkm-1r': 'sensor-av-mine',
  'css-bundle': 'supply-puch',

  // Suporte
  powerpulse: 'defibs',
  'goliath-compact': 'supply-crate',
  'maxguard-900': 'deply-cover',
  gpdis: 'nade-intercept',
  'mp-aps': 'missile-intercept',
  lwcms: 'mortar',
  'm320a1-smk': 'smoke-launcher',
  'sich-g1-wp': 'incid-launcher',

  // Reconhecimento
  'xfgm-6d': 'recon-drone',
  m18a1: 'claymore',
  'c4-explosives': 'c4',
  'ltlm-ii': 'laser-designator',
  trcrv2: 'tracer-dart',
  'field-dummy-25': 'decoy',

  // Arremessáveis
  'm67-frag': 'frag',
  'steel-wing': 'throwing-knife',
  'mk-141-mod-0': 'stun',
  'm84-flash': 'flash',
  'scg-24-at': 'av-nade',
  'v40-mini-frag': 'mini-nade',
  'm18-smoke': 'smoke-nade',
  'an-m14-incendiary': 'incind-nade',
  'mtn-55-motion': 'prox-sensor',
};

export const GADGET_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(FILE_BY_GADGET).map(([id, file]) => [id, `${TIERMAKER}/${file}.png`]),
);

/** Arte servida pelo próprio projeto; `null` para quem não tem. */
export function gadgetImagePath(id: string): string | null {
  return id in FILE_BY_GADGET ? `/gadgets/${id}.webp` : null;
}
