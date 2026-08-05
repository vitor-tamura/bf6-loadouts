import type { Classe, DefinicaoSlot, IdSlot } from './tipos';

export const CLASSES: Classe[] = [
  {
    id: 'assalto',
    nome: 'Assalto',
    resumo:
      'A ponta de lança do esquadrão. Avança, toma posição e sustenta a briga na linha de frente.',
    papel: 'Tomar e manter objetivos',
    traco: 'Saque e troca de arma mais rápidos e recuperação de corrida acelerada com fuzis de assalto.',
    categoriaAssinatura: 'ar',
    cor: '#ff8a00',
  },
  {
    id: 'suporte',
    nome: 'Suporte',
    resumo:
      'Mantém o time de pé: reanima, distribui munição, levanta cobertura e prende o inimigo com fogo de supressão.',
    papel: 'Sustentar o esquadrão',
    traco: 'Sem penalidade de velocidade de corrida ao carregar metralhadoras.',
    categoriaAssinatura: 'lmg',
    cor: '#7ddc4c',
  },
  {
    id: 'engenheiro',
    nome: 'Engenheiro',
    resumo:
      'Especialista em veículos. Repara os aliados, destrói os inimigos e nega passagem com minas.',
    papel: 'Dominar o combate de veículos',
    traco: 'Manejo aprimorado de carabinas e reparo mais veloz.',
    categoriaAssinatura: 'carabina',
    cor: '#22c3d6',
  },
  {
    id: 'reconhecimento',
    nome: 'Reconhecimento',
    resumo:
      'Os olhos do time. Marca alvos, abre caminhos de flanco e elimina a distância antes de ser visto.',
    papel: 'Informação e eliminação a longa distância',
    traco: 'Menos oscilação ao mirar e prender a respiração por mais tempo com rifles de precisão.',
    categoriaAssinatura: 'sniper',
    cor: '#a78bfa',
  },
];

export const SLOTS: DefinicaoSlot[] = [
  {
    id: 'mira',
    nome: 'Mira',
    nomeOriginal: 'Sight',
    descricao: 'Define a ampliação e a velocidade de aquisição de alvo.',
    ordem: 1,
  },
  {
    id: 'boca',
    nome: 'Boca',
    nomeOriginal: 'Muzzle',
    descricao: 'Molda o recuo e decide se os disparos aparecem no minimapa.',
    ordem: 2,
  },
  {
    id: 'cano',
    nome: 'Cano',
    nomeOriginal: 'Barrel',
    descricao: 'O slot de maior alcance: mexe em velocidade de bala, recuo e mira.',
    ordem: 3,
  },
  {
    id: 'acoplamento',
    nome: 'Acoplamento Inferior',
    nomeOriginal: 'Underbarrel',
    descricao: 'Ajusta a estabilidade e o comportamento ao mirar em movimento.',
    ordem: 4,
  },
  {
    id: 'carregador',
    nome: 'Carregador',
    nomeOriginal: 'Magazine',
    descricao: 'Capacidade contra manejo — carregadores maiores pesam na recarga.',
    ordem: 5,
  },
  {
    id: 'municao',
    nome: 'Munição',
    nomeOriginal: 'Ammunition',
    descricao: 'Altera dano, alcance e velocidade do projétil.',
    ordem: 6,
  },
  {
    id: 'ergonomia',
    nome: 'Ergonomia',
    nomeOriginal: 'Ergonomics',
    descricao: 'Coronhas e empunhaduras que trocam mobilidade por estabilidade.',
    ordem: 7,
  },
  {
    id: 'opticoExtra',
    nome: 'Acessório Óptico',
    nomeOriginal: 'Optic Accessory',
    descricao: 'Ampliadores e retículos acoplados à mira principal.',
    ordem: 8,
  },
  {
    id: 'lateralEsquerda',
    nome: 'Acessório Esquerdo',
    nomeOriginal: 'Left Accessory',
    descricao: 'Laser, lanterna e apoios montados na lateral esquerda.',
    ordem: 9,
  },
  {
    id: 'lateralDireita',
    nome: 'Acessório Direito',
    nomeOriginal: 'Right Accessory',
    descricao: 'Acessórios de manuseio montados na lateral direita.',
    ordem: 10,
  },
];

export const SLOTS_POR_ID = new Map<IdSlot, DefinicaoSlot>(SLOTS.map((s) => [s.id, s]));

/** Orçamento de personalização do jogo. */
export const ORCAMENTO_PONTOS = 100;

export const NOMES_CATEGORIA: Record<string, string> = {
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

export const NOMES_CATEGORIA_CURTO: Record<string, string> = {
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
