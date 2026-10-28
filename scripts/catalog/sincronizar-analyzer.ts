#!/usr/bin/env node
/**
 * Os números e as peças do site conferidos contra os arquivos do jogo.
 *
 *   npm run catalog:sincronizar-analyzer               # baixa o Analyzer e grava a correção
 *   ANALYZER_DIR=../BF6-Weapon-Analyzer npm run catalog:sincronizar-analyzer
 *   npm run catalog:sincronizar-analyzer -- --dry-run  # só relata
 *   npm run catalog:sincronizar-analyzer -- --force    # grava mesmo com o Analyzer atrás do catálogo
 *
 * ## Por que existe
 *
 * O cadastro de `src/data/weapons.ts` e `src/data/attachments.ts` foi montado
 * de várias fontes ao longo de cinco temporadas — o catálogo do bf6loadouts,
 * planilhas da comunidade, telas do jogo lidas à mão —, e envelheceu por
 * partes. Em outubro de 2026 a conta era esta: quase toda arma com curva de
 * dano diferente da do jogo (a AK4D com 28 de dano a queima-roupa, quando o
 * jogo dá 35,22), recarga tática no lugar da vazia, pente contando a bala da
 * câmara (PP-19 com 53), custos de peça de uma temporada atrás (a 1P86 LPVO
 * a 25 pontos, quando custa 20) e peças faltando em arma que as aceita.
 *
 * O BF6-Weapon-Analyzer (`numeros_de_simulacao` em
 * `data/sources/registry.json`) lê os arquivos do jogo com o Frosty e declara,
 * em `data/provenance/live-baseline.json`, de que versão é a leitura. Ele
 * enumera, arma por arma, cada slot inteiro com o custo de cada peça naquela
 * arma — e é por isso que a ausência de uma peça na lista dele vale como
 * negativa, o mesmo princípio de `import-analyzer-compat.ts`.
 *
 * ## O que esta rotina faz
 *
 * Compara o Analyzer com o cadastro **antes** de qualquer correção
 * (`WEAPONS_SEM_SINCRONIA`, `ATTACHMENTS_SEM_SINCRONIA`) e grava só a
 * diferença em `src/data/analyzer-sync.json`, que `weapons.ts` e
 * `attachments.ts` aplicam na hora de montar o arsenal (`analyzer-sync.ts`).
 * Nada de código é reescrito: rodar de novo recalcula a mesma diferença, e o
 * JSON só muda quando o Analyzer ou o cadastro mudam.
 *
 * - **Arma:** curva de dano, projéteis por disparo, cadência, velocidade,
 *   pente, recargas, multiplicador na cabeça e modos de tiro. As barras, o
 *   recuo e os tempos de mira e de saque ficam de fora: são a escala deste
 *   site, não números crus do jogo.
 * - **Custo de peça:** o que o jogo cobra naquela arma. Quando a mesma peça
 *   custa diferente numa arma só, ela se divide — nasce uma variante
 *   `<peça>-<arma>` com o preço dela, como o cadastro já fazia à mão
 *   (`sight-iron-sights-interdictor`, `underbarrel-slim-angled-rspr`).
 * - **Compatibilidade:** a lista exata de armas que o Analyzer enumera, slot a
 *   slot — mira, boca, empunhadura, laser e lanterna, ergonomia, acessório de
 *   mira, munição, carregador e cano.
 *
 * ## O que ela não faz
 *
 * **Não apaga peça.** Peça do site que o Analyzer não conhece fica como está e
 * entra no relatório — ela pode ser nome que o casamento não alcançou, e
 * sumir com ela do montador seria pior do que deixá-la sem confirmação.
 *
 * **Não adivinha cano.** O site guarda o cano pelo nome físico (`600mm DMR`) e
 * o Analyzer pelo papel (`heavy_ext`). Onde o conjunto do site e o do jogo não
 * fecham sem escolher qual peça física é qual papel, nada muda e a arma vai
 * para revisão no relatório. Ver `sincronizarCanos`.
 *
 * **Não segue Analyzer atrasado.** Se a versão que ele declara ter lido é
 * anterior à mais recente de `data/versions`, o arquivo fica como está: um
 * patch aplicado hoje pelo `catalog:aplicar-no-site` não pode ser desfeito pelo
 * número de ontem. `--force` passa por cima.
 *
 * ## Saída
 *
 * - `src/data/analyzer-sync.json` — o que o site aplica, com o commit do
 *   Analyzer e, em cada número, o valor que o cadastro mostrava (`antes`) e o
 *   arquivo de onde o novo veio.
 * - `data/validation/analyzer-sync-report.json` — tudo o que mudou e tudo o que
 *   não deu para casar, para quem for curar.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEAPONS_SEM_SINCRONIA } from '../../src/data/weapons.ts';
import { ATTACHMENTS_SEM_SINCRONIA } from '../../src/data/attachments.ts';
import { siteIdFor } from '../../src/catalog/adapters/renamed-ids.ts';
import { aplicarCompat } from '../../src/data/analyzer-sync.ts';
import type { ArquivoDeSincronia, CampoSincronizado, Correcao, SincroniaDaArma } from '../../src/data/analyzer-sync.ts';
import type { Attachment, SlotId, Weapon } from '../../src/data/types.ts';
import { chave, chaveDePeca, escadaDoJogo, modosDeTiro } from './novidades.ts';
import { fetchJson } from './lib/http.ts';
import { DATA, ROOT, compareVersions, isGameVersion, listVersions, log } from './lib/io.ts';
import { fonteAtiva } from './lib/sources.ts';

export const ARQUIVO = join(ROOT, 'src', 'data', 'analyzer-sync.json');
export const RELATORIO = join(DATA, 'validation', 'analyzer-sync-report.json');

/** Os arquivos do Analyzer que esta rotina lê, todos em `data/`. */
const ARQUIVOS_DO_ANALYZER = [
  'weapons.json',
  'attachments.json',
  'ammo.json',
  'hit_zones.json',
  'provenance/live-baseline.json',
] as const;

/* ========================================================================== *
 * O formato do Analyzer, só com o que se usa aqui
 * ========================================================================== */

export interface ArmaDoAnalyzer {
  id: string;
  name: string;
  cls: string;
  rpm: number;
  mag: number;
  tacRld: number | null;
  emptyRld: number | null;
  bulletVel: number;
  pellets?: number;
  fireMode?: string;
  availableFireModes?: string[];
  dmg?: { r: number; d: number }[];
}

export interface PecaDoAnalyzer {
  id: string;
  name: string;
  pts: number;
  velMult?: number;
  /** O jogo renomeia ou reprecifica a peça em algumas armas (`dp_brake` é o Multi-Port Brake da ELR-40). */
  weaponOverrides?: Record<string, { name?: string; pts?: number }>;
}

export interface SlotsDaArma {
  sight?: string[];
  muzzle?: string[];
  barrel?: string[];
  barrelDef?: string;
  grip?: string[];
  laser?: string[];
  light?: string[];
  /** Custo da mira naquela arma, quando difere do geral (`{ iron: 15 }` nos rifles de precisão). */
  sightPoints?: Record<string, number>;
}

export interface CarregadorDoAnalyzer {
  name: string;
  pts: number;
  mag: number;
}

export interface DadosDoAnalyzer {
  armas: ArmaDoAnalyzer[];
  pecas: {
    SIGHTS: PecaDoAnalyzer[];
    MUZZLES: PecaDoAnalyzer[];
    BARRELS: PecaDoAnalyzer[];
    GRIPS: PecaDoAnalyzer[];
    LASERS: PecaDoAnalyzer[];
    LIGHTS: PecaDoAnalyzer[];
    ERGOS: PecaDoAnalyzer[];
    ACCESSORIES: PecaDoAnalyzer[];
    WEAPON_ATTS: Record<string, SlotsDaArma>;
    WEAPON_ERGO: Record<string, { avail?: string[] }>;
    WEAPON_ACCESSORY: Record<string, { avail?: string[] }>;
    WEAPON_MAG: Record<string, { def: string; mags: Record<string, CarregadorDoAnalyzer> }>;
  };
  municao: {
    AMMO: { id: string; name: string }[];
    WEAPON_AMMO: Record<string, { def: string; ammo: Record<string, number> }>;
  };
  zonas: { weapons: Record<string, { headshot?: number }> };
}

/* ========================================================================== *
 * Casar as armas
 * ========================================================================== */

/**
 * Arma do site → arma do Analyzer.
 *
 * Primeiro pela tabela de renomeações que o catálogo já mantém
 * (`renamed-ids.ts`: `18-5ks-k` é o `ks18k` de lá), depois pelo id e pelo nome
 * reduzidos a letra e número — `sor-556-mk2` e `SOR-556 Mk2` dão no mesmo
 * `sor556mk2`. Arma de um lado sem par do outro vai para o relatório; hoje são
 * só as cinco de corpo a corpo, que o Analyzer não modela.
 */
