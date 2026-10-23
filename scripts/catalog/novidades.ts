/**
 * Arma e acessório novos, do jogo para o site, sem esperar ninguém.
 *
 *   npm run catalog:novidades              # descobre e grava src/data/novidades.json
 *   npm run catalog:novidades -- --dry-run # só relata
 *
 * ## Por que existe
 *
 * O pipeline do patch note (`catalog:update`) lê **mudança** em arma que o site
 * já conhece. Arma nova ele não reconhece: a 2.1.1.0 trouxe Mk 24, Z84M e
 * ELR-40, e nenhuma das três virou evento — o parser só resolve nome que já
 * está no dataset. Elas entraram à mão no dia seguinte. O sincronizador
 * (`npm run sync`) também não serve de detector: o catálogo do bf6loadouts
 * está atrás deste site, sem dez armas que aqui já existem.
 *
 * ## Duas fontes, uma para cada pergunta
 *
 * **Arma nova** vem do BF6-Weapon-Analyzer (`numeros_de_simulacao`), um
 * repositório no GitHub que publica, dos arquivos do jogo, a lista de armas
 * com cadência, pente, recargas, velocidade, recuo, modo de tiro e a curva de
 * dano. É atualizado quase todo dia e o GitHub Actions o alcança.
 *
 * **Acessório novo** vem do rnkd.gg (`enumeracao_de_slot`), cuja ficha de
 * cada arma lista cada slot com o nome da peça como o jogo a mostra e o custo
 * dela naquela arma. O Analyzer não serve para isso: ele agrupa as miras em
 * seis tipos genéricos e os canos por papel. Mas o rnkd recusa (403) quem
 * chega de datacenter, e isso inclui o GitHub Actions — decisão do site, que
 * esta rotina respeita em vez de contornar. Por isso a parte do rnkd só roda
 * de um computador comum (`npm run catalog:novidades` na mão); no Actions ela
 * é pulada e os acessórios ficam como a última rodada local deixou.
 *
 * ## O que é novo
 *
 * - **Arma:** arma do Analyzer que não casa com nenhuma daqui, nem pelo id nem
 *   pelo nome.
 * - **Acessório:** peça de alguma ficha do rnkd que não casa com nenhuma daqui
 *   — pelo nome original, pelo nome em português, pelo nome por arma, por
 *   prefixo ("Taclight - Hip" é a "Taclight - Hipfire") ou por erro de
 *   digitação ("Thread Protetor"), sempre com os mesmos números. Casar a mais
 *   é o erro barato: uma peça nova vista como velha só não aparece; uma velha
 *   vista como nova vira peça duplicada no montador.
 *
 * ## O que entra, e com que confiança
 *
 * Tudo vai para `src/data/novidades.json`, que `weapons.ts`, `attachments.ts`
 * e `weapon-images.ts` juntam ao cadastro. Nada aqui reescreve arquivo de
 * código: a curadoria continua sendo `weapons.ts` e `attachments.ts`, e item
 * que for curado lá some daqui sozinho na rodada seguinte.
 *
 * Tudo entra como `curated`, que acende o aviso de valor aproximado:
 *
 * - da arma, a curva de dano, a cadência, a velocidade, o arrasto e as
 *   recargas são do jogo; o pente desconta a bala na câmara, que o Analyzer
 *   conta; o recuo passa pela escala deste site, calibrada categoria por
 *   categoria nas armas que existem nos dois lados. As barras, o tempo de
 *   mira e de saque e o multiplicador na cabeça vêm da ficha do rnkd quando
 *   ela abre, e da arma mais parecida da mesma categoria quando não;
 * - a arma nova monta as peças que a ficha dela lista; sem ficha, herda as da
 *   gêmea — o mesmo que o cadastro fez à mão com as armas que a fonte antiga
 *   não cobria;
 * - o efeito do acessório não sai de fonte nenhuma — entra sem efeito (`mods:
 *   {}`).
 *
 * O nome em português e as descrições são do modelo (o Claude Haiku primeiro,
 * os gratuitos de reserva — ver `meta/provedores.mjs`), com os nomes do
 * próprio site como exemplo. Sem modelo, o item entra com o nome original.
 *
 * ## Desfazer
 *
 * Item que não deveria ter entrado não se apaga só do arquivo: a rodada
 * seguinte o traria de volta. Ponha a chave dele em `ignorar`, no próprio
 * `novidades.json` — `arma:<id>` ou `peca:<Seção>:<nome>`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEAPONS_CURADAS } from '../../src/data/weapons.ts';
import { ATTACHMENTS_CURADOS } from '../../src/data/attachments.ts';
import { seasonOn } from '../../src/data/season.ts';
import type { Attachment, SlotId, Weapon, WeaponCategory } from '../../src/data/types.ts';
import { candidatos, modelosDe, perguntarSemBusca, temAlgumaChave } from '../meta/provedores.mjs';
import { extrairJson } from '../meta/leitura.mjs';
import { FetchFailed, fetchJson, fetchText, htmlToText } from './lib/http.ts';
import { fonteAtiva } from './lib/sources.ts';
import { ROOT, log } from './lib/io.ts';

export const ARQUIVO = join(ROOT, 'src', 'data', 'novidades.json');

/** Quantas fichas ler ao mesmo tempo. Baixo de propósito: é o site de outra pessoa. */
const EM_PARALELO = 4;

/* ========================================================================== *
 * Formato do arquivo
 * ========================================================================== */

export interface ArmaNova {
  id: string;
  name: string;
  category: WeaponCategory;
  archetype: Weapon['archetype'];
  summary: string;
  damage: [number, number][];
  pellets?: number;
  rpm: number;
  velocity: number;
  drag: number;
  headshot: number;
  magazine: number;
  reload: number;
  emptyReload: number;
  adsMs: number;
  swapMs: number;
  accuracy: number;
  control: number;
  mobility: number;
  hipfire: number;
  verticalRecoil: number;
  horizontalRecoil: number;
  fireModes: Weapon['fireModes'];
  season: number;
  provenance: 'curated';
  /** De onde veio e de quem herdou o que a fonte não publica. */
  origem: { fonte: string; detectadaEm: string; gemea: string; idNaFonte: string; fichaDoRnkd: boolean };
}

export interface PecaNova extends Attachment {
  origem: { fonte: string; detectadaEm: string; secao: string; nomeNaFonte: string; custos?: number[] };
}

export interface Novidades {
  /** Leia o cabeçalho de scripts/catalog/novidades.ts antes de mexer aqui. */
  _leiaMe?: string;
  atualizadoEm: string | null;
  armas: ArmaNova[];
  acessorios: PecaNova[];
  /** Peça que já existe e passa a valer numa arma nova: id da peça → ids de arma. */
  compatExtra: Record<string, string[]>;
  /** Foto da arma nova, enquanto ela não tem uma em `weapon-images.ts`. */
  imagens: Record<string, { render: string }>;
  /** Chaves que a rotina não deve trazer de volta. Ver "Desfazer", no cabeçalho do script. */
  ignorar: string[];
}

