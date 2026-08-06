#!/usr/bin/env node
/**
 * Lista as artes de arma esperadas pelo preview e mostra quais ainda faltam.
 *
 * Acessórios não entram: eles são ícones em `src/components/icons/`, não PNGs.
 *
 *   node scripts/images.mjs           → resumo do que falta
 *   node scripts/images.mjs --all   → list completa, inclusive as prontas
 *   node scripts/images.mjs --md      → tabela em Markdown, para colar em docs
 *
 * Lê os ids direto dos arquivos de dados, então nunca sai de sincronia com o
 * dataset.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function extract(arquivo, withPart) {
  const text = readFileSync(join(root, arquivo), 'utf8');
  const items = [];
  // Cada entrada começa com `id: '...'` e traz `name: '...'` logo em seguida.
  const pattern = /id:\s*'([^']+)',\s*\n\s*name:\s*'([^']+)'/g;
  let m;
  while ((m = pattern.exec(text))) {
    const [, id, name] = m;
    if (withPart) {
      // Só acessórios com peça desenhável aparecem no preview.
      const chunk = text.slice(m.index, m.index + 1400);
      const end = chunk.indexOf("\n  },");
      if (!/part:\s*'/.test(chunk.slice(0, end < 0 ? chunk.length : end))) continue;
    }
    items.push({ id, name });
  }
  return items;
}

const weapons = extract('src/data/weapons.ts', false).filter(
  // Corpo a corpo não usa o compositor de camadas.
  (a) => !['kbr-mark-ii', 'bighorn-hk-16', 'sledgehammer-14lb', 'nomad-cx-12', 'ripper-14'].includes(a.id),
);
const groups = [{ title: 'Armas', folder: 'public/weapons', items: weapons }];

const showAll = process.argv.includes('--all');
const markdown = process.argv.includes('--md');

let missing = 0;
let total = 0;

for (const group of groups) {
  const lines = [];
  for (const item of group.items) {
    total++;
    const path = join(root, group.folder, `${item.id}.webp`);
    const exists = existsSync(path);
    if (!exists) missing++;
    if (exists && !showAll) continue;
    lines.push(
      markdown
        ? `| \`${item.id}.webp\` | ${item.name} | ${exists ? 'pronta' : 'falta'} |`
        : `  ${exists ? '✓' : '·'} ${group.folder}/${item.id}.webp   ${item.name}`,
    );
  }

  console.log(`\n${group.title} — ${group.items.length} imagens esperadas em ${group.folder}/`);
  if (markdown) console.log('\n| Arquivo | Item | Situação |\n| --- | --- | --- |');
  if (lines.length === 0) console.log('  tudo pronto');
  else console.log(lines.join('\n'));
}

console.log(`\n${total - missing} de ${total} prontas · faltam ${missing}\n`);
