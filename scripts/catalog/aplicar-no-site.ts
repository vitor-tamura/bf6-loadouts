#!/usr/bin/env node
/**
 * As mudanças que o parser leu com certeza, gravadas no dataset do site.
 *
 *   npm run catalog:aplicar-no-site                    # a versão corrente
 *   npm run catalog:aplicar-no-site -- --version 1.4.3.0
 *   npm run catalog:aplicar-no-site -- --desde 1.4.2.5    # cada versão posterior, em ordem
 *   npm run catalog:aplicar-no-site -- --dry-run
 *
 * O pipeline do catálogo escreve em `data/versions`; o site lê
 * `src/data/weapons.ts` e `src/data/attachments.ts`. Sem esta ponte, um patch
 * lido e conciliado chegava ao catálogo e nunca à tela — foi o que aconteceu com
 * a Interdictor na 1.4.3.0, aplicada à mão três dias depois.
 *
 * ## Só o que a EA escreveu, e só onde bate
 *
 * O workflow publica em `main` sem revisão, então esta rotina não deduz nada:
 *
 * - entra só mudança `auto` do parser, isto é, com a entidade resolvida e o
 *   número escrito na frase;
 * - "de X para Y" só é aplicado se o site mostra X hoje. Se mostra outra
 *   coisa, o dado do site veio de outra fonte, e trocar um número que não é o
 *   de antes do patch seria inventar o de depois — a mudança vai para o
 *   relatório, com o motivo;
 * - numa curva de dano, troca-se o degrau que vale X, e só ele. Distância não
 *   muda aqui: "sweet spot range adjusted to 120m to 160m" não tem "de X para
 *   Y", e é a análise do patch (`analisar-patch.ts`) quem a lê, com as mesmas
 *   travas de frase e número;
 * - custo novo ("now costs 15 points") vale sem valor de antes, porque o
 *   número é o preço inteiro que o Gunsmith mostra. Mudando numa arma só, a
 *   peça se divide, como as entradas de cano por família já fazem.
 *
 * O resultado vai para `data/versions/<versão>/site-regras.json`: o que foi
 * aplicado, o que já estava e o que foi recusado.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEAPONS } from '../../src/data/weapons.ts';
import { ATTACHMENTS } from '../../src/data/attachments.ts';
import { siteIdFor } from '../../src/catalog/adapters/renamed-ids.ts';
import { aplicarCusto, aplicarNaArma, type PropostaArma } from './analisar-patch.ts';
import type { PatchChange } from './parse-patch-note.ts';
import { INDEXES, PATCHES, ROOT, compareVersions, listVersions, log, readJson, versionDir } from './lib/io.ts';
import { attachments as catalogAttachments } from './lib/store.ts';

const WEAPONS_TS = join(ROOT, 'src', 'data', 'weapons.ts');
const ATTACHMENTS_TS = join(ROOT, 'src', 'data', 'attachments.ts');

/** O campo do parser e o nome dele no dataset do site. */
const CAMPO_NO_SITE: Record<string, PropostaArma['field']> = {
  damage: 'damage',
  rpm: 'rpm',
  velocity: 'velocity',
  magazineCapacity: 'magazine',
  reload: 'reload',
  headshotMultiplier: 'headshot',
};

type Arma = (typeof WEAPONS)[number];

export interface Resultado {
  aplicadas: { linha: string; o: string }[];
  jaEstavam: { linha: string; o: string }[];
  recusadas: { linha: string; motivo: string }[];
}

const semPlural = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');

/**
 * A mudança de um número da arma, se o site mostra o valor de antes.
 *
 * Devolve a proposta pronta para `aplicarNaArma`, `'ja'` quando o site já tem o
 * valor novo, ou o motivo da recusa.
 */
export function propostaDeArma(change: PatchChange, arma: Arma): PropostaArma | 'ja' | string {
  const campo = CAMPO_NO_SITE[change.field ?? ''];
  if (!campo) return `o site não guarda o campo ${change.field}`;
  if (change.before == null || change.after == null) return 'a frase não diz o valor de antes e o de depois';

  const { before, after } = change;

  if (campo === 'damage') {
    const curva = arma.damage.map((d) => [d.damage, d.distance] as [number, number]);
    const bate = curva.filter(([dano]) => dano === before).length;

    if (!bate) {
      return curva.some(([dano]) => dano === after)
        ? 'ja'
        : `a curva do site não tem degrau de ${before} — ela veio de outra fonte, e trocar outro número seria inventar`;
    }
    return {
      weapon: arma.id,
      field: 'damage',
      value: curva.map(([dano, distancia]) => [dano === before ? after : dano, distancia] as [number, number]),
      evidence: [change.line],
    };
  }

  const atual = arma[campo as keyof Arma];
  if (atual === after) return 'ja';
  if (atual !== before) return `o site mostra ${String(atual)}, não os ${before} de antes do patch`;
  return { weapon: arma.id, field: campo, value: after, evidence: [change.line] };
}

/**
 * A peça do site que corresponde à do catálogo, naquela arma.
 *
 * O catálogo tem uma "Iron Sights" global; o site tem várias entradas com esse
 * nome original, divididas por preço. A certa é a que a arma aceita — e tem de
 * ser uma só, senão a escolha seria a esmo.
 */