export function casarArmas(
  site: Pick<Weapon, 'id' | 'name'>[],
  analyzer: Pick<ArmaDoAnalyzer, 'id' | 'name'>[],
): { pares: Map<string, string>; siteSemPar: string[]; analyzerSemPar: string[] } {
  const ids = site.map((w) => w.id);
  const pares = new Map<string, string>();
  const usados = new Set<string>();
  for (const fora of analyzer) {
    const porId = siteIdFor(fora.id, ids);
    const alvo = new Set([chave(fora.id), chave(fora.name)]);
    const id =
      // `siteIdFor` devolve a renomeação mesmo quando o site não tem a arma.
      (porId && ids.includes(porId) && !usados.has(porId) ? porId : null) ??
      site.find((w) => !usados.has(w.id) && (alvo.has(chave(w.id)) || alvo.has(chave(w.name))))?.id ??
      null;
    if (!id) continue;
    pares.set(id, fora.id);
    usados.add(id);
  }
  return {
    pares,
    siteSemPar: ids.filter((id) => !pares.has(id)),
    analyzerSemPar: analyzer.map((a) => a.id).filter((id) => ![...pares.values()].includes(id)),
  };
}

/* ========================================================================== *
 * Os números da arma
 * ========================================================================== */

const arredondar = (valor: number, casas: number) => Number(valor.toFixed(casas));

/**
 * A curva do jogo como escada do site, com as casas que o jogo usa.
 *
 * A conversão é a de `escadaDoJogo` (`novidades.ts`), a mesma do cadastro à
 * mão: rampa que sobe vira degrau onde ela chega, rampa que desce vira degrau
 * onde ela começa, salto vertical vira degrau naquela distância, e o primeiro
 * degrau vale desde 0 m mesmo quando a curva do Analyzer começa adiante (a
 * M2010 começa em 54 m). Depois do último ponto, o último valor segue
 * constante — é o caso da M250, cuja curva para em 15 m.
 */
export function curvaDoJogo(pontos: { r: number; d: number }[]): [number, number][] {
  return escadaDoJogo(pontos).map(([dano, distancia]) => [arredondar(dano, 2), arredondar(distancia, 2)]);
}

/**
 * O pente sem a bala na câmara.
 *
 * `weapons.json#mag` conta a da câmara (a AK4D tem 21 lá). O carregador de
 * fábrica em `WEAPON_MAG` dá a capacidade limpa — e acerta onde a conta de
 * menos um erraria: o revólver não tem câmara (M44, 6), e a DB-12 tem dois
 * tubos de sete (14).
 */
export function penteDeFabrica(dados: DadosDoAnalyzer, idNoAnalyzer: string): number | null {
  const pentes = dados.pecas.WEAPON_MAG[idNoAnalyzer];
  const fabrica = pentes?.mags[pentes.def];
  return fabrica?.mag ?? null;
}

export interface Divergencia {
  arma: string;
  campo: CampoSincronizado;
  antes: unknown;
  depois: unknown;
}

const valorDoCadastro = (arma: Weapon, campo: CampoSincronizado): unknown =>
  campo === 'damage' ? arma.damage.map((d) => [d.damage, d.distance]) : arma[campo];

/**
 * O que os arquivos do jogo corrigem numa arma.
 *
 * Escopeta de tubo não tem recarga com a arma vazia no Analyzer
 * (`emptyRld: null`): lá a recarga tática é **um cartucho** com os tempos de
 * início e fim, e a do site é outra medida. Comparar as duas trocaria a
 * unidade sem trocar o nome, então a recarga dessas fica com o cadastro e a
 * arma entra no relatório.
 */
export function corrigirArma(
  arma: Weapon,
  fora: ArmaDoAnalyzer,
  dados: DadosDoAnalyzer,
): { campos: SincroniaDaArma['campos']; divergencias: Divergencia[]; recargaDeTubo: boolean } {
  const novos: Partial<Record<CampoSincronizado, { valor: unknown; fonte: string }>> = {};

  if (fora.dmg?.length) novos.damage = { valor: curvaDoJogo(fora.dmg), fonte: 'data/weapons.json#dmg' };
  if (fora.pellets && fora.pellets > 1) novos.pellets = { valor: fora.pellets, fonte: 'data/weapons.json#pellets' };
  if (fora.rpm) novos.rpm = { valor: Math.round(fora.rpm), fonte: 'data/weapons.json#rpm' };
  if (fora.bulletVel) novos.velocity = { valor: Math.round(fora.bulletVel), fonte: 'data/weapons.json#bulletVel' };

  const pente = penteDeFabrica(dados, fora.id);
  if (pente) novos.magazine = { valor: pente, fonte: 'data/attachments.json#WEAPON_MAG.def' };

  const recargaDeTubo = fora.emptyRld == null;
  if (!recargaDeTubo && fora.tacRld) {
    novos.reload = { valor: arredondar(fora.tacRld, 3), fonte: 'data/weapons.json#tacRld' };
    novos.emptyReload = { valor: arredondar(fora.emptyRld!, 3), fonte: 'data/weapons.json#emptyRld' };
  }

  const cabeca = dados.zonas.weapons[fora.id]?.headshot;
  if (cabeca) novos.headshot = { valor: arredondar(cabeca, 3), fonte: 'data/hit_zones.json#headshot' };

  const modos = modosDeTiro(fora);
  // A ordem dos modos não é informação; só o conjunto.
  if (modos.length && !mesmoConjunto(modos, arma.fireModes)) {
    novos.fireModes = { valor: modos, fonte: 'data/weapons.json#availableFireModes' };
  }

  const campos: SincroniaDaArma['campos'] = {};
  const divergencias: Divergencia[] = [];
  for (const [campo, novo] of Object.entries(novos) as [CampoSincronizado, { valor: unknown; fonte: string }][]) {
    const antes = valorDoCadastro(arma, campo);
    if (JSON.stringify(antes) === JSON.stringify(novo.valor)) continue;
    (campos as Record<string, Correcao<unknown>>)[campo] = { valor: novo.valor, antes, fonte: novo.fonte };
    divergencias.push({ arma: arma.id, campo, antes, depois: novo.valor });
  }
  return { campos, divergencias, recargaDeTubo };
}

const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/* ========================================================================== *
 * Casar as peças
 * ========================================================================== */

/**
 * A chave de nome de peça, igual dos dois lados.
 *
 * Sobre `chaveDePeca` (`novidades.ts`, que já iguala "3.50x" e "3.5x"), três
 * diferenças de escrita entre o site e o Analyzer: o site chama de "Laser/Light
 * Combo" o que lá é "Combo"; o Analyzer põe a faixa de ampliação no nome da
 * luneta variável ("1P86 LPVO 1.5-4.5x", "SM Rifle Variable 2-8x"); e o site
 * escreve "Canted Vertical Grip" onde lá é "Canted Vertical". Parêntese some
 * com o resto da pontuação: "Hybrid Suppressor (L)" é o "Hybrid Suppressor L".
 */
export function chaveDeNome(nome: string): string {
  const limpo = String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/laser\s*\/?\s*light\s+combo/g, 'combo')
    .replace(/\s+\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s*x\s*$/, '')
    .replace(/\s+grip\s*$/, '')
    .trim();
  return chaveDePeca(limpo);
}

/**
 * Peça do site cujo nome não diz qual é a do Analyzer.
 *
 * Fica numa tabela, e não numa regra de nome, porque cada linha é uma decisão:
 * a munição do site usa o nome da tela ("FMJ", "Tungsten Core") e o Analyzer o
 * do arquivo (`standard`, `penetration`); a UMG-40 tem duas alças próprias que
 * no jogo ocupam o papel da alça de ferro.
 */
export const APELIDOS: Record<string, string[]> = {
  'sight-aperture-sights': ['iron'],
  'sight-cqb-sights': ['iron'],
  'opticAccessory-canted-iron-sight': ['canted_irons'],
  'opticAccessory-canted-iron-sights': ['canted_irons'],
  'ammo-fmj': ['standard'],
  'ammo-tungsten-core': ['penetration'],
  'ammo-polymer-case': ['lightweight'],
  'ammo-polymer-links': ['lightweight'],
  'ammo-match-grade': ['long_range'],
  'ammo-synthetic-tip': ['synthetic'],
  'ammo-tungsten-match': ['range_pen'],
  'ammo-subsonic-hp': ['subsonic_hp'],
  'ammo-buckshot': ['buckshot'],
};

/**
 * Peças do site que o Analyzer junta numa só.
 *
 * `secondary_optic` é "Canted Reflex, Piggyback Reflex, G43 Magnifier ou
 * Adjustable Magnification" — mesmo custo, nenhum efeito modelado, uma linha
 * só. A lista dele diz **se** a arma aceita mira secundária, não **qual**.
 * Então o grupo só tira: arma sem `secondary_optic` perde as seis; arma com
 * ele fica com as que o cadastro já dava, e nenhuma é acrescentada.
 */
export const GRUPOS: Record<string, string[]> = {
  secondary_optic: [
    'opticAccessory-canted-reflex',
    'opticAccessory-piggyback-reflex',
    'optic-accessory-magnifier',
    'opticAccessory-adjustable-magnification-2-00x',
    'opticAccessory-adjustable-magnification-3-00x',
    'opticAccessory-adjustable-magnification-4-00x',
  ],
};

/**
 * O que a curadoria sabe e os arquivos do jogo não mostram.
 *
 * O Gatilho continua na EF88 e na BROD 3 dentro do jogo, mas o estúdio o
 * desligou nas duas por comunicado em agosto de 2026, sem linha em changelog
 * (ver o teste "não oferece o Gatilho onde o estúdio o desligou" em
 * `stats.test.ts`). Arquivo de jogo não registra decisão de servidor. A
 * sincronização nunca acrescenta estes pares — nem como variante —, e cada
 * vez que o Analyzer os pede, o relatório diz (`travadas`).
 */
