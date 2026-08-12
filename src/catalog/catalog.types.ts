/**
 * O contrato do catálogo versionado.
 *
 * Este arquivo é a fronteira entre o pipeline de dados (`scripts/catalog`) e o
 * site: os dois lados leem os mesmos tipos, então um campo que muda aqui quebra
 * o build de quem escreve e de quem consome, que é exatamente o alarme que se
 * quer.
 *
 * O modelo tem três camadas, e a separação é o ponto:
 *
 * - **Entidade** é identidade e nada mais: id estável, nome, apelidos e o
 *   ciclo de vida. Uma arma continua sendo a mesma arma quando é renomeada,
 *   rebalanceada ou retirada do jogo.
 * - **Versão** é o estado do jogo num patch: quais peças cada arma aceita,
 *   quanto elas custam, o que fazem e quanto a arma tem de cadência. Cada
 *   versão é um instantâneo fechado, e nenhuma reescreve a anterior.
 * - **Evento** é a passagem de uma versão para a outra, com a fonte que a
 *   sustenta. É o que permite responder "por que isto mudou" meses depois.
 *
 * Compatibilidade não mora na entidade de propósito. Ela é uma relação entre
 * arma e peça num patch específico — e é a única coisa que jamais se deduz de
 * categoria, arquétipo ou semelhança: a EA confirma que cada arma tem o próprio
 * conjunto de acessórios, então relação sem fonte que a confirme não existe.
 */

/** Versão do jogo no formato da EA: `1.3.3.0`. */
export type GameVersion = string;

/**
 * O que é feito de uma entidade que sai do jogo.
 *
 * `removed` é o que se aplica a quem saiu: a entidade fica, com a versão da
 * saída registrada, porque apagá-la levaria junto o histórico de quem a usou.
 * `deprecated` é a peça que ainda existe mas está a caminho da porta.
 */
export type EntityStatus = 'active' | 'removed' | 'deprecated';

/**
 * A que título uma fonte fala.
 *
 * A hierarquia não é global, é por tipo de informação: os patch notes da EA
 * mandam no que mudou, o BF6 Loadouts manda no que existe hoje, e o dataset da
 * comunidade entra como conferência. `inferred` existe para ser recusado —
 * nenhum dado do catálogo pode nascer daqui.
 */
export type SourceType = 'official' | 'current_state' | 'verified' | 'community' | 'inferred';

/**
 * De onde veio o dado.
 *
 * Cada registro carrega a sua, e não a do arquivo em que está: um mesmo
 * `compatibility.json` mistura linhas confirmadas pelo BF6 Loadouts com linhas
 * herdadas do dataset da comunidade, e sem isto não haveria como saber qual é
 * qual quando as duas divergirem.
 */
export interface SourceRef {
  /** Quem publicou: `EA`, `bf6loadouts`, `raymdl/BF6-Weapon-Analyzer`. */
  provider: string;
  type: SourceType;
  url?: string | null;
  /** Recorte usado dentro da fonte, quando ela tem mais de um. */
  dataset?: string | null;
  /** SHA do commit, para a importação de um repositório ser reproduzível. */
  commit?: string | null;
  /** Versão do jogo a que a observação se refere. */
  version?: GameVersion | null;
  /** Quando foi lida, em ISO. */
  retrievedAt?: string | null;
  /** Nome do instantâneo que agrupa a importação. */
  snapshot?: string | null;
}

/* ------------------------------- entidades ------------------------------- */

export interface CategoryEntity {
  id: string;
  /** Como o jogo escreve: `Assault Rifle`. */
  name: string;
  aliases: string[];
}

export interface SlotEntity {
  id: string;
  name: string;
  aliases: string[];
  /** Ordem de exibição, quando houver. `null` enquanto ninguém a definiu. */
  order: number | null;
}

/** O que é permanente numa entidade: o id e a linha do tempo dele. */
interface Lifecycle {
  status: EntityStatus;
  introducedIn: GameVersion;
  removedIn: GameVersion | null;
  /**
   * Nomes anteriores, na ordem em que foram trocados.
   *
   * Renomear não cria entidade nova: o id fica, o nome novo entra em `name` e o
   * antigo desce para cá, senão a busca por "50 MW Violet" deixaria de achar a
   * peça no dia em que a EA a rebatizasse.
   */
  aliases: string[];
  source: SourceRef;
}

export interface WeaponEntity extends Lifecycle {
  id: string;
  name: string;
  category: string;
  caliber: string | null;
}