export function pecaDoSite(nomeNoCatalogo: string, armaId: string | null) {
  const alvo = semPlural(nomeNoCatalogo);
  const candidatas = ATTACHMENTS.filter(
    (a) => semPlural(a.originalName) === alvo && (!armaId || (a.compat.weapons ?? []).includes(armaId)),
  );
  return candidatas.length === 1 ? candidatas[0] : null;
}

export function aplicar(changes: PatchChange[], versao: string, fontes: { armas: string; pecas: string }) {
  const resultado: Resultado = { aplicadas: [], jaEstavam: [], recusadas: [] };
  const siteIds = WEAPONS.map((w) => w.id);
  const nomeDaPeca = new Map(catalogAttachments().map((a) => [a.id, a.name]));
  let { armas, pecas } = fontes;

  for (const change of changes) {
    if (change.automation !== 'auto') continue;
    const linha = change.line;

    if (change.kind === 'stat_changed' && change.entityType === 'weapon' && change.entityId) {
      const id = siteIdFor(change.entityId, siteIds);
      const arma = WEAPONS.find((w) => w.id === id);
      if (!arma) {
        resultado.recusadas.push({ linha, motivo: `a arma ${change.entityId} não está no site` });
        continue;
      }

      const proposta = propostaDeArma(change, arma);
      if (proposta === 'ja') resultado.jaEstavam.push({ linha, o: `${arma.id} ${change.field}` });
      else if (typeof proposta === 'string') resultado.recusadas.push({ linha, motivo: proposta });
      else {
        const novo = aplicarNaArma(armas, proposta, versao);
        if (novo) {
          armas = novo;
          resultado.aplicadas.push({ linha, o: `${arma.id} ${proposta.field} → ${JSON.stringify(proposta.value)}` });
        } else resultado.jaEstavam.push({ linha, o: `${arma.id} ${proposta.field}` });
      }
      continue;
    }

    if (change.kind === 'cost_changed' && change.entityId && change.after != null) {
      const armaDoCatalogo = change.weaponIds?.length === 1 ? change.weaponIds[0] : null;
      const armaId = armaDoCatalogo ? siteIdFor(armaDoCatalogo, siteIds) : null;
      if (armaDoCatalogo && !armaId) {
        resultado.recusadas.push({ linha, motivo: `a arma ${armaDoCatalogo} não está no site` });
        continue;
      }

      const peca = pecaDoSite(nomeDaPeca.get(change.entityId) ?? change.entityId, armaId);
      if (!peca) {
        resultado.recusadas.push({ linha, motivo: `nenhuma peça única do site corresponde a ${change.entityId}${armaId ? ` na ${armaId}` : ''}` });
        continue;
      }

      const novo = aplicarCusto(
        pecas,
        { attachment: peca.id, weapon: armaId, cost: change.after, evidence: [linha] },
        versao,
      );
      if (novo) {
        pecas = novo;
        resultado.aplicadas.push({ linha, o: `${peca.id}${armaId ? ` na ${armaId}` : ''}: ${change.after} pts` });
      } else resultado.jaEstavam.push({ linha, o: `${peca.id} ${change.after} pts` });
    }
  }

  return { resultado, armas, pecas };
}

function main(): void {
  const args = process.argv.slice(2);
  const valor = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);

  /*
   * `--desde <versão>` aplica, em ordem, cada versão posterior a ela: é o que o
   * workflow passa, com a versão que o catálogo tinha antes da rodada, quando
   * uma execução processa mais de um patch.
   */
  const desde = valor('--desde');
  const versoes = valor('--version')
    ? [valor('--version')!]
    : desde
      ? listVersions().filter((v) => compareVersions(v, desde) > 0).sort(compareVersions)
      : [readJson<{ gameVersion: string }>(join(INDEXES, 'current.json')).gameVersion];

  if (!versoes.length) log('nenhuma versão nova para aplicar no site');
  for (const versao of versoes) aplicarVersao(versao, args.includes('--dry-run'));
}

function aplicarVersao(versao: string, dryRun: boolean): void {
  const caminho = join(PATCHES, `${versao}.json`);
  if (!existsSync(caminho)) {
    log(`${versao}: sem patch note — nada a aplicar no site`);
    return;
  }

  const { changes = [] } = readJson<{ changes?: PatchChange[] }>(caminho);
  const { resultado, armas, pecas } = aplicar(changes, versao, {
    armas: readFileSync(WEAPONS_TS, 'utf8'),
    pecas: readFileSync(ATTACHMENTS_TS, 'utf8'),
  });

  for (const a of resultado.aplicadas) log('  aplicada', a.o);
  for (const r of resultado.recusadas) log('  recusada', { motivo: r.motivo, linha: r.linha.slice(0, 120) });

  if (dryRun) {
    log(`${versao}: nada gravado (--dry-run)`, { aplicariam: resultado.aplicadas.length });
    return;
  }

  writeFileSync(WEAPONS_TS, armas);
  writeFileSync(ATTACHMENTS_TS, pecas);
  writeFileSync(
    join(versionDir(versao), 'site-regras.json'),
    `${JSON.stringify({ version: versao, ...resultado }, null, 2)}\n`,
  );
  log(`${versao}: site atualizado pelas regras`, {
    aplicadas: resultado.aplicadas.length,
    jaEstavam: resultado.jaEstavam.length,
    recusadas: resultado.recusadas.length,
  });
}

if (process.argv[1] && process.argv[1].endsWith('aplicar-no-site.ts')) main();
