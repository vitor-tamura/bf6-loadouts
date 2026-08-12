#!/usr/bin/env node
/**
 * O catálogo já sustenta esta tela?
 *
 *   npm run catalog:coverage
 *
 * A migração do site acontece por domínio, e a regra é uma só: um domínio só
 * migra quando **todos** os dados de que ele precisa existirem, estiverem
 * validados e cobertos por teste. A pergunta "já dá?" precisa ter resposta
 * medida — senão vira impressão, e impressão erra: o painel de estatísticas
 * parece simples até alguém contar que ele depende de doze campos.
 *
 * Este script responde com número, em três seções que não devem ser
 * confundidas:
 *
 * **DATA COVERAGE** — quantas armas têm cada campo. É contagem pura.
 *
 * **FEATURE COVERAGE** — se existe código que transforma esses dados no que a
 * tela mostra. Ter a curva de dano não é ter TTK; alguém precisa escrever a
 * conta. Enquanto o motor não existir, o domínio é `NOT IMPLEMENTED` mesmo com
 * os dados completos.
 *
 * **MIGRATION STATUS** — se a tela pode trocar de fonte. Exige dados **e**
 * motor. `WAITING ENGINE` é o estado em que os dados chegaram antes da conta.
 *
 * Confundir os três é o erro que este arquivo existe para impedir: um domínio
 * "pronto" na primeira coluna convida a migrar uma tela que não teria o que
 * chamar na segunda.
 *
 * Nada aqui altera dado; é só leitura.
 */

import type { CatalogCapabilities } from '../../src/catalog/catalog.types.ts';
import { getCurrentCatalog } from '../../src/catalog/catalog.service.ts';
import { log } from './lib/io.ts';

/**
 * O estado do motor que a feature precisa.
 *
 * Ter os dados não é ter a feature. O TTK teve os dados prontos muito antes de
 * existir uma função que os transformasse em milissegundos, e chamar aquilo de
 * "pronto" convidava a migrar uma tela que não teria o que chamar. As duas
 * coisas são medidas separadamente por isso.
 */
type Engine = 'implemented' | 'not_implemented' | 'none_needed';

interface Domain {
  id: string;
  label: string;
  phase: number;
  screens: string[];
  capabilities: (keyof CatalogCapabilities)[];
  /** Campos de `stats` por arma, exigidos de todas. */
  weaponStats?: string[];
  engine: Engine;
  /** Onde o motor vive, quando há um. */
  engineModule?: string;
}

/**
 * O que cada domínio do site precisa para viver do catálogo.
 *
 * A lista é escrita à mão de propósito. Derivá-la do código do frontend daria
 * ilusão de exatidão — o que uma tela usa hoje não é o que ela precisa para
 * estar correta — e esconderia justamente a decisão que interessa: quem escreve
 * aqui está afirmando "com estes dados, esta tela está certa".
 */
const DOMAINS: Domain[] = [
  {
    id: 'arsenal',
    label: 'Arsenal — lista, busca e página da arma',
    phase: 1,
    screens: ['src/app/armas', 'src/components/weapon-selector.tsx'],
    capabilities: ['weapons', 'compatibility'],
    engine: 'none_needed',
  },
  {
    id: 'builder',
    label: 'Montador — slots, peças e orçamento',
    phase: 1,
    screens: ['src/app/montar', 'src/components/slots-panel.tsx'],
    capabilities: ['weapons', 'attachments', 'compatibility', 'magazines', 'ammo', 'costs'],
    engine: 'none_needed',
  },
  {
    id: 'stats',
    label: 'Painel de estatísticas',
    phase: 2,
    screens: ['src/components/stats-panel.tsx', 'src/lib/stats.ts'],
    capabilities: ['weapons', 'ads', 'recoil'],
    weaponStats: ['rpm', 'magazineCapacity', 'adsMs', 'reload', 'emptyReload', 'velocity'],
    engine: 'none_needed',
  },
  {
    id: 'ttk',
    label: 'TTK, tiros para abater e tempo de voo',
    phase: 3,
    screens: ['src/lib/ballistics.ts'],
    capabilities: ['damageCurves', 'ttk', 'velocity'],
    weaponStats: ['rpm'],
    engine: 'implemented',
    engineModule: 'src/simulation/ttk.ts',
  },
  {
    id: 'charts',
    label: 'Gráficos — dano por distância e queda da bala',
    phase: 4,
    screens: ['src/components/charts.tsx'],
    capabilities: ['damageCurves', 'velocity', 'drag'],
    engine: 'implemented',
    engineModule: 'src/simulation/ballistics.ts',
  },
  {
    id: 'compare',
    label: 'Comparação detalhada entre armas',
    phase: 5,
    screens: ['src/app/comparar'],
    capabilities: ['damageCurves', 'ttk', 'velocity', 'ads', 'recoil'],
    weaponStats: ['rpm', 'magazineCapacity', 'adsMs', 'reload'],
    engine: 'implemented',
    engineModule: 'src/simulation/index.ts',
  },
];

type DataLevel = 'READY' | 'PARTIAL' | 'MISSING';
type FeatureLevel = 'READY' | 'NOT IMPLEMENTED' | 'BLOCKED';
type MigrationLevel = 'SAFE' | 'WAITING ENGINE' | 'BLOCKED';

