#!/usr/bin/env node
/**
 * Lista as imagens esperadas pelo preview e mostra quais ainda faltam.
 *
 *   node scripts/imagens.mjs           → resumo do que falta
 *   node scripts/imagens.mjs --todas   → lista completa, inclusive as prontas
 *   node scripts/imagens.mjs --md      → tabela em Markdown, para colar em docs
 *
 * Lê os ids direto dos arquivos de dados, então nunca sai de sincronia com o
 * dataset.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function extrair(arquivo, comPeca) {
  const texto = readFileSync(join(raiz, arquivo), 'utf8');
  const itens = [];
  // Cada entrada começa com `id: '...'` e traz `nome: '...'` logo em seguida.
  const regex = /id:\s*'([^']+)',\s*\n\s*name:\s*'([^']+)'/g;
  let m;
  while ((m = regex.exec(texto))) {
    const [, id, nome] = m;
    if (comPeca) {
      // Só acessórios com peça desenhável aparecem no preview.
      const trecho = texto.slice(m.index, m.index + 1400);
      const fim = trecho.indexOf("\n  },");
      if (!/part:\s*'/.test(trecho.slice(0, fim < 0 ? trecho.length : fim))) continue;
    }
    itens.push({ id, nome });
  }
  return itens;
}

const armas = extrair('src/data/weapons.ts', false).filter(
  // Corpo a corpo não usa o compositor de camadas.
  (a) => !['kbr-mark-ii', 'bighorn-hk-16', 'marreta-14lb', 'nomad-cx-12', 'ripper-14'].includes(a.id),
);
const acessorios = extrair('src/data/attachments.ts', true);

const grupos = [
  { titulo: 'Armas', pasta: 'public/armas', itens: armas },
  { titulo: 'Acessórios', pasta: 'public/acessorios', itens: acessorios },
];

const todas = process.argv.includes('--todas');
const markdown = process.argv.includes('--md');

let faltando = 0;
let total = 0;

for (const grupo of grupos) {
  const linhas = [];
  for (const item of grupo.itens) {
    total++;
    const caminho = join(raiz, grupo.pasta, `${item.id}.png`);
    const existe = existsSync(caminho);
    if (!existe) faltando++;
    if (existe && !todas) continue;
    linhas.push(
      markdown
        ? `| \`${item.id}.png\` | ${item.nome} | ${existe ? 'pronta' : 'falta'} |`
        : `  ${existe ? '✓' : '·'} ${grupo.pasta}/${item.id}.png   ${item.nome}`,
    );
  }

  console.log(`\n${grupo.titulo} — ${grupo.itens.length} imagens esperadas em ${grupo.pasta}/`);
  if (markdown) console.log('\n| Arquivo | Item | Situação |\n| --- | --- | --- |');
  if (linhas.length === 0) console.log('  tudo pronto');
  else console.log(linhas.join('\n'));
}

console.log(`\n${total - faltando} de ${total} prontas · faltam ${faltando}\n`);
