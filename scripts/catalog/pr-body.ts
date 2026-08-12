#!/usr/bin/env node
/**
 * O corpo do Pull Request de uma atualização.
 *
 *   node --experimental-strip-types scripts/catalog/pr-body.ts 1.4.2.0 1.4.1.5
 *
 * Quem revisa não lê duas mil linhas de compatibilidade: lê isto. Então o que
 * importa aqui não é listar tudo, é separar o que já está resolvido do que
 * precisa de olho humano — e deixar o segundo impossível de não ver.
 *
 * 🟢 seguiu sozinho, com fonte oficial e explícita.
 * 🟡 precisa de decisão: fontes divergem, entidade nova, número ausente.
 * 🔴 o parser não conseguiu ler; o catálogo não foi tocado por essas.
 */

import { join } from 'node:path';
import type { ChangeEvent } from '../../src/catalog/catalog.types.ts';
import { DIFFS, PUBLIC_CATALOG, readJson, readJsonIf, versionDir } from './lib/io.ts';
import type { CurrentCatalog } from '../../src/catalog/catalog.types.ts';

const [version, previous] = process.argv.slice(2);

if (!version) {
  console.error('uso: pr-body.ts <versão> [versão anterior]');
  process.exit(1);
}

const events = readJson<{ events: ChangeEvent[] }>(join(versionDir(version), 'changes.json')).events;
const catalog = readJson<CurrentCatalog>(PUBLIC_CATALOG);

const diff = previous
  ? readJsonIf<{
      weapons: { added: string[]; removed: string[]; renamed: unknown[] };
      attachments: { added: string[]; removed: string[]; renamed: unknown[] };
      compatibility: { added: string[]; removed: string[] };
      stats: unknown[];
      effects: unknown[];
      costs: unknown[];
    } | null>(join(DIFFS, `${previous}-to-${version}.json`), null)
  : null;

const byLevel = (level: string) => events.filter((event) => event.automation === level);

const auto = byLevel('auto');
const review = byLevel('review');
const blocked = byLevel('blocked');

/** Uma linha por evento, com a frase de origem quando houver. */
const describe = (event: ChangeEvent) => {
  const line = (event.changes as { line?: string }).line;
  const target = event.entityId ?? '—';
  return `- \`${event.type}\` **${target}**${line ? `\n  > ${line}` : ''}`;
};

const list = (events: ChangeEvent[]) =>
  events.length ? events.map(describe).join('\n') : '_nenhuma._';

const quality = Object.entries(catalog.dataQuality)
  .map(([domain, counts]) => {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const good = counts.verified;
    return `- ${domain}: ${good}/${total} verificados, ${counts.provisional} provisórios`;
  })
  .join('\n');

const covered = Object.entries(catalog.capabilities)
  .filter(([, value]) => value)
  .map(([key]) => key);

console.log(`# Battlefield 6 — Update ${version}

Fonte: **EA Official Patch Notes**${previous ? ` · versão anterior: \`${previous}\`` : ''}

## Resumo

| | |
| --- | ---: |
| 🟢 aplicadas automaticamente | ${auto.length} |
| 🟡 precisam de revisão | ${review.length} |
| 🔴 não puderam ser lidas | ${blocked.length} |

${
  diff
    ? `## Diff

\`\`\`
Weapons:        + ${diff.weapons.added.length}  - ${diff.weapons.removed.length}  ~ ${diff.weapons.renamed.length}
Attachments:    + ${diff.attachments.added.length}  - ${diff.attachments.removed.length}  ~ ${diff.attachments.renamed.length}
Compatibility:  + ${diff.compatibility.added.length}  - ${diff.compatibility.removed.length}
Stats:          ~ ${diff.stats.length}
Effects:        ~ ${diff.effects.length}
Costs:          ~ ${diff.costs.length}
\`\`\``
    : ''
}

## 🟢 Aplicadas

${list(auto)}

## 🟡 Revisão necessária

${
  review.length
    ? `${list(review)}

**Nada disso foi aplicado ao catálogo.** Percentuais de patch note não viraram número: a EA publica a proporção, não o valor, e calcular sobre o dado atual só funcionaria se ele estivesse certo.`
    : '_nenhuma._'
}

## 🔴 Não lidas

${
  blocked.length
    ? `${list(blocked)}

O texto continua em \`data/patches/${version}.json\` para auditoria.`
    : '_nenhuma._'
}

## Qualidade dos dados

${quality}

Capacidades cobertas: ${covered.length ? covered.map((c) => `\`${c}\``).join(', ') : '_nenhuma_'}

## Validação

Testes, lint, tipos, validação do catálogo e build passaram — o Pull Request só
é aberto quando todos passam.

---

🤖 Aberto por \`bf6-update-process.yml\`. Revisão humana obrigatória antes do merge.`);
