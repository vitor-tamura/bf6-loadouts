import type { Attachment, Compatibility, Weapon } from './types';
import arquivo from './analyzer-sync.json' with { type: 'json' };

/**
 * As correções que os arquivos do jogo fazem no cadastro do site.
 *
 * Quem escreve `analyzer-sync.json` é `npm run catalog:sincronizar-analyzer`
 * (ver o cabeçalho de `scripts/catalog/sincronizar-analyzer.ts`), a partir do
 * BF6-Weapon-Analyzer, que lê os arquivos do jogo com o Frosty. Aqui só se lê:
 * `weapons.ts` e `attachments.ts` passam o cadastro por estas funções na hora
 * de montar `WEAPONS` e `ATTACHMENTS`, e nenhum arquivo de código é reescrito
 * por expressão regular — rodar o sincronizador de novo só regrava o JSON.
 *
 * ## Por que cada número traz o valor de antes
 *
 * Cada correção guarda o que o cadastro mostrava quando ela foi calculada
 * (`antes`), e só vale enquanto o cadastro continuar mostrando aquilo. Se a
 * curadoria — ou o `catalog:aplicar-no-site`, que grava o patch note em
 * `weapons.ts` — mexer no campo depois, o número novo dela vence até a próxima
 * sincronização. Sem essa trava, um patch aplicado no dia ficaria escondido
 * atrás do valor que o Analyzer tinha antes dele.
 *
 * Compatibilidade não precisa da trava: ela viaja como diferença (`adicionar`,
 * `remover`), e uma diferença aplicada sobre um cadastro que mudou continua
 * dizendo a mesma coisa sobre aquelas armas.
 */

/** Os campos da arma que vêm dos arquivos do jogo. Os de escala do site (barras, recuo, tempos de mira e saque) não entram. */
export type CampoSincronizado =
  | 'damage'
  | 'pellets'
  | 'rpm'
  | 'velocity'
  | 'magazine'
  | 'reload'
  | 'emptyReload'
  | 'headshot'
  | 'fireModes';

/** Uma correção de um número: o valor do jogo, o do cadastro quando ela foi feita, e de onde ela veio. */
export interface Correcao<T> {
  valor: T;
  antes: T;
  fonte: string;
}

/** A curva de dano viaja como em `weapons.ts`: pares [dano, distância]. */
export type ValorDoCampo<C extends CampoSincronizado> = C extends 'damage'
  ? [number, number][]
  : C extends 'fireModes'
    ? Weapon['fireModes']
    : number;

export interface SincroniaDaArma {
  idNoAnalyzer: string;
  campos: { [C in CampoSincronizado]?: Correcao<ValorDoCampo<C>> };
}

export interface SincroniaDaPeca {
  custo?: Correcao<number>;
  compat?: { adicionar?: string[]; remover?: string[]; fonte: string };
}

export interface ArquivoDeSincronia {
  /** Leia o cabeçalho de scripts/catalog/sincronizar-analyzer.ts antes de mexer aqui. */
  _leiaMe?: string;
  fonte: {
    repo: string;
    commit: string | null;
    data: string | null;
    versaoDeclarada: string | null;
  } | null;
  armas: Record<string, SincroniaDaArma>;
  pecas: Record<string, SincroniaDaPeca>;
  /** Variantes por arma que o cadastro não tinha — custo próprio naquela arma. */
  pecasNovas: (Attachment & { origem?: unknown })[];
  /** Custo de cada papel de cano, quando o do jogo difere de `CUSTO_DO_CANO` em `loadout.ts`. */
  custoDoCano: Record<string, number>;
  /** A munição que vem na arma, quando não é a regra de `defaultAmmo`: id da arma → id da peça. */
  municaoDeSerie?: Record<string, string>;
}

const dados = arquivo as unknown as ArquivoDeSincronia;

export const SINCRONIA: ArquivoDeSincronia = dados;