/**
 * O alcance de uma peça.
 *
 * `global` é a peça que circula entre armas — um freio de boca, uma mira. `weapon`
 * é a que só existe dentro de uma arma, como cada carregador: o "30 Rnd" da
 * M4A1 não é o mesmo objeto que o "30 Rnd" da AK, tem custo e efeito próprios,
 * e tratá-los como um só faria a troca de arma herdar números alheios.
 */
export type AttachmentScope = 'global' | 'weapon';

export interface AttachmentEntity extends Lifecycle {
  id: string;
  /** O id curto dentro da fonte, antes do prefixo que o torna único aqui. */
  sourceId: string | null;
  name: string;
  slot: string;
  scope: AttachmentScope;
  /** O grupo da fonte — `WEAPON_MAG`, `LASERS` —, guardado para rastreio. */
  group: string | null;
  /** A arma dona da peça, quando `scope` é `weapon`. */
  weaponScope: string | null;
}

/* --------------------------- estado de uma versão --------------------------- */

/**
 * O que uma relação arma → peça diz.
 *
 * `active` é a relação que a fonte confirma naquela versão. `removed` é a que
 * existia e deixou de existir — ela fica registrada, porque o desaparecimento é
 * informação. `needs_review` é a que nenhuma fonte sustenta com clareza
 * suficiente: ela não vale como compatibilidade, e existe para ser resolvida
 * por gente, não para ser assumida.
 */
export type RelationStatus = 'active' | 'removed' | 'needs_review';

export interface CompatibilityRow {
  gameVersion: GameVersion;
  weaponId: string;
  attachmentId: string;
  slot: string;
  status: RelationStatus;
  source: SourceRef;
  /** Preenchido quando a linha entra como pendência, dizendo o que falta. */
  note?: string | null;
}

/**
 * As estatísticas da arma naquela versão.
 *
 * O mapa é aberto de propósito: o catálogo guarda o que a fonte publica, e o
 * que ela ainda não publica fica de fora em vez de virar zero. Campo ausente é
 * campo desconhecido — quem lê precisa distinguir "não sabemos" de "é zero".
 */
export interface WeaponStats {
  weaponId: string;
  gameVersion: GameVersion;
  stats: Record<string, number | null>;
  source: SourceRef;
}

/**
 * O que a peça faz, naquela versão.
 *
 * Fica separado da identidade porque muda sozinho: um patch que reduz o recuo
 * do freio de boca não cria um freio de boca novo. As chaves são as da fonte —
 * o dataset da comunidade trabalha em degraus (`adsTimeTierMod`), e converter
 * isso para outra escala aqui seria inventar precisão que ninguém mediu.
 */
export interface AttachmentEffects {
  attachmentId: string;
  gameVersion: GameVersion;
  effects: Record<string, unknown>;
  /** Custo em Attachment Points. `null` quando a fonte não publica. */
  cost: number | null;
  source: SourceRef;
  /** Campos que a fonte marcou como suposição dela, e não como medição. */
  assumed?: string[];
}

/** O instantâneo de uma entidade dentro de uma versão. */
export interface VersionedEntityRef {
  id: string;
  status: EntityStatus;
  /** Nome em vigor naquela versão, que pode não ser o de hoje. */
  name: string;
}

export interface VersionMetadata {
  version: GameVersion;
  label: string;
  /** Publicação do patch pela EA, quando conhecida. */
  releasedAt: string | null;
  importedAt: string;
  /** A versão que este instantâneo sucede — `null` na primeira. */
  previousVersion: GameVersion | null;
  status: 'current' | 'historical';
  sources: SourceRef[];
  counts: {
    weapons: number;
    attachments: number;
    compatibility: number;
    stats: number;
    effects: number;
  };
}

/* --------------------------------- eventos --------------------------------- */

export type ChangeType =
  | 'initial_import'
  | 'weapon_added'
  | 'weapon_removed'
  | 'weapon_reintroduced'
  | 'attachment_added'
  | 'attachment_removed'
  | 'attachment_reintroduced'
  | 'compatibility_added'
  | 'compatibility_removed'
  | 'stat_changed'
  | 'attachment_effect_changed'
  | 'cost_changed'
  | 'weapon_renamed'
  | 'attachment_renamed'
  | 'source_conflict'
  | 'source_conflict_resolved';