export const NOVIDADES_VAZIO: Novidades = {
  atualizadoEm: null,
  armas: [],
  acessorios: [],
  compatExtra: {},
  imagens: {},
  ignorar: [],
};

/* ========================================================================== *
 * Leitura da ficha
 * ========================================================================== */

export const chave = (valor: string) =>
  String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * A chave de nome de peça, com o número escrito de um jeito só.
 *
 * O rnkd escreve "MGO 3.50X"; o cadastro pode ter "3.5x" ou "3,50x". Sem isto,
 * a mesma mira viraria duas.
 */
export function chaveDePeca(nome: string): string {
  const numero = String(nome).replace(/(\d+)[.,](\d+)/g, (_, inteiro: string, fracao: string) => {
    const resto = fracao.replace(/0+$/, '');
    return resto ? `${inteiro}p${resto}` : inteiro;
  });
  return chave(numero);
}

/** O slot daqui, pelo título da seção da ficha. O laser de cima mora no trilho direito. */
export const SLOT_DA_SECAO: Record<string, SlotId> = {
  Scope: 'sight',
  Muzzle: 'muzzle',
  Barrel: 'barrel',
  Magazine: 'magazine',
  Ammunition: 'ammo',
  Underbarrel: 'underbarrel',
  Ergonomics: 'ergonomics',
  'Optic Accessory': 'opticAccessory',
  'Left Accessory': 'leftRail',
  'Right Accessory': 'rightRail',
  'Top Accessory': 'rightRail',
};

/** A categoria daqui, pelo rótulo da ficha. */
export const CATEGORIA_DO_ROTULO: Record<string, WeaponCategory> = {
  assaultrifle: 'ar',
  carbine: 'carbine',
  smg: 'smg',
  submachinegun: 'smg',
  lmg: 'lmg',
  lightmachinegun: 'lmg',
  dmr: 'dmr',
  designatedmarksmanrifle: 'dmr',
  marksmanrifle: 'dmr',
  sniperrifle: 'sniper',
  sniper: 'sniper',
  shotgun: 'shotgun',
  pistol: 'pistol',
  sidearm: 'pistol',
  handgun: 'pistol',
};

export interface NumerosDaFicha {
  damage?: number;
  rpm?: number;
  velocity?: number;
  magazine?: number;
  reload?: number;
  adsMs?: number;
  headshot?: number;
  mobility?: number;
  hipfire?: number;
  accuracy?: number;
  control?: number;
}

export interface Ficha {
  nome: string;
  rotulo: string;
  numeros: NumerosDaFicha;
  imagem: string | null;
  /** Por seção, cada peça com o nome como a ficha escreve e o custo. */
  pecas: Map<string, { nome: string; custo: number | null }[]>;
}

const ROTULOS_DOS_NUMEROS: [string, keyof NumerosDaFicha][] = [
  ['Damage', 'damage'],
  ['Fire Rate', 'rpm'],
  ['Muzzle Velocity', 'velocity'],
  ['Mag Size', 'magazine'],
  ['Reload Time', 'reload'],
  ['Aim Downsight Speed', 'adsMs'],
  ['Headshot Multiplier', 'headshot'],
  ['Mobility', 'mobility'],
  ['Hipfire', 'hipfire'],
  ['Precision', 'accuracy'],
  ['Control', 'control'],
];

/**
 * A ficha de uma arma do rnkd, reduzida ao que o detector usa.
 *
 * Os números vêm na primeira ocorrência de cada rótulo, que é o quadro
 * "Global"; o segundo quadro repete os mesmos valores com a posição dentro da
 * categoria. As peças são lidas pela estrutura, `<h3>` de seção e `<h4>` de
 * peça, como em `lerFicha` da auditoria — mas guardando o nome como está
 * escrito, que é o que vira `originalName`.
 */