/** Comparação por valor, para número, lista de modos de tiro e curva de dano. */
export function mesmoValor(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** O valor do campo como a correção o guarda: a curva vira pares. */
function valorNoCadastro(arma: Weapon, campo: CampoSincronizado): unknown {
  if (campo === 'damage') return arma.damage.map((degrau) => [degrau.damage, degrau.distance]);
  return arma[campo];
}

/** A arma com os números do jogo, onde o cadastro ainda mostra o valor que a sincronização viu. */
export function sincronizarArma(arma: Weapon, sincronia: SincroniaDaArma | undefined = dados.armas[arma.id]): Weapon {
  if (!sincronia) return arma;
  const corrigida: Weapon = { ...arma };
  for (const [campo, correcao] of Object.entries(sincronia.campos) as [CampoSincronizado, Correcao<unknown>][]) {
    if (!correcao || !mesmoValor(valorNoCadastro(arma, campo), correcao.antes)) continue;
    if (campo === 'damage') {
      corrigida.damage = (correcao.valor as [number, number][]).map(([damage, distance]) => ({ damage, distance }));
    } else {
      (corrigida as unknown as Record<string, unknown>)[campo] = correcao.valor;
    }
  }
  return corrigida;
}

/**
 * A compatibilidade com as armas que a fonte acrescenta e tira.
 *
 * Peça com lista de armas ganha e perde da lista. Peça por categoria (a
 * munição) não tem lista: perde por `except` e ganha por `extraWeapons`, para
 * continuar valendo nas armas novas da mesma categoria que `novidades.ts`
 * trouxer.
 */
export function aplicarCompat(
  compat: Compatibility,
  { adicionar = [], remover = [] }: { adicionar?: string[]; remover?: string[] },
): Compatibility {
  if (!adicionar.length && !remover.length) return compat;
  const tirar = new Set(remover);
  const por = new Set(adicionar);

  if (compat.weapons) {
    const weapons = [...new Set([...compat.weapons, ...adicionar])].filter((w) => !tirar.has(w));
    const resultado: Compatibility = { ...compat, weapons };
    if (compat.except) resultado.except = compat.except.filter((w) => !por.has(w));
    return resultado;
  }

  const except = [...new Set([...(compat.except ?? []).filter((w) => !por.has(w)), ...remover])];
  const extraWeapons = [...new Set([...(compat.extraWeapons ?? []), ...adicionar])].filter((w) => !tirar.has(w));
  const resultado: Compatibility = { ...compat };
  delete resultado.except;
  delete resultado.extraWeapons;
  if (except.length) resultado.except = except;
  if (extraWeapons.length) resultado.extraWeapons = extraWeapons;
  return resultado;
}

/** A peça com o custo e as armas do jogo. */
export function sincronizarPeca(peca: Attachment, sincronia: SincroniaDaPeca | undefined = dados.pecas[peca.id]): Attachment {
  if (!sincronia) return peca;
  let corrigida = peca;
  if (sincronia.custo && peca.cost === sincronia.custo.antes) corrigida = { ...corrigida, cost: sincronia.custo.valor };
  if (sincronia.compat) corrigida = { ...corrigida, compat: aplicarCompat(corrigida.compat, sincronia.compat) };
  return corrigida;
}

/** As variantes novas, sem o registro de origem. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `origem` sai de propósito.
export const PECAS_DA_SINCRONIA: Attachment[] = (dados.pecasNovas ?? []).map(({ origem: _origem, ...peca }) => peca);

/**
 * O cadastro de peças com as correções aplicadas e as variantes novas no fim.
 * Peça que o cadastro já tem com o mesmo id tem precedência sobre a variante.
 */
export function sincronizarPecas(pecas: Attachment[]): Attachment[] {
  const ids = new Set(pecas.map((peca) => peca.id));
  return [
    ...pecas.map((peca) => sincronizarPeca(peca)),
    ...PECAS_DA_SINCRONIA.filter((nova) => !ids.has(nova.id)),
  ];
}

/** A munição de série que o jogo dá à arma, quando não é a regra de `defaultAmmo`. */
export const MUNICAO_DE_SERIE: Record<string, string> = dados.municaoDeSerie ?? {};

/** Custo por papel de cano que o jogo cobra e difere da tabela de `loadout.ts`. */
export const CUSTO_DO_CANO_SINCRONIZADO: Record<string, number> = dados.custoDoCano ?? {};
