#!/usr/bin/env node
/**
 * O site contra o BattlefieldMeta, acessório por acessório, arma por arma.
 *
 *   npm run catalog:conferir-battlefieldmeta              # lê, compara e grava
 *   npm run catalog:conferir-battlefieldmeta -- --dry-run # só mostra
 *
 * Em 16/11/2026 a Slim Handstop aparecia no site com o nome e o preço da Slim
 * Angled, e só um print do jogo mostrou. Os custos e a compatibilidade vêm dos
 * arquivos do jogo (`sincronizar-analyzer.ts`); esta conferência é a segunda
 * opinião, de uma base mantida por gente que joga.
 *
 * Cada divergência se resolve sozinha, sem issue e sem gente, por uma regra só:
 * **quem decide é o arquivo do jogo**. O BattlefieldMeta às vezes está atrás do
 * jogo — a munição Frangível custava 20 antes de um patch e 15 depois, e ele
 * ainda diz 20 —, então ele vale só onde o jogo cala:
 *
 * - `jogo`: o arquivo do jogo dá a peça (ou a nega) para a arma; o site segue
 *   o jogo pela sincronização, e o BattlefieldMeta está atrasado;
 * - `curadoria`: a peça tem trava escrita à mão (`TRAVAS_DA_CURADORIA`), com o
 *   motivo — o Gatilho de Competição que o estúdio desligou na EF88;
 * - `battlefieldmeta`: o jogo não diz o preço da peça naquela arma; vale o do
 *   BattlefieldMeta, que vai para `data/sources/battlefieldmeta-precos.json` e
 *   a sincronização aplica na rodada seguinte.
 *
 * O resultado fica em `data/validation/battlefieldmeta-conferencia.json`, sem
 * data, para o arquivo só mudar quando a lista muda, e no resumo da execução
 * (`GITHUB_STEP_SUMMARY`).
 *
 * Duas espécies de divergência entram na lista:
 *
 * - `custo`: a peça existe nos dois lados para a arma e o preço difere;
 * - `faltaNoSite`: o BattlefieldMeta dá a peça à arma e o site não tem nenhuma
 *   peça com aquele nome no slot.
 *
 * A peça que o site tem e o BattlefieldMeta não fica de fora: ele demora a
 * cadastrar peça nova (a Vertical Emborrachada, o Módulo Acionado), e a lista
 * viraria ruído.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { attachmentsForWeapon } from '../../src/data/attachments.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import type { Attachment, Weapon } from '../../src/data/types.ts';
import { fetchJson } from './lib/http.ts';
import { ROOT, log } from './lib/io.ts';
import {
  CUSTO_DO_CANO_NO_SITE,
  ID_NO_BATTLEFIELDMETA,
  TRAVAS_DA_CURADORIA,
  casarArmas,
  chaveDeNome,
  chavesDaPeca,
  configsDeSlot,
  dadosDe,
  jsonLegivel,
  lerAnalyzer,
  type DadosDoAnalyzer,
} from './sincronizar-analyzer.ts';

export const ARQUIVO = join(ROOT, 'data', 'validation', 'battlefieldmeta-conferencia.json');

/** O preço do BattlefieldMeta onde o jogo não diz nenhum: a sincronização o aplica. */
export const PRECOS = join(ROOT, 'data', 'sources', 'battlefieldmeta-precos.json');

/** Slot do BattlefieldMeta → slots daqui. */
const SLOTS: Record<string, string[]> = {
  scope: ['sight'],
  muzzle: ['muzzle'],
  barrel: ['barrel'],
  // Nas pistolas o BattlefieldMeta põe laser e lanterna no "underbarrel"; aqui eles moram nos trilhos.
  underbarrel: ['underbarrel', 'leftRail', 'rightRail'],
  magazine: ['magazine'],
  ammunition: ['ammo'],
  ergonomics: ['ergonomics'],
  'optic-accessory': ['opticAccessory'],
  'left-accessory': ['leftRail', 'rightRail'],
  'right-accessory': ['leftRail', 'rightRail'],
  'top-accessory': ['leftRail', 'rightRail'],
};

