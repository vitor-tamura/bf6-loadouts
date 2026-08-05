import type { PlayerClass, SlotDefinition, SlotId } from './types';

export const CLASSES: PlayerClass[] = [
  {
    id: 'assalto',
    name: 'Assalto',
    summary:
      'A ponta de lança do esquadrão. Avança, toma posição e sustenta a briga na linha de frente.',
    role: 'Tomar e manter objetivos',
    trait: 'Saque e troca de arma mais rápidos e recuperação de corrida acelerada com fuzis de assalto.',
    signatureCategory: 'ar',
    color: '#ff8a00',
  },
  {
    id: 'suporte',
    name: 'Suporte',
    summary:
      'Mantém o time de pé: reanima, distribui munição, levanta cobertura e prende o inimigo com fogo de supressão.',
    role: 'Sustentar o esquadrão',
    trait: 'Sem penalidade de velocidade de corrida ao carregar metralhadoras.',
    signatureCategory: 'lmg',
    color: '#7ddc4c',
  },
  {
    id: 'engenheiro',
    name: 'Engenheiro',
    summary:
      'Especialista em veículos. Repara os aliados, destrói os inimigos e nega passagem com minas.',
    role: 'Dominar o combate de veículos',
    trait: 'Manejo aprimorado de carabinas e reparo mais veloz.',
    signatureCategory: 'carabina',
    color: '#22c3d6',
  },
  {
    id: 'reconhecimento',
    name: 'Reconhecimento',
    summary:
      'Os olhos do time. Marca alvos, abre caminhos de flanco e elimina a distância antes de ser visto.',
    role: 'Informação e eliminação a longa distância',
    trait: 'Menos oscilação ao mirar e prender a respiração por mais tempo com rifles de precisão.',
    signatureCategory: 'sniper',
    color: '#a78bfa',
  },
];

export const SLOTS: SlotDefinition[] = [
  {
    id: 'mira',
    name: 'Mira',
    originalName: 'Sight',
    description: 'Define a ampliação e a velocidade de aquisição de alvo.',
    order: 1,
  },
  {
    id: 'boca',
    name: 'Boca',
    originalName: 'Muzzle',
    description: 'Molda o recuo e decide se os disparos aparecem no minimapa.',
    order: 2,
  },
  {
    id: 'cano',
    name: 'Cano',
    originalName: 'Barrel',
    description: 'O slot de maior alcance: mexe em velocidade de bala, recuo e mira.',
    order: 3,
  },
  {
    id: 'acoplamento',
    name: 'Acoplamento Inferior',
    originalName: 'Underbarrel',
    description: 'Ajusta a estabilidade e o comportamento ao mirar em movimento.',
    order: 4,
  },
  {
    id: 'carregador',
    name: 'Carregador',
    originalName: 'Magazine',
    description: 'Capacidade contra manejo — carregadores maiores pesam na recarga.',
    order: 5,
  },
  {
    id: 'municao',
    name: 'Munição',
    originalName: 'Ammunition',
    description: 'Altera dano, alcance e velocidade do projétil.',
    order: 6,
  },
  {
    id: 'ergonomia',
    name: 'Ergonomia',
    originalName: 'Ergonomics',
    description: 'Coronhas e empunhaduras que trocam mobilidade por estabilidade.',
    order: 7,
  },
  {
    id: 'opticoExtra',
    name: 'Acessório Óptico',
    originalName: 'Optic Accessory',
    description: 'Ampliadores e retículos acoplados à mira principal.',
    order: 8,
  },
  {
    id: 'lateralEsquerda',
    name: 'Acessório Esquerdo',
    originalName: 'Left Accessory',
    description: 'Laser, lanterna e apoios montados na lateral esquerda.',
    order: 9,
  },
  {
    id: 'lateralDireita',
    name: 'Acessório Direito',
    originalName: 'Right Accessory',
    description: 'Acessórios de manuseio montados na lateral direita.',
    order: 10,
  },
];

export const SLOTS_BY_ID = new Map<SlotId, SlotDefinition>(SLOTS.map((s) => [s.id, s]));

/** Orçamento de personalização do jogo. */
export const POINT_BUDGET = 100;

export const CATEGORY_NAMES: Record<string, string> = {
  ar: 'Fuzis de Assalto',
  carabina: 'Carabinas',
  smg: 'Submetralhadoras',
  lmg: 'Metralhadoras',
  dmr: 'Rifles de Precisão Semiautomáticos',
  sniper: 'Rifles de Precisão',
  escopeta: 'Escopetas',
  pistola: 'Pistolas',
  'corpo-a-corpo': 'Corpo a Corpo',
};

export const SHORT_CATEGORY_NAMES: Record<string, string> = {
  ar: 'Assalto',
  carabina: 'Carabina',
  smg: 'SMG',
  lmg: 'LMG',
  dmr: 'DMR',
  sniper: 'Sniper',
  escopeta: 'Escopeta',
  pistola: 'Pistola',
  'corpo-a-corpo': 'Corpo a corpo',
};