export const TRAVAS_DA_CURADORIA: Record<string, { armas: string[]; motivo: string }> = {
  'ergonomics-match-trigger': {
    armas: ['ef88', 'brod-3'],
    motivo: 'desligado pelo estúdio por comunicado em agosto de 2026; o arquivo do jogo ainda o lista',
  },
};

/** A arma de que a peça é variante — `sight-iron-sights-interdictor` é a da Interdictor —, ou nulo. */
export function varianteDe(peca: Pick<Attachment, 'id' | 'compat'>, idsDeArma: string[]): string | null {
  const lista = peca.compat.weapons ?? [];
  const candidatas = idsDeArma
    .filter((w) => peca.id.endsWith(`-${w}`) && lista.length <= 1 && (lista.length === 0 || lista[0] === w))
    .sort((a, b) => b.length - a.length);
  return candidatas[0] ?? null;
}

/** A compatibilidade da peça com a arma, sem olhar se a arma tem o slot — isso é a tela que decide. */
export function cabeNaLista(peca: Pick<Attachment, 'compat'>, arma: Pick<Weapon, 'id' | 'category' | 'archetype'>): boolean {
  const { weapons, except, categories, archetypes, extraWeapons } = peca.compat;
  if (except?.includes(arma.id)) return false;
  if (extraWeapons?.includes(arma.id)) return true;
  if (weapons) return weapons.includes(arma.id);
  if (!categories && !archetypes) return true;
  return Boolean(categories?.includes(arma.category) || archetypes?.includes(arma.archetype));
}

/** Uma peça que o Analyzer lista numa arma, com o nome e o custo que ela tem ali. */
export interface ItemNaArma {
  id: string;
  nome: string;
  pts: number;
}

/** A moda; no empate, o valor preferido, se estiver entre os empatados, senão o menor. */
export function moda(valores: number[], preferido?: number): number {
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  const maior = Math.max(...contagem.values());
  const empatados = [...contagem].filter(([, n]) => n === maior).map(([v]) => v);
  if (preferido !== undefined && empatados.includes(preferido)) return preferido;
  return Math.min(...empatados);
}

/* ========================================================================== *
 * O resultado em construção
 * ========================================================================== */

interface Atribuicao {
  arma: string;
  pts: number;
  item: string;
}

export interface Relatorio {
  fonte: ArquivoDeSincronia['fonte'];
  /**
   * O último commit do Analyzer que esta rotina leu, aplicado ou não.
   *
   * É o que `bf6-update-check.yml` compara com o `main` de lá. Quando a trava
   * do dataset atrasado segura a gravação, `fonte` (o que o site aplica) fica
   * no commit anterior e só esta linha anda — sem ela, o check dispararia o
   * processamento todo dia até o Analyzer alcançar o patch.
   */
  ultimaLeitura?: (NonNullable<ArquivoDeSincronia['fonte']> & { bloqueada?: string }) | null;
  resumo: Record<string, number>;
  armas: Divergencia[];
  armasSemPar: { site: string[]; analyzer: string[] };
  recargaDeTubo: string[];
  custos: { peca: string; antes: number; depois: number; armas: string[] }[];
  compat: Record<string, { adicionadas: { peca: string; arma: string }[]; removidas: { peca: string; arma: string }[] }>;
  variantes: { id: string; de: string; arma: string; custo: number; item: string }[];
  pecasDoAnalyzerSemPar: { slot: string; item: string; nome: string; armas: string[] }[];
  pecasDoSiteSemPar: { id: string; slot: SlotId; originalName: string }[];
  /** Peça que, com as correções, não sobra em arma nenhuma do jogo — fica no cadastro, sem aparecer no montador. */
  pecasSemArma: { id: string; slot: SlotId; originalName: string }[];
  /** O que o Analyzer pedia e a curadoria segura (`TRAVAS_DA_CURADORIA`). */
  travadas: { peca: string; arma: string; motivo: string }[];
  /** Arma cuja munição de série não é a regra de `defaultAmmo`, com a peça que a faz. */
  municaoDeSerie: { arma: string; item: string; peca: string | null; nota?: string }[];
  grupos: { grupo: string; arma: string; nota: string }[];
  slotsQueAArmaNaoTem: { arma: string; slot: SlotId; itens: string[] }[];
  carregadores: {
    ambiguos: { arma: string; carregador: string; pecas: string[] }[];
    criados: { id: string; arma: string; carregador: string }[];
  };
  canos: {
    removidos: { peca: string; arma: string; papelNoSite: string }[];
    criados: { id: string; arma: string; papel: string }[];
    revisar: { arma: string; motivo: string; papeisDoJogo: string[]; noSite: { peca: string; papel: string }[] }[];
    duplicados: { arma: string; papel: string; pecas: string[] }[];
    custoPorPapel: { papel: string; site: number | null; jogo: number }[];
  };
}

/*
  Os campos são declarados e atribuídos um a um, pela mesma razão de
  `FetchFailed` em `lib/http.ts`: o Node em modo strip-only não gera a
  atribuição implícita de `constructor(readonly x)`.
*/
class Construcao {
  pecas: ArquivoDeSincronia['pecas'] = {};
  pecasNovas: ArquivoDeSincronia['pecasNovas'] = [];
  /** A peça do site que ficou com cada peça do Analyzer em cada arma: `slot:arma:item` → id. */
  escolhas = new Map<string, string>();
  relatorio: Relatorio;
  armas: Weapon[];
  pecasDoSite: Attachment[];
  pares: Map<string, string>;
  private porId: Map<string, Attachment>;

  constructor(armas: Weapon[], pecasDoSite: Attachment[], pares: Map<string, string>) {
    this.armas = armas;
    this.pecasDoSite = pecasDoSite;
    this.pares = pares;
    this.porId = new Map(pecasDoSite.map((p) => [p.id, p]));
    this.relatorio = {
      fonte: null,
      ultimaLeitura: null,
      resumo: {},
      armas: [],
      armasSemPar: { site: [], analyzer: [] },
      recargaDeTubo: [],
      custos: [],
      compat: {},
      variantes: [],
      pecasDoAnalyzerSemPar: [],
      pecasDoSiteSemPar: [],
      pecasSemArma: [],
      travadas: [],
      municaoDeSerie: [],
      grupos: [],
      slotsQueAArmaNaoTem: [],
      carregadores: { ambiguos: [], criados: [] },
      canos: { removidos: [], criados: [], revisar: [], duplicados: [], custoPorPapel: [] },
    };
  }

  arma(id: string): Weapon {
    return this.armas.find((w) => w.id === id)!;
  }

  peca(id: string): Attachment | undefined {
    return this.porId.get(id) ?? this.pecasNovas.find((p) => p.id === id);
  }

  escolher(slot: string, arma: string, item: string, peca: string) {
    const chave = `${slot}:${arma}:${item}`;
    if (!this.escolhas.has(chave)) this.escolhas.set(chave, peca);
  }

  /** A trava da curadoria que segura este par, se houver. */
  private travada(peca: string, arma: string): string | null {
    const base = peca.endsWith(`-${arma}`) ? peca.slice(0, -(arma.length + 1)) : peca;
    const trava = TRAVAS_DA_CURADORIA[base];
    if (!trava?.armas.includes(arma)) return null;
    this.relatorio.travadas.push({ peca: base, arma, motivo: trava.motivo });
    return trava.motivo;
  }

  existe(id: string): boolean {
    return this.porId.has(id) || this.pecasNovas.some((p) => p.id === id);
  }

  private compatDe(peca: string) {
    const entrada = (this.pecas[peca] ??= {});
    return (entrada.compat ??= { fonte: 'data/attachments.json#WEAPON_ATTS' });
  }

  private compatDoRelatorio(slot: string) {
    return (this.relatorio.compat[slot] ??= { adicionadas: [], removidas: [] });
  }

  adicionar(peca: Attachment, arma: string, fonte: string, slot: string) {
    if (this.travada(peca.id, arma)) return;
    const compat = this.compatDe(peca.id);
    compat.fonte = fonte;
    compat.adicionar = [...new Set([...(compat.adicionar ?? []), arma])].sort();
    this.compatDoRelatorio(slot).adicionadas.push({ peca: peca.id, arma });
  }

  remover(peca: Attachment, arma: string, fonte: string, slot: string) {
    const compat = this.compatDe(peca.id);
    compat.fonte = fonte;
    // Tirar o que esta mesma rodada acrescentou é desfazer, não remover.
    if (compat.adicionar?.includes(arma)) {
      compat.adicionar = compat.adicionar.filter((w) => w !== arma);
      const relatorio = this.compatDoRelatorio(slot);
      relatorio.adicionadas = relatorio.adicionadas.filter((a) => !(a.peca === peca.id && a.arma === arma));
      return;
    }
    compat.remover = [...new Set([...(compat.remover ?? []), arma])].sort();
    this.compatDoRelatorio(slot).removidas.push({ peca: peca.id, arma });
  }

  custo(peca: Attachment, valor: number, fonte: string, armas: string[]) {
    if (peca.cost === valor) return;
    (this.pecas[peca.id] ??= {}).custo = { valor, antes: peca.cost, fonte };
    this.relatorio.custos.push({ peca: peca.id, antes: peca.cost, depois: valor, armas: [...armas].sort() });
  }