/** Nome que o BattlefieldMeta guarda para o papel quando não cadastrou a peça: não é peça. */
const MARCADORES = new Set(['BASIC', 'SHORT', 'EXTENDED', 'HEAVY', 'HEAVY EXT.', 'LIGHT', 'CRYO', 'NONE', '']);

export interface PecaDoBattlefieldMeta {
  slotId?: string;
  name?: string;
  point?: number | null;
}

export interface Divergencia {
  arma: string;
  slot: string;
  peca: string;
  tipo: 'custo' | 'faltaNoSite';
  site?: number;
  battlefieldmeta?: number;
  /** A peça do site em que a divergência foi achada, quando existe. */
  idNoSite?: string;
  decisao?: 'jogo' | 'curadoria' | 'battlefieldmeta';
  jogo?: number | null;
}

/** O que o arquivo do jogo diz de cada arma: as chaves das peças (as de `sincronizar-analyzer`) e o preço. */
export type Jogo = Map<string, Map<string, number>>;

export function oQueOJogoDiz(dados: DadosDoAnalyzer, armas: Weapon[]): Jogo {
  const { pares } = casarArmas(armas, dados.armas);
  const configs = configsDeSlot(dados);
  const jogo: Jogo = new Map();
  for (const [site, fora] of pares) {
    const precos = new Map<string, number>();
    for (const config of configs) {
      for (const item of config.itens(fora) ?? []) {
        precos.set(`id:${item.id}`, item.pts);
        precos.set(`nome:${chaveDeNome(item.nome)}`, item.pts);
      }
    }
    for (const pente of Object.values(dados.pecas.WEAPON_MAG[fora]?.mags ?? {})) {
      precos.set(chave(`${pente.mag} ${/fast/i.test(pente.name) ? 'FAST' : 'RND'}`), pente.pts);
    }
    jogo.set(site, precos);
  }
  return jogo;
}

/** A decisão de cada divergência pela regra do cabeçalho. */
export function decidir(d: Divergencia, jogo: Jogo, armas: Weapon[], todas: Attachment[]): Divergencia {
  const pecas = d.idNoSite ? todas.filter((p) => p.id === d.idNoSite) : todas.filter((p) => chave(p.originalName) === chave(d.peca));
  if (pecas.some((p) => TRAVAS_DA_CURADORIA[p.id]?.armas.includes(d.arma))) return { ...d, decisao: 'curadoria', jogo: null };
  const precos = jogo.get(d.arma);
  // Arma que o jogo não cobre: só o BattlefieldMeta fala.
  if (!precos) return { ...d, decisao: 'battlefieldmeta', jogo: null };
  if (d.slot === 'barrel') return { ...d, decisao: 'jogo', jogo: d.site ?? null };
  const ids = armas.map((w) => w.id);
  const chaves = [chave(d.peca), ...pecas.flatMap((p) => chavesDaPeca(p, ids)), `nome:${chaveDeNome(d.peca)}`];
  const preco = chaves.map((k) => precos.get(k)).find((v) => v !== undefined);
  if (preco !== undefined) return { ...d, decisao: 'jogo', jogo: preco };
  // O jogo enumera a arma e não tem a peça: para a falta, ele já decidiu que não há.
  if (d.tipo === 'faltaNoSite') return { ...d, decisao: 'jogo', jogo: null };
  // O site tem a peça, o jogo não lhe dá preço: vale o do BattlefieldMeta.
  return { ...d, decisao: 'battlefieldmeta', jogo: null };
}

/** O nome dos dois lados na mesma chave: "HYBRID SUPPRESSOR [K]", "20 RND", "45 FAST". */
export function chave(nome: string): string {
  const limpo = nome.trim().toUpperCase();
  // Carregador pela capacidade e pelo tipo: "100 RND" é o "100RND Belt Pouch" da M60, "6 RND" o "6 Shell Tube".
  const pente = /^(\d+)\s*(?:RND|SHELL)?\b(.*)$/.exec(limpo);
  if (pente && /^(|MAGAZINE|MAG|FAST|FAST MAG|DRUM|DRUM MAG|BELT|BELT POUCH|BELT BOX|LOOSE BELT|TUBE|SHELL TUBE|SPEEDLOADER|MOON CLIP|BOX)$/.test(pente[2].trim())) {
    return `pente:${pente[1]}:${/FAST/.test(pente[2]) ? 'rapido' : 'comum'}`;
  }
  return chaveDeNome(
    limpo
      .replace(/\[(\w)\]/, '($1)')
      .replace(/^MOUNT$/, 'UNDERSLUNG MOUNT')
      .replace(/\bSIGHTS\b/, 'SIGHT')
      .replace(/\bRECIEVER\b/, 'RECEIVER')
      .replace(/^SYNTHETIC TIP$/, 'SYNTHETIC'),
  );
}