/**
 * O quanto uma mudança pode andar sozinha.
 *
 * `auto` é a mudança que uma fonte confirma sem discordância. `review` é a que
 * as fontes contam de formas diferentes: ela entra no Pull Request marcada, e
 * quem decide é quem revisa. `blocked` é a que o parser não conseguiu ler — ela
 * não toca no catálogo e vira issue.
 */
export type AutomationLevel = 'auto' | 'review' | 'blocked';

export interface ChangeEvent {
  id: string;
  gameVersion: GameVersion;
  timestamp: string;
  type: ChangeType;
  entityType: 'weapon' | 'attachment' | 'compatibility' | 'catalog';
  entityId: string | null;
  changes: Record<string, unknown>;
  sources: SourceRef[];
  automation: AutomationLevel;
  /** Como o conflito terminou, quando o evento é de conflito. */
  resolution?: {
    status: 'resolved' | 'open';
    selectedSource?: string;
    reason?: string;
  } | null;
}

/* --------------------------------- índices --------------------------------- */

/**
 * Os índices são derivados, e isso é uma regra e não uma observação: quem
 * responde "que peças esta arma aceita" é `compatibility.json`. Estes mapas
 * existem só para a leitura ser rápida, e são regerados inteiros a cada build —
 * se um deles discordar da fonte, quem está errado é o índice.
 */
export interface CatalogIndexes {
  gameVersion: GameVersion;
  generatedAt: string;
  attachmentsByWeapon: Record<string, string[]>;
  weaponsByAttachment: Record<string, string[]>;
  attachmentsByWeaponSlot: Record<string, Record<string, string[]>>;
}

export interface VersionsIndex {
  current: GameVersion;
  versions: {
    version: GameVersion;
    label: string;
    releasedAt: string | null;
    importedAt: string;
    status: 'current' | 'historical';
  }[];
}

/* ------------------------- o artefato que o site lê ------------------------- */

/**
 * O catálogo pronto para consumo.
 *
 * Gerado por `scripts/catalog/build.ts` e nunca editado à mão. Ele é a versão
 * corrente já resolvida: entidade, estado, compatibilidade e índices no mesmo
 * objeto, sem patch notes, sem histórico e sem conflitos — quem precisa dessas
 * camadas lê `data/`, que é onde elas vivem.
 */
/**
 * A balística de uma arma numa versão.
 *
 * Mora fora de `stats.json` porque é outra natureza de dado: `stats` são os
 * números que o menu do jogo mostra, e isto é o que descreve o projétil no ar —
 * a escada de dano por distância, a velocidade, o arrasto. Um vem da tela do
 * jogo, o outro de medição, e misturá-los faria a procedência dos dois virar a
 * mesma.
 *
 * Nenhuma das três fontes publica isto hoje. O tipo existe para que, quando uma
 * publicar, o dado tenha lugar definido em vez de ser espremido no primeiro
 * campo livre.
 */
/**
 * O quanto se pode confiar num número.
 *
 * Vem da fonte, não de avaliação nossa: o Analyzer marca as próprias curvas de
 * dano como `provisional`, e essa marca viaja até a tela. `unavailable` é a
 * ausência — diferente de estimativa, que é um número fraco, ausência é a falta
 * de número, e as duas pedem comportamentos diferentes de quem exibe.
 */
export type DataQuality = 'verified' | 'provisional' | 'estimated' | 'unavailable';

export interface WeaponBallistics {
  weaponId: string;
  /** Velocidade inicial do projétil, em m/s. */
  muzzleVelocity: number | null;
  /**
   * O arrasto é do modelo, não da arma.
   *
   * O coeficiente é aplicado a todas e trocado por tipo de munição. Guardá-lo
   * repetido em cada arma faria parecer que foi medido arma a arma — e ele é
   * disputado entre fontes; ver `dragConflict` em `ballistics.json`.
   */
  drag: { model: string; coefficient: number } | null;
  gravity: number | null;
  status: DataQuality;
  source: SourceRef;
}

/**
 * A curva de dano por distância, em pontos.
 *
 * Guardar mínimo e máximo perderia os degraus do meio, que é onde a arma muda
 * de comportamento. Com os pontos, o dano em qualquer distância sai por
 * interpolação e o gráfico desenha o que existe, sem inventar o intervalo.
 */
