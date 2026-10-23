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
 * ## A fonte
 *
 * O rnkd.gg, que já cumpre o papel `enumeracao_de_slot` na auditoria de
 * acessórios (`perguntar-acessorios.ts`). A ficha de cada arma traz, numa
 * página só, o que o detector precisa: os números base (dano, cadência,
 * velocidade, pente, recarga, mira, multiplicador na cabeça e as quatro
 * barras) e a lista de cada slot, com o custo de cada peça naquela arma.
 *
 * ## O que é novo
 *
 * - **Arma:** endereço da lista do rnkd que não casa com nenhuma arma daqui,
 *   nem pelo id, nem pelo nome, nem pelos apelidos de endereço.
 * - **Acessório:** peça de alguma ficha que não casa com nenhuma peça daqui —
 *   pelo nome original, pelo nome em português, pelo nome por arma, por
 *   prefixo ("Taclight - Hip" é a "Taclight - Hipfire") ou por um erro de
 *   digitação de até dois caracteres ("Thread Protetor"). Casar a mais é o
 *   erro barato: uma peça nova vista como velha só não aparece; uma velha
 *   vista como nova vira peça duplicada no montador.
 *
 * ## O que entra, e com que confiança
 *
 * Tudo vai para `src/data/novidades.json`, que `weapons.ts`, `attachments.ts`
 * e `weapon-images.ts` juntam ao cadastro. Nada aqui reescreve arquivo de
 * código: a curadoria continua sendo `weapons.ts` e `attachments.ts`, e item
 * que for curado lá some daqui sozinho na rodada seguinte.
 *
 * Tudo entra como `curated`, que é o que acende o aviso de valor aproximado na
 * interface. E é aproximado mesmo:
 *
 * - da arma, o rnkd dá o dano máximo, e não a curva; a escada é a da arma mais
 *   parecida da mesma categoria, escalada para o dano novo. Recuo, arrasto,
 *   tempo de saque e modo de tiro também vêm dessa gêmea;
 * - as barras e o tempo de mira daqui não são os números do rnkd: são
 *   calibrados, categoria por categoria, pela razão mediana entre os dois
 *   lados nas armas que existem nos dois;
 * - o efeito do acessório não sai de fonte nenhuma — entra sem efeito (`mods:
 *   {}`). O custo é o que a ficha mostra, e a compatibilidade são as fichas
 *   que listam a peça.
 *
 * O nome em português e as descrições são do modelo (o Claude Haiku primeiro,
 * os gratuitos de reserva — ver `meta/provedores.mjs`), com os nomes do
 * próprio site como exemplo. Sem modelo, a peça entra com o nome original.
 *
 * ## Desfazer
 *
 * Item que não deveria ter entrado não se apaga só do arquivo: a rodada
 * seguinte o traria de volta. Ponha a chave dele em `ignorar`, no próprio
 * `novidades.json` — `arma:<endereço no rnkd>` ou `peca:<Seção>:<nome>`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEAPONS_CURADAS } from '../../src/data/weapons.ts';
import { ATTACHMENTS_CURADOS } from '../../src/data/attachments.ts';
import { seasonOn } from '../../src/data/season.ts';
import type { Attachment, SlotId, Weapon, WeaponCategory } from '../../src/data/types.ts';
import { candidatos, modelosDe, perguntarSemBusca, temAlgumaChave } from '../meta/provedores.mjs';
import { extrairJson } from '../meta/leitura.mjs';
import { fetchText, htmlToText } from './lib/http.ts';
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
  origem: { fonte: string; detectadaEm: string; gemea: string };
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

const mediana = (valores: number[]) => {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
};

const CALIBRADOS = ['accuracy', 'control', 'mobility', 'hipfire', 'adsMs'] as const;
type Calibrado = (typeof CALIBRADOS)[number];

/**
 * Quanto o número daqui vale para cada número do rnkd, categoria por categoria.
 *
 * As barras e o tempo de mira deste site não são os da ficha: o tempo de mira,
 * por exemplo, é o do jogo multiplicado por um fator de categoria (a ELR-40
 * tem 367 ms lá e 815 aqui). A razão mediana entre os dois lados, nas armas que
 * existem nos dois, é a tradução; categoria sem par cai na razão de todas.
 */