/** O custo que o site cobra na arma: o do cano sai do papel dele ali (`attachmentCost`). */
function custoNoSite(peca: Attachment, arma: Weapon): number {
  if (peca.slot !== 'barrel') return peca.cost;
  return CUSTO_DO_CANO_NO_SITE[peca.namePerWeapon?.[arma.id] ?? peca.name] ?? peca.cost;
}

/** As divergências de uma arma. */
export function conferirArma(arma: Weapon, lista: PecaDoBattlefieldMeta[], doSite = attachmentsForWeapon(arma)): Divergencia[] {
  const divergencias = new Map<string, Divergencia>();
  for (const item of lista) {
    const slots = SLOTS[item.slotId ?? ''];
    const nome = String(item.name ?? '').trim();
    if (!slots || MARCADORES.has(nome.toUpperCase()) || typeof item.point !== 'number') continue;
    const candidatas = slots.flatMap((s) => doSite.get(s as never) ?? []).filter((p) => chave(p.originalName) === chave(nome));
    const id = `${arma.id}|${item.slotId}|${chave(nome)}`;
    if (!candidatas.length) {
      divergencias.set(id, { arma: arma.id, slot: item.slotId!, peca: nome, tipo: 'faltaNoSite', battlefieldmeta: item.point });
      continue;
    }
    // O site repete peça (a geral e a variante da arma): basta uma no preço.
    const custos = candidatas.map((p) => custoNoSite(p, arma));
    if (custos.includes(item.point)) {
      divergencias.delete(id);
      continue;
    }
    if (!divergencias.has(id)) {
      divergencias.set(id, {
        arma: arma.id,
        slot: item.slotId!,
        peca: nome,
        tipo: 'custo',
        site: custos[0],
        battlefieldmeta: item.point,
        idNoSite: candidatas[0].id,
      });
    }
  }
  return [...divergencias.values()];
}

const chaveDe = (d: Divergencia) => `${d.tipo}|${d.arma}|${d.slot}|${chave(d.peca)}|${d.site ?? ''}|${d.battlefieldmeta ?? ''}`;

const RESOLUCAO: Record<NonNullable<Divergencia['decisao']>, string> = {
  jogo: 'vale o arquivo do jogo',
  curadoria: 'vale a trava da curadoria',
  battlefieldmeta: 'vale o BattlefieldMeta (aplicado)',
};

function resumo(divergencias: Divergencia[], novas: Divergencia[], lidas: number): string {
  const linha = (d: Divergencia) =>
    `| ${d.arma} | ${d.slot} | ${d.peca} | ${
      d.tipo === 'custo' ? `site ${d.site}, BattlefieldMeta ${d.battlefieldmeta}` : `o site não tem (BattlefieldMeta: ${d.battlefieldmeta} pts)`
    }${d.jogo != null ? `, jogo ${d.jogo}` : ''} | ${RESOLUCAO[d.decisao ?? 'jogo']} |`;
  const por = (decisao: Divergencia['decisao']) => divergencias.filter((d) => d.decisao === decisao).length;
  return [
    '## Conferência com o BattlefieldMeta',
    '',
    `${lidas} armas lidas, ${divergencias.length} divergências, todas resolvidas: ${por('jogo')} pelo arquivo do jogo, ${por('curadoria')} pela curadoria e ${por('battlefieldmeta')} pelo BattlefieldMeta, onde o jogo não diz o preço. ${novas.length} novas desde a última conferência.`,
    '',
    ...(novas.length ? ['### Novas', '', '| Arma | Slot | Peça | Divergência | Resolução |', '|---|---|---|---|---|', ...novas.map(linha), ''] : []),
  ].join('\n');
}