  /** A variante da peça numa arma, com o custo dela ali — clonada da peça geral. */
  variante(base: Attachment, arma: string, custo: number, item: string, fonte: string, extra: Partial<Attachment> = {}): Attachment | null {
    const id = extra.id ?? `${base.id}-${arma}`;
    if (this.travada(base.id, arma)) return null;
    const nome = base.namePerWeapon?.[arma];
    const nova: Attachment = {
      ...structuredClone(base),
      ...extra,
      id,
      cost: custo,
      compat: { weapons: [arma] },
    };
    delete nova.namePerWeapon;
    delete nova.supersededBy;
    if (nome) nova.name = nome;
    this.pecasNovas.push({ ...nova, origem: { fonte, item, clonadaDe: base.id } } as Attachment & { origem: unknown });
    this.relatorio.variantes.push({ id, de: base.id, arma, custo, item });
    return nova;
  }
}

/* ========================================================================== *
 * Os slots que o Analyzer enumera peça por peça
 * ========================================================================== */

interface ConfigDeSlot {
  /** Nome do slot no relatório. */
  nome: string;
  /** Slots do site em que as peças moram. Laser e lanterna moram nos dois trilhos. */
  slots: SlotId[];
  fonte: string;
  /** As peças do Analyzer naquela arma; `null` quando o slot não é enumerado para ela. */
  itens: (idNoAnalyzer: string) => ItemNaArma[] | null;
  /** Todas as peças que o Analyzer conhece neste slot, para saber se uma peça do site tem par. */
  conhecidas: { id: string; nome: string }[];
}

function itensDaCategoria(
  categoria: PecaDoAnalyzer[],
  lista: string[] | undefined,
  idNoAnalyzer: string,
  custoNaArma?: Record<string, number>,
): ItemNaArma[] | null {
  if (!lista) return null;
  const porId = new Map(categoria.map((p) => [p.id, p]));
  // `none` é o slot vazio, que o Analyzer lista em algumas armas; não é peça.
  return lista.filter((id) => id !== 'none').flatMap((id) => {
    const peca = porId.get(id);
    if (!peca) return [{ id, nome: id, pts: NaN }];
    const ajuste = peca.weaponOverrides?.[idNoAnalyzer];
    return [{ id, nome: ajuste?.name ?? peca.name, pts: custoNaArma?.[id] ?? ajuste?.pts ?? peca.pts }];
  });
}

/** Os nomes que uma peça do Analyzer tem em qualquer arma — o geral e os de `weaponOverrides`. */
const nomesDe = (pecas: PecaDoAnalyzer[]) =>
  pecas.flatMap((p) => [
    { id: p.id, nome: p.name },
    ...Object.values(p.weaponOverrides ?? {})
      .filter((o) => o.name)
      .map((o) => ({ id: p.id, nome: o.name! })),
  ]);

export function configsDeSlot(dados: DadosDoAnalyzer): ConfigDeSlot[] {
  const p = dados.pecas;
  const doSlot = (w: string) => p.WEAPON_ATTS[w];
  const municoes = dados.municao.AMMO;
  return [
    {
      nome: 'sight',
      slots: ['sight'],
      fonte: 'data/attachments.json#WEAPON_ATTS.sight',
      itens: (w) => itensDaCategoria(p.SIGHTS, doSlot(w)?.sight, w, doSlot(w)?.sightPoints),
      conhecidas: nomesDe(p.SIGHTS),
    },
    {
      nome: 'muzzle',
      slots: ['muzzle'],
      fonte: 'data/attachments.json#WEAPON_ATTS.muzzle',
      itens: (w) => itensDaCategoria(p.MUZZLES, doSlot(w)?.muzzle, w),
      conhecidas: nomesDe(p.MUZZLES),
    },
    {
      nome: 'underbarrel',
      slots: ['underbarrel'],
      fonte: 'data/attachments.json#WEAPON_ATTS.grip',
      itens: (w) => itensDaCategoria(p.GRIPS, doSlot(w)?.grip, w),
      conhecidas: nomesDe(p.GRIPS),
    },
    {
      nome: 'rail',
      slots: ['leftRail', 'rightRail'],
      fonte: 'data/attachments.json#WEAPON_ATTS.laser+light',
      itens: (w) => {
        const slots = doSlot(w);
        if (!slots || (!slots.laser && !slots.light)) return null;
        return [
          ...(itensDaCategoria(p.LASERS, slots.laser ?? [], w) ?? []),
          ...(itensDaCategoria(p.LIGHTS, slots.light ?? [], w) ?? []),
        ];
      },
      conhecidas: [...nomesDe(p.LASERS), ...nomesDe(p.LIGHTS)],
    },
    {
      /*
        Arma sem chave em `WEAPON_ERGO` não tem ergonomia nenhuma no jogo — a
        fonte enumera o slot arma por arma, e a ausência ali é evidência
        contrária (ver `import-analyzer-compat.ts`). O mesmo vale para o
        acessório de mira.
      */
      nome: 'ergonomics',
      slots: ['ergonomics'],
      fonte: 'data/attachments.json#WEAPON_ERGO',
      itens: (w) => itensDaCategoria(p.ERGOS, p.WEAPON_ERGO[w]?.avail ?? [], w),
      conhecidas: nomesDe(p.ERGOS),
    },
    {
      nome: 'opticAccessory',
      slots: ['opticAccessory'],
      fonte: 'data/attachments.json#WEAPON_ACCESSORY',
      itens: (w) => itensDaCategoria(p.ACCESSORIES, p.WEAPON_ACCESSORY[w]?.avail ?? [], w),
      conhecidas: nomesDe(p.ACCESSORIES),
    },
    {
      nome: 'ammo',
      slots: ['ammo'],
      fonte: 'data/ammo.json#WEAPON_AMMO',
      itens: (w) => {
        const daArma = dados.municao.WEAPON_AMMO[w];
        if (!daArma) return null;
        return Object.entries(daArma.ammo).map(([id, pts]) => ({
          id,
          nome: municoes.find((m) => m.id === id)?.name ?? id,
          pts,
        }));
      },
      conhecidas: municoes.map((m) => ({ id: m.id, nome: m.name })),
    },
  ];
}

/** As chaves por que uma peça do site é procurada: o apelido, se houver, ou o nome original. */
function chavesDaPeca(peca: Attachment, idsDeArma: string[]): string[] {
  const arma = varianteDe(peca, idsDeArma);
  const base = arma ? peca.id.slice(0, -(arma.length + 1)) : peca.id;
  const grupo = Object.entries(GRUPOS).find(([, membros]) => membros.includes(base));
  if (grupo) return [`grupo:${grupo[0]}`];
  const apelido = APELIDOS[base];
  if (apelido) return apelido.map((id) => `id:${id}`);
  return [`nome:${chaveDeNome(peca.originalName)}`];
}

/**
 * Um slot inteiro: compatibilidade, custo e variantes.
 *
 * Para cada arma e cada peça que o Analyzer lista nela, a família é o conjunto
 * de peças do site com aquele nome (ou apelido). A peça escolhida é, nesta
 * ordem: a variante daquela arma, se houver; as da família que o cadastro já
 * dá à arma; e, se nenhuma, a geral mais usada, que ganha a arma. Toda peça do
 * site com par no Analyzer perde as armas em que ele não a lista.
 *
 * O custo da peça geral é o que o jogo cobra na maioria das armas que a
 * recebem. A arma em que ela custa outra coisa ganha a variante dela.
 */
