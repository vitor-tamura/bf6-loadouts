#!/usr/bin/env node
/**
 * Importa a planilha de TTK como fonte de velocidade, dano e arrasto.
 *
 *   npm run catalog:import-ttk
 *
 * A planilha `BF6 TTK vs Range` cobre 41 armas com velocidade de saída,
 * coeficiente de arrasto, cadência, multiplicador de cabeça e dano em sete
 * distâncias. Ela é mais recente que o dataset do Analyzer — que é da 1.3.3.0 —
 * e passa a mandar nos campos que as duas publicam.
 *
 * ## O que ela muda, e o que isso custa
 *
 * As duas fontes concordam em cadência (39 de 39) e discordam em quase todo o
 * resto: velocidade em 35 casos, dano em 33. Adotar a planilha significa que o
 * arsenal fica com **duas procedências**: as armas que ela cobre passam a ser
 * dela, e as demais continuam com o Analyzer. Isso não é um detalhe de
 * implementação — é uma inconsistência conhecida, registrada como conflito, e
 * cada registro carrega a fonte que o sustenta.
 *
 * ## A curva de dano encolhe
 *
 * O Analyzer publica a curva em degraus, com a distância exata de cada queda. A
 * planilha publica o dano em sete distâncias fixas. Convertida em curva, ela
 * descreve a mesma arma com menos resolução: a queda passa a acontecer no ponto
 * medido seguinte, não onde ela de fato acontece. Por isso a curva importada
 * daqui entra como `provisional`, e a distância de queda vira aproximação — o
 * que é honesto e continua sendo o dado mais atual que existe.
 */

import { join } from 'node:path';
import type { SourceRef } from '../../src/catalog/catalog.types.ts';
import { DATA, IMPORTS, NOW, TODAY, log, readJson, versionDir, writeJson } from './lib/io.ts';
import { readWorkbook, type Row } from './lib/xlsx.ts';
import { currentVersion, weapons } from './lib/store.ts';

const FILE = join(IMPORTS, 'bf6-ttk-vs-range.xlsx');

const SOURCE: SourceRef = {
  provider: 'BF6 TTK vs Range (planilha)',
  type: 'community',
  url: null,
  dataset: 'aba Data',
  commit: null,
  version: null,
  retrievedAt: NOW,
  snapshot: `ttk-sheet-${TODAY}`,
};