export interface WeaponDamageModel {
  weaponId: string;
  model: string;
  /**
   * Quanto cada parte do corpo multiplica o dano.
   *
   * Vem de tabela por arma, com padrão por família quando a arma não está
   * listada — não é propriedade da curva, e por isso viaja ao lado dela.
   */
  zones: {
    head: number;
    limb: number;
    body: number;
    limbClass: string | null;
    byAmmo: { hollowPoint: number | null; synthetic: number | null };
  };
  curve: { distance: number; damage: number; source: string | null }[];
  status: DataQuality;
  /** A procedência que a fonte declara, em texto livre. */
  declaredSource: string | null;
  source: SourceRef;
}

/** O modelo de recuo do BF6 é polar: direção e variação, não X e Y. */
export interface WeaponRecoil {
  weaponId: string;
  model: string;
  recoil: unknown;
  status: DataQuality;
  source: SourceRef;
}

export interface WeaponSpread {
  weaponId: string;
  spread: unknown;
  dynamic: unknown;
  status: DataQuality;
  source: SourceRef;
}

export interface WeaponReload {
  weaponId: string;
  /** Recarga com bala na agulha, em segundos. */
  tactical: number | null;
  /** Recarga com o carregador vazio, em segundos. */
  empty: number | null;
  speed: unknown;
  status: DataQuality;
  source: SourceRef;
}

/** O modelo de voo do projétil, comum a todas as armas. */
export interface BallisticsModel {
  name: string;
  gravityMps2: number;
  baseDragPerMeter: number;
  ammoDragPerMeter: Record<string, unknown>;
  /** A discordância entre fontes sobre o coeficiente, quando existe. */
  dragConflict?: {
    status: 'open' | 'resolved';
    analyzer: { base: number; longRange: number };
    communitySpreadsheet: { base: number; longRange: number };
    note: string;
  };
}

/**
 * O que o catálogo já é capaz de sustentar.
 *
 * A migração do site acontece por domínio, e cada domínio precisa saber se pode
 * confiar no catálogo para o que ele faz. Esta bandeira responde isso sem que
 * ninguém precise inspecionar registro por registro — e sem a alternativa ruim,
 * que seria a tela descobrir a falta de dado na hora de desenhar o gráfico.
 *
 * Ela é calculada pelo `build` a partir dos dados reais, nunca escrita à mão:
 * uma capacidade declarada verdadeira sem o dado por trás é pior do que não ter
 * a bandeira nenhuma.
 */
export interface CatalogCapabilities {
  weapons: boolean;
  attachments: boolean;
  compatibility: boolean;
  magazines: boolean;
  ammo: boolean;
  costs: boolean;
  effects: boolean;
  ballistics: boolean;
  damageCurves: boolean;
  velocity: boolean;
  drag: boolean;
  ads: boolean;
  recoil: boolean;
  ttk: boolean;
}

export interface CurrentCatalog {
  schemaVersion: number;
  gameVersion: GameVersion;
  generatedAt: string;
  /** O que este catálogo sustenta hoje. Ver `CatalogCapabilities`. */
  capabilities: CatalogCapabilities;
  categories: CategoryEntity[];
  slots: SlotEntity[];
  weapons: (WeaponEntity & { stats: Record<string, number | null> })[];
  attachments: (AttachmentEntity & {
    /**
     * O nome da peça no jogo em inglês.
     *
     * `name` é o nome em português; este é o da fonte. Os dois viajam juntos
     * porque quem joga em inglês reconhece a peça por este, e a busca precisa
     * achar pelos dois.
     */
    originalName: string;
    cost: number | null;
    effects: Record<string, unknown>;
  })[];
  compatibility: {
    weaponId: string;
    attachmentId: string;
    slot: string;
  }[];

  /**
   * Os dados de simulação.
   *
   * São o que sustenta TTK, curva de dano e queda de bala. Vêm separados das
   * estatísticas de menu de propósito: `stats` é o que o jogo mostra na tela de
   * personalização, isto é o que descreve o projétil no ar. Procedências
   * diferentes, confiabilidades diferentes.
   */
  ballisticsModel: BallisticsModel | null;
  ballistics: WeaponBallistics[];
  damageModels: WeaponDamageModel[];
  recoil: WeaponRecoil[];
  spread: WeaponSpread[];
  reload: WeaponReload[];

  indexes: CatalogIndexes;
  /** O que ficou pendente de revisão humana, contado por tipo. */
  pending: Record<string, number>;
  /** Quantas armas há em cada nível de confiança, por domínio de dado. */
  dataQuality: Record<string, Record<DataQuality, number>>;
}