export function sincronizarSlot(config: ConfigDeSlot, obra: Construcao): void {
  const idsDeArma = obra.armas.map((w) => w.id);
  const pecas = obra.pecasDoSite.filter((p) => config.slots.includes(p.slot));
  const chaves = new Map(pecas.map((p) => [p.id, chavesDaPeca(p, idsDeArma)]));

  const conhecidas = new Set([
    ...config.conhecidas.map((c) => `id:${c.id}`),
    ...config.conhecidas.map((c) => `nome:${chaveDeNome(c.nome)}`),
    ...Object.keys(GRUPOS).map((g) => `grupo:${g}`),
  ]);
  const comPar = pecas.filter((p) => chaves.get(p.id)!.some((k) => conhecidas.has(k)));
  for (const p of pecas) {
    if (!comPar.includes(p)) obra.relatorio.pecasDoSiteSemPar.push({ id: p.id, slot: p.slot, originalName: p.originalName });
  }

  const atribuicoes = new Map<string, Atribuicao[]>();
  const enumeradas = new Set<string>();
  const semPar = new Map<string, { slot: string; item: string; nome: string; armas: string[] }>();

  for (const [site, fora] of obra.pares) {
    const itens = config.itens(fora);
    if (!itens) continue;
    enumeradas.add(site);
    const arma = obra.arma(site);
    if (itens.length && !config.slots.some((s) => arma.slots.includes(s))) {
      obra.relatorio.slotsQueAArmaNaoTem.push({ arma: site, slot: config.slots[0], itens: itens.map((i) => i.id) });
    }

    for (const item of itens) {
      const grupo = Object.keys(GRUPOS).find((g) => g === item.id);
      const alvo = grupo ? [`grupo:${grupo}`] : [`id:${item.id}`, `nome:${chaveDeNome(item.nome)}`];
      const familia = comPar.filter((p) => {
        const dona = varianteDe(p, idsDeArma);
        return (!dona || dona === site) && chaves.get(p.id)!.some((k) => alvo.includes(k));
      });

      if (!familia.length) {
        const k = `${item.id}:${item.nome}`;
        const registro = semPar.get(k) ?? { slot: config.nome, item: item.id, nome: item.nome, armas: [] };
        registro.armas.push(site);
        semPar.set(k, registro);
        continue;
      }

      const variantes = familia.filter((p) => varianteDe(p, idsDeArma) === site);
      const naArma = familia.filter((p) => cabeNaLista(p, arma));
      let escolhidas = variantes.length ? variantes : naArma;

      if (!escolhidas.length) {
        if (grupo) {
          obra.relatorio.grupos.push({
            grupo,
            arma: site,
            nota: 'o Analyzer dá mira secundária à arma e o cadastro não dá nenhuma das peças do grupo; qual delas é, a fonte não diz',
          });
          continue;
        }
        const principal = [...familia].sort(
          (a, b) => (b.compat.weapons?.length ?? 999) - (a.compat.weapons?.length ?? 999) || a.id.localeCompare(b.id),
        )[0];
        escolhidas = [principal];
      }

      for (const p of escolhidas) {
        const lista = atribuicoes.get(p.id) ?? [];
        lista.push({ arma: site, pts: item.pts, item: item.id });
        atribuicoes.set(p.id, lista);
      }
    }
  }

  obra.relatorio.pecasDoAnalyzerSemPar.push(...semPar.values());

  for (const p of comPar) {
    const daPeca = atribuicoes.get(p.id) ?? [];
    const armasDaPeca = new Set(daPeca.map((a) => a.arma));

    // Removidas: arma enumerada pelo Analyzer em que a peça não está.
    for (const site of enumeradas) {
      if (cabeNaLista(p, obra.arma(site)) && !armasDaPeca.has(site)) obra.remover(p, site, config.fonte, config.nome);
    }
    if (!daPeca.length) continue;

    const dona = varianteDe(p, idsDeArma);
    const custos = daPeca.map((a) => a.pts).filter(Number.isFinite);
    if (!custos.length) continue;
    const geral = dona ? custos[0] : moda(custos, p.cost);
    obra.custo(p, geral, config.fonte, [...armasDaPeca]);

    for (const a of daPeca) {
      const naLista = cabeNaLista(p, obra.arma(a.arma));
      if (dona || a.pts === geral || !Number.isFinite(a.pts)) {
        if (!naLista) obra.adicionar(p, a.arma, config.fonte, config.nome);
        obra.escolher(config.nome, a.arma, a.item, p.id);
        continue;
      }
      // Custa outra coisa nesta arma: a arma sai da geral e ganha a variante.
      if (naLista) obra.remover(p, a.arma, config.fonte, config.nome);
      const variante = obra.existe(`${p.id}-${a.arma}`) ? `${p.id}-${a.arma}` : obra.variante(p, a.arma, a.pts, a.item, config.fonte)?.id;
      if (variante) obra.escolher(config.nome, a.arma, a.item, variante);
    }
  }
}

/* ========================================================================== *
 * Carregadores
 * ========================================================================== */

export type TipoDeCarregador = 'rapido' | 'agil' | 'comum';

/** O tipo pelo id do Analyzer: `30_fast`, `100_agil`, `30_rnd`. */
export function tipoNoAnalyzer(id: string): TipoDeCarregador {
  if (/_fast$/.test(id)) return 'rapido';
  if (/_agil$/.test(id)) return 'agil';
  return 'comum';
}

/**
 * O tipo pelo nome da peça do site: "30RND Fast Mag", "100 Agil"; o resto —
 * pente, tambor, fita, tubo, speedloader — é comum. O moon clip é o carregador
 * rápido do revólver: na M357 Trait o Analyzer tem `8_rnd` por 5 e `8_fast`
 * por 10, e o site, o speedloader por 5 e o moon clip por 10.
 */
export function tipoNoSite(nome: string): TipoDeCarregador {
  if (/\bfast\b|moon\s*clip/i.test(nome)) return 'rapido';
  if (/\bagil\b/i.test(nome)) return 'agil';
  return 'comum';
}

/** A capacidade da peça do site: `magazineSize`, ou o número do nome ("7 Shell Tube"). */
export function capacidadeNoSite(peca: Pick<Attachment, 'magazineSize' | 'originalName'>): number | null {
  if (peca.magazineSize) return peca.magazineSize;
  if (/single\s*shot/i.test(peca.originalName)) return 1;
  const numero = /(\d+)/.exec(peca.originalName);
  return numero ? Number(numero[1]) : null;
}

/**
 * As capacidades que um carregador do Analyzer pode ter no nome do site.
 *
 * Quase sempre uma só. A DB-12 é a exceção: o carregador `7_rnd` dela tem 14
 * tiros (dois tubos de sete), e o site o chama "7 Shell Dual Tubes".
 */
export function capacidadesNoAnalyzer(id: string, carregador: CarregadorDoAnalyzer): number[] {
  const doId = Number.parseInt(id, 10);
  return [...new Set([carregador.mag, ...(Number.isFinite(doId) ? [doId] : [])])];
}

/**
 * A peça do site para um carregador do Analyzer numa arma.
 *
 * O Analyzer só distingue o carregador comum, o rápido e o ágil; o site
 * separa o comum em pente, tambor, caixa de fita, bolsa, tubo. O casamento é
 * por capacidade e tipo, e quem desempata é o cadastro: se ele já dá à arma
 * uma peça daquela capacidade, é ela — o site sabe que o de cem da M240L é
 * caixa de fita, e o Analyzer não. Duas peças candidatas com o mesmo custo são
 * ambiguidade de verdade e ficam as duas, no relatório.
 */
export function casarCarregador(
  id: string,
  carregador: CarregadorDoAnalyzer,
  arma: Pick<Weapon, 'id' | 'category' | 'archetype'>,
  pecas: Attachment[],
  idsDeArma: string[],
): { escolhidas: Attachment[]; acrescentar: boolean; ambiguo: boolean } {
  const tipo = tipoNoAnalyzer(id);
  const capacidades = capacidadesNoAnalyzer(id, carregador);
  const familia = pecas.filter((p) => {
    const dona = varianteDe(p, idsDeArma);
    const capacidade = capacidadeNoSite(p);
    return (!dona || dona === arma.id) && tipoNoSite(p.originalName) === tipo && capacidade !== null && capacidades.includes(capacidade);
  });
  if (!familia.length) return { escolhidas: [], acrescentar: false, ambiguo: false };

  const preferirCusto = (lista: Attachment[]) => {
    const mesmoCusto = lista.filter((p) => p.cost === carregador.pts);
    return mesmoCusto.length ? mesmoCusto : lista;
  };

  const variantes = familia.filter((p) => varianteDe(p, idsDeArma) === arma.id);
  const naArma = familia.filter((p) => cabeNaLista(p, arma));
  for (const lista of [variantes, naArma]) {
    if (!lista.length) continue;
    const melhores = preferirCusto(lista);
    if (melhores.length === 1) return { escolhidas: melhores, acrescentar: false, ambiguo: false };
    return { escolhidas: melhores, acrescentar: false, ambiguo: true };
  }

  // Nenhuma na arma: a de mesmo custo, de nome genérico ("Magazine", "Fast Mag"), mais usada.
  const generico = (p: Attachment) => /magazine|fast mag/i.test(p.originalName);
  const principal = [...preferirCusto(familia)].sort(
    (a, b) =>
      Number(generico(b)) - Number(generico(a)) ||
      (b.compat.weapons?.length ?? 0) - (a.compat.weapons?.length ?? 0) ||
      a.id.localeCompare(b.id),
  )[0];
  return { escolhidas: [principal], acrescentar: true, ambiguo: false };
}

function sincronizarCarregadores(obra: Construcao, dados: DadosDoAnalyzer): void {
  const fonte = 'data/attachments.json#WEAPON_MAG';
  const idsDeArma = obra.armas.map((w) => w.id);
  const pecas = obra.pecasDoSite.filter((p) => p.slot === 'magazine');
  const atribuicoes = new Map<string, Atribuicao[]>();
  const enumeradas = new Set<string>();
  const ambiguas = new Set<string>();

  for (const [site, fora] of obra.pares) {
    const daArma = dados.pecas.WEAPON_MAG[fora];
    if (!daArma) continue;
    enumeradas.add(site);
    const arma = obra.arma(site);

    for (const [id, carregador] of Object.entries(daArma.mags)) {
      const { escolhidas, ambiguo } = casarCarregador(id, carregador, arma, pecas, idsDeArma);
      if (ambiguo) {
        obra.relatorio.carregadores.ambiguos.push({ arma: site, carregador: `${id} (${carregador.name})`, pecas: escolhidas.map((p) => p.id) });
        for (const p of escolhidas) ambiguas.add(`${p.id}:${site}`);
      }
      if (!escolhidas.length) {
        // Nenhuma peça do site tem essa capacidade e tipo: nasce a variante da arma.
        const criada = criarCarregador(obra, pecas, site, id, carregador, fonte);
        if (criada) obra.relatorio.carregadores.criados.push({ id: criada.id, arma: site, carregador: `${id} (${carregador.name})` });
        continue;
      }
      for (const p of escolhidas) {
        const lista = atribuicoes.get(p.id) ?? [];
        lista.push({ arma: site, pts: carregador.pts, item: id });
        atribuicoes.set(p.id, lista);
      }
    }
  }

  for (const p of pecas) {
    const daPeca = atribuicoes.get(p.id) ?? [];
    const armasDaPeca = new Set(daPeca.map((a) => a.arma));
    for (const site of enumeradas) {
      if (cabeNaLista(p, obra.arma(site)) && !armasDaPeca.has(site)) obra.remover(p, site, fonte, 'magazine');
    }
    if (!daPeca.length) continue;
    const dona = varianteDe(p, idsDeArma);
    // Peça ambígua não ganha preço novo pelo voto de uma arma em que ela pode nem ser a peça certa.
    const votos = daPeca.filter((a) => !ambiguas.has(`${p.id}:${a.arma}`));
    const geral = dona ? daPeca[0].pts : moda((votos.length ? votos : daPeca).map((a) => a.pts), p.cost);
    obra.custo(p, geral, fonte, [...armasDaPeca]);
    for (const a of daPeca) {
      const naLista = cabeNaLista(p, obra.arma(a.arma));
      if (dona || a.pts === geral || ambiguas.has(`${p.id}:${a.arma}`)) {
        if (!naLista) obra.adicionar(p, a.arma, fonte, 'magazine');
        continue;
      }
      if (naLista) obra.remover(p, a.arma, fonte, 'magazine');
      if (!obra.existe(`${p.id}-${a.arma}`)) obra.variante(p, a.arma, a.pts, a.item, fonte);
    }
  }
}

