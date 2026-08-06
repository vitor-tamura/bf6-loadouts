#!/usr/bin/env node
/**
 * Regenera `ARMAS.md` — a relação de todas as armas do montador.
 *
 *   node scripts/weapons-doc.mjs          → reescreve o arquivo
 *   node scripts/weapons-doc.mjs --stdout → imprime sem gravar
 *
 * Lê direto de `src/data`, então nunca sai de sincronia com o dataset.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readData = (arquivo) => readFileSync(join(root, 'src/data', arquivo), 'utf8');

const CATEGORIES = [
  ['ar', 'Fuzis de Assalto', 'Assault Rifles', 'Assalto'],
  ['carbine', 'Carabinas', 'Carbines', '—'],
  ['smg', 'Submetralhadoras', 'SMGs', 'Engenheiro'],
  ['lmg', 'Metralhadoras', 'LMGs', 'Suporte'],
  ['dmr', 'Rifles de Precisão Semiautomáticos', 'DMRs', '—'],
  ['sniper', 'Rifles de Precisão', 'Sniper Rifles', 'Reconhecimento'],
  ['shotgun', 'Escopetas', 'Shotguns', '—'],
  ['pistol', 'Pistolas', 'Sidearms', '—'],
  ['melee', 'Corpo a Corpo', 'Melee', '—'],
];

const text = readData('weapons.ts');
const weapons = [];
for (const block of text.split('\n  {\n')) {
  if (!block.includes("id: '") || !block.includes('category:')) continue;
  const field = (chave) => block.match(new RegExp(`${chave}: '([^']*)'`))?.[1] ?? '';
  const number = (chave) => Number(block.match(new RegExp(`${chave}: ([\\d.]+)`))?.[1] ?? 0);
  const steps = [...block.matchAll(/\[([\d.]+), (\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  weapons.push({
    id: field('id'),
    name: field('name'),
    category: field('category'),
    summary: field('summary'),
    season: number('season'),
    rpm: number('rpm'),
    velocity: number('velocity'),
    magazine: number('magazine'),
    damage: steps,
  });
}

/** "28 → 22" resume a escada de dano do primeiro ao último degrau. */
function damageRange(steps) {
  if (steps.length === 0) return '—';
  const first = steps[0][0];
  const last = steps[steps.length - 1][0];
  return first === last ? String(first) : `${first} → ${last}`;
}

/** Onde a queda começa e termina, em metros. */
function distanceRange(steps) {
  if (steps.length < 2) return 'sem queda';
  return `${steps[1][1]}–${steps[steps.length - 1][1]} m`;
}

const lines = [
  '# Armas',
  '',
  `Relação completa das **${weapons.length} armas** do montador, agrupadas por category e`,
  'ordenadas pela season em que entraram no jogo.',
  '',
  '`Lanç.` marca o conteúdo de lançamento; `T1` a `T4`, a season de estreia.',
  '',
  'Gerado por `node scripts/weapons-doc.mjs`.',
  '',
  '## Resumo',
  '',
  '| Categoria | Original | Classe-assinatura | Armas |',
  '| --- | --- | --- | ---: |',
];

for (const [chave, title, original, classe] of CATEGORIES) {
  const total = weapons.filter((a) => a.category === chave).length;
  lines.push(`| ${title} | ${original} | ${classe} | ${total} |`);
}
lines.push(`| **Total** | | | **${weapons.length}** |`, '');

for (const [chave, title, original, classe] of CATEGORIES) {
  const list = weapons
    .filter((a) => a.category === chave)
    .sort((a, b) => a.season - b.season || a.name.localeCompare(b.name, 'pt-BR'));
  if (list.length === 0) continue;

  const melee = chave === 'melee';
  lines.push(
    `## ${title}`,
    '',
    `*${original}* — ${list.length} weapons${classe !== '—' ? `, arma-assinatura do ${classe}` : ''}.`,
    '',
  );

  if (melee) {
    lines.push('| Arma | Entrada | Descrição |', '| --- | --- | --- |');
    for (const a of list) {
      lines.push(`| ${a.name} | ${a.season ? `T${a.season}` : 'Lanç.'} | ${a.summary} |`);
    }
  } else {
    lines.push(
      '| Arma | Entrada | Dano | Queda | RPM | Velocidade | Carregador |',
      '| --- | --- | --- | --- | ---: | ---: | ---: |',
    );
    for (const a of list) {
      lines.push(
        `| ${a.name} | ${a.season ? `T${a.season}` : 'Lanç.'} | ${damageRange(a.damage)} | ` +
          `${distanceRange(a.damage)} | ${a.rpm} | ${a.velocity} m/s | ${a.magazine} |`,
      );
    }
  }
  lines.push('');
}

const output = lines.join('\n');
if (process.argv.includes('--stdout')) console.log(output);
else {
  writeFileSync(join(root, 'ARMAS.md'), output);
  console.log(`ARMAS.md atualizado — ${weapons.length} armas em ${CATEGORIES.length} categorias`);
}
