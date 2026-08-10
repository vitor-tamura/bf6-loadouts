/**
 * Modelo de dados do arsenal de Battlefield 6.
 *
 * Convenções que valem para todo o dataset:
 * - Distâncias em metros, tempos em milissegundos (salvo `recarga`, em segundos).
 * - `dano` é uma escada de degraus: cada degrau vale a partir da sua distância
 *   até o degrau seguinte. É assim que o jogo trata a queda de dano.
 * - Estatísticas de 0 a 100 (precisão, controle, mobilidade, tiro sem visada)
 *   espelham as barras exibidas no menu do jogo.
 */

export type ClassId = 'assault' | 'support' | 'engineer' | 'recon';

export type WeaponCategory =
  | 'ar'
  | 'carbine'
  | 'smg'
  | 'lmg'
  | 'dmr'
  | 'sniper'
  | 'shotgun'
  | 'pistol'
  | 'melee';

/** Os dez slots de personalização, com os nomes da localização do jogo. */
export type SlotId =
  | 'sight'
  | 'muzzle'
  | 'barrel'
  | 'magazine'
  | 'ammo'
  | 'underbarrel'
  | 'ergonomics'
  | 'opticAccessory'
  | 'leftRail'
  | 'rightRail';

/** De onde vem cada número — dirige o aviso de valor aproximado na interface. */
export type Provenance = 'game' | 'curated';

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
  fireModes: ('auto' | 'burst' | 'semi' | 'ferrolho' | 'bombeamento')[];
  /** Slots que esta arma aceita. */
  slots: SlotId[];

  provenance: Provenance;
}

/** Silhuetas base reaproveitadas entre armas parecidas. */
export type WeaponArchetype =
  | 'ar-nato'
  | 'ar-east'
  | 'bullpup'
  | 'carbine-short'
  | 'smg-compact'
  | 'smg-pdw'
  | 'lmg-belt'
  | 'lmg-light'
  | 'dmr'
  | 'sniper-bolt'
  | 'shotgun'
  | 'pistol'
  | 'revolver'
  | 'knife'
  | 'blunt';

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
  | 'drag'
  | 'magazine'
  | 'reload'
  | 'adsMs'
  | 'swapMs'
  | 'accuracy'
  | 'control'
  | 'mobility'
  | 'hipfire'
  | 'verticalRecoil'
  | 'horizontalRecoil'
  | 'headshot';

export type StatMods = Partial<Record<StatKey, Modifier>>;

export interface Compatibility {
  categories?: WeaponCategory[];
  archetypes?: WeaponArchetype[];
  /** Libera apenas para estas armas, ignorando categoria e arquétipo. */
  weapons?: string[];
  /** Remove estas armas da compatibilidade. */
  except?: string[];
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
  /**
   * Capacidade absoluta do carregador, quando a peça é um carregador. Vem do
   * próprio nome ("Carregador de 30"), então substitui o valor da arma em vez
   * de multiplicá-lo.
   */
  magazineSize?: number;
  /**
   * Número de projéteis por disparo, quando a peça o redefine. É o caso do
   * balote: ele troca a nuvem de chumbo por um projétil único, então não dá
   * para tratá-lo como multiplicador de dano sobre as pelotas.
   */
  pelletsOverride?: number;
  /**
   * Multiplicador de dano na cabeça, quando a munição o fixa. Ponta oca e ponta
   * sintética valem 1,50x e 1,75x em qualquer arma — é um valor absoluto, não
   * um ganho sobre o multiplicador de origem.
   */
  headshotOverride?: number;
  compat: Compatibility;
  /** Ampliação, para miras. */
  magnification?: number;
  /**
   * Peça cujo efeito repete o de outra, apontando para ela.
   *
   * Nasceu da premissa de que dois canos de mesmo comprimento são
   * intercambiáveis, e é por isso que precisa ser lida com cuidado: a tela do
   * jogo mostra que boa parte desses pares é de categorias distintas — o
   * `18" SPR` é o cano Pesado da M16A4 e o `18" Govt.` é o Básico, e estão
   * marcados aqui como se um substituísse o outro. O que os igualou foi o
   * dataset, que deriva o efeito do cano só do comprimento e ainda não modela
   * o perfil pesado.
   *
   * Ninguém lê este campo ainda. Antes de ligá-lo a qualquer filtro de tela, as
   * marcações precisam ser conferidas uma a uma contra o jogo.
   */
  supersededBy?: string;
  provenance: Provenance;
}

export interface Gadget {
  id: string;
  name: string;
  originalName: string;
  playerClass: ClassId | 'all';
  /** `equipment` é o dispositivo de assinatura, fixo na classe. */
  kind: 'gadget' | 'throwable' | 'equipment';
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