/** O carregador que o site não tem: clonado da peça do mesmo tipo de capacidade mais próxima. */
function criarCarregador(
  obra: Construcao,
  pecas: Attachment[],
  arma: string,
  id: string,
  carregador: CarregadorDoAnalyzer,
  fonte: string,
): Attachment | null {
  const tipo = tipoNoAnalyzer(id);
  const capacidade = carregador.mag;
  const idsDeArma = obra.armas.map((w) => w.id);
  const modelo = [...pecas]
    .filter((p) => tipoNoSite(p.originalName) === tipo && !varianteDe(p, idsDeArma) && p.magazineSize)
    .sort((a, b) => Math.abs(a.magazineSize! - capacidade) - Math.abs(b.magazineSize! - capacidade) || a.id.localeCompare(b.id))[0];
  const rotulo = { rapido: ['Fast Mag', 'Carregador Rápido de'], agil: ['Agil', 'Carregador Ágil de'], comum: ['Magazine', 'Carregador de'] }[tipo];
  const base: Attachment = modelo ?? {
    id: 'magazine',
    name: '',
    originalName: '',
    slot: 'magazine',
    cost: carregador.pts,
    description: '',
    mods: {},
    compat: { weapons: [] },
    provenance: 'curated',
  };
  const semente = { ...base, id: `magazine-${capacidade}rnd-${rotulo[0].toLowerCase().replace(/\s+/g, '-')}` };
  return obra.variante(semente as Attachment, arma, carregador.pts, id, fonte, {
    name: `${rotulo[1]} ${capacidade}`,
    originalName: `${capacidade}RND ${rotulo[0]}`,
    description: tipo === 'comum' ? `Carregador de ${capacidade} tiros.` : base.description,
    magazineSize: capacidade,
    provenance: 'curated',
  });
}

/* ========================================================================== *
 * Canos
 * ========================================================================== */

/** O papel do cano no Analyzer e o nome que a tela do jogo dá a ele. */
export const PAPEL_DO_CANO: Record<string, string> = {
  basic: 'Cano Básico',
  short: 'Cano Curto',
  extended: 'Cano Estendido',
  heavy: 'Cano Pesado',
  heavy_ext: 'Cano Ext. Pesado',
  light: 'Cano Leve',
  cryo: 'Cano Crio',
  ext_light: 'Cano Estendido Leve',
  short_light: 'Cano Curto Leve',
};

/** A mesma tabela de `loadout.ts`, para dizer onde o custo do jogo difere. */
const CUSTO_DO_CANO_NO_SITE: Record<string, number> = {
  'Cano Estendido': 5,
  'Cano Básico': 10,
  'Cano Pesado': 10,
  'Cano Ext. Pesado': 10,
  'Cano Curto': 15,
  'Cano Leve': 20,
  'Cano Crio': 20,
  'Cano Curto Leve': 25,
  'Cano Estendido Leve': 25,
};

/**
 * O nome que o site dá a cada papel do Analyzer naquela arma.
 *
 * O cano que vem montado é sempre o Básico na tela (ver `defaultBarrel`). Nas
 * metralhadoras de fita o Analyzer diz que ele é o `heavy` (`barrelDef`), e
 * a M240L, a L110 e a Z84M do cadastro já o mostram como Básico — o custo é o
 * mesmo, dez. Papel sem nome na tela (os dois supressos da VSSM) volta nulo.
 */
export function papeisNaTela(papeis: string[], padrao: string | undefined): Map<string, string> | null {
  const nomes = new Map<string, string>();
  for (const papel of papeis) {
    const nome = papel === padrao ? 'Cano Básico' : PAPEL_DO_CANO[papel];
    if (!nome || nomes.has(nome)) return null;
    nomes.set(nome, papel);
  }
  return nomes;
}

/**
 * Canos, com a cautela que o nome físico exige.
 *
 * Arma por arma, o conjunto de papéis do site (o nome que cada cano tem nela)
 * contra o do Analyzer:
 *
 * - **bate**: nada a fazer;
 * - **sobra cano no site e não falta papel**: o cano que sobra não corresponde
 *   a papel nenhum do jogo — todo papel já tem o seu —, e sai da arma;
 * - **falta papel e não sobra cano nem há nome repetido**: nasce o cano do
 *   papel (`barrel-<arma>-<papel>`), como os da Mk 24 e da Z84M no cadastro,
 *   sem efeito modelado;
 * - **falta papel e sobra cano, ou há nome repetido**: algum cano do site está
 *   com o papel errado, e qual é qual só a tela do jogo diz. Nada muda; a arma
 *   vai para `canos.revisar`.
 *
 * O custo do cano já sai do papel (`attachmentCost`); aqui só se confere a
 * tabela de `loadout.ts` contra a do jogo.
 */
function sincronizarCanos(obra: Construcao, dados: DadosDoAnalyzer): void {
  const fonte = 'data/attachments.json#WEAPON_ATTS.barrel';
  const canos = obra.pecasDoSite.filter((p) => p.slot === 'barrel');
  const daTabela = new Map(dados.pecas.BARRELS.map((b) => [b.id, b]));

  for (const [site, fora] of obra.pares) {
    const slots = dados.pecas.WEAPON_ATTS[fora];
    if (!slots?.barrel) continue;
    const arma = obra.arma(site);
    const noSite = canos
      .filter((c) => cabeNaLista(c, arma))
      .map((c) => ({ peca: c, papel: c.namePerWeapon?.[site] ?? c.name }));
    const papeis = papeisNaTela(slots.barrel, slots.barrelDef);
    const resumo = noSite.map((c) => ({ peca: c.peca.id, papel: c.papel }));

    if (!papeis) {
      obra.relatorio.canos.revisar.push({
        arma: site,
        motivo: 'o Analyzer usa papel sem nome na tela de seleção (ou dois papéis com o mesmo nome)',
        papeisDoJogo: slots.barrel,
        noSite: resumo,
      });
      continue;
    }

    const padrao = papeis.get('Cano Básico');
    const ptsDoPadrao = padrao ? daTabela.get(padrao)?.pts : undefined;
    if (ptsDoPadrao !== undefined && ptsDoPadrao !== CUSTO_DO_CANO_NO_SITE['Cano Básico']) {
      obra.relatorio.canos.revisar.push({
        arma: site,
        motivo: `o cano de fábrica (${padrao}) custa ${ptsDoPadrao} no jogo, e o Básico custa ${CUSTO_DO_CANO_NO_SITE['Cano Básico']} no site`,
        papeisDoJogo: slots.barrel,
        noSite: resumo,
      });
    }

    const porPapel = new Map<string, Attachment[]>();
    for (const c of noSite) porPapel.set(c.papel, [...(porPapel.get(c.papel) ?? []), c.peca]);
    const sobram = noSite.filter((c) => !papeis.has(c.papel));
    const faltam = [...papeis.keys()].filter((nome) => !porPapel.has(nome));
    const repetidos = [...porPapel].filter(([nome, lista]) => papeis.has(nome) && lista.length > 1);
    for (const [papel, lista] of repetidos) {
      obra.relatorio.canos.duplicados.push({ arma: site, papel, pecas: lista.map((p) => p.id) });
    }

    if (sobram.length && faltam.length) {
      obra.relatorio.canos.revisar.push({
        arma: site,
        motivo: `faltam ${faltam.join(', ')} e sobram ${sobram.map((c) => `${c.peca.originalName} (${c.papel})`).join(', ')} — algum cano está com o papel errado`,
        papeisDoJogo: slots.barrel,
        noSite: resumo,
      });
      continue;
    }
    for (const c of sobram) {
      obra.remover(c.peca, site, fonte, 'barrel');
      obra.relatorio.canos.removidos.push({ peca: c.peca.id, arma: site, papelNoSite: c.papel });
    }
    if (!faltam.length) continue;
    if (repetidos.length) {
      obra.relatorio.canos.revisar.push({
        arma: site,
        motivo: `faltam ${faltam.join(', ')} e há nome repetido (${repetidos.map(([n]) => n).join(', ')}) — um dos repetidos pode ser o papel que falta`,
        papeisDoJogo: slots.barrel,
        noSite: resumo,
      });
      continue;
    }
    for (const nome of faltam) {
      const papel = papeis.get(nome)!;
      // O id segue o dos canos à mão (`barrel-mk-24-basic`): a arma no meio, o papel no fim.
      const id = `barrel-${site}-${papel.replace(/_/g, '-')}`;
      if (obra.existe(id)) continue;
      const doJogo = daTabela.get(papel);
      const custo = CUSTO_DO_CANO_NO_SITE[nome] ?? doJogo?.pts ?? 10;
      const semente: Attachment = {
        id,
        name: nome,
        originalName: doJogo?.name ?? papel,
        slot: 'barrel',
        cost: custo,
        description: nome === 'Cano Básico' ? 'Cano de fábrica da arma.' : `${nome} da arma; o efeito ainda não foi medido.`,
        mods: {},
        compat: { weapons: [] },
        provenance: 'curated',
      };
      obra.variante(semente, site, custo, papel, fonte, { id });
      obra.relatorio.canos.criados.push({ id, arma: site, papel });
    }
  }

  /*
    A tabela de custo por papel é uma só para o jogo todo — o Analyzer guarda
    `pts` no papel, não no par arma-papel —, e a conferência é contra ela.
  */
  for (const cano of dados.pecas.BARRELS) {
    const nome = PAPEL_DO_CANO[cano.id];
    if (!nome) continue;
    obra.relatorio.canos.custoPorPapel.push({ papel: nome, site: CUSTO_DO_CANO_NO_SITE[nome] ?? null, jogo: cano.pts });
  }
}

