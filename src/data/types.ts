/**
 * Modelo de dados do arsenal de Battlefield 6.
 *
 * Convenções que valem para todo o dataset:
 * - Distâncias em metros, tempos em milissegundos (salvo `recarga`, em segundos).
 * - `dano` é uma escada de degraus: cada degrau vale a partir da sua distância
 *   até o degrau seguinte. É assim que o jogo trata a queda de dano.
 * - Estatísticas de 0 a 100 (precisão, controle, mobilidade, tiro de quadril)
 *   espelham as barras exibidas no menu do jogo.
 */

export type ClassId = 'assalto' | 'suporte' | 'engenheiro' | 'reconhecimento';

export type WeaponCategory =
  | 'ar'
  | 'carabina'
  | 'smg'
  | 'lmg'
  | 'dmr'
  | 'sniper'
  | 'escopeta'
  | 'pistola'
  | 'corpo-a-corpo';

/** Os dez slots de personalização, com os nomes da localização do jogo. */
export type SlotId =
  | 'mira'
  | 'boca'
  | 'cano'
  | 'carregador'
  | 'municao'
  | 'acoplamento'
  | 'ergonomia'
  | 'opticoExtra'
  | 'lateralEsquerda'
  | 'lateralDireita';

/** De onde vem cada número — dirige o aviso de valor aproximado na interface. */
export type Provenance = 'jogo' | 'curado';

export interface DamageStep {
  /** Dano por projétil a partir desta distância. */
  damage: number;
  /** Distância em metros onde este degrau passa a valer. */
  distance: number;
}

export interface Weapon {
  id: string;
  name: string;
  category: WeaponCategory;
  /** Classe que ganha bônus de manejo com esta categoria. */
  signatureClass: ClassId | null;
  /** Temporada em que a arma entrou no jogo (0 = lançamento). */
  season: number;
  /** Família de silhueta usada para montar o desenho da arma. */
  archetype: WeaponArchetype;
  /** Uma linha sobre o papel da arma em combate. */
  summary: string;

  damage: DamageStep[];
  /** Projéteis por disparo — maior que 1 apenas em escopetas. */
  pellets: number;
  /** Disparos por minuto. */
  rpm: number;
  /** Velocidade inicial do projétil, em m/s. Base da curva de queda. */
  velocity: number;
  /** Coeficiente de arrasto relativo do projétil (1 = referência 5,56 mm). */
  drag: number;
  /** Multiplicador de dano em acerto na cabeça. */
  headshot: number;

  magazine: number;
  /** Recarga com bala na agulha, em segundos. */
  reload: number;
  /** Recarga com a arma vazia, em segundos. */
  emptyReload: number;
  /** Tempo para mirar, em milissegundos. */
  adsMs: number;
  /** Tempo de saque/troca de arma, em milissegundos. */
  swapMs: number;

  accuracy: number;
  control: number;
  mobility: number;
  hipfire: number;
  /** Recuo vertical e horizontal por disparo (unidades relativas). */
  verticalRecoil: number;
  horizontalRecoil: number;

  /** Modo de disparo disponível. */
  fireModes: ('automatico' | 'rajada' | 'semiautomatico' | 'ferrolho' | 'bombeamento')[];
  /** Slots que esta arma aceita. */
  slots: SlotId[];

  provenance: Provenance;
}

/** Silhuetas base reaproveitadas entre armas parecidas. */
export type WeaponArchetype =
  | 'ar-otan'
  | 'ar-leste'
  | 'bullpup'
  | 'carabina-curta'
  | 'smg-compacta'
  | 'smg-pdw'
  | 'lmg-caixa'
  | 'lmg-leve'
  | 'dmr'
  | 'sniper-ferrolho'
  | 'escopeta'
  | 'pistola'
  | 'revolver'
  | 'faca'
  | 'contundente';

export interface Modifier {
  /** Somado ao valor base. */
  add?: number;
  /** Multiplica o valor base. */
  mult?: number;
}

/** Estatísticas que um acessório pode alterar. */
export type StatKey =
  | 'damage'
  | 'range'
  | 'rpm'
  | 'velocity'
  | 'magazine'
  | 'reload'
  | 'adsMs'
  | 'swapMs'
  | 'accuracy'
  | 'control'
  | 'mobility'
  | 'hipfire'
  | 'verticalRecoil'
  | 'horizontalRecoil';

export type StatMods = Partial<Record<StatKey, Modifier>>;

export interface Compatibility {
  categories?: WeaponCategory[];
  arquetipos?: WeaponArchetype[];
  /** Libera apenas para estas armas, ignorando categoria e arquétipo. */
  armas?: string[];
  /** Remove estas armas da compatibilidade. */
  exceto?: string[];
}

export interface Attachment {
  id: string;
  /** Nome como aparece no jogo em português. */
  name: string;
  /** Nome original em inglês, mostrado como apoio a quem joga em inglês. */
  originalName: string;
  slot: SlotId;
  /** Custo no orçamento de 100 pontos. */
  cost: number;
  description: string;
  mods: StatMods;
  compat: Compatibility;
  /** Peça correspondente no desenho da arma. */
  part?: AttachmentPart;
  /** Ampliação, para miras. */
  magnification?: number;
  provenance: Provenance;
}

/** Peças desenháveis sobre a silhueta da arma. */
export type AttachmentPart =
  | 'supressor'
  | 'freio'
  | 'compensador'
  | 'quebra-chamas'
  | 'cano-curto'
  | 'cano-longo'
  | 'cano-pesado'
  | 'ponto-vermelho'
  | 'holografica'
  | 'luneta-media'
  | 'luneta-longa'
  | 'ferro'
  | 'empunhadura-vertical'
  | 'empunhadura-angular'
  | 'bipe'
  | 'apoio-mao'
  | 'carregador-curto'
  | 'carregador-longo'
  | 'tambor'
  | 'laser'
  | 'lanterna'
  | 'coronha-leve'
  | 'coronha-pesada'
  | 'ampliador';

export interface Gadget {
  id: string;
  name: string;
  originalName: string;
  playerClass: ClassId | 'todas';
  tipo: 'gadget' | 'granada' | 'equipamento';
  description: string;
  provenance: Provenance;
}

export interface PlayerClass {
  id: ClassId;
  name: string;
  summary: string;
  /** O que a classe faz de melhor, em uma frase. */
  role: string;
  /** Vantagem passiva com a arma-assinatura. */
  trait: string;
  signatureCategory: WeaponCategory;
  color: string;
}

/** Definição de um slot para exibição na interface. */
export interface SlotDefinition {
  id: SlotId;
  name: string;
  originalName: string;
  description: string;
  /** Ordem de exibição no painel de personalização. */
  order: number;
}
