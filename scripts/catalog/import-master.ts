#!/usr/bin/env node
/**
 * A planilha MASTER como fonte única de armas, peças e compatibilidade.
 *
 *   npm run catalog:import-master
 *
 * `BF6_MASTER_Armas_Attachments_Stats_Compatibilidade_1.4.1.5.xlsx` traz, num
 * arquivo só, o que até aqui vinha de quatro lugares: estatísticas das 62
 * armas, curvas de dano ponto a ponto, custo e efeito de cada peça, e a matriz
 * de compatibilidade inteira — 2.478 relações, **todas com custo**, incluindo
 * as 326 de munição que nenhuma outra fonte publicava.
 *
 * ## O que ela fecha
 *
 * Munição deixa de ser peça sem arma: a planilha diz em que armas cada uma
 * entra e quanto custa. Tempo de mira, recarga, recuo e espalhamento vêm por
 * arma. O custo, que vinha de páginas salvas do navegador, passa a vir da mesma
 * fonte que a compatibilidade — sem risco de uma discordar da outra.
 *
 * ## O que ela não fecha
 *
 * Ergonomia continua sem compatibilidade: a matriz tem sete slots, e
 * `ergonomics` não é um deles. As cinco peças confirmadas por print na M16A4
 * seguem sendo a única fonte disso, e são preservadas.
 *
 * Quatro armas seguem sem tempo de mira, três sem recarga tática e seis sem
 * recarga com pente vazio — são lacunas da fonte, e continuam `null`.
 */

import { join } from 'node:path';
import type { SourceRef } from '../../src/catalog/catalog.types.ts';
import { DATA, IMPORTS, NOW, TODAY, log, readJson, versionDir, writeJson } from './lib/io.ts';
import { readWorkbook, type Row } from './lib/xlsx.ts';
import { attachments, currentVersion } from './lib/store.ts';

const FILE = join(IMPORTS, 'bf6-master-1.4.1.5.xlsx');

const SOURCE: SourceRef = {
  provider: 'BF6 MASTER (planilha)',
  type: 'verified',
  url: null,
  dataset: 'BF6_MASTER_Armas_Attachments_Stats_Compatibilidade_1.4.1.5.xlsx',
  commit: null,
  version: null,
  retrievedAt: NOW,
  snapshot: `master-${TODAY}`,
};