export function calibrar(
  pares: { categoria: WeaponCategory; site: Pick<Weapon, Calibrado>; fonte: NumerosDaFicha }[],
): (categoria: WeaponCategory, campo: Calibrado) => number {
  const razoes = new Map<string, number[]>();
  for (const { categoria, site, fonte } of pares) {
    for (const campo of CALIBRADOS) {
      const lado = fonte[campo];
      if (!lado || !site[campo]) continue;
      for (const k of [`${categoria}:${campo}`, `*:${campo}`]) razoes.set(k, [...(razoes.get(k) ?? []), site[campo] / lado]);
    }
  }
  return (categoria, campo) => {
    const daCategoria = razoes.get(`${categoria}:${campo}`) ?? [];
    return mediana(daCategoria.length >= 2 ? daCategoria : (razoes.get(`*:${campo}`) ?? [])) ?? 1;
  };
}

/** A arma daqui mais parecida, na mesma categoria: é dela que vem o que a ficha não publica. */
export function gemeaDe(
  categoria: WeaponCategory,
  numeros: NumerosDaFicha,
  armas: Weapon[],
): Weapon | null {
  const daCategoria = armas.filter((w) => w.category === categoria);
  if (!daCategoria.length) return null;
  const dano = (w: Weapon) => Math.max(...w.damage.map((d) => d.damage));
  const custo = (w: Weapon) =>
    Math.abs(Math.log((numeros.damage ?? dano(w)) / dano(w))) +
    Math.abs(Math.log((numeros.rpm ?? w.rpm) / w.rpm)) +
    0.5 * Math.abs(Math.log((numeros.velocity ?? w.velocity) / w.velocity));
  return [...daCategoria].sort((a, b) => custo(a) - custo(b))[0];
}

const arredondar = (valor: number, casas = 0) => Number(valor.toFixed(casas));

