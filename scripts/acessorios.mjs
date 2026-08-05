#!/usr/bin/env node
/**
 * Regenera `ACESSORIOS.md` — a relação de todas as peças do montador.
 *
 *   node scripts/acessorios.mjs          → reescreve o arquivo
 *   node scripts/acessorios.mjs --stdout → imprime sem gravar
 *
 * Lê direto de `src/data`, então nunca sai de sincronia com o dataset.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const lerDados = (arquivo) => readFileSync(join(raiz, 'src/data', arquivo), 'utf8');

const SLOTS = [
  ['mira', 'Mira', 'Sight'],
  ['boca', 'Boca', 'Muzzle'],
  ['cano', 'Cano', 'Barrel'],
  ['acoplamento', 'Acoplamento Inferior', 'Underbarrel'],
  ['carregador', 'Carregador', 'Magazine'],
  ['municao', 'Munição', 'Ammunition'],
  ['ergonomia', 'Ergonomia', 'Ergonomics'],
  ['opticoExtra', 'Acessório Óptico', 'Optic Accessory'],
  ['lateralEsquerda', 'Acessório Superior', 'Top Accessory'],
  ['lateralDireita', 'Acessório Direito', 'Right Accessory'],
];

const armas = new Map(
  [...lerDados('weapons.ts').matchAll(/^ {4}id: '([^']+)',\n {4}name: '([^']+)'/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);

const texto = lerDados('attachments.ts');
const pecas = [];
for (const bloco of texto.split('\n  {\n')) {
  const id = bloco.match(/id: '([^']+)'/);
  if (!id || !bloco.includes('slot:')) continue;
  const campo = (chave) => bloco.match(new RegExp(`${chave}: '([^']*)'`))?.[1] ?? '';
  const lista = bloco.match(/weapons: \[([^\]]*)\]/)?.[1] ?? '';
  pecas.push({
    nome: campo('name'),
    original: campo('originalName'),
    slot: campo('slot'),
    descricao: campo('description'),
    custo: Number(bloco.match(/cost: (\d+)/)?.[1] ?? 0),
    armas: lista
      .split(',')
      .map((a) => a.trim().replace(/'/g, ''))
      .filter(Boolean),
  });
}

/** Resume a compatibilidade: nomear 60 armas numa célula não ajuda ninguém. */
function resumoArmas(ids) {
  if (ids.length >= 55) return `quase todas (${ids.length})`;
  if (ids.length === 1) return armas.get(ids[0]) ?? ids[0];
  if (ids.length <= 4) return ids.map((a) => armas.get(a) ?? a).join(', ');
  return `${ids.length} armas`;
}

const ancora = (titulo) =>
  titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');

const linhas = [
  '# Acessórios',
  '',
  `Relação completa das **${pecas.length} peças** do montador, na ordem em que os slots`,
  'aparecem na interface.',
  '',
  'Nome, slot, custo em pontos e compatibilidade vêm do catálogo do bf6loadouts.com,',
  'filtrados pelas regras por categoria da planilha `attachments-compatibility.xlsx`.',
  'A coluna **Armas** resume em quantas a peça encaixa — a lista exata de cada uma',
  'está em `src/data/attachments.ts`.',
  '',
  'Gerado por `node scripts/acessorios.mjs`.',
  '',
  '## Slots',
  '',
  '| Slot | Original | Peças |',
  '| --- | --- | ---: |',
];

for (const [chave, titulo, original] of SLOTS) {
  const total = pecas.filter((p) => p.slot === chave).length;
  linhas.push(`| [${titulo}](#${ancora(titulo)}) | ${original} | ${total} |`);
}
linhas.push('');

for (const [chave, titulo, original] of SLOTS) {
  const lista = pecas
    .filter((p) => p.slot === chave)
    .sort((a, b) => a.custo - b.custo || a.nome.localeCompare(b.nome, 'pt-BR'));

  linhas.push(
    `## ${titulo}`,
    '',
    `*${original}* — ${lista.length} peças.`,
    '',
    '| Peça | Original | Pts | Armas | Efeito |',
    '| --- | --- | ---: | --- | --- |',
  );
  for (const p of lista) {
    linhas.push(
      `| ${p.nome} | ${p.original} | ${p.custo} | ${resumoArmas(p.armas)} | ${p.descricao} |`,
    );
  }
  linhas.push('');
}

const saida = linhas.join('\n');
if (process.argv.includes('--stdout')) console.log(saida);
else {
  writeFileSync(join(raiz, 'ACESSORIOS.md'), saida);
  console.log(`ACESSORIOS.md atualizado — ${pecas.length} peças em ${SLOTS.length} slots`);
}
