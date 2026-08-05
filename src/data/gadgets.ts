import type { ClassId, Gadget } from './types';

/* -------------------------------------------------------------------------- *
 * Equipamento por classe.
 *
 * Cada peça traz a designação que aparece no jogo (Tarantula ALX, M320A1 HE) e,
 * ao lado, o que ela é — porque o nome técnico sozinho não diz para que serve.
 *
 * Os arremessáveis se dividem em dois grupos: os universais, que qualquer classe
 * leva, e os exclusivos, que só aparecem para a classe dona.
 * -------------------------------------------------------------------------- */

export const GADGETS: Gadget[] = [
  /* --------------------------------- Assalto --------------------------------- */
  {
    id: 'tarantula-alx',
    name: 'Tarantula ALX',
    originalName: 'Assault Ladder',
    playerClass: 'assalto',
    kind: 'gadget',
    description:
      'Escada extensível: na vertical, sobe prédio; na horizontal, vira ponte. Abre rota onde a defesa não espera.',
    provenance: 'jogo',
  },
  {
    id: 'x95-bre',
    name: 'X95 BRE',
    originalName: 'Breaching Projectile Launcher',
    playerClass: 'assalto',
    kind: 'gadget',
    description: 'Dispara uma carga que explode após um instante e abre parede — entrada nova em prédio fechado.',
    provenance: 'jogo',
  },
  {
    id: 'qlink-6',
    name: 'Qlink 6',
    originalName: 'Deploy Beacon',
    playerClass: 'assalto',
    kind: 'gadget',
    description: 'Ponto de renascimento para o esquadrão, com usos limitados. Bem escondido, sustenta um flanco.',
    provenance: 'jogo',
  },
  {
    id: 'm320a1-he',
    name: 'M320A1 HE',
    originalName: 'High Explosive Launcher',
    playerClass: 'assalto',
    kind: 'gadget',
    description: 'Lança-granadas explosivo: elimina infantaria agrupada e derruba cobertura leve.',
    provenance: 'jogo',
  },
  {
    id: 'm320a1-thrm',
    name: 'M320A1 THRM',
    originalName: 'Thermobaric Grenade Launcher',
    playerClass: 'assalto',
    kind: 'gadget',
    description: 'Projétil termobárico que cria uma zona de fogo persistente — feito para limpar sala.',
    provenance: 'jogo',
  },
  {
    id: 'ss26',
    name: 'SS26',
    originalName: 'Incendiary-Round Shotgun',
    playerClass: 'assalto',
    kind: 'gadget',
    description: 'Escopeta incendiária acoplada: resposta rápida no vão curto, com cartucho que queima.',
    provenance: 'jogo',
  },

  /* -------------------------------- Engenheiro -------------------------------- */
  {
    id: 'repair-tool',
    name: 'Repair Tool',
    originalName: 'Repair Tool',
    playerClass: 'engenheiro',
    kind: 'equipment',
    description:
      'Dispositivo de assinatura, sempre no loadout: repara veículo aliado ou causa dano contínuo no inimigo.',
    provenance: 'jogo',
  },
  {
    id: 'm136-at',
    name: 'M136 AT',
    originalName: 'Aim-Guided Launcher',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Foguete antitanque guiado pela mira: mantenha o alvo na retícula até o impacto.',
    provenance: 'jogo',
  },
  {
    id: 'mbt-law',
    name: 'MBT-LAW',
    originalName: 'Auto-Guided Launcher',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Trava sozinho no alvo em terra e ataca de cima para baixo, onde a blindagem é fina.',
    provenance: 'jogo',
  },
  {
    id: 'rpg-7v2',
    name: 'RPG-7V2',
    originalName: 'Unguided Rocket Launcher',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Foguete burro de alto impacto e projétil veloz. Sem trava: a mira é toda sua.',
    provenance: 'jogo',
  },
  {
    id: 'slm-93a-spire',
    name: 'SLM-93A Spire',
    originalName: 'Air-Defense Launcher',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Antiaéreo com trava por calor: obriga jato e helicóptero a manter distância.',
    provenance: 'jogo',
  },
  {
    id: 'mas-148-glaive',
    name: 'MAS 148 Glaive',
    originalName: 'Long-Range Launcher',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Projétil pesado com câmera no bico: alcança blindado escondido do outro lado do mapa.',
    provenance: 'jogo',
  },
  {
    id: 'eod-bot-csb-iv',
    name: 'EOD Bot CSB IV',
    originalName: 'EOD Bot',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Mini-esteira por rádio: desarma bomba, conserta e explode tanque sem expor o operador.',
    provenance: 'jogo',
  },
  {
    id: 'm15',
    name: 'M15',
    originalName: 'Anti-Vehicle Mine',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Mina de pressão clássica: dano massivo em esteira e pneu. Em conjunto, fecha uma estrada.',
    provenance: 'jogo',
  },
  {
    id: 'm4a1-slam',
    name: 'M4A1 SLAM',
    originalName: 'Tripwire Sensor AV Mine',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Mina magnética direcional: gruda na parede e detona quando o veículo passa perto.',
    provenance: 'jogo',
  },
  {
    id: 'ptkm-1r',
    name: 'PTKM-1R',
    originalName: 'Acoustic Sensor AV Mine',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Ouve o motor e dispara um projétil contra o teto do tanque — não precisa ser pisada.',
    provenance: 'jogo',
  },
  {
    id: 'css-bundle',
    name: 'CSS Bundle',
    originalName: 'Vehicle Supply Crate',
    playerClass: 'engenheiro',
    kind: 'gadget',
    description: 'Reabastece a munição do blindado aliado e encurta a recarga das habilidades dele.',
    provenance: 'jogo',
  },

  /* --------------------------------- Suporte --------------------------------- */
  {
    id: 'powerpulse',
    name: 'Powerpulse',
    originalName: 'Defibrillator',
    playerClass: 'suporte',
    kind: 'equipment',
    description: 'Dispositivo de assinatura: reanima o aliado caído na hora e devolve o esquadrão à briga.',
    provenance: 'jogo',
  },
  {
    id: 'goliath-compact',
    name: 'Goliath Compact',
    originalName: 'Supply Pouch',
    playerClass: 'suporte',
    kind: 'gadget',
    description: 'Arremessa pacotes de munição e utilitário direto para quem está avançando.',
    provenance: 'jogo',
  },
  {
    id: 'maxguard-900',
    name: 'Maxguard 900',
    originalName: 'Deployable Cover',
    playerClass: 'suporte',
    kind: 'gadget',
    description: 'Barricada balística portátil: cria posição de tiro onde o mapa não oferece nenhuma.',
    provenance: 'jogo',
  },
  {
    id: 'gpdis',
    name: 'GPDIS',
    originalName: 'Grenade Intercept System',
    playerClass: 'suporte',
    kind: 'gadget',
    description: 'APS portátil que destrói granada de fragmentação e de fumaça ainda no ar.',
    provenance: 'jogo',
  },
  {
    id: 'mp-aps',
    name: 'MP-APS',
    originalName: 'Missile Intercept System',
    playerClass: 'suporte',
    kind: 'gadget',
    description: 'APS pesado: anula foguete e míssil guiado de veículo dentro do perímetro.',
    provenance: 'jogo',
  },
  {
    id: 'lwcms',
    name: 'LWCMS',
    originalName: 'Portable Mortar',
    playerClass: 'suporte',
    kind: 'gadget',
    description: 'Morteiro portátil: barragem de fragmentação ou fumaça sobre alvo que você não vê.',
    provenance: 'jogo',
  },
  {
    id: 'm320a1-smk',
    name: 'M320A1 SMK',
    originalName: 'Smoke Grenade Launcher',
    playerClass: 'suporte',
    kind: 'gadget',
    description: 'Cortina de fumaça densa a distância, para cobrir a travessia do esquadrão.',
    provenance: 'jogo',
  },
  {
    id: 'sich-g1-wp',
    name: 'Sich G1 WP',
    originalName: 'Incendiary Airburst Launcher',
    playerClass: 'suporte',
    kind: 'gadget',
    description: 'Explode no ar sobre a cobertura e chove fogo em quem está entrincheirado.',
    provenance: 'jogo',
  },

  /* ----------------------------- Reconhecimento ----------------------------- */
  {
    id: 'xfgm-6d',
    name: 'XFGM-6D',
    originalName: 'Recon Drone',
    playerClass: 'reconhecimento',
    kind: 'gadget',
    description: 'Drone aéreo por controle remoto: avista infantaria e marca veículo eletronicamente.',
    provenance: 'jogo',
  },
  {
    id: 'm18a1',
    name: 'M18A1',
    originalName: 'Anti-Personnel Mine',
    playerClass: 'reconhecimento',
    kind: 'gadget',
    description: 'Claymore com fios de laser: protege as costas enquanto você observa pela luneta.',
    provenance: 'jogo',
  },
  {
    id: 'c4-explosives',
    name: 'C-4 Explosives',
    originalName: 'Demolition Charge',
    playerClass: 'reconhecimento',
    kind: 'gadget',
    description: 'Explosivo plástico adesivo com detonação remota — para armadilha ou investida em tanque.',
    provenance: 'jogo',
  },
  {
    id: 'acoustic-sensor',
    name: 'Acoustic Sensor',
    originalName: 'Motion Sensor',
    playerClass: 'reconhecimento',
    kind: 'gadget',
    description: 'Enterrado no chão, revela no minimapa qualquer inimigo que correr no raio.',
    provenance: 'jogo',
  },
  {
    id: 'ltlm-ii',
    name: 'LTLM II',
    originalName: 'Laser Designator',
    playerClass: 'reconhecimento',
    kind: 'gadget',
    description: 'Binóculo que pinta o alvo para os mísseis traváveis dos Engenheiros.',
    provenance: 'jogo',
  },
  {
    id: 'trcrv2',
    name: 'TRCRV2',
    originalName: 'Tracer Dart',
    playerClass: 'reconhecimento',
    kind: 'gadget',
    description: 'Dardo magnético no veículo inimigo: qualquer lançador do time passa a travar nele.',
    provenance: 'jogo',
  },
  {
    id: 'field-dummy-25',
    name: 'Field Dummy 25',
    originalName: 'Sniper Decoy',
    playerClass: 'reconhecimento',
    kind: 'gadget',
    description: 'Alvo falso que, ao ser alvejado, cria um marcador de atirador enganoso no mapa inimigo.',
    provenance: 'jogo',
  },

  /* ------------------------- Arremessáveis universais ------------------------- */
  {
    id: 'm67-frag',
    name: 'M67 Frag',
    originalName: 'M67 Frag',
    playerClass: 'todas',
    kind: 'throwable',
    description: 'Granada temporizada clássica: dano massivo em área. Resolve cômodo fechado.',
    provenance: 'jogo',
  },
  {
    id: 'steel-wing',
    name: 'Steel Wing',
    originalName: 'Steel Wing',
    playerClass: 'todas',
    kind: 'throwable',
    description: 'Lâmina de arremesso: eliminação furtiva de um golpe, sem barulho nem explosão.',
    provenance: 'jogo',
  },
  {
    id: 'aio-impact',
    name: 'AIO Impact',
    originalName: 'AIO Impact',
    playerClass: 'todas',
    kind: 'throwable',
    description: 'Detona ao tocar a superfície: sem tempo de reação para o alvo, com dano menor.',
    provenance: 'jogo',
  },

  /* ------------------------ Arremessáveis por classe ------------------------ */
  {
    id: 'mk-141-mod-0',
    name: 'MK 141 Mod 0',
    originalName: 'Stun Grenade',
    playerClass: 'assalto',
    kind: 'throwable',
    description: 'Atordoa: bloqueia a corrida e a mira do inimigo por alguns segundos.',
    provenance: 'jogo',
  },
  {
    id: 'm84-flash',
    name: 'M84 Flash',
    originalName: 'Flashbang',
    playerClass: 'assalto',
    kind: 'throwable',
    description: 'Cega por completo quem estiver olhando na direção do estouro.',
    provenance: 'jogo',
  },
  {
    id: 'scg-24-at',
    name: 'SCG-24 AT',
    originalName: 'Anti-Tank Grenade',
    playerClass: 'engenheiro',
    kind: 'throwable',
    description: 'Abre paraquedas no ar e desce na vertical para atingir o teto do tanque.',
    provenance: 'jogo',
  },
  {
    id: 'v40-mini-frag',
    name: 'V40 Mini-Frag',
    originalName: 'V40 Mini-Frag',
    playerClass: 'engenheiro',
    kind: 'throwable',
    description: 'Duas unidades: menos dano que a M67, porém arremessa muito mais longe.',
    provenance: 'jogo',
  },
  {
    id: 'm18-smoke',
    name: 'M18 Smoke',
    originalName: 'Smoke Grenade',
    playerClass: 'suporte',
    kind: 'throwable',
    description:
      'Névoa densa que corta a visão e limpa marcações. Jogada sobre fogo incendiário, apaga as chamas.',
    provenance: 'jogo',
  },
  {
    id: 'an-m14-incendiary',
    name: 'AN/M14 Incendiary',
    originalName: 'Incendiary Grenade',
    playerClass: 'suporte',
    kind: 'throwable',
    description: 'Queima uma área por tempo limitado: bloqueia passagem e impede reanimação.',
    provenance: 'jogo',
  },
  {
    id: 'mtn-55-motion',
    name: 'MTN-55 Motion',
    originalName: 'Motion Sensor',
    playerClass: 'reconhecimento',
    kind: 'throwable',
    description: 'Sensor arremessável que rastreia e revela a posição do inimigo no minimapa.',
    provenance: 'jogo',
  },
  {
    id: 'biohazard-gas',
    name: 'Biohazard Gas',
    originalName: 'Gas Grenade',
    playerClass: 'reconhecimento',
    kind: 'throwable',
    description: 'Nuvem tóxica: dano contínuo e visão embaçada para quem não está protegido.',
    provenance: 'jogo',
  },
];

export const GADGETS_BY_ID = new Map<string, Gadget>(GADGETS.map((g) => [g.id, g]));

/** Gadgets e equipamento de assinatura da classe. */
export function gadgetsForClass(playerClass: ClassId): Gadget[] {
  return GADGETS.filter((g) => g.playerClass === playerClass && g.kind !== 'throwable');
}

/**
 * Arremessáveis disponíveis para a classe: os universais mais os exclusivos
 * dela.
 */
export function throwables(playerClass?: ClassId): Gadget[] {
  return GADGETS.filter(
    (g) =>
      g.kind === 'throwable' &&
      (g.playerClass === 'todas' || !playerClass || g.playerClass === playerClass),
  );
}