export function rascunhoDaArma(
  endereco: string,
  ficha: Ficha,
  categoria: WeaponCategory,
  gemea: Weapon,
  fator: (categoria: WeaponCategory, campo: Calibrado) => number,
  { hoje, temporada, fonte }: { hoje: string; temporada: number; fonte: string },
): ArmaNova {
  const n = ficha.numeros;
  const danoDaGemea = Math.max(...gemea.damage.map((d) => d.damage));
  const escala = n.damage ? n.damage / danoDaGemea : 1;
  const calibrado = (campo: Calibrado, casas = 0) =>
    n[campo] !== undefined ? arredondar(n[campo]! * fator(categoria, campo), casas) : gemea[campo];
  const reload = n.reload ?? gemea.reload;

  return {
    id: endereco.toLowerCase(),
    name: ficha.nome,
    category: categoria,
    archetype: gemea.archetype,
    summary: '',
    damage: gemea.damage.map((d) => [arredondar(d.damage * escala, 1), d.distance]),
    ...(gemea.pellets > 1 ? { pellets: gemea.pellets } : {}),
    rpm: n.rpm ?? gemea.rpm,
    velocity: n.velocity ?? gemea.velocity,
    drag: gemea.drag,
    headshot: n.headshot ?? gemea.headshot,
    magazine: n.magazine ?? gemea.magazine,
    reload,
    emptyReload: arredondar(reload * (gemea.emptyReload / gemea.reload), 2),
    adsMs: calibrado('adsMs'),
    swapMs: gemea.swapMs,
    accuracy: Math.min(100, calibrado('accuracy')),
    control: Math.min(100, calibrado('control')),
    mobility: Math.min(100, calibrado('mobility')),
    hipfire: Math.min(100, calibrado('hipfire')),
    verticalRecoil: gemea.verticalRecoil,
    horizontalRecoil: gemea.horizontalRecoil,
    fireModes: gemea.fireModes,
    season: temporada,
    provenance: 'curated',
    origem: { fonte, detectadaEm: hoje, gemea: gemea.id },
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

  for (const arma of armasNovas) {
    // Do cadastro: os que a ficha da arma nova lista e os que já a citam pelo id.
    const herdados = canosDoCadastro.filter((a) => compatExtra[a.id]?.includes(arma) || a.compat.weapons?.includes(arma));
    const ocupados = new Set(herdados.map((a) => a.namePerWeapon?.[arma] ?? a.name));
    const daArma = canos.filter((c) => c.compat.weapons?.includes(arma));
    if (!daArma.length && !herdados.length) continue;

    const dez = daArma.filter((c) => c.cost === 10);
    const basico = ocupados.has('Cano Básico')
      ? null
      : (dez.find((c) => /factory|standard|basic/i.test(c.origem.nomeNaFonte)) ?? dez[0] ?? null);

    if (!ocupados.has('Cano Básico') && !basico) {
      for (const c of daArma) tirar(c, arma);
      for (const a of herdados) {
        if (!compatExtra[a.id]) continue;
        compatExtra[a.id] = compatExtra[a.id].filter((w) => w !== arma);
        if (!compatExtra[a.id].length) delete compatExtra[a.id];
      }
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
  /** Endereços cuja categoria a rotina não reconheceu — ficam de fora, e aparecem no log. */
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
 * Compara as fichas com o cadastro e devolve o que é novo.
 *
 * `fichas` é o endereço do rnkd → a ficha lida. `anterior` é o arquivo da
 * rodada passada: o que já estava nele fica como estava (inclusive o nome que o
 * modelo deu), e o que a curadoria levou para `weapons.ts` ou `attachments.ts`
 * sai.
 */
export function detectar(
  fichas: Map<string, Ficha>,
  { armas, pecas, anterior, hoje, temporada, fonte }: {
    armas: Weapon[];
    pecas: Attachment[];
    anterior: Novidades;
    hoje: string;
    temporada: number;
    fonte: string;
  },
): Deteccao {
  const ignorar = new Set(anterior.ignorar);
  const armaDoEndereco = new Map<string, string>();
  const novasArmas: [string, Ficha][] = [];

  for (const [endereco, ficha] of fichas) {
    const id = casarArma(endereco, ficha.nome, armas);
    if (id) armaDoEndereco.set(endereco, id);
    else if (!ignorar.has(`arma:${endereco}`)) novasArmas.push([endereco, ficha]);
  }

  // A calibração e a gêmea saem só das armas que existem nos dois lados.
  const pares = [...armaDoEndereco].map(([endereco, id]) => {
    const site = armas.find((w) => w.id === id)!;
    return { categoria: site.category, site, fonte: fichas.get(endereco)!.numeros };
  });
  const fator = calibrar(pares);

  const jaAnteriores = new Map(anterior.armas.map((a) => [a.id, a]));
  const resultadoArmas: ArmaNova[] = [];
  const imagens: Record<string, { render: string }> = {};
  const semCategoria: string[] = [];

  for (const [endereco, ficha] of novasArmas) {
    const categoria = CATEGORIA_DO_ROTULO[chave(ficha.rotulo)];
    if (!categoria) {
      semCategoria.push(`${endereco} (${ficha.rotulo || 'sem rótulo'})`);
      continue;
    }
    const gemea = gemeaDe(categoria, ficha.numeros, armas);
    if (!gemea) {
      semCategoria.push(`${endereco} (nenhuma arma da categoria ${categoria} para servir de gêmea)`);
      continue;
    }
    const id = endereco.toLowerCase();
    const rascunho = jaAnteriores.get(id) ?? rascunhoDaArma(endereco, ficha, categoria, gemea, fator, { hoje, temporada, fonte });
    resultadoArmas.push(rascunho);
    armaDoEndereco.set(endereco, rascunho.id);
    if (ficha.imagem) imagens[rascunho.id] = { render: ficha.imagem };
  }

  // Peças: o que casa com o cadastro vira compatibilidade extra para arma nova;
  // o que não casa é peça nova.
  const indice = indexarPecas(pecas);
  const idsNovos = new Set(resultadoArmas.map((a) => a.id));
  const compatExtra: Record<string, string[]> = {};
  const novasPecas = new Map<string, { secao: string; nome: string; porArma: Map<string, number | null> }>();
  const aproximadas = new Set<string>();
  const canosParaCurar = new Set<string>();

  for (const [endereco, ficha] of fichas) {
    const armaId = armaDoEndereco.get(endereco);
    if (!armaId) continue;
    for (const [secao, lista] of ficha.pecas) {
      const slot = SLOT_DA_SECAO[secao];
      for (const { nome, custo } of lista) {
        const casou = casarPecaComo(nome, slot, indice);
        const existente = casou?.id;
        if (casou && casou.como !== 'exato') aproximadas.add(`${secao}: "${nome}" → ${casou.id} (${casou.como})`);
        if (existente) {
          if (idsNovos.has(armaId)) compatExtra[existente] = [...new Set([...(compatExtra[existente] ?? []), armaId])].sort();
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

  const usados = new Set([...pecas.map((p) => p.id), ...anterior.acessorios.map((p) => p.id)]);
  const existentes = new Set([...armas.map((w) => w.id), ...idsNovos]);
  const anterioresPorFonte = new Map(
    anterior.acessorios.map((p) => [`peca:${p.origem.secao}:${chaveDePeca(p.origem.nomeNaFonte)}`, p]),
  );
  const resultadoPecas: PecaNova[] = [];
  for (const [k, { secao, nome, porArma }] of novasPecas) {
    const antes = anterioresPorFonte.get(k);
    if (antes) {
      /*
        Mantém nome, descrição e id; atualiza só as armas, que crescem com a
        temporada. A união com a rodada anterior segura a arma cuja ficha não
        abriu hoje — mas só arma que existe: a que foi para `ignorar` sai.
      */
      const armas = [...new Set([...(antes.compat.weapons ?? []), ...porArma.keys()])].filter((w) => existentes.has(w));
      resultadoPecas.push({ ...antes, compat: { weapons: armas.sort() } });
    } else {
      resultadoPecas.push(rascunhoDaPeca(secao, nome, porArma, usados, { hoje, fonte }));
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

async function main(): Promise<void> {
  const seco = process.argv.includes('--dry-run');
  const hoje = new Date().toISOString().slice(0, 10);
  const temporada = seasonOn(new Date())?.number ?? 0;
  const fonte = fonteAtiva('enumeracao_de_slot').url.replace(/\/$/, '');
  const anterior = lerArquivo();

  const lista = lerListaDeArmas(await fetchText(`${fonte}/`));
  /*
    Lista vazia não é "nada de novo": é a página que mudou de forma. Seguir
    adiante gravaria um arquivo sem nenhuma novidade, apagando as anteriores,
    justamente quando a rotina parou de enxergar.
  */
  if (lista.length < 30) {
    throw new Error(`a lista de armas do rnkd veio com ${lista.length} endereços — a página mudou de forma?`);
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
  if (falhas.length > lista.length / 4) throw new Error(`${falhas.length} de ${lista.length} fichas não abriram`);

  const deteccao = detectar(fichas, {
    armas: WEAPONS_CURADAS,
    pecas: ATTACHMENTS_CURADOS,
    anterior,
    hoje,
    temporada,
    fonte,
  });
  if (deteccao.semCategoria.length) log('armas novas sem categoria reconhecida', { armas: deteccao.semCategoria });
  if (deteccao.aproximadas.length) log('peças casadas por aproximação', { pecas: deteccao.aproximadas });
  if (deteccao.canosParaCurar.length) {
    log('canos da ficha que o cadastro não tem, em arma já cadastrada (curadoria)', { canos: deteccao.canosParaCurar });
  }

  log('novidades', {
    armas: deteccao.armas.map((a) => `${a.id} (gêmea ${a.origem.gemea})`),
    acessorios: deteccao.acessorios.map((p) => `${p.slot}: ${p.origem.nomeNaFonte} — ${(p.compat.weapons ?? []).length} arma(s)`),
    'peças existentes em arma nova': Object.keys(deteccao.compatExtra).length,
  });

  if (seco) {
    log('nada foi gravado (--dry-run)', {});
    return;
  }

  await traduzir(deteccao.armas, deteccao.acessorios, ATTACHMENTS_CURADOS);

  const novo: Novidades = {
    _leiaMe:
      'Gerado por `npm run catalog:novidades` a partir do rnkd.gg. Não edite à mão: cure o item em weapons.ts ou attachments.ts (ele sai daqui sozinho) ou ponha a chave dele em `ignorar`.',
    atualizadoEm: anterior.atualizadoEm,
    armas: deteccao.armas,
    acessorios: deteccao.acessorios,
    compatExtra: deteccao.compatExtra,
    imagens: deteccao.imagens,
    ignorar: anterior.ignorar,
  };

  const semData = (n: Novidades) => JSON.stringify({ ...n, atualizadoEm: null, _leiaMe: null });
  if (semData(novo) === semData(anterior)) {
    log('nada novo', {});
    return;
  }
  novo.atualizadoEm = hoje;
  writeFileSync(ARQUIVO, JSON.stringify(novo, null, 2) + '\n', 'utf8');
  log('gravado', { arquivo: 'src/data/novidades.json', armas: novo.armas.length, acessorios: novo.acessorios.length });
}

if (process.argv[1] && process.argv[1].endsWith('novidades.ts')) await main();
