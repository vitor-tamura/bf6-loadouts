#!/usr/bin/env node
/**
 * A conferência do catálogo inteiro.
 *
 *   npm run catalog:validate
 *
 * Roda antes de qualquer publicação e é o que separa "o pipeline terminou" de
 * "o pipeline acertou". A automação abre Pull Request sozinha; sem uma trava
 * mecânica, a primeira coisa que ela publicaria seria uma relação apontando
 * para uma arma que não existe mais — e ninguém percebe isso lendo um diff de
 * duas mil linhas.
 *
 * Erro derruba a execução. Aviso não: uma pendência conhecida — as munições sem
 * compatibilidade, um custo que a fonte não publica — precisa ficar visível sem
 * travar o resto do catálogo, senão a saída seria apagar a pendência para o
 * pipeline voltar a rodar, que é o contrário do que se quer.
 */

import type { RelationStatus } from '../../src/catalog/catalog.types.ts';
import {
  INDEXES,
  isGameVersion,
  compareVersions,
  listVersions,
  readJsonIf,
  log,
  versionDir,
} from './lib/io.ts';
import { join } from 'node:path';

/** O mínimo que todo registro de simulação tem: a arma e a confiança. */
interface SimEntry {
  weaponId: string;
  status: string;
}

interface DamageEntry extends SimEntry {
  curve: { distance: number; damage: number }[];
}
import { buildIndexes } from './lib/indexes.ts';
import {
  attachments,
  categories,
  compatibility,
  currentVersion,
  effects,
  metadata,
  slots,
  stats,
  versionAttachments,
  versionWeapons,
  weapons,
} from './lib/store.ts';

const errors: string[] = [];
const warnings: string[] = [];

const fail = (message: string) => errors.push(message);
const warn = (message: string) => warnings.push(message);