function check(domain: Domain) {
  const catalog = getCurrentCatalog();
  const missing: string[] = [];
  const partial: string[] = [];

  for (const capability of domain.capabilities) {
    if (!catalog.capabilities[capability]) missing.push(`capacidade ${capability}`);
  }

  for (const field of domain.weaponStats ?? []) {
    const have = catalog.weapons.filter((weapon) => weapon.stats?.[field] != null).length;
    if (have === 0) missing.push(`stats.${field}`);
    else if (have < catalog.weapons.length) {
      partial.push(`stats.${field} (${have}/${catalog.weapons.length})`);
    }
  }

  const data: DataLevel = missing.length ? 'MISSING' : partial.length ? 'PARTIAL' : 'READY';

  /*
   * As três respostas, e a diferença entre elas.
   *
   * `data` diz se o dado existe. `feature` diz se há código que o transforme no
   * que a tela mostra. `migration` combina os dois — e é só ele que autoriza
   * trocar a fonte de uma tela. Um domínio com dados prontos e motor ausente é
   * `WAITING ENGINE`, nunca "pronto": migrar ali seria apontar a tela para uma
   * função que não existe.
   */
  const feature: FeatureLevel =
    data !== 'READY' ? 'BLOCKED' : domain.engine === 'not_implemented' ? 'NOT IMPLEMENTED' : 'READY';

  const migration: MigrationLevel =
    data !== 'READY' ? 'BLOCKED' : feature === 'NOT IMPLEMENTED' ? 'WAITING ENGINE' : 'SAFE';

  return { domain, data, feature, migration, missing, partial };
}

/** As contagens campo a campo, que é o que "data coverage" quer dizer. */
function dataCoverage() {
  const catalog = getCurrentCatalog();
  const total = catalog.weapons.length;

  const withStat = (field: string) =>
    catalog.weapons.filter((weapon) => weapon.stats?.[field] != null).length;

  return [
    ['Curvas de dano', catalog.damageModels.filter((m) => m.curve.length).length, total],
    ['Velocidade', catalog.ballistics.filter((b) => b.muzzleVelocity != null).length, total],
    ['Arrasto', catalog.ballistics.filter((b) => b.drag != null).length, total],
    ['Recuo', catalog.recoil.filter((r) => r.recoil != null).length, total],
    ['Espalhamento', catalog.spread.filter((s) => s.spread != null).length, total],
    ['Cadência', withStat('rpm'), total],
    ['ADS', withStat('adsMs'), total],
    ['Recarga tática', catalog.reload.filter((r) => r.tactical != null).length, total],
    ['Recarga vazia', catalog.reload.filter((r) => r.empty != null).length, total],
    [
      'Custo de acessório',
      catalog.attachments.filter((a) => a.cost != null).length,
      catalog.attachments.length,
    ],
  ] as [string, number, number][];
}

/** O rótulo curto de um domínio, para caber na coluna. */
const short = (domain: Domain) => domain.label.split(/ —|,/)[0];

function main(): void {
  const catalog = getCurrentCatalog();
  const results = DOMAINS.map(check);
  const pad = (text: string, width: number) =>
    (text.length > width ? `${text.slice(0, width - 1)}…` : text).padEnd(width);

  console.log(`\nCatálogo ${catalog.gameVersion}\n`);

  console.log('DATA COVERAGE');
  console.log('─'.repeat(46));
  for (const [label, have, total] of dataCoverage()) {
    const mark = have === total ? ' ' : '!';
    console.log(`${mark} ${pad(label, 24)} ${String(have).padStart(4)} / ${total}`);
  }

  console.log('\nFEATURE COVERAGE');
  console.log('─'.repeat(46));
  for (const { domain, feature } of results) {
    console.log(`  ${pad(short(domain), 24)} ${feature}`);
    if (feature === 'NOT IMPLEMENTED' && domain.engineModule) {
      console.log(`  ${pad('', 24)} motor esperado em ${domain.engineModule}`);
    }
  }

  console.log('\nMIGRATION STATUS');
  console.log('─'.repeat(46));
  for (const { domain, migration, missing, partial } of results) {
    console.log(`  ${pad(short(domain), 24)} ${migration}`);
    for (const item of missing) console.log(`  ${pad('', 24)} falta: ${item}`);
    for (const item of partial) console.log(`  ${pad('', 24)} parcial: ${item}`);
  }

  /*
   * Dado provisório não bloqueia migração, mas precisa ser dito.
   *
   * Uma curva estimada sustenta um gráfico, desde que a tela avise. O que não
   * pode é a tela não saber — por isso `getWeaponDataQuality` existe.
   */
  const provisional = Object.entries(catalog.dataQuality)
    .filter(([, counts]) => counts.provisional > 0)
    .map(([name, counts]) => `${name}: ${counts.provisional}`);

  if (provisional.length) {
    console.log('\nDADOS PROVISÓRIOS (a tela deve avisar)');
    console.log('─'.repeat(46));
    for (const item of provisional) console.log(`  ${item}`);
  }

  const safe = results.filter((result) => result.migration === 'SAFE');

  console.log(
    safe.length
      ? `\nPodem migrar: ${safe.map((r) => r.domain.id).join(', ')}.\n` +
          'Migrar exige paridade funcional com a tela atual — ver docs/frontend-migration.md.'
      : '\nNenhum domínio liberado. Tudo continua em src/data/*.ts.',
  );

  log('cobertura', {
    safe: safe.length,
    'waiting engine': results.filter((r) => r.migration === 'WAITING ENGINE').length,
    blocked: results.filter((r) => r.migration === 'BLOCKED').length,
  });
}

main();