/* ========================================================================== *
 * Munição de série
 * ========================================================================== */

/**
 * A munição que vem na arma, quando não é a regra de `defaultAmmo`.
 *
 * O site monta encamisada (FMJ) em toda arma de projétil único e chumbo
 * grosso nas escopetas. O Analyzer diz duas exceções: a VSSM sai com a
 * Tungsten Match (`range_pen`), e a GRT-CPS com ponta oca. Sem esta entrada,
 * as duas abririam com uma munição que o jogo não dá a elas.
 *
 * Munição de série não altera número nenhum — os números da arma já foram
 * medidos com ela (ver `defaultAmmo`). Se a peça escolhida tem efeito, a arma
 * ganha a variante dela sem efeito: aplicar o alcance menor da ponta oca sobre
 * uma curva que já é a da ponta oca contaria o efeito duas vezes.
 */
function sincronizarMunicaoDeSerie(obra: Construcao, dados: DadosDoAnalyzer): Record<string, string> {
  const fonte = 'data/ammo.json#WEAPON_AMMO.def';
  const idsDeArma = obra.armas.map((w) => w.id);
  const resultado: Record<string, string> = {};
  for (const [site, fora] of obra.pares) {
    const daArma = dados.municao.WEAPON_AMMO[fora];
    if (!daArma?.def) continue;
    const arma = obra.arma(site);
    const regra = arma.category === 'shotgun' ? 'ammo-buckshot' : 'ammo-fmj';
    const escolhida = obra.escolhas.get(`ammo:${site}:${daArma.def}`);
    if (escolhida === regra) continue;
    if (!escolhida) {
      obra.relatorio.municaoDeSerie.push({ arma: site, item: daArma.def, peca: null, nota: 'o site não tem a peça; vale a regra de defaultAmmo' });
      continue;
    }

    const peca = obra.peca(escolhida)!;
    const temEfeito = (p: Attachment) =>
      Object.keys(p.mods).length > 0 || p.headshotOverride !== undefined || p.pelletsOverride !== undefined;
    let final = escolhida;
    if (temEfeito(peca)) {
      const nova = obra.pecasNovas.find((p) => p.id === escolhida);
      if (nova && varianteDe(nova, idsDeArma) === site) {
        // Variante nascida nesta rodada: ela mesma perde o efeito.
        nova.mods = {};
        delete nova.headshotOverride;
        delete nova.pelletsOverride;
      } else if (varianteDe(peca, idsDeArma) === site) {
        obra.relatorio.municaoDeSerie.push({
          arma: site,
          item: daArma.def,
          peca: escolhida,
          nota: 'a variante do cadastro tem efeito; tirá-lo é curadoria, e a regra de defaultAmmo continua valendo',
        });
        continue;
      } else {
        obra.remover(peca, site, fonte, 'ammo');
        const variante = obra.variante(peca, site, daArma.ammo[daArma.def] ?? peca.cost, daArma.def, fonte, { mods: {} });
        if (!variante) continue;
        const gravada = obra.pecasNovas.find((p) => p.id === variante.id)!;
        delete gravada.headshotOverride;
        delete gravada.pelletsOverride;
        final = variante.id;
      }
    }
    resultado[site] = final;
    obra.relatorio.municaoDeSerie.push({ arma: site, item: daArma.def, peca: final });
  }
  return Object.fromEntries(Object.entries(resultado).sort(([a], [b]) => a.localeCompare(b)));
}

/* ========================================================================== *
 * Tudo junto, sem rede
 * ========================================================================== */

export function sincronizar({
  dados,
  armas,
  pecas,
}: {
  dados: DadosDoAnalyzer;
  armas: Weapon[];
  pecas: Attachment[];
}): { arquivo: Omit<ArquivoDeSincronia, 'fonte' | '_leiaMe'>; relatorio: Relatorio } {
  const { pares, siteSemPar, analyzerSemPar } = casarArmas(armas, dados.armas);
  const obra = new Construcao(armas, pecas, pares);
  obra.relatorio.armasSemPar = { site: siteSemPar, analyzer: analyzerSemPar };

  const armasCorrigidas: ArquivoDeSincronia['armas'] = {};
  for (const [site, fora] of pares) {
    const arma = obra.arma(site);
    const doAnalyzer = dados.armas.find((a) => a.id === fora)!;
    const { campos, divergencias, recargaDeTubo } = corrigirArma(arma, doAnalyzer, dados);
    if (recargaDeTubo) obra.relatorio.recargaDeTubo.push(site);
    if (Object.keys(campos).length) armasCorrigidas[site] = { idNoAnalyzer: fora, campos };
    obra.relatorio.armas.push(...divergencias);
  }

  for (const config of configsDeSlot(dados)) sincronizarSlot(config, obra);
  sincronizarCarregadores(obra, dados);
  sincronizarCanos(obra, dados);
  const municaoDeSerie = sincronizarMunicaoDeSerie(obra, dados);

  const custoDoCano: Record<string, number> = {};
  for (const { papel, site, jogo } of obra.relatorio.canos.custoPorPapel) if (site !== jogo) custoDoCano[papel] = jogo;

  // Ordem fixa, para o arquivo só mudar quando o conteúdo muda.
  const ordenado = <T>(registro: Record<string, T>) =>
    Object.fromEntries(Object.entries(registro).sort(([a], [b]) => a.localeCompare(b)));
  obra.pecasNovas.sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id));

  const r = obra.relatorio;
  for (const p of pecas) {
    const compat = obra.pecas[p.id]?.compat;
    if (!compat?.remover?.length) continue;
    const final = { ...p, compat: aplicarCompat(p.compat, compat) };
    if (!armas.some((w) => w.category !== 'melee' && cabeNaLista(final, w))) {
      r.pecasSemArma.push({ id: p.id, slot: p.slot, originalName: p.originalName });
    }
  }
  const contar = (lado: 'adicionadas' | 'removidas') =>
    Object.values(r.compat).reduce((total, slot) => total + slot[lado].length, 0);
  r.resumo = {
    armasCorrigidas: Object.keys(armasCorrigidas).length,
    camposDeArmaCorrigidos: r.armas.length,
    custosCorrigidos: r.custos.length,
    compatAdicionadas: contar('adicionadas'),
    compatRemovidas: contar('removidas'),
    variantesNovas: r.variantes.length,
    pecasDoAnalyzerSemPar: r.pecasDoAnalyzerSemPar.length,
    pecasDoSiteSemPar: r.pecasDoSiteSemPar.length,
    pecasSemArma: r.pecasSemArma.length,
    carregadoresAmbiguos: r.carregadores.ambiguos.length,
    canosParaRevisar: r.canos.revisar.length,
  };

  return {
    arquivo: {
      armas: ordenado(armasCorrigidas),
      pecas: ordenado(obra.pecas),
      pecasNovas: obra.pecasNovas,
      custoDoCano,
      municaoDeSerie,
    },
    relatorio: r,
  };
}

/* ========================================================================== *
 * Ler o Analyzer
 * ========================================================================== */

interface Leitura {
  arquivos: Record<string, unknown>;
  fonte: NonNullable<ArquivoDeSincronia['fonte']>;
}

/**
 * O commit de um clone local.
 *
 * `git log` quando há git; senão, `.git/HEAD` lido à mão (o SHA sai, a data
 * não). `ANALYZER_COMMIT` e `ANALYZER_COMMIT_DATE` sobrescrevem os dois.
 */