/** Só as dez primeiras ocorrências de cada família — o resto é ruído. */
function report(kind: 'erro' | 'aviso', label: string, items: string[]) {
  if (!items.length) return;
  const push = kind === 'erro' ? fail : warn;
  for (const item of items.slice(0, 10)) push(`${label}: ${item}`);
  if (items.length > 10) push(`${label}: e mais ${items.length - 10}`);
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function main(): void {
  const version = currentVersion();
  const versions = listVersions();

  const weaponList = weapons();
  const attachmentList = attachments();
  const categoryIds = new Set(categories().map((c) => c.id));
  const slotIds = new Set(slots().map((s) => s.id));
  const weaponIds = new Set(weaponList.map((w) => w.id));
  const attachmentIds = new Set(attachmentList.map((a) => a.id));

  /* --------------------------------- ids --------------------------------- */

  report('erro', 'id de arma repetido', duplicates(weaponList.map((w) => w.id)));
  report('erro', 'id de acessório repetido', duplicates(attachmentList.map((a) => a.id)));
  report(
    'erro',
    'arma sem id ou sem nome',
    weaponList.filter((w) => !w.id || !w.name).map((w) => w.id || '(sem id)'),
  );
  report(
    'erro',
    'acessório sem id ou sem nome',
    attachmentList.filter((a) => !a.id || !a.name).map((a) => a.id || '(sem id)'),
  );

  /* -------------------------------- armas -------------------------------- */

  report(
    'erro',
    'categoria inexistente',
    weaponList.filter((w) => !categoryIds.has(w.category)).map((w) => `${w.id} → ${w.category}`),
  );

  /* ----------------------------- acessórios ----------------------------- */

  report(
    'erro',
    'slot inexistente',
    attachmentList.filter((a) => !slotIds.has(a.slot)).map((a) => `${a.id} → ${a.slot}`),
  );
  report(
    'erro',
    'peça de arma sem arma dona',
    attachmentList
      .filter((a) => a.scope === 'weapon' && (!a.weaponScope || !weaponIds.has(a.weaponScope)))
      .map((a) => `${a.id} → ${a.weaponScope ?? 'null'}`),
  );

  /* ----------------------------- ciclo de vida ----------------------------- */

  const lifecycle = [...weaponList, ...attachmentList];
  report(
    'erro',
    'versão de introdução inválida',
    lifecycle.filter((e) => !isGameVersion(e.introducedIn)).map((e) => `${e.id} → ${e.introducedIn}`),
  );
  report(
    'erro',
    'removido antes de existir',
    lifecycle
      .filter((e) => e.removedIn && compareVersions(e.removedIn, e.introducedIn) < 0)
      .map((e) => `${e.id} (${e.introducedIn} → ${e.removedIn})`),
  );
  report(
    'erro',
    'status removed sem removedIn',
    lifecycle.filter((e) => e.status === 'removed' && !e.removedIn).map((e) => e.id),
  );
  report(
    'erro',
    'removedIn com status ativo',
    lifecycle.filter((e) => e.removedIn && e.status === 'active').map((e) => e.id),
  );

  /* --------------------------------- fontes --------------------------------- */

  report(
    'erro',
    'registro sem procedência',
    lifecycle.filter((e) => !e.source?.provider || !e.source?.type).map((e) => e.id),
  );
  report(
    'erro',
    'dado marcado como inferido',
    lifecycle.filter((e) => e.source?.type === 'inferred').map((e) => e.id),
  );

  /* ------------------------------ cada versão ------------------------------ */

  for (const current of versions) {
    const meta = metadata(current);
    const prefix = `versão ${current}`;

    if (!isGameVersion(current)) fail(`${prefix}: número de versão fora do formato da EA`);
    if (meta.version !== current) fail(`${prefix}: metadata aponta para ${meta.version}`);
    if (meta.previousVersion && !versions.includes(meta.previousVersion)) {
      fail(`${prefix}: versão anterior ${meta.previousVersion} não existe em data/versions`);
    }

    const rows = compatibility(current);
    const known = new Set(versionWeapons(current).map((w) => w.id));
    const knownAttachments = new Set(versionAttachments(current).map((a) => a.id));

    report(
      'erro',
      `${prefix}: relação com arma desconhecida`,
      rows.filter((row) => !weaponIds.has(row.weaponId)).map((row) => row.weaponId),
    );
    report(
      'erro',
      `${prefix}: relação com acessório desconhecido`,
      rows.filter((row) => !attachmentIds.has(row.attachmentId)).map((row) => row.attachmentId),
    );
    report(
      'erro',
      `${prefix}: relação fora do instantâneo da versão`,
      rows
        .filter((row) => !known.has(row.weaponId) || !knownAttachments.has(row.attachmentId))
        .map((row) => `${row.weaponId} → ${row.attachmentId}`),
    );
    report(
      'erro',
      `${prefix}: relação com versão trocada`,
      rows.filter((row) => row.gameVersion !== current).map((row) => `${row.weaponId} → ${row.attachmentId}`),
    );

    /*
     * O slot da relação tem de ser o slot da peça.
     *
     * Não é conferência de burocracia: é ela que impede um freio de boca de
     * aparecer na lista de miras de uma arma porque alguém copiou uma linha e
     * trocou só o id.
     */
    const slotOf = new Map(attachmentList.map((a) => [a.id, a.slot]));
    report(
      'erro',
      `${prefix}: slot da relação diferente do slot da peça`,
      rows
        .filter((row) => slotOf.has(row.attachmentId) && slotOf.get(row.attachmentId) !== row.slot)
        .map((row) => `${row.attachmentId} (${row.slot} ≠ ${slotOf.get(row.attachmentId)})`),
    );

    report(
      'erro',
      `${prefix}: relação repetida`,
      duplicates(rows.map((row) => `${row.weaponId}|${row.attachmentId}`)),
    );

    /*
     * Peça de arma só entra na arma dela.
     *
     * O carregador de 30 da M4A1 é uma entidade diferente do carregador de 30
     * de qualquer outra arma justamente para isto poder ser verificado.
     */
    const ownerOf = new Map(
      attachmentList.filter((a) => a.scope === 'weapon').map((a) => [a.id, a.weaponScope]),
    );
    report(
      'erro',
      `${prefix}: peça exclusiva em arma alheia`,
      rows
        .filter((row) => ownerOf.has(row.attachmentId) && ownerOf.get(row.attachmentId) !== row.weaponId)
        .map((row) => `${row.attachmentId} em ${row.weaponId}`),
    );

    const validStatus: RelationStatus[] = ['active', 'removed', 'needs_review'];
    report(
      'erro',
      `${prefix}: status de relação inválido`,
      rows.filter((row) => !validStatus.includes(row.status)).map((row) => String(row.status)),
    );
    report(
      'erro',
      `${prefix}: relação sem procedência`,
      rows
        .filter((row) => !row.source?.provider)
        .map((row) => `${row.weaponId} → ${row.attachmentId}`),
    );

    report(
      'aviso',
      `${prefix}: relação aguardando revisão`,
      rows
        .filter((row) => row.status === 'needs_review')
        .map((row) => `${row.weaponId} → ${row.attachmentId}`),
    );

    /* ----------------------------- stats e efeitos ----------------------------- */

    const statList = stats(current);
    report(
      'erro',
      `${prefix}: estatística de arma desconhecida`,
      statList.filter((s) => !weaponIds.has(s.weaponId)).map((s) => s.weaponId),
    );
    report('erro', `${prefix}: estatística repetida`, duplicates(statList.map((s) => s.weaponId)));

    const effectList = effects(current);
    report(
      'erro',
      `${prefix}: efeito de acessório desconhecido`,
      effectList.filter((e) => !attachmentIds.has(e.attachmentId)).map((e) => e.attachmentId),
    );
    report('erro', `${prefix}: efeito repetido`, duplicates(effectList.map((e) => e.attachmentId)));
    report(
      'erro',
      `${prefix}: custo negativo`,
      effectList.filter((e) => typeof e.cost === 'number' && e.cost < 0).map((e) => e.attachmentId),
    );
    report(
      'aviso',
      `${prefix}: custo em pontos não publicado pela fonte`,
      effectList.filter((e) => e.cost === null).map((e) => e.attachmentId),
    );
    report(
      'aviso',
      `${prefix}: efeito com campo suposto pela fonte`,
      effectList.filter((e) => e.assumed?.length).map((e) => e.attachmentId),
    );

    /* ---------------------------- dados de simulação ---------------------------- */

    /*
     * A balística é opcional — uma versão pode existir sem ela — mas quando
     * existe tem de fechar: arma conhecida, curva em ordem crescente, nível de
     * confiança declarado. Curva fora de ordem é o erro que não aparece em
     * lugar nenhum até o gráfico sair com um degrau para trás.
     */
    const dir = versionDir(current);
    const ballistics = readJsonIf<{ ballistics: SimEntry[] }>(join(dir, 'ballistics.json'), {
      ballistics: [],
    }).ballistics;
    const damageModels = readJsonIf<{ models: DamageEntry[] }>(join(dir, 'damage-models.json'), {
      models: [],
    }).models;

    const simFiles: [string, SimEntry[]][] = [
      ['balística', ballistics],
      ['dano', damageModels],
      ['recuo', readJsonIf<{ recoil: SimEntry[] }>(join(dir, 'recoil.json'), { recoil: [] }).recoil],
      ['espalhamento', readJsonIf<{ spread: SimEntry[] }>(join(dir, 'spread.json'), { spread: [] }).spread],
      ['recarga', readJsonIf<{ reload: SimEntry[] }>(join(dir, 'reload.json'), { reload: [] }).reload],
    ];

    const qualities = ['verified', 'provisional', 'estimated', 'unavailable'];

    for (const [label, entries] of simFiles) {
      report(
        'erro',
        `${prefix}: ${label} de arma desconhecida`,
        entries.filter((entry) => !weaponIds.has(entry.weaponId)).map((entry) => entry.weaponId),
      );
      report('erro', `${prefix}: ${label} repetida`, duplicates(entries.map((e) => e.weaponId)));
      report(
        'erro',
        `${prefix}: ${label} sem nível de confiança`,
        entries.filter((entry) => !qualities.includes(entry.status)).map((entry) => entry.weaponId),
      );
      report(
        'aviso',
        `${prefix}: ${label} sem dado disponível`,
        entries.filter((entry) => entry.status === 'unavailable').map((entry) => entry.weaponId),
      );
      report(
        'aviso',
        `${prefix}: ${label} com dado provisório`,
        entries.filter((entry) => entry.status === 'provisional').map((entry) => entry.weaponId),
      );
    }

    report(
      'erro',
      `${prefix}: curva de dano fora de ordem`,
      damageModels
        .filter((model) =>
          model.curve.some((point, index) => index > 0 && point.distance < model.curve[index - 1].distance),
        )
        .map((model) => model.weaponId),
    );
    report(
      'erro',
      `${prefix}: curva de dano com valor negativo`,
      damageModels
        .filter((model) => model.curve.some((point) => point.damage < 0 || point.distance < 0))
        .map((model) => model.weaponId),
    );

    /* -------------------------------- órfãos -------------------------------- */

    const related = new Set(rows.filter((row) => row.status === 'active').map((r) => r.attachmentId));
    report(
      'aviso',
      `${prefix}: acessório sem nenhuma arma`,
      attachmentList.filter((a) => a.status === 'active' && !related.has(a.id)).map((a) => a.id),
    );

    const armed = new Set(rows.filter((row) => row.status === 'active').map((r) => r.weaponId));
    report(
      'aviso',
      `${prefix}: arma sem nenhum acessório`,
      weaponList.filter((w) => w.status === 'active' && !armed.has(w.id)).map((w) => w.id),
    );
  }

  /* -------------------------------- índices -------------------------------- */

  const onDisk = readJsonIf<{ attachmentsByWeapon?: Record<string, string[]> } | null>(
    join(INDEXES, 'current.json'),
    null,
  );

  if (!onDisk) {
    warn('índices ainda não foram gerados — rode catalog:indexes');
  } else {
    const rebuilt = buildIndexes(version, '');
    const stored = JSON.stringify(onDisk.attachmentsByWeapon ?? {});
    if (stored !== JSON.stringify(rebuilt.attachmentsByWeapon)) {
      fail('índice em disco discorda da compatibilidade — rode catalog:indexes');
    }
  }

  /* -------------------------------- resultado -------------------------------- */

  for (const message of warnings) console.warn(`  aviso  ${message}`);
  for (const message of errors) console.error(`  ERRO   ${message}`);

  log('validação', {
    'versão': version,
    'versões': versions.length,
    erros: errors.length,
    avisos: warnings.length,
  });

  if (errors.length) {
    console.error(`\n${errors.length} erro(s) — o catálogo não está publicável.`);
    process.exit(1);
  }
}

main();