/** A planilha escreve acentos como entidade HTML em algumas células. */
const decode = (value: string | null): string =>
  (value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();

const number = (value: string | null): number | null => {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Lê uma aba como lista de objetos, usando a primeira linha como cabeçalho. */
function table(rows: Row[] | undefined): Record<string, string | null>[] {
  if (!rows?.length) return [];
  const header = rows[0].map((cell) => decode(cell));

  return rows.slice(1).map((row) => {
    const entry: Record<string, string | null> = {};
    header.forEach((name, index) => {
      entry[name] = row[index] ?? null;
    });
    return entry;
  });
}

/**
 * O id da munição carrega o escopo; o da planilha, não.
 *
 * A planilha escreve `standard`, e o catálogo `ammo:standard` — o prefixo existe
 * para a munição não colidir com peça de outro slot de mesmo nome curto. Sem
 * recolocá-lo, as 326 relações de munição nascem apontando para ids que não
 * existem, e o validador as recusa uma a uma.
 */
const scoped = (attachmentId: string, slot: string) =>
  slot === 'ammo' && !attachmentId.startsWith('ammo:') ? `ammo:${attachmentId}` : attachmentId;

function main(): void {
  const version = currentVersion();
  const dir = versionDir(version);
  const sheets = readWorkbook(FILE);

  const weaponRows = table(sheets.get('Armas'));
  const curveRows = table(sheets.get('Curvas de Dano'));
  const attachmentRows = table(sheets.get('Attachment Stats'));
  const compatRows = table(sheets.get('Compatibilidade'));
  const magazineRows = table(sheets.get('Carregadores'));
  const pendingRows = table(sheets.get('Pendencias'));

  if (!weaponRows.length || !compatRows.length) {
    throw new Error(`planilha sem as abas Armas e Compatibilidade: ${FILE}`);
  }

  /* ------------------------------ estatísticas ------------------------------ */

  const statsPath = join(dir, 'stats.json');
  const stats = readJson<{ gameVersion: string; stats: { weaponId: string; stats: Record<string, number | null>; source: SourceRef }[] }>(
    statsPath,
  );
  const statsById = new Map(stats.stats.map((entry) => [entry.weaponId, entry]));

  for (const row of weaponRows) {
    const id = decode(row.weapon_id);
    const entry = statsById.get(id);
    if (!entry) continue;

    entry.stats = {
      ...entry.stats,
      rpm: number(row.rpm),
      magazineCapacity: number(row.mag_capacity),
      adsMs: number(row.ads_time_ms),
      reload: number(row.tactical_reload_s),
      emptyReload: number(row.empty_reload_s),
      velocity: number(row.bullet_velocity_mps),
      verticalRecoil: number(row.recoil_amount),
      horizontalRecoil: number(row.recoil_variation),
      spreadMax: number(row.spread_max),
    };
    entry.source = SOURCE;
  }

  writeJson(statsPath, stats);

  /* ------------------------------ curvas de dano ------------------------------ */

  const damagePath = join(dir, 'damage-models.json');
  const damage = readJson<{ gameVersion: string; models: Record<string, unknown>[] }>(damagePath);
  const damageById = new Map(damage.models.map((model) => [model.weaponId as string, model]));

  const curves = new Map<string, { distance: number; damage: number; source: string | null }[]>();
  for (const row of curveRows) {
    const id = decode(row.weapon_id);
    const distance = number(row.distance_m);
    const value = number(row.damage);
    if (distance === null || value === null) continue;

    if (!curves.has(id)) curves.set(id, []);
    curves.get(id)!.push({ distance, damage: value, source: decode(row.point_source) || null });
  }

  let curvesApplied = 0;
  for (const [id, curve] of curves) {
    const model = damageById.get(id);
    if (!model) continue;

    model.curve = curve;
    model.source = SOURCE;
    model.declaredSource = decode(curveRows.find((row) => decode(row.weapon_id) === id)?.provenance ?? null);
    /*
     * O status vem da planilha, não daqui: ela marca as curvas como
     * `provisional` porque o levantamento original as marca assim. Promovê-las
     * a verificadas seria inventar confiança que a fonte não dá.
     */
    model.status = decode(curveRows.find((row) => decode(row.weapon_id) === id)?.status ?? 'provisional');
    curvesApplied += 1;
  }

  writeJson(damagePath, damage);

  /* --------------------------- custo e efeito das peças --------------------------- */

  const effectsPath = join(dir, 'effects.json');
  const effects = readJson<{ gameVersion: string; effects: { attachmentId: string; cost: number | null; effects: Record<string, unknown>; source: SourceRef }[] }>(
    effectsPath,
  );
  const effectById = new Map(effects.effects.map((entry) => [entry.attachmentId, entry]));

  /** As colunas que descrevem a peça, e não o efeito dela. */
  const META = new Set(['id', 'name', 'category', 'slot', 'pts']);

  let costsApplied = 0;
  /** O que a planilha mudou sobre valores que vinham de print de tela. */
  const overriddenGame: { id: string; game: number | null; sheet: number }[] = [];

  const applyCost = (id: string, cost: number | null, extra?: Record<string, unknown>) => {
    const entry = effectById.get(id);
    if (!entry || cost === null) return;

    // A planilha manda também no custo: onde ela diverge do que a print
    // mostrava, o valor dela entra e a divergência fica registrada.
    if (entry.source?.provider === 'jogo' && entry.cost !== cost) {
      overriddenGame.push({ id, game: entry.cost, sheet: cost });
    }

    if (entry.cost !== cost) costsApplied += 1;
    entry.cost = cost;
    entry.source = SOURCE;
    if (extra && Object.keys(extra).length) entry.effects = extra;
  };

  for (const row of attachmentRows) {
    const id = decode(row.id);
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (META.has(key) || value === null || value === '') continue;
      const parsed = number(value);
      extra[key] = parsed === null ? decode(value) : parsed;
    }
    applyCost(scoped(id, decode(row.slot)), number(row.pts), extra);
  }

  /* --------------------------- a matriz de compatibilidade --------------------------- */

  const compatPath = join(dir, 'compatibility.json');

  /*
   * As relações confirmadas por print são preservadas.
   *
   * A matriz da planilha não tem o slot `ergonomics`, e a tela do jogo é a
   * única fonte que já disse quais peças de ergonomia a M16A4 aceita. Trocar a
   * matriz inteira apagaria isso sem que nada tomasse o lugar.
   */
  /*
   * A planilha substitui a matriz inteira.
   *
   * Nada é preservado de importações anteriores — nem relação confirmada por
   * print, nem relação anunciada em patch note. A planilha é a fonte, e o que
   * não está nela não está no catálogo.
   *
   * O custo disso é concreto e fica registrado: as cinco peças de ergonomia da
   * M16A4 saem (a planilha não tem o slot `ergonomics`), as quatro relações do
   * Extended Barrel saem (a base é 1.3.3.0, anterior à Temporada 4) e o 50 MW
   * Violet volta às 55 armas da matriz original, contra as quatro que o estado
   * atual do jogo mostrava.
   */
  const keep: Record<string, unknown>[] = [];

  const seen = new Set(keep.map((row) => `${row.weaponId}|${row.attachmentId}`));
  const relations: Record<string, unknown>[] = [...keep];

  /** O slot que cada peça declara para si — a referência da conferência. */
  const slotOf = new Map(attachments().map((attachment) => [attachment.id, attachment.slot]));

  const mismatched: { weaponId: string; attachmentId: string; matrix: string; declared: string }[] = [];
  let skippedNone = 0;

  const addRelation = (weaponId: string, rawAttachment: string, slot: string) => {
    const attachmentId = scoped(rawAttachment, slot);

    // "none" é a opção de deixar o slot vazio na interface, não uma peça.
    if (attachmentId === 'none' || attachmentId === 'ammo:none') {
      skippedNone += 1;
      return;
    }

    const key = `${weaponId}|${attachmentId}`;
    if (!weaponId || !attachmentId || seen.has(key)) return;

    /*
     * A planilha herda a contradição do levantamento original: as cinco
     * empunhaduras da vz61 aparecem na matriz sob `laser`, e as peças declaram
     * `underbarrel`. Elas entram como pendência, no slot que a peça declara —
     * a mesma decisão tomada na importação inicial, e pelo mesmo motivo: qual
     * dos dois lados está certo é pergunta para quem tem o jogo aberto.
     */
    const declared = slotOf.get(attachmentId);
    const divergent = declared !== undefined && declared !== slot;
    if (divergent) mismatched.push({ weaponId, attachmentId, matrix: slot, declared: declared! });

    seen.add(key);
    relations.push({
      gameVersion: version,
      weaponId,
      attachmentId,
      slot: divergent ? declared! : slot,
      status: divergent ? 'needs_review' : 'active',
      source: SOURCE,
      note: divergent
        ? `A matriz da planilha registra esta relação no slot "${slot}", e a peça declara "${declared}". Confirmar no jogo antes de ativar.`
        : null,
    });
  };

  for (const row of compatRows) {
    const slot = decode(row.slot);
    addRelation(decode(row.weapon_id), decode(row.attachment_id), slot);
    applyCost(scoped(decode(row.attachment_id), slot), number(row.cost_points));
  }

  // Carregadores vêm em aba própria: são peças de uma arma só.
  for (const row of magazineRows) {
    addRelation(decode(row.weapon_id), decode(row.magazine_id), 'magazine');
    applyCost(decode(row.magazine_id), number(row.cost_points));
  }

  relations.sort(
    (a, b) =>
      String(a.weaponId).localeCompare(String(b.weaponId)) ||
      String(a.slot).localeCompare(String(b.slot)) ||
      String(a.attachmentId).localeCompare(String(b.attachmentId)),
  );

  writeJson(compatPath, { gameVersion: version, compatibility: relations });
  writeJson(effectsPath, effects);

  /* -------------------------------- o registro -------------------------------- */

  const pending = pendingRows.map((row) => ({
    item: decode(row.item),
    status: decode(row.status),
    reason: decode(row.reason),
  }));

  writeJson(join(DATA, 'validation', `master-import-${version}.json`), {
    gameVersion: version,
    checkedAt: TODAY,
    source: SOURCE,
    weapons: weaponRows.length,
    curves: curvesApplied,
    attachments: attachmentRows.length,
    relations: relations.length,
    costsApplied,
    overriddenGame,
    slotMismatch: mismatched,
    pending,
  });

  const changesPath = join(dir, 'changes.json');
  const changes = readJson<{ gameVersion: string; events: ({ id: string } & Record<string, unknown>)[] }>(
    changesPath,
  );
  const id = `evt-${TODAY}-master-import`;

  changes.events = [
    ...changes.events.filter((event) => event.id !== id),
    {
      id,
      gameVersion: version,
      timestamp: TODAY,
      type: 'initial_import',
      entityType: 'catalog',
      entityId: null,
      changes: {
        armas: weaponRows.length,
        curvas: curvesApplied,
        peças: attachmentRows.length,
        relações: relations.length,
        custosAplicados: costsApplied,
        divergênciasDeSlot: mismatched,
        opçõesVaziasIgnoradas: skippedNone,

        sobrescritosSobreAPrint: overriddenGame,
        pendências: pending,
      },
      sources: [SOURCE],
      automation: 'auto',
      resolution: {
        status: 'resolved',
        selectedSource: 'BF6 MASTER (planilha)',
        reason:
          'A planilha reúne estatísticas, curvas, custos e compatibilidade num arquivo só, com custo em todas as relações e as 326 de munição que nenhuma outra fonte publicava. Vira a fonte primária desses campos; o que a tela do jogo confirmou continua acima dela.',
      },
    },
  ];

  writeJson(changesPath, changes);

  log('planilha MASTER', {
    armas: weaponRows.length,
    curvas: curvesApplied,
    'peças': attachmentRows.length,
    'relações': relations.length,
    'custos aplicados': costsApplied,
    'divergências de slot': mismatched.length,
    'sobrescritos sobre a print': overriddenGame.length,
  });
}

main();