function commitLocal(dir: string): { commit: string | null; data: string | null } {
  let commit: string | null = null;
  let data: string | null = null;
  try {
    const [sha, quando] = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%H %cI'], { encoding: 'utf8' }).trim().split(' ');
    commit = sha || null;
    data = quando || null;
  } catch {
    const head = join(dir, '.git', 'HEAD');
    if (existsSync(head)) {
      const conteudo = readFileSync(head, 'utf8').trim();
      const ref = /^ref:\s*(.+)$/.exec(conteudo)?.[1];
      if (!ref) commit = conteudo;
      else if (existsSync(join(dir, '.git', ref))) commit = readFileSync(join(dir, '.git', ref), 'utf8').trim();
      else {
        const empacotados = join(dir, '.git', 'packed-refs');
        if (existsSync(empacotados)) {
          commit = readFileSync(empacotados, 'utf8').split('\n').find((l) => l.endsWith(` ${ref}`))?.split(' ')[0] ?? null;
        }
      }
    }
  }
  return { commit: process.env.ANALYZER_COMMIT ?? commit, data: process.env.ANALYZER_COMMIT_DATE ?? data };
}

async function lerAnalyzer(): Promise<Leitura> {
  const { repo, branch = 'main' } = fonteAtiva('numeros_de_simulacao');
  if (!repo) throw new Error('a fonte de numeros_de_simulacao não declara `repo` em data/sources/registry.json');

  const dir = process.env.ANALYZER_DIR;
  if (dir) {
    const arquivos: Record<string, unknown> = {};
    for (const nome of ARQUIVOS_DO_ANALYZER) {
      arquivos[`data/${nome}`] = JSON.parse(readFileSync(join(dir, 'data', nome), 'utf8'));
    }
    const { commit, data } = commitLocal(dir);
    return { arquivos, fonte: { repo, commit, data, versaoDeclarada: null } };
  }

  /*
    O commit primeiro, os arquivos depois, presos a ele: baixar de `main`
    deixaria o SHA gravado descrever outro conteúdo se o Analyzer publicasse
    no meio da leitura.
  */
  const token = process.env.GITHUB_TOKEN;
  const cabecalhos: Record<string, string> = {
    accept: 'application/vnd.github+json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const head = await fetchJson<{ sha: string; commit: { committer: { date: string } } }>(
    `https://api.github.com/repos/${repo}/commits/${branch}`,
    cabecalhos,
  );
  if (!head?.sha) throw new Error(`não consegui ler o commit de ${repo}@${branch}`);
  const base = `https://raw.githubusercontent.com/${repo}/${head.sha}/data`;
  const arquivos: Record<string, unknown> = {};
  await Promise.all(
    ARQUIVOS_DO_ANALYZER.map(async (nome) => {
      arquivos[`data/${nome}`] = await fetchJson(`${base}/${nome}`);
    }),
  );
  return { arquivos, fonte: { repo, commit: head.sha, data: head.commit.committer.date, versaoDeclarada: null } };
}

function dadosDe(arquivos: Record<string, unknown>): DadosDoAnalyzer {
  const armas = arquivos['data/weapons.json'] as ArmaDoAnalyzer[];
  /*
    Lista curta não é "nada mudou": é o arquivo que mudou de forma. Seguir
    adiante leria toda arma como sem par e todas as correções sumiriam.
  */
  if (!Array.isArray(armas) || armas.length < 30) {
    throw new Error(`o weapons.json do Analyzer veio com ${Array.isArray(armas) ? armas.length : 0} armas — o arquivo mudou de forma?`);
  }
  const pecas = arquivos['data/attachments.json'] as DadosDoAnalyzer['pecas'];
  if (!pecas?.WEAPON_ATTS || !pecas.WEAPON_MAG) throw new Error('o attachments.json do Analyzer não tem WEAPON_ATTS e WEAPON_MAG');
  return {
    armas,
    pecas,
    municao: arquivos['data/ammo.json'] as DadosDoAnalyzer['municao'],
    zonas: arquivos['data/hit_zones.json'] as DadosDoAnalyzer['zonas'],
  };
}

/* ========================================================================== *
 * Rodar
 * ========================================================================== */

/**
 * A versão do jogo que o Analyzer declara ter lido.
 *
 * Vem de `data/provenance/live-baseline.json`: a mais nova entre as
 * `sourceVersion` das fontes que ele lista, que é a pergunta que a trava faz —
 * o dataset já alcançou o patch? `import-analyzer.ts` chega lá por
 * `ballistics.json#source`, mas desde o esquema 2 desse arquivo `source` é um
 * objeto, não um ponteiro; o arquivo de proveniência é quem responde direto.
 */
export function versaoDeclarada(linhaDeBase: unknown): string | null {
  const fontes = (linhaDeBase as { sources?: { sourceVersion?: unknown }[] } | null)?.sources ?? [];
  const versoes = fontes
    .map((f) => f.sourceVersion)
    .filter((v): v is string => isGameVersion(v))
    .sort(compareVersions);
  return versoes.at(-1) ?? null;
}

/**
 * JSON com lista curta numa linha só.
 *
 * Com a indentação comum, cada degrau de curva de dano vira quatro linhas e
 * cada lista de armas, sessenta — e o diff da rodada que muda um número fica
 * ilegível. Lista sem objeto nem lista dentro cabe numa linha.
 */
export function jsonLegivel(valor: unknown): string {
  return (
    JSON.stringify(valor, null, 2).replace(/\[\s*([^[\]{}]*?)\s*\]/g, (_, dentro: string) =>
      `[${dentro
        .split(/,\s*\n\s*/)
        .map((item) => item.trim())
        .join(', ')}]`,
    ) + '\n'
  );
}

async function main(): Promise<void> {
  const seco = process.argv.includes('--dry-run');
  const forcar = process.argv.includes('--force');

  const { arquivos, fonte } = await lerAnalyzer();
  const version = versaoDeclarada(arquivos['data/provenance/live-baseline.json']);
  fonte.versaoDeclarada = version;

  /*
    A trava do dataset atrasado, a mesma de `import-analyzer.ts`: se o
    Analyzer descreve um patch anterior ao último do catálogo, o arquivo fica
    como está. O que já estava nele continua valendo onde o cadastro não mudou.
  */
  const corrente = listVersions().sort(compareVersions).at(-1) ?? null;
  if (!forcar && corrente && (!version || compareVersions(version, corrente) < 0)) {
    const motivo = `o Analyzer descreve ${version ?? 'versão nenhuma'} e o catálogo está em ${corrente}`;
    log('sincronização com o Analyzer: nada gravado', {
      'o Analyzer descreve': version ?? 'não declara versão',
      'o catálogo está em': corrente,
      'o que fazer': 'esperar o Analyzer alcançar o patch, ou passar --force',
    });
    if (!seco && existsSync(RELATORIO)) {
      const anterior = JSON.parse(readFileSync(RELATORIO, 'utf8')) as Relatorio;
      anterior.ultimaLeitura = { ...fonte, bloqueada: motivo };
      writeFileSync(RELATORIO, jsonLegivel(anterior), 'utf8');
    }
    return;
  }

  const dados = dadosDe(arquivos);
  const { arquivo, relatorio } = sincronizar({ dados, armas: WEAPONS_SEM_SINCRONIA, pecas: ATTACHMENTS_SEM_SINCRONIA });
  relatorio.fonte = fonte;
  relatorio.ultimaLeitura = fonte;

  const r = relatorio.resumo;
  log('sincronização com o Analyzer', {
    commit: fonte.commit?.slice(0, 7) ?? 'desconhecido',
    'versão declarada': version,
    'armas corrigidas': `${r.armasCorrigidas} (${r.camposDeArmaCorrigidos} campos)`,
    'custos corrigidos': r.custosCorrigidos,
    'compatibilidade': `+${r.compatAdicionadas} / -${r.compatRemovidas}`,
    'variantes novas': r.variantesNovas,
    'peças do Analyzer sem par no site': r.pecasDoAnalyzerSemPar,
    'peças do site sem par no Analyzer': r.pecasDoSiteSemPar,
    'carregadores ambíguos': r.carregadoresAmbiguos,
    'armas com cano para revisar': r.canosParaRevisar,
    'armas sem par': relatorio.armasSemPar.site.length ? relatorio.armasSemPar.site : 'nenhuma',
  });
  for (const [slot, { adicionadas, removidas }] of Object.entries(relatorio.compat)) {
    log(`  ${slot}`, `+${adicionadas.length} / -${removidas.length}`);
  }

  if (seco) {
    log('nada foi gravado (--dry-run)');
    return;
  }

  const novo: ArquivoDeSincronia = {
    _leiaMe:
      'Gerado por `npm run catalog:sincronizar-analyzer` a partir do BF6-Weapon-Analyzer. Não edite à mão: corrija o cadastro em weapons.ts ou attachments.ts e rode o script de novo. Relatório em data/validation/analyzer-sync-report.json.',
    fonte,
    ...arquivo,
  };
  const texto = jsonLegivel(novo);
  if (existsSync(ARQUIVO) && readFileSync(ARQUIVO, 'utf8') === texto) {
    log('nada novo', { arquivo: 'src/data/analyzer-sync.json' });
  } else {
    writeFileSync(ARQUIVO, texto, 'utf8');
    log('gravado', { arquivo: 'src/data/analyzer-sync.json' });
  }
  writeFileSync(RELATORIO, jsonLegivel(relatorio), 'utf8');
  log('relatório', { arquivo: 'data/validation/analyzer-sync-report.json' });
}

if (process.argv[1] && process.argv[1].endsWith('sincronizar-analyzer.ts')) await main();
