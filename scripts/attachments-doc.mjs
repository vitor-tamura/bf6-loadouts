#!/usr/bin/env node
/**
 * Regenera `ACESSORIOS.md` — a relação de showAll as peças do montador.
 *
 *   node scripts/attachments-doc.mjs          → reescreve o arquivo
 *   node scripts/attachments-doc.mjs --stdout → imprime sem gravar
 *
 * Lê direto de `src/data`, então nunca sai de sincronia com o dataset.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readData = (arquivo) => readFileSync(join(root, 'src/data', arquivo), 'utf8');

const SLOTS = [
  ['sight', 'Mira', 'Sight'],
  ['muzzle', 'Boca', 'Muzzle'],
  ['barrel', 'Cano', 'Barrel'],
  ['underbarrel', 'Acoplamento Inferior', 'Underbarrel'],
  ['magazine', 'Carregador', 'Magazine'],
  ['ammo', 'Munição', 'Ammunition'],
  ['ergonomics', 'Ergonomia', 'Ergonomics'],
  ['opticAccessory', 'Acessório Óptico', 'Optic Accessory'],
  ['leftRail', 'Acessório Superior', 'Top Accessory'],
  ['rightRail', 'Acessório Direito', 'Right Accessory'],
];

const weapons = new Map(
  [...readData('weapons.ts').matchAll(/^ {4}id: '([^']+)',\n {4}name: '([^']+)'/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);

const text = readData('attachments.ts');
const parts = [];
for (const block of text.split('\n  {\n')) {
  const id = block.match(/id: '([^']+)'/);
  if (!id || !block.includes('slot:')) continue;
  const field = (chave) => block.match(new RegExp(`${chave}: '([^']*)'`))?.[1] ?? '';
  const list = block.match(/weapons: \[([^\]]*)\]/)?.[1] ?? '';
  parts.push({
    name: field('name'),
    original: field('originalName'),
    slot: field('slot'),
    descricao: field('description'),
    custo: Number(block.match(/cost: (\d+)/)?.[1] ?? 0),
    weapons: list
      .split(',')
      .map((a) => a.trim().replace(/'/g, ''))
      .filter(Boolean),
  });
}

/** Resume a compatibilidade: nomear 60 armas numa célula não ajuda ninguém. */
function weaponSummary(ids) {
  if (ids.length >= 55) return `quase showAll (${ids.length})`;
  if (ids.length === 1) return weapons.get(ids[0]) ?? ids[0];
  if (ids.length <= 4) return ids.map((a) => weapons.get(a) ?? a).join(', ');
  return `${ids.length} weapons`;
}

const anchor = (title) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');

const lines = [
  '# Acessórios',
  '',
  `Relação completa das **${parts.length} peças** do montador, na ordem em que os slots`,
  'aparecem na interface.',
  '',
  'Nome, slot, custo em pontos e compatibilidade vêm do catálogo do bf6loadouts.com,',
  'filtrados pelas regras por categoria da planilha `attachments-compatibility.xlsx`.',
  'A coluna **Armas** resume em quantas a peça encaixa — a list exata de cada uma',
  'está em `src/data/attachments.ts`.',
  '',
  'Gerado por `node scripts/attachments-doc.mjs`.',
  '',
  '## Slots',
  '',
  '| Slot | Original | Peças |',
  '| --- | --- | ---: |',
];

for (const [chave, title, original] of SLOTS) {
  const total = parts.filter((p) => p.slot === chave).length;
  lines.push(`| [${title}](#${anchor(title)}) | ${original} | ${total} |`);
}
lines.push('');

for (const [chave, title, original] of SLOTS) {
  const list = parts
    .filter((p) => p.slot === chave)
    .sort((a, b) => a.custo - b.custo || a.name.localeCompare(b.name, 'pt-BR'));

  lines.push(
    `## ${title}`,
    '',
    `*${original}* — ${list.length} peças.`,
    '',
    '| Peça | Original | Pts | Armas | Efeito |',
    '| --- | --- | ---: | --- | --- |',
  );
  for (const p of list) {
    lines.push(
      `| ${p.name} | ${p.original} | ${p.custo} | ${weaponSummary(p.weapons)} | ${p.descricao} |`,
    );
  }
  lines.push('');
}

const output = lines.join('\n');
if (process.argv.includes('--stdout')) console.log(output);
else {
  writeFileSync(join(root, 'ACESSORIOS.md'), output);
  console.log(`ACESSORIOS.md atualizado — ${parts.length} peças em ${SLOTS.length} slots`);
}