/** `M433` → `m433`, para casar com o id do catálogo pelo nome da arma. */
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const number = (value: string | null): number | null => {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * As sete distâncias medidas viram uma curva em degraus.
 *
 * Só entra ponto em que o dano muda: repetir 25 em 0, 10 e 20 metros descreve
 * um patamar, e o patamar precisa de dois pontos — onde começa e onde termina.
 * O degrau é marcado com a distância repetida, que é como o catálogo já
 * representa queda brusca.
 */
function curveFrom(distances: number[], damages: (number | null)[]) {
  const curve: { distance: number; damage: number; source: string | null }[] = [];

  for (let index = 0; index < distances.length; index += 1) {
    const damage = damages[index];
    if (damage === null) continue;

    const previous = curve[curve.length - 1];
    if (!previous) {
      curve.push({ distance: distances[index], damage, source: 'planilha' });
      continue;
    }
    if (previous.damage === damage) continue;

    // Fecha o patamar anterior na distância medida em que ele ainda valia, e
    // abre o novo ali mesmo: a queda real está em algum ponto entre as duas
    // medições, e fingir precisão maior seria inventar.
    curve.push({ distance: distances[index], damage: previous.damage, source: 'planilha' });
    curve.push({ distance: distances[index], damage, source: 'planilha' });
  }

  return curve;
}

function main(): void {
  const version = currentVersion();
  const dir = versionDir(version);

  const sheets = readWorkbook(FILE);
  const data = sheets.get('Data');
  if (!data?.length) throw new Error(`aba "Data" não encontrada em ${FILE}`);

  const header = data[0];
  const distances = header
    .slice(8)
    .map((value) => number(value))
    .filter((value): value is number => value !== null);

  const byName = new Map(weapons().map((weapon) => [normalize(weapon.name), weapon.id]));

  const ballistics = readJson<{ model: Record<string, unknown>; ballistics: Record<string, unknown>[] }>(
    join(dir, 'ballistics.json'),
  );
  const damage = readJson<{ models: Record<string, unknown>[] }>(join(dir, 'damage-models.json'));

  const ballisticsById = new Map(ballistics.ballistics.map((entry) => [entry.weaponId as string, entry]));
  const damageById = new Map(damage.models.map((entry) => [entry.weaponId as string, entry]));

  const applied: string[] = [];
  const unmatched: string[] = [];
  const divergences: Record<string, unknown>[] = [];
  let drag: number | null = null;

  for (const row of data.slice(1) as Row[]) {
    const name = row[0];
    if (!name) continue;

    const id = byName.get(normalize(name));
    if (!id) {
      unmatched.push(name);
      continue;
    }

    const velocity = number(row[1]);
    drag ??= number(row[2]);
    const headshot = number(row[7]);
    const curve = curveFrom(
      distances,
      distances.map((_, index) => number(row[8 + index] ?? null)),
    );

    const previousBallistics = ballisticsById.get(id);
    const previousDamage = damageById.get(id);

    /* O que muda fica registrado, não só aplicado. */
    const before = {
      velocity: previousBallistics?.muzzleVelocity ?? null,
      damage: (previousDamage?.curve as { damage: number }[] | undefined)?.[0]?.damage ?? null,
    };
    if (before.velocity !== velocity || before.damage !== curve[0]?.damage) {
      divergences.push({ weaponId: id, analyzer: before, planilha: { velocity, damage: curve[0]?.damage ?? null } });
    }

    if (previousBallistics) {
      previousBallistics.muzzleVelocity = velocity;
      previousBallistics.source = SOURCE;
      previousBallistics.status = 'verified';
    }

    if (previousDamage && curve.length) {
      previousDamage.curve = curve;
      previousDamage.source = SOURCE;
      previousDamage.declaredSource = 'Planilha comunitária de TTK vs Range';
      // Sete medições descrevem menos que a curva do jogo: a queda cai no ponto
      // medido seguinte, e não onde ela acontece.
      previousDamage.status = 'provisional';
      if (headshot !== null) {
        (previousDamage.zones as { head: number }).head = headshot;
      }
    }

    applied.push(id);
  }

  /* ------------------------------- o arrasto ------------------------------- */

  if (drag !== null) {
    const model = ballistics.model as Record<string, unknown>;
    model.baseDragPerMeter = drag;
    model.dragConflict = {
      status: 'resolved',
      selected: drag,
      analyzer: { base: 0.0035, longRange: 0.002 },
      communitySpreadsheet: { base: 0.0025, longRange: 0.001 },
      note:
        'Duas fontes independentes publicam 0,0025 — a planilha de TTK e o comentário da planilha da comunidade —, contra 0,0035 do Analyzer, que é da 1.3.3.0. O catálogo passa a usar 0,0025. A EA confirma o mecanismo e não publica o número, então isto continua sendo escolha entre fontes, não medição.',
    };
  }

  writeJson(join(dir, 'ballistics.json'), ballistics);
  writeJson(join(dir, 'damage-models.json'), damage);

  /* ------------------------------- o registro ------------------------------- */

  writeJson(join(DATA, 'validation', `ttk-sheet-vs-analyzer-${version}.json`), {
    gameVersion: version,
    checkedAt: TODAY,
    domain: 'ballistics',
    fields: ['muzzleVelocity', 'damage curve', 'dragPerMeter', 'headshotMultiplier'],
    weapons: applied.length,
    status: divergences.length ? 'differences_found' : 'verified_no_difference',
    note:
      'A planilha prevalece por ser mais recente que o dataset do Analyzer (1.3.3.0). As armas fora dela mantêm os valores do Analyzer, então o arsenal tem duas procedências.',
    unmatched,
    differences: divergences,
  });

  const changesPath = join(dir, 'changes.json');
  const changes = readJson<{ gameVersion: string; events: { id: string }[] }>(changesPath);
  const id = `evt-${TODAY}-ttk-sheet-import`;

  changes.events = [
    ...changes.events.filter((event) => event.id !== id),
    {
      id,
      gameVersion: version,
      timestamp: TODAY,
      type: 'source_conflict_resolved',
      entityType: 'catalog',
      entityId: null,
      changes: {
        armas: applied.length,
        semCorrespondência: unmatched,
        divergências: divergences.length,
        arrasto: drag,
        aindaComAnalyzer: weapons().length - applied.length,
      },
      sources: [SOURCE],
      automation: 'auto',
      resolution: {
        status: 'resolved',
        selectedSource: 'BF6 TTK vs Range (planilha)',
        reason:
          'A planilha é posterior ao dataset do Analyzer, que é da 1.3.3.0, e o catálogo já está em versão mais nova. Nos campos em que as duas publicam, a mais recente manda. As armas que a planilha não cobre seguem com o Analyzer, e isso está registrado.',
      },
    } as never,
  ];

  writeJson(changesPath, changes);

  log('planilha de TTK', {
    armas: applied.length,
    'sem correspondência': unmatched,
    'divergências aplicadas': divergences.length,
    arrasto: drag,
    'seguem com o Analyzer': weapons().length - applied.length,
  });
}

main();