export function lerFichaDaArma(html: string, base = 'https://rnkd.gg'): Ficha {
  const titulo = /<title>([^<]+)<\/title>/i.exec(html)?.[1] ?? '';
  const nome = htmlToText(titulo).replace(/\s+Stats,.*$/i, '').trim();

  const linhas = htmlToText(html)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const iNome = linhas.findIndex((l) => l === nome);
  const rotulo = iNome >= 0 ? (linhas[iNome + 1] ?? '') : '';

  const numeros: NumerosDaFicha = {};
  const texto = linhas.join('\n');
  for (const [rotuloDoNumero, campo] of ROTULOS_DOS_NUMEROS) {
    const achado = new RegExp(`(?:^|\\n)${rotuloDoNumero}:\\s*\\n?\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i').exec(texto);
    if (achado) numeros[campo] = Number(achado[1]);
  }

  const og = /property="og:image"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:image"/i.exec(html);
  const caminho = og?.[1] ?? og?.[2] ?? null;
  const imagem = caminho ? new URL(caminho, base).toString() : null;

  const pecas = new Map<string, { nome: string; custo: number | null }[]>();
  for (const bloco of html.split(/<h3[^>]*>/i).slice(1)) {
    const fim = bloco.indexOf('<');
    if (fim < 0) continue;
    const secao = htmlToText(bloco.slice(0, fim)).trim();
    if (!SLOT_DA_SECAO[secao]) continue;

    const marcas = [...bloco.matchAll(/<h4[^>]*>([^<]+)<\/h4>/gi)];
    const lista = marcas.map((marca, i) => {
      const cartao = bloco.slice(marca.index! + marca[0].length, marcas[i + 1]?.index ?? bloco.length);
      const custo = /(\d+)\s*pts/i.exec(cartao);
      return { nome: htmlToText(marca[1]).trim(), custo: custo ? Number(custo[1]) : null };
    });
    if (lista.length) pecas.set(secao, lista);
  }

  return { nome, rotulo, numeros, imagem, pecas };
}

/** Os endereços de arma da lista do rnkd, sem as imagens que moram no mesmo caminho. */
export function lerListaDeArmas(html: string): string[] {
  return [
    ...new Set(
      [...html.matchAll(/battlefield6\/weapons\/([A-Za-z0-9_-]+)/g)]
        .map((m) => m[1])
        .filter((s) => !/cropped|processed/i.test(s)),
    ),
  ];
}

/* ========================================================================== *
 * Casar com o que o site já tem
 * ========================================================================== */

/**
 * Endereços do rnkd que não são o id daqui. Mesma tabela da auditoria
 * (`ENDERECO_DA_ARMA`), lida ao contrário.
 */
const ARMA_DO_ENDERECO: Record<string, string> = {
  '185ks-k': '18-5ks-k',
  SVDM: 'svdm',
};

export function casarArma(endereco: string, nome: string, armas: Pick<Weapon, 'id' | 'name'>[]): string | null {
  if (ARMA_DO_ENDERECO[endereco]) return ARMA_DO_ENDERECO[endereco];
  const alvo = new Set([chave(endereco), chave(nome)].filter(Boolean));
  return armas.find((w) => alvo.has(chave(w.id)) || alvo.has(chave(w.name)))?.id ?? null;
}

/** Distância de edição, para o erro de digitação da fonte. */
export function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/** Os trilhos são uma família: a lanterna mora num lado aqui e no outro lá. */
const familia = (slot: SlotId) => (slot === 'leftRail' || slot === 'rightRail' ? 'rail' : slot);

export interface IndiceDePecas {
  porChave: Map<string, { id: string; slot: SlotId }[]>;
}

export function indexarPecas(pecas: Pick<Attachment, 'id' | 'slot' | 'name' | 'originalName' | 'namePerWeapon'>[]): IndiceDePecas {
  const porChave = new Map<string, { id: string; slot: SlotId }[]>();
  for (const peca of pecas) {
    const nomes = [peca.originalName, peca.name, ...Object.values(peca.namePerWeapon ?? {})];
    for (const nome of nomes) {
      const k = chaveDePeca(nome);
      if (!k) continue;
      porChave.set(k, [...(porChave.get(k) ?? []), { id: peca.id, slot: peca.slot }]);
    }
  }
  return { porChave };
}

/** Os números de um nome, na ordem: "22RND Magazine" → "22"; "MGO 3.50x" → "3p5". */
const numerosDe = (k: string) => (k.match(/\d+(?:p\d+)?/g) ?? []).join(',');

export type ComoCasou = 'exato' | 'prefixo' | 'digitacao';

/**
 * A peça daqui que é esta peça da ficha, e como se chegou a ela; nulo se ela é nova.
 *
 * Nome igual vale em qualquer slot. Prefixo ("Taclight - Hip" na "Taclight -
 * Hipfire") e erro de digitação ("Thread Protetor") só no mesmo slot, com nome
 * comprido o bastante para não casar "M" com "MGO" — e **com os mesmos
 * números**. Sem esta última trava, a primeira versão casou o "22RND Magazine"
 * com o "10RND Magazine" e o cano de 29" com o de 10": num nome de peça, o
 * número é a peça.
 */
export function casarPecaComo(
  nome: string,
  slot: SlotId,
  indice: IndiceDePecas,
): { id: string; como: ComoCasou; com: string } | null {
  const k = chaveDePeca(nome);
  const exato = indice.porChave.get(k);
  if (exato?.length) return { id: (exato.find((p) => familia(p.slot) === familia(slot)) ?? exato[0]).id, como: 'exato', com: k };

  for (const [outra, lista] of indice.porChave) {
    const mesmoSlot = lista.find((p) => familia(p.slot) === familia(slot));
    if (!mesmoSlot || numerosDe(outra) !== numerosDe(k)) continue;
    const curta = Math.min(k.length, outra.length);
    if (curta >= 6 && (outra.startsWith(k) || k.startsWith(outra))) return { id: mesmoSlot.id, como: 'prefixo', com: outra };
    if (curta >= 8 && distancia(k, outra) <= 2) return { id: mesmoSlot.id, como: 'digitacao', com: outra };
  }
  return null;
}

export const casarPeca = (nome: string, slot: SlotId, indice: IndiceDePecas) => casarPecaComo(nome, slot, indice)?.id ?? null;

/* ========================================================================== *
 * O rascunho da arma
 * ========================================================================== */

/** Uma arma do BF6-Weapon-Analyzer (`data/weapons.json`), só com o que se usa aqui. */
export interface ArmaDoAnalyzer {
  id: string;
  name: string;
  cls: string;
  rpm: number;
  mag: number;
  tacRld: number;
  emptyRld: number;
  bulletVel: number;
  recoilV: number;
  recoilVar: number;
  fireMode?: string;
  availableFireModes?: string[];
  dmg?: { r: number; d: number }[];
}

/** De `data/ballistics.json`: o projétil de cada arma e o arrasto de cada projétil. */
export interface BalisticaDoAnalyzer {
  projectiles: Record<string, { dragPerMeter?: number }>;
  weapons: Record<string, { base?: string }>;
}

/** O arrasto de referência deste site: o 5,56 mm, 0,0035 por metro, vale 1. */
const ARRASTO_DE_REFERENCIA = 0.0035;

const mediana = (valores: number[]) => {
  const v = [...valores].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
};

const arredondar = (valor: number, casas = 0) => Number(valor.toFixed(casas));

/**
 * A curva do jogo como escada deste site.
 *
 * O Analyzer dá pontos (distância, dano), e entre dois pontos o dano anda em
 * rampa. A escada daqui muda de degrau num ponto só: subindo, o degrau novo
 * vale de onde a rampa chega (a ELR-40 só dá 100 a partir de 150 m); descendo,
 * de onde a rampa começa (ela já não garante 100 depois de 180 m). É o mesmo
 * critério do cadastro feito à mão, e com ele a Mk 24 e a Z84M saem iguais.
 */
export function escadaDoJogo(pontos: { r: number; d: number }[]): [number, number][] {
  const ordenados = [...pontos].sort((a, b) => a.r - b.r);
  if (!ordenados.length) return [];
  const escada: [number, number][] = [[ordenados[0].d, 0]];
  for (let i = 1; i < ordenados.length; i += 1) {
    const atual = escada[escada.length - 1][0];
    const { r, d } = ordenados[i];
    if (d === atual) continue;
    const distancia = d > atual ? r : ordenados[i - 1].r;
    escada.push([d, distancia]);
  }
  return escada;
}

export const CATEGORIA_DO_ANALYZER: Record<string, WeaponCategory> = {
  assaultrifle: 'ar',
  carbine: 'carbine',
  smg: 'smg',
  lmg: 'lmg',
  dmr: 'dmr',
  sniperrifle: 'sniper',
  shotgun: 'shotgun',
  sidearm: 'pistol',
  pistol: 'pistol',
};

export function modosDeTiro(arma: Pick<ArmaDoAnalyzer, 'fireMode' | 'availableFireModes'>): Weapon['fireModes'] {
  if (arma.fireMode === 'bolt') return ['ferrolho'];
  if (arma.fireMode === 'pump') return ['bombeamento'];
  const mapa: Record<string, Weapon['fireModes'][number]> = { auto: 'auto', burst: 'burst', single: 'semi', semi: 'semi' };
  const modos = [...new Set((arma.availableFireModes ?? [arma.fireMode ?? 'auto']).map((m) => mapa[m]).filter(Boolean))];
  return modos.length ? modos : ['auto'];
}

/** O id deste site para um nome: "Mk 24" → "mk-24", "ELR-40" → "elr-40". */
export const idDoNome = (nome: string) =>
  nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type Escala = (categoria: WeaponCategory, campo: string) => number;

/**
 * Quanto o número daqui vale para cada número de fora, categoria por categoria.
 *
 * Recuo, barras e tempo de mira deste site não são os números crus:
 * o recuo vertical da ELR-40, por exemplo, é o do jogo vezes 1,57, e o tempo de
 * mira dela é 367 ms lá e 815 aqui. A razão mediana entre os dois lados, nas
 * armas que existem nos dois, é a tradução; categoria com menos de dois pares
 * cai na razão de todas.
 */
export function calibrar(pares: { categoria: WeaponCategory; site: number; fora: number | undefined; campo: string }[]): Escala {
  const razoes = new Map<string, number[]>();
  for (const { categoria, site, fora, campo } of pares) {
    if (!fora || !site) continue;
    for (const k of [`${categoria}:${campo}`, `*:${campo}`]) razoes.set(k, [...(razoes.get(k) ?? []), site / fora]);
  }
  return (categoria, campo) => {
    const daCategoria = razoes.get(`${categoria}:${campo}`) ?? [];
    return mediana(daCategoria.length >= 2 ? daCategoria : (razoes.get(`*:${campo}`) ?? [])) ?? 1;
  };
}

/** A arma daqui mais parecida, na mesma categoria: é dela que vem o que nenhuma fonte publica. */
export function gemeaDe(categoria: WeaponCategory, alvo: { dano?: number; rpm?: number; velocidade?: number }, armas: Weapon[]): Weapon | null {
  const daCategoria = armas.filter((w) => w.category === categoria);
  if (!daCategoria.length) return null;
  const dano = (w: Weapon) => Math.max(...w.damage.map((d) => d.damage));
  const custo = (w: Weapon) =>
    Math.abs(Math.log((alvo.dano ?? dano(w)) / dano(w))) +
    Math.abs(Math.log((alvo.rpm ?? w.rpm) / w.rpm)) +
    0.5 * Math.abs(Math.log((alvo.velocidade ?? w.velocity) / w.velocity));
  return [...daCategoria].sort((a, b) => custo(a) - custo(b))[0];
}

const BARRAS = ['accuracy', 'control', 'mobility', 'hipfire'] as const;

export function rascunhoDaArma(
  fora: ArmaDoAnalyzer,
  categoria: WeaponCategory,
  gemea: Weapon,
  escala: Escala,
  {
    arrasto,
    ficha,
    hoje,
    temporada,
    fonte,
  }: { arrasto: number | null; ficha: Ficha | null; hoje: string; temporada: number; fonte: string },
): ArmaNova {
  const escada = escadaDoJogo(fora.dmg ?? []);
  const n = ficha?.numeros ?? {};
  const daFicha = (campo: 'accuracy' | 'control' | 'mobility' | 'hipfire' | 'adsMs') =>
    n[campo] !== undefined ? arredondar(n[campo]! * escala(categoria, `rnkd:${campo}`)) : gemea[campo];

  return {
    id: idDoNome(fora.name),
    name: fora.name,
    category: categoria,
    archetype: gemea.archetype,
    summary: '',
    damage: escada.length ? escada : gemea.damage.map((d) => [d.damage, d.distance]),
    ...(gemea.pellets > 1 ? { pellets: gemea.pellets } : {}),
    rpm: arredondar(fora.rpm),
    velocity: arredondar(fora.bulletVel),
    drag: arrasto ? arredondar(arrasto / ARRASTO_DE_REFERENCIA, 3) : gemea.drag,
    headshot: n.headshot ?? gemea.headshot,
    // O Analyzer conta a bala na câmara; o pente deste site, não.
    magazine: Math.max(1, fora.mag - 1),
    // Recarga do jogo, crua: é o que o cadastro à mão usa desde a Temporada 5.
    reload: arredondar(fora.tacRld, 3),
    emptyReload: arredondar(fora.emptyRld, 3),
    adsMs: daFicha('adsMs'),
    swapMs: gemea.swapMs,
    ...(Object.fromEntries(BARRAS.map((b) => [b, Math.min(100, daFicha(b))])) as Record<(typeof BARRAS)[number], number>),
    verticalRecoil: arredondar(fora.recoilV * escala(categoria, 'verticalRecoil'), 3),
    horizontalRecoil: arredondar(fora.recoilVar * escala(categoria, 'horizontalRecoil'), 3),
    fireModes: modosDeTiro(fora),
    season: temporada,
    provenance: 'curated',
    origem: { fonte, detectadaEm: hoje, gemea: gemea.id, idNaFonte: fora.id, fichaDoRnkd: Boolean(ficha) },
  };
}

/* ========================================================================== *
 * O rascunho da peça
 * ========================================================================== */

const moda = (valores: number[]) => {
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  return [...contagem].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
};

/** Nome em caixa de título, para quando nenhum modelo responde: "MGO 3.50X" → "MGO 3.50x". */
export function caixaDeTitulo(nome: string): string {
  return nome
    .split(/(\s+|-)/)
    .map((parte) => {
      if (/^\d+(?:\.\d+)?X$/i.test(parte)) return parte.toLowerCase();
      if (/\d/.test(parte) || parte.length <= 3) return parte;
      return parte.charAt(0) + parte.slice(1).toLowerCase();
    })
    .join('');
}

export function idDaPeca(slot: SlotId, nome: string, usados: Set<string>): string {
  const base = `${slot.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}-${nome
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
  let id = base;
  for (let i = 2; usados.has(id); i += 1) id = `${base}-${i}`;
  usados.add(id);
  return id;
}

export function rascunhoDaPeca(
  secao: string,
  nome: string,
  porArma: Map<string, number | null>,
  usados: Set<string>,
  { hoje, fonte }: { hoje: string; fonte: string },
): PecaNova {
  const slot = SLOT_DA_SECAO[secao];
  const custos = [...porArma.values()].filter((c): c is number => c !== null);
  const original = caixaDeTitulo(nome);
  const ampliacao = /(\d+(?:\.\d+)?)\s*X$/i.exec(nome);
  const capacidade = /^(\d+)\s*RND/i.exec(nome);
  const variados = [...new Set(custos)].sort((a, b) => a - b);

  return {
    id: idDaPeca(slot, nome, usados),
    name: original,
    originalName: original,
    slot,
    cost: moda(custos),
    description: '',
    mods: {},
    ...(slot === 'sight' && ampliacao ? { magnification: Number(ampliacao[1]) } : {}),
    ...(slot === 'magazine' && capacidade ? { magazineSize: Number(capacidade[1]) } : {}),
    compat: { weapons: [...porArma.keys()].sort() },
    provenance: 'curated',
    origem: {
      fonte,
      detectadaEm: hoje,
      secao,
      nomeNaFonte: nome,
      ...(variados.length > 1 ? { custos: variados } : {}),
    },
  };
}

/* ========================================================================== *
 * Canos
 * ========================================================================== */

/** Os papéis que a tela de seleção do jogo mostra (`stats.test.ts`). */
export const PAPEIS_DE_CANO = new Set([
  'Cano Curto', 'Cano Básico', 'Cano Estendido', 'Cano Curto Leve', 'Cano Leve',
  'Cano Estendido Leve', 'Cano Pesado', 'Cano Ext. Pesado', 'Cano Crio',
]);

/**
 * O papel do cano na tela de seleção, pelo custo — e, no empate, pelo nome.
 *
 * O jogo não nomeia o cano pelo tamanho: nomeia pelo papel, e o papel tem
 * preço fixo (`stats.test.ts`, "cobra pelo cano o que a tela do jogo cobra").
 * Custo fora da tabela é cano que esta rotina não sabe nomear, e ele fica de
 * fora em vez de entrar com um nome que a tela do jogo não mostra.
 */
export function papelDoCano(nomeNaFonte: string, custo: number): string | null {
  switch (custo) {
    case 5:
      return 'Cano Estendido';
    case 10:
      return 'Cano Pesado';
    case 15:
      return 'Cano Curto';
    case 20:
      return /cryo/i.test(nomeNaFonte) ? 'Cano Crio' : 'Cano Leve';
    case 25:
      return /short|compact|cqb|sbr|commando/i.test(nomeNaFonte) ? 'Cano Curto Leve' : 'Cano Estendido Leve';
    default:
      return null;
  }
}

/**
 * Dá aos canos das armas novas o nome do papel, com cada papel uma vez só e um
 * Básico por arma.
 *
 * A arma nova pode receber canos de dois lados: os que já existem no cadastro
 * e a ficha dela também lista (`compatExtra`), e os que são novos. Os do
 * cadastro vêm primeiro — já têm nome conferido —, e o cano novo só ocupa papel
 * que sobrou: dois canos com o mesmo nome na mesma arma são duas peças que o
 * jogador não distingue na tela de seleção (`stats.test.ts`).
 *
 * Toda arma sai de fábrica com o Básico montado, e ele cobra dez pontos. Se o
 * cadastro não deu um, é o novo de dez pontos com "Factory", "Standard" ou
 * "Basic" no nome; sem nenhum desses, o primeiro de dez. Arma em que isso não
 * fecha fica sem cano nenhum — nem o do cadastro: o slot vazio é honesto, e um
 * conjunto sem Básico quebraria o orçamento da tela.
 */
export function nomearCanos(
  pecas: PecaNova[],
  armasNovas: Set<string>,
  compatExtra: Record<string, string[]>,
  cadastro: Pick<Attachment, 'id' | 'slot' | 'name' | 'namePerWeapon' | 'compat'>[],
): PecaNova[] {
  const canos = pecas.filter((p) => p.slot === 'barrel');
  const canosDoCadastro = cadastro.filter((a) => a.slot === 'barrel');
  const tirar = (c: PecaNova, arma: string) => {
    c.compat = { weapons: c.compat.weapons!.filter((w) => w !== arma) };
  };

  const largar = (id: string, arma: string) => {
    if (!compatExtra[id]) return;
    compatExtra[id] = compatExtra[id].filter((w) => w !== arma);
    if (!compatExtra[id].length) delete compatExtra[id];
  };

  for (const arma of armasNovas) {
    /*
      Do cadastro: os que já citam a arma pelo id ficam como estão; os que
      chegam por `compatExtra` (pela ficha, ou herdados da gêmea) só entram com
      papel que a tela mostra e que ainda esteja livre.
    */
    const fixos = canosDoCadastro.filter((a) => a.compat.weapons?.includes(arma));
    const ocupados = new Set(fixos.map((a) => a.namePerWeapon?.[arma] ?? a.name));
    const herdados = [...fixos];
    for (const a of canosDoCadastro.filter((c) => compatExtra[c.id]?.includes(arma) && !fixos.includes(c))) {
      const papel = a.namePerWeapon?.[arma] ?? a.name;
      if (!PAPEIS_DE_CANO.has(papel) || ocupados.has(papel)) {
        largar(a.id, arma);
        continue;
      }
      ocupados.add(papel);
      herdados.push(a);
    }
    const daArma = canos.filter((c) => c.compat.weapons?.includes(arma));
    if (!daArma.length && !herdados.length) continue;

    const dez = daArma.filter((c) => c.cost === 10);
    const basico = ocupados.has('Cano Básico')
      ? null
      : (dez.find((c) => /factory|standard|basic/i.test(c.origem.nomeNaFonte)) ?? dez[0] ?? null);

    if (!ocupados.has('Cano Básico') && !basico) {
      for (const c of daArma) tirar(c, arma);
      for (const a of herdados) largar(a.id, arma);
      continue;
    }

    for (const c of [...daArma].sort((a, b) => Number(b === basico) - Number(a === basico))) {
      const papel = c === basico ? 'Cano Básico' : papelDoCano(c.origem.nomeNaFonte, c.cost);
      if (!papel || ocupados.has(papel)) {
        tirar(c, arma);
        continue;
      }
      ocupados.add(papel);
      c.namePerWeapon = { ...c.namePerWeapon, [arma]: papel };
    }
  }

  // O nome geral é o papel mais comum da peça; o resto fica em `namePerWeapon`.
  for (const c of canos) {
    const nomes = Object.entries(c.namePerWeapon ?? {}).filter(([w]) => c.compat.weapons?.includes(w));
    if (!nomes.length) continue;
    const contagem = new Map<string, number>();
    for (const [, nome] of nomes) contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    c.name = [...contagem].sort((a, b) => b[1] - a[1])[0][0];
    const resto = Object.fromEntries(nomes.filter(([, nome]) => nome !== c.name));
    if (Object.keys(resto).length) c.namePerWeapon = resto;
    else delete c.namePerWeapon;
  }

  return pecas.filter((p) => p.slot !== 'barrel' || (p.compat.weapons?.length ?? 0) > 0);
}

/* ========================================================================== *
 * A detecção, sem rede
 * ========================================================================== */

export interface Deteccao {
  armas: ArmaNova[];
  acessorios: PecaNova[];
  compatExtra: Record<string, string[]>;
  imagens: Record<string, { render: string }>;
  /** Armas cuja categoria a rotina não reconheceu — ficam de fora, e aparecem no log. */
  semCategoria: string[];
  /** Peças da ficha casadas com o cadastro por aproximação, para conferir no log. */
  aproximadas: string[];
  /**
   * Canos que a ficha mostra numa arma já cadastrada e o cadastro não tem.
   *
   * Não entram sozinhos: a arma já tem um conjunto de canos (às vezes herdado
   * de uma parecida), e somar os da ficha repetiria papel na tela de seleção.
   * Trocar um conjunto pelo outro é curadoria — o log diz onde.
   */
  canosParaCurar: string[];
}

/**
 * Compara as fontes com o cadastro e devolve o que é novo.
 *
 * `analyzer` é a lista de armas do BF6-Weapon-Analyzer, com o arrasto de cada
 * uma. `fichas` é o endereço do rnkd → a ficha lida, ou `null` quando o rnkd
 * não abriu (o GitHub Actions): aí os acessórios ficam como a rodada anterior
 * deixou, e arma nova herda as peças da gêmea. `anterior` é o arquivo da rodada
 * passada: o que já estava nele fica como estava (inclusive o nome que o modelo
 * deu), e o que a curadoria levou para `weapons.ts` ou `attachments.ts` sai.
 */
export function detectar({
  analyzer,
  arrastos,
  fichas,
  armas,
  pecas,
  anterior,
  hoje,
  temporada,
  fontes,
}: {
  analyzer: ArmaDoAnalyzer[];
  arrastos: Record<string, number>;
  fichas: Map<string, Ficha> | null;
  armas: Weapon[];
  pecas: Attachment[];
  anterior: Novidades;
  hoje: string;
  temporada: number;
  fontes: { analyzer: string; rnkd: string };
}): Deteccao {
  const ignorar = new Set(anterior.ignorar);
  const semCategoria: string[] = [];

  // ---------------------------------------------------------------- armas
  const casadas: { fora: ArmaDoAnalyzer; site: Weapon }[] = [];
  const novas: ArmaDoAnalyzer[] = [];
  for (const fora of analyzer) {
    const id = casarArma(fora.id, fora.name, armas);
    if (id) casadas.push({ fora, site: armas.find((w) => w.id === id)! });
    else if (!ignorar.has(`arma:${idDoNome(fora.name)}`) && !ignorar.has(`arma:${fora.id}`)) novas.push(fora);
  }

  // Endereço do rnkd → id daqui, para as armas que existem; as novas entram abaixo.
  const armaDaFicha = new Map<string, string>();
  const fichaDaArma = new Map<string, Ficha>();
  for (const [endereco, ficha] of fichas ?? []) {
    const id = casarArma(endereco, ficha.nome, armas);
    if (id) {
      armaDaFicha.set(endereco, id);
      fichaDaArma.set(id, ficha);
    }
  }

  const pares: Parameters<typeof calibrar>[0] = [];
  for (const { fora, site } of casadas) {
    const c = site.category;
    pares.push(
      { categoria: c, campo: 'verticalRecoil', site: site.verticalRecoil, fora: fora.recoilV },
      { categoria: c, campo: 'horizontalRecoil', site: site.horizontalRecoil, fora: fora.recoilVar },
    );
  }
  for (const [id, ficha] of fichaDaArma) {
    const site = armas.find((w) => w.id === id)!;
    for (const campo of ['accuracy', 'control', 'mobility', 'hipfire', 'adsMs'] as const) {
      pares.push({ categoria: site.category, campo: `rnkd:${campo}`, site: site[campo], fora: ficha.numeros[campo] });
    }
  }
  const escala = calibrar(pares);

  const jaAnteriores = new Map(anterior.armas.map((a) => [a.id, a]));
  const resultadoArmas: ArmaNova[] = [];
  const imagens: Record<string, { render: string }> = {};
  const fichasDasNovas = new Map<string, Ficha>();

  for (const fora of novas) {
    const categoria = CATEGORIA_DO_ANALYZER[chave(fora.cls)];
    if (!categoria) {
      semCategoria.push(`${fora.name} (${fora.cls || 'sem classe'})`);
      continue;
    }
    const escada = escadaDoJogo(fora.dmg ?? []);
    const gemea = gemeaDe(categoria, { dano: Math.max(...escada.map(([d]) => d)), rpm: fora.rpm, velocidade: fora.bulletVel }, armas);
    if (!gemea) {
      semCategoria.push(`${fora.name} (nenhuma arma da categoria ${categoria} para servir de gêmea)`);
      continue;
    }

    const id = idDoNome(fora.name);
    const endereco = [...(fichas?.keys() ?? [])].find((e) => !armaDaFicha.has(e) && casarArma(e, fichas!.get(e)!.nome, [{ id, name: fora.name }]));
    const ficha = endereco ? fichas!.get(endereco)! : null;
    if (endereco) {
      armaDaFicha.set(endereco, id);
      fichasDasNovas.set(id, ficha!);
    }

    const antes = jaAnteriores.get(id);
    // A rodada anterior manda, a não ser que ela não tivesse a ficha e esta tenha.
    const rascunho =
      antes && (antes.origem.fichaDoRnkd || !ficha)
        ? antes
        : { ...rascunhoDaArma(fora, categoria, gemea, escala, { arrasto: arrastos[fora.id] ?? null, ficha, hoje, temporada, fonte: fontes.analyzer }), ...(antes ? { summary: antes.summary } : {}) };
    resultadoArmas.push(rascunho);

    if (ficha?.imagem) imagens[id] = { render: ficha.imagem };
    else if (anterior.imagens[id]) imagens[id] = anterior.imagens[id];
  }

  const idsNovos = new Set(resultadoArmas.map((a) => a.id));
  const existentes = new Set([...armas.map((w) => w.id), ...idsNovos]);
  const compatExtra: Record<string, string[]> = {};
  const somar = (peca: string, arma: string) => {
    compatExtra[peca] = [...new Set([...(compatExtra[peca] ?? []), arma])].sort();
  };

  // ---------------------------------------------------------------- peças
  const indice = indexarPecas(pecas);
  const novasPecas = new Map<string, { secao: string; nome: string; porArma: Map<string, number | null> }>();
  const aproximadas = new Set<string>();
  const canosParaCurar = new Set<string>();

  if (fichas) {
    for (const [endereco, ficha] of fichas) {
      const armaId = armaDaFicha.get(endereco);
      if (!armaId) continue;
      for (const [secao, lista] of ficha.pecas) {
        const slot = SLOT_DA_SECAO[secao];
        for (const { nome, custo } of lista) {
          const casou = casarPecaComo(nome, slot, indice);
          if (casou && casou.como !== 'exato') aproximadas.add(`${secao}: "${nome}" → ${casou.id} (${casou.como})`);
          if (casou) {
            if (idsNovos.has(armaId)) somar(casou.id, armaId);
            continue;
          }
          if (slot === 'barrel' && !idsNovos.has(armaId)) {
            canosParaCurar.add(`${armaId}: ${nome}`);
            continue;
          }
          const k = `peca:${secao}:${chaveDePeca(nome)}`;
          if (ignorar.has(k) || ignorar.has(`peca:${secao}:${nome}`)) continue;
          const grupo = novasPecas.get(k) ?? { secao, nome, porArma: new Map() };
          grupo.porArma.set(armaId, custo);
          novasPecas.set(k, grupo);
        }
      }
    }
  }

  /*
    Arma nova sem ficha nesta rodada: as peças da rodada anterior, se havia
    ficha nela; senão, as da gêmea — que é o que o cadastro fez à mão com as
    armas que a fonte antiga não cobria.
  */
  for (const arma of resultadoArmas) {
    if (fichasDasNovas.has(arma.id)) continue;
    const daAnterior = Object.entries(anterior.compatExtra).filter(([, ids]) => ids.includes(arma.id));
    if (daAnterior.length) {
      for (const [peca] of daAnterior) somar(peca, arma.id);
      continue;
    }
    for (const peca of pecas) if (peca.compat.weapons?.includes(arma.origem.gemea)) somar(peca.id, arma.id);
  }
  for (const id of Object.keys(compatExtra)) if (!pecas.some((p) => p.id === id)) delete compatExtra[id];

  const usados = new Set([...pecas.map((p) => p.id), ...anterior.acessorios.map((p) => p.id)]);
  const anterioresPorFonte = new Map(
    anterior.acessorios.map((p) => [`peca:${p.origem.secao}:${chaveDePeca(p.origem.nomeNaFonte)}`, p]),
  );
  const resultadoPecas: PecaNova[] = [];

  if (fichas) {
    for (const [k, { secao, nome, porArma }] of novasPecas) {
      const antes = anterioresPorFonte.get(k);
      if (antes) {
        /*
          Mantém nome, descrição e id; atualiza só as armas, que crescem com a
          temporada. A união com a rodada anterior segura a arma cuja ficha não
          abriu hoje — mas só arma que existe: a que foi para `ignorar` sai.
        */
        const lista = [...new Set([...(antes.compat.weapons ?? []), ...porArma.keys()])].filter((w) => existentes.has(w));
        resultadoPecas.push({ ...antes, compat: { weapons: lista.sort() } });
      } else {
        resultadoPecas.push(rascunhoDaPeca(secao, nome, porArma, usados, { hoje, fonte: fontes.rnkd }));
      }
    }
  } else {
    // Sem o rnkd, a lista de peças é a da última rodada que o alcançou.
    for (const antes of anterior.acessorios) {
      if (ignorar.has(`peca:${antes.origem.secao}:${chaveDePeca(antes.origem.nomeNaFonte)}`)) continue;
      if (pecas.some((p) => p.id === antes.id)) continue;
      const lista = (antes.compat.weapons ?? []).filter((w) => existentes.has(w));
      if (lista.length) resultadoPecas.push({ ...antes, compat: { weapons: lista } });
    }
  }

  const comCanos = nomearCanos(resultadoPecas, idsNovos, compatExtra, pecas);
  comCanos.sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id));
  resultadoArmas.sort((a, b) => a.id.localeCompare(b.id));
  return {
    armas: resultadoArmas,
    acessorios: comCanos,
    compatExtra,
    imagens,
    semCategoria,
    aproximadas: [...aproximadas].sort(),
    canosParaCurar: [...canosParaCurar].sort(),
  };
}

/* ========================================================================== *
 * Nome e descrição em português
 * ========================================================================== */

/**
 * Pergunta ao modelo o que falta em português: nome e descrição da peça,
 * resumo da arma.
 *
 * Os exemplos são do próprio cadastro, do mesmo slot, para o modelo seguir o
 * vocabulário do site ("Freio Compensado", "Estojo Polimérico"). O que voltar
 * sem nome, ou com o nome vazio, fica com o nome original — melhor um nome em
 * inglês que o jogador reconhece do que uma tradução inventada pela metade.
 */
export function promptDeTraducao(armas: ArmaNova[], pecas: PecaNova[], cadastro: Attachment[]): string {
  const exemplos = [...new Set(pecas.map((p) => p.slot))]
    .flatMap((slot) => cadastro.filter((a) => a.slot === slot && a.provenance === 'game').slice(0, 6))
    .map((a) => `- [${a.slot}] "${a.originalName}" → nome: "${a.name}"; descrição: "${a.description}"`)
    .join('\n');

  const listaDePecas = pecas
    .map((p) => `- id "${p.id}", slot ${p.slot}, nome na fonte "${p.origem.nomeNaFonte}", custo ${p.cost} pts, armas: ${(p.compat.weapons ?? []).join(', ')}`)
    .join('\n');

  const listaDeArmas = armas
    .map(
      (a) =>
        `- id "${a.id}", ${a.name}, categoria ${a.category}: dano ${Math.max(...a.damage.map(([d]) => d))}, ${a.rpm} disparos/min, ${a.velocity} m/s, pente ${a.magazine}, multiplicador na cabeça ${a.headshot}`,
    )
    .join('\n');

  return `Você cadastra peças e armas de Battlefield 6 num site brasileiro. Escreva em português do Brasil.

${pecas.length ? `## Peças novas\n\n${listaDePecas}\n\nPara cada peça:\n- "originalName": o nome em inglês com a caixa certa ("MGO 3.50x", "Multi-Port Brake", "42rnd Fast Mag") — siglas e modelos em maiúscula, palavras comuns só com a inicial.\n- "name": o nome como a localização brasileira do jogo chamaria, seguindo os exemplos. Modelo de mira e sigla não se traduzem ("MGO 3,50x").\n- "description": uma frase curta dizendo o que a peça é, sem inventar número nem efeito que o nome não diz.\n\nExemplos do próprio site:\n${exemplos}\n` : ''}
${armas.length ? `## Armas novas\n\n${listaDeArmas}\n\nPara cada arma, "summary": uma linha sobre o papel dela em combate, no tom destes exemplos — "Fuzil pesado de 7,62 mm: três tiros derrubam, mas o coice cobra pulso firme." Use só os números dados.\n` : ''}
## Resposta

Responda SOMENTE com este JSON, sem cercas de código:

{"pecas":[{"id":"…","originalName":"…","name":"…","description":"…"}],"armas":[{"id":"…","summary":"…"}]}`;
}

const valido = (texto: unknown): texto is string =>
  typeof texto === 'string' && texto.trim().length > 0 && !/TODO/i.test(texto);

export function aplicarTraducao(
  armas: ArmaNova[],
  pecas: PecaNova[],
  resposta: { pecas?: { id?: string; originalName?: string; name?: string; description?: string }[]; armas?: { id?: string; summary?: string }[] } | null,
): void {
  const porPeca = new Map((resposta?.pecas ?? []).map((p) => [p.id, p]));
  for (const peca of pecas) {
    const r = porPeca.get(peca.id);
    if (valido(r?.originalName) && chaveDePeca(r.originalName) === chaveDePeca(peca.origem.nomeNaFonte)) {
      peca.originalName = r.originalName.trim();
    }
    // Cano leva o nome do papel (`nomearCanos`), não o que o modelo sugerir.
    if (peca.slot !== 'barrel' && valido(r?.name)) peca.name = r.name.trim();
    if (!peca.name) peca.name = peca.originalName;
    if (valido(r?.description)) peca.description = r.description.trim();
    if (!peca.description) peca.description = 'Peça nova, cadastrada sozinha a partir da ficha da arma; o efeito ainda não foi medido.';
  }

  const porArma = new Map((resposta?.armas ?? []).map((a) => [a.id, a]));
  for (const arma of armas) {
    const r = porArma.get(arma.id);
    if (valido(r?.summary)) arma.summary = r.summary.trim();
    if (!arma.summary) arma.summary = `${arma.name}: arma nova, com números preliminares da ficha pública.`;
  }
}

async function traduzir(armas: ArmaNova[], pecas: PecaNova[], cadastro: Attachment[]) {
  const pendentesArmas = armas.filter((a) => !a.summary);
  const pendentesPecas = pecas.filter((p) => !p.description);
  if (!pendentesArmas.length && !pendentesPecas.length) return;

  let resposta = null;
  if (temAlgumaChave()) {
    const prompt = promptDeTraducao(pendentesArmas, pendentesPecas, cadastro);
    for await (const candidato of candidatos(modelosDe(process.env.NOVIDADES_MODELS), { busca: false })) {
      try {
        const lida = await perguntarSemBusca(candidato, prompt, { maxOutputTokens: 8000, tentativas: 2 });
        resposta = extrairJson(lida.texto);
        if (resposta) {
          log('tradução', { modelo: candidato.modelo });
          break;
        }
      } catch (erro) {
        log('tradução falhou', { modelo: candidato.modelo, erro: (erro as Error).message });
      }
    }
  }
  if (!resposta) log('tradução', { aviso: 'nenhum modelo respondeu; os itens novos ficam com o nome original' });
  aplicarTraducao(pendentesArmas, pendentesPecas, resposta);
}

/* ========================================================================== *
 * Rodar
 * ========================================================================== */

export function lerArquivo(caminho = ARQUIVO): Novidades {
  if (!existsSync(caminho)) return structuredClone(NOVIDADES_VAZIO);
  return { ...structuredClone(NOVIDADES_VAZIO), ...JSON.parse(readFileSync(caminho, 'utf8')) };
}

/** As armas e o arrasto de cada uma, do BF6-Weapon-Analyzer no commit mais recente do branch. */
async function lerAnalyzer(): Promise<{ armas: ArmaDoAnalyzer[]; arrastos: Record<string, number>; fonte: string }> {
  const { repo, branch = 'main' } = fonteAtiva('numeros_de_simulacao');
  if (!repo) throw new Error('a fonte de numeros_de_simulacao não declara `repo` em data/sources/registry.json');
  const base = `https://raw.githubusercontent.com/${repo}/${branch}/data`;
  const [armas, balistica] = await Promise.all([
    fetchJson<ArmaDoAnalyzer[]>(`${base}/weapons.json`),
    fetchJson<BalisticaDoAnalyzer>(`${base}/ballistics.json`).catch(() => null),
  ]);
  /*
    Lista curta não é "nada de novo": é o arquivo que mudou de forma. Seguir
    adiante leria todas as armas como sumidas e apagaria as novidades.
  */
  if (!Array.isArray(armas) || armas.length < 30) {
    throw new Error(`o weapons.json do Analyzer veio com ${Array.isArray(armas) ? armas.length : 0} armas — o arquivo mudou de forma?`);
  }
  const arrastos: Record<string, number> = {};
  for (const [id, { base: projetil }] of Object.entries(balistica?.weapons ?? {})) {
    const arrasto = projetil ? balistica!.projectiles[projetil]?.dragPerMeter : undefined;
    if (arrasto) arrastos[id] = arrasto;
  }
  return { armas, arrastos, fonte: `https://github.com/${repo}` };
}

/**
 * As fichas do rnkd, ou `null` quando ele não abre.
 *
 * Do GitHub Actions ele não abre: o rnkd recusa (403) quem chega de
 * datacenter. Isso não é falha da rotina — é o site dizendo que não quer esse
 * tráfego —, e por isso a rodada segue sem ele em vez de quebrar.
 */
async function lerRnkd(fonte: string): Promise<Map<string, Ficha> | null> {
  let lista: string[];
  try {
    lista = lerListaDeArmas(await fetchText(`${fonte}/`));
  } catch (erro) {
    const status = erro instanceof FetchFailed ? erro.status : null;
    log('rnkd indisponível — acessórios ficam como a última rodada local deixou', {
      motivo: status === 403 ? '403: o rnkd recusa acesso de datacenter, como o GitHub Actions' : (erro as Error).message,
    });
    return null;
  }
  if (lista.length < 30) {
    log('rnkd indisponível — acessórios ficam como a última rodada local deixou', {
      motivo: `a lista de armas veio com ${lista.length} endereços; a página mudou de forma?`,
    });
    return null;
  }

  const fichas = new Map<string, Ficha>();
  const falhas: string[] = [];
  for (let i = 0; i < lista.length; i += EM_PARALELO) {
    await Promise.all(
      lista.slice(i, i + EM_PARALELO).map(async (endereco) => {
        try {
          fichas.set(endereco, lerFichaDaArma(await fetchText(`${fonte}/${endereco}/`), new URL(fonte).origin));
        } catch (erro) {
          falhas.push(`${endereco}: ${(erro as Error).message}`);
        }
      }),
    );
  }
  if (falhas.length) log('fichas que não abriram', { falhas });
  if (falhas.length > lista.length / 4) {
    log('rnkd indisponível — acessórios ficam como a última rodada local deixou', {
      motivo: `${falhas.length} de ${lista.length} fichas não abriram`,
    });
    return null;
  }
  return fichas;
}

async function main(): Promise<void> {
  const seco = process.argv.includes('--dry-run');
  const hoje = new Date().toISOString().slice(0, 10);
  const temporada = seasonOn(new Date())?.number ?? 0;
  const fonteRnkd = fonteAtiva('enumeracao_de_slot').url.replace(/\/$/, '');
  const anterior = lerArquivo();

  const analyzer = await lerAnalyzer();
  const fichas = await lerRnkd(fonteRnkd);

  const deteccao = detectar({
    analyzer: analyzer.armas,
    arrastos: analyzer.arrastos,
    fichas,
    armas: WEAPONS_CURADAS,
    pecas: ATTACHMENTS_CURADOS,
    anterior,
    hoje,
    temporada,
    fontes: { analyzer: analyzer.fonte, rnkd: fonteRnkd },
  });
  if (deteccao.semCategoria.length) log('armas novas sem categoria reconhecida', { armas: deteccao.semCategoria });
  if (deteccao.aproximadas.length) log('peças casadas por aproximação', { pecas: deteccao.aproximadas });
  if (deteccao.canosParaCurar.length) {
    log('canos da ficha que o cadastro não tem, em arma já cadastrada (curadoria)', { canos: deteccao.canosParaCurar });
  }

  log('novidades', {
    armas: deteccao.armas.map((a) => `${a.id} (gêmea ${a.origem.gemea}${a.origem.fichaDoRnkd ? ', com ficha do rnkd' : ''})`),
    acessorios: deteccao.acessorios.map((p) => `${p.slot}: ${p.origem.nomeNaFonte} — ${(p.compat.weapons ?? []).length} arma(s)`),
    'peças existentes em arma nova': Object.keys(deteccao.compatExtra).length,
    rnkd: fichas ? 'lido' : 'pulado',
  });

  if (seco) {
    log('nada foi gravado (--dry-run)', {});
    return;
  }

  await traduzir(deteccao.armas, deteccao.acessorios, ATTACHMENTS_CURADOS);

  const novo: Novidades = {
    _leiaMe:
      'Gerado por `npm run catalog:novidades` (armas do BF6-Weapon-Analyzer, acessórios do rnkd.gg). Não edite à mão: cure o item em weapons.ts ou attachments.ts (ele sai daqui sozinho) ou ponha a chave dele em `ignorar`.',
    atualizadoEm: anterior.atualizadoEm,
    armas: deteccao.armas,
    acessorios: deteccao.acessorios,
    compatExtra: deteccao.compatExtra,
    imagens: deteccao.imagens,
    ignorar: anterior.ignorar,
  };

  // Só o conteúdo, numa ordem fixa: a data e o texto de ajuda não são novidade.
  const conteudo = (n: Novidades) => JSON.stringify([n.armas, n.acessorios, n.compatExtra, n.imagens, n.ignorar]);
  if (conteudo(novo) === conteudo(anterior)) {
    log('nada novo', {});
    return;
  }
  novo.atualizadoEm = hoje;
  writeFileSync(ARQUIVO, JSON.stringify(novo, null, 2) + '\n', 'utf8');
  log('gravado', { arquivo: 'src/data/novidades.json', armas: novo.armas.length, acessorios: novo.acessorios.length });
}

if (process.argv[1] && process.argv[1].endsWith('novidades.ts')) await main();
