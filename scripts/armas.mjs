#!/usr/bin/env node
/**
 * Regenera `ARMAS.md` — a relação de todas as armas do montador.
 *
 *   node scripts/armas.mjs          → reescreve o arquivo
 *   node scripts/armas.mjs --stdout → imprime sem gravar
 *
 * Lê direto de `src/data`, então nunca sai de sincronia com o dataset.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const lerDados = (arquivo) => readFileSync(join(raiz, 'src/data', arquivo), 'utf8');

const CATEGORIAS = [
  ['ar', 'Fuzis de Assalto', 'Assault Rifles', 'Assalto'],
  ['carabina', 'Carabinas', 'Carbines', 'Engenheiro'],
  ['smg', 'Submetralhadoras', 'SMGs', '—'],
  ['lmg', 'Metralhadoras', 'LMGs', 'Suporte'],
  ['dmr', 'Rifles de Precisão Semiautomáticos', 'DMRs', 'Reconhecimento'],
  ['sniper', 'Rifles de Precisão', 'Sniper Rifles', 'Reconhecimento'],
  ['escopeta', 'Escopetas', 'Shotguns', '—'],
  ['pistola', 'Pistolas', 'Sidearms', '—'],
  ['corpo-a-corpo', 'Corpo a Corpo', 'Melee', '—'],
];

const texto = lerDados('weapons.ts');
const armas = [];
for (const bloco of texto.split('\n  {\n')) {
  if (!bloco.includes("id: '") || !bloco.includes('category:')) continue;
  const campo = (chave) => bloco.match(new RegExp(`${chave}: '([^']*)'`))?.[1] ?? '';
  const numero = (chave) => Number(bloco.match(new RegExp(`${chave}: ([\\d.]+)`))?.[1] ?? 0);
  const passos = [...bloco.matchAll(/\[([\d.]+), (\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  armas.push({
    id: campo('id'),
    nome: campo('name'),
    categoria: campo('category'),
    resumo: campo('summary'),
    temporada: numero('season'),
    rpm: numero('rpm'),
    velocidade: numero('velocity'),
    carregador: numero('magazine'),
    dano: passos,
  });
}

/** "28 → 22" resume a escada de dano do primeiro ao último degrau. */
function faixaDano(passos) {
  if (passos.length === 0) return '—';
  const primeiro = passos[0][0];
  const ultimo = passos[passos.length - 1][0];
  return primeiro === ultimo ? String(primeiro) : `${primeiro} → ${ultimo}`;
}

/** Onde a queda começa e termina, em metros. */
function faixaDistancia(passos) {
  if (passos.length < 2) return 'sem queda';
  return `${passos[1][1]}–${passos[passos.length - 1][1]} m`;
}

const linhas = [
  '# Armas',
  '',
  `Relação completa das **${armas.length} armas** do montador, agrupadas por categoria e`,
  'ordenadas pela temporada em que entraram no jogo.',
  '',
  '`Lanç.` marca o conteúdo de lançamento; `T1` a `T4`, a temporada de estreia.',
  '',
  'Gerado por `node scripts/armas.mjs`.',
  '',
  '## Resumo',
  '',
  '| Categoria | Original | Classe-assinatura | Armas |',
  '| --- | --- | --- | ---: |',
];

for (const [chave, titulo, original, classe] of CATEGORIAS) {
  const total = armas.filter((a) => a.categoria === chave).length;
  linhas.push(`| ${titulo} | ${original} | ${classe} | ${total} |`);
}
linhas.push(`| **Total** | | | **${armas.length}** |`, '');

for (const [chave, titulo, original, classe] of CATEGORIAS) {
  const lista = armas
    .filter((a) => a.categoria === chave)
    .sort((a, b) => a.temporada - b.temporada || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (lista.length === 0) continue;

  const melee = chave === 'corpo-a-corpo';
  linhas.push(
    `## ${titulo}`,
    '',
    `*${original}* — ${lista.length} armas${classe !== '—' ? `, arma-assinatura do ${classe}` : ''}.`,
    '',
  );

  if (melee) {
    linhas.push('| Arma | Entrada | Descrição |', '| --- | --- | --- |');
    for (const a of lista) {
      linhas.push(`| ${a.nome} | ${a.temporada ? `T${a.temporada}` : 'Lanç.'} | ${a.resumo} |`);
    }
  } else {
    linhas.push(
      '| Arma | Entrada | Dano | Queda | RPM | Velocidade | Carregador |',
      '| --- | --- | --- | --- | ---: | ---: | ---: |',
    );
    for (const a of lista) {
      linhas.push(
        `| ${a.nome} | ${a.temporada ? `T${a.temporada}` : 'Lanç.'} | ${faixaDano(a.dano)} | ` +
          `${faixaDistancia(a.dano)} | ${a.rpm} | ${a.velocidade} m/s | ${a.carregador} |`,
      );
    }
  }
  linhas.push('');
}

const saida = linhas.join('\n');
if (process.argv.includes('--stdout')) console.log(saida);
else {
  writeFileSync(join(raiz, 'ARMAS.md'), saida);
  console.log(`ARMAS.md atualizado — ${armas.length} armas em ${CATEGORIAS.length} categorias`);
}
