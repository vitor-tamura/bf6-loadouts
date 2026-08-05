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

export type IdClasse = 'assalto' | 'suporte' | 'engenheiro' | 'reconhecimento';

export type CategoriaArma =
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
export type IdSlot =
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
export type Procedencia = 'jogo' | 'curado';

export interface DegrauDano {
  /** Dano por projétil a partir desta distância. */
  dano: number;
  /** Distância em metros onde este degrau passa a valer. */
  distancia: number;
}

export interface Arma {
  id: string;
  nome: string;
  categoria: CategoriaArma;
  /** Classe que ganha bônus de manejo com esta categoria. */
  classeAssinatura: IdClasse | null;
  /** Temporada em que a arma entrou no jogo (0 = lançamento). */
  temporada: number;
  /** Família de silhueta usada para montar o desenho da arma. */
  arquetipo: ArquetipoArma;
  /** Uma linha sobre o papel da arma em combate. */
  resumo: string;

  dano: DegrauDano[];
  /** Projéteis por disparo — maior que 1 apenas em escopetas. */
  projeteis: number;
  /** Disparos por minuto. */
  rpm: number;
  /** Velocidade inicial do projétil, em m/s. Base da curva de queda. */
  velocidade: number;
  /** Coeficiente de arrasto relativo do projétil (1 = referência 5,56 mm). */
  arrasto: number;
  /** Multiplicador de dano em acerto na cabeça. */
  headshot: number;

  carregador: number;
  /** Recarga com bala na agulha, em segundos. */
  recarga: number;
  /** Recarga com a arma vazia, em segundos. */
  recargaVazia: number;
  /** Tempo para mirar, em milissegundos. */
  adsMs: number;
  /** Tempo de saque/troca de arma, em milissegundos. */
  trocaMs: number;

  precisao: number;
  controle: number;
  mobilidade: number;
  hipfire: number;
  /** Recuo vertical e horizontal por disparo (unidades relativas). */
  recuoV: number;
  recuoH: number;

  /** Modo de disparo disponível. */
  disparo: ('automatico' | 'rajada' | 'semiautomatico' | 'ferrolho' | 'bombeamento')[];
  /** Slots que esta arma aceita. */
  slots: IdSlot[];

  procedencia: Procedencia;
}

/** Silhuetas base reaproveitadas entre armas parecidas. */
export type ArquetipoArma =
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

export interface Modificador {
  /** Somado ao valor base. */
  add?: number;
  /** Multiplica o valor base. */
  mult?: number;
}

/** Estatísticas que um acessório pode alterar. */
export type ChaveStat =
  | 'dano'
  | 'alcance'
  | 'rpm'
  | 'velocidade'
  | 'carregador'
  | 'recarga'
  | 'adsMs'
  | 'trocaMs'
  | 'precisao'
  | 'controle'
  | 'mobilidade'
  | 'hipfire'
  | 'recuoV'
  | 'recuoH';

export type ModsStat = Partial<Record<ChaveStat, Modificador>>;

export interface Compatibilidade {
  categorias?: CategoriaArma[];
  arquetipos?: ArquetipoArma[];
  /** Libera apenas para estas armas, ignorando categoria e arquétipo. */
  armas?: string[];
  /** Remove estas armas da compatibilidade. */
  exceto?: string[];
}

export interface Acessorio {
  id: string;
  /** Nome como aparece no jogo em português. */
  nome: string;
  /** Nome original em inglês, mostrado como apoio a quem joga em inglês. */
  nomeOriginal: string;
  slot: IdSlot;
  /** Custo no orçamento de 100 pontos. */
  custo: number;
  descricao: string;
  mods: ModsStat;
  compat: Compatibilidade;
  /** Peça correspondente no desenho da arma. */
  peca?: PecaAcessorio;
  /** Ampliação, para miras. */
  ampliacao?: number;
  procedencia: Procedencia;
}

/** Peças desenháveis sobre a silhueta da arma. */
export type PecaAcessorio =
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
  nome: string;
  nomeOriginal: string;
  classe: IdClasse | 'todas';
  tipo: 'gadget' | 'granada' | 'equipamento';
  descricao: string;
  procedencia: Procedencia;
}

export interface Classe {
  id: IdClasse;
  nome: string;
  resumo: string;
  /** O que a classe faz de melhor, em uma frase. */
  papel: string;
  /** Vantagem passiva com a arma-assinatura. */
  traco: string;
  categoriaAssinatura: CategoriaArma;
  cor: string;
}

/** Definição de um slot para exibição na interface. */
export interface DefinicaoSlot {
  id: IdSlot;
  nome: string;
  nomeOriginal: string;
  descricao: string;
  /** Ordem de exibição no painel de personalização. */
  ordem: number;
}