async function main() {
  const seco = process.argv.includes('--dry-run');
  const armas = WEAPONS.filter((w) => w.category !== 'melee');
  const anterior: Divergencia[] = existsSync(ARQUIVO) ? (JSON.parse(readFileSync(ARQUIVO, 'utf8')).divergencias ?? []) : [];

  const { arquivos } = await lerAnalyzer();
  const jogo = oQueOJogoDiz(dadosDe(arquivos), armas);
  const todas = armas.flatMap((w) => [...attachmentsForWeapon(w).values()].flat());

  const divergencias: Divergencia[] = [];
  let lidas = 0;
  // `--de-arquivo=<json>`: as respostas já baixadas, { id: lista }, para conferir sem rede.
  const deArquivo = process.argv.find((a) => a.startsWith('--de-arquivo='))?.split('=')[1];
  const baixadas: Record<string, PecaDoBattlefieldMeta[]> | null = deArquivo ? JSON.parse(readFileSync(deArquivo, 'utf8')) : null;
  for (const arma of armas) {
    try {
      const idLa = ID_NO_BATTLEFIELDMETA[arma.id] ?? arma.id;
      const resposta = baixadas
        ? { data: Array.isArray(baixadas[idLa]) ? baixadas[idLa] : [] }
        : await fetchJson<{ data?: PecaDoBattlefieldMeta[] }>(`https://app.battlefieldmeta.gg/api/weapons/${idLa}/unlocked-attachments`);
      if (!resposta.data?.length) continue;
      lidas += 1;
      divergencias.push(...conferirArma(arma, resposta.data).map((d) => decidir(d, jogo, armas, todas)));
    } catch {
      // Arma que o BattlefieldMeta não lista ainda (a NSW4 na semana em que saiu): sem conferência.
    }
  }

  // Sem leitura nenhuma (site fora do ar), a lista anterior fica: zerar seria dizer que tudo bate.
  if (!lidas) {
    log('conferência com o BattlefieldMeta', { aviso: 'nenhuma arma lida; a lista anterior fica como está' });
    return;
  }

  divergencias.sort((a, b) => chaveDe(a).localeCompare(chaveDe(b)));
  const conhecidas = new Set(anterior.map(chaveDe));
  const novas = divergencias.filter((d) => !conhecidas.has(chaveDe(d)));

  log('conferência com o BattlefieldMeta', {
    lidas,
    custos: divergencias.filter((d) => d.tipo === 'custo').length,
    faltaNoSite: divergencias.filter((d) => d.tipo === 'faltaNoSite').length,
    novas: novas.length,
  });

  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo(divergencias, novas, lidas) + '\n');
  if (seco) {
    console.log(resumo(divergencias, novas, lidas));
    return;
  }
  writeFileSync(
    ARQUIVO,
    jsonLegivel({
      _leiaMe:
        'Escrito por `npm run catalog:conferir-battlefieldmeta`: onde o custo ou a lista de acessórios do site difere do BattlefieldMeta, e como cada divergência foi resolvida (`decisao`). Vale o arquivo do jogo; o BattlefieldMeta só onde o jogo não diz o preço.',
      divergencias,
    }),
    'utf8',
  );
  // O preço do BattlefieldMeta onde o jogo cala: a sincronização o aplica (`precosDoBattlefieldMeta`).
  const precos = divergencias
    .filter((d) => d.decisao === 'battlefieldmeta' && d.tipo === 'custo' && d.idNoSite && typeof d.battlefieldmeta === 'number')
    .map((d) => ({ arma: d.arma, peca: d.idNoSite!, custo: d.battlefieldmeta! }));
  writeFileSync(
    PRECOS,
    jsonLegivel({
      _leiaMe:
        'Escrito por `npm run catalog:conferir-battlefieldmeta`: o preço do BattlefieldMeta para peça que o site tem e o arquivo do jogo não precifica naquela arma. A sincronização o aplica.',
      precos,
    }),
    'utf8',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
