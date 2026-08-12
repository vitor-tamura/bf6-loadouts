#!/usr/bin/env node
/**
 * Lê um patch note e diz o que ele afirma.
 *
 *   npm run catalog:parse-patch -- 1.4.2.0
 *
 * Transforma o texto guardado em `data/patches/<versão>.json` numa lista de
 * mudanças estruturadas, e escreve o resultado de volta no mesmo arquivo, em
 * `changes`. Nada aqui toca no catálogo: quem aplica é o `reconcile`, e a
 * separação existe para que uma leitura errada possa ser refeita sem ter
 * corrompido nada.
 *
 * ## A regra que governa este arquivo
 *
 * Não completar o que a fonte não diz.
 *
 * Quando a EA escreve "Recoil reduced by 10%", o que se sabe é a operação e a
 * proporção — não o valor de antes nem o de depois. O registro fica assim, com
 * `operation: "percentage"` e `value: -10`, e quem quiser o número absoluto vai
 * ter de buscá-lo numa fonte que o meça. Preencher `before` e `after` com uma
 * conta feita aqui produziria estatística inventada com aparência de apurada,
 * que é a pior espécie: ela não se distingue da verdadeira depois de salva.
 *
 * ## Três destinos
 *
 * - `auto`: a linha nomeia uma entidade que existe no catálogo e uma operação
 *   reconhecida. Segue sozinha.
 * - `review`: a linha é claramente uma mudança, mas algo nela não fecha — a
 *   entidade não existe, o número não foi entendido, a frase é ambígua. Vai
 *   para o Pull Request marcada.
 * - `blocked`: o texto não permite dizer nem do que se trata. Não vira mudança;
 *   vira issue.
 */

import { join } from 'node:path';
import type { AutomationLevel } from '../../src/catalog/catalog.types.ts';
import { PATCHES, isGameVersion, log, readJson, writeJson } from './lib/io.ts';
import { attachments, weapons } from './lib/store.ts';
import type { PatchNote } from './fetch-patch-note.ts';

export interface PatchChange {
  /** O que a frase parece fazer. */
  kind:
    | 'stat_changed'
    | 'cost_changed'
    | 'weapon_added'
    | 'weapon_removed'
    | 'attachment_added'
    | 'attachment_removed'
    | 'compatibility_added'
    | 'compatibility_removed'
    | 'unknown';
  entityType: 'weapon' | 'attachment' | 'unknown';
  /** O id do catálogo, quando a entidade foi reconhecida. */
  entityId: string | null;
  /** O nome exatamente como o patch note o escreveu. */
  mentioned: string | null;
  field: string | null;
  operation: 'percentage' | 'absolute' | 'set' | 'none' | null;
  value: number | null;
  before: number | null;
  after: number | null;
  automation: AutomationLevel;
  reason: string | null;
  /** A frase de origem, para quem revisa conferir sem abrir o site da EA. */
  line: string;
}

/* ------------------------- reconhecimento de nomes ------------------------- */

/** `M121 A2`, `m121-a2` e `M121A2` viram a mesma chave. */
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

interface Known {
  weapons: Map<string, string>;
  attachments: Map<string, string>;
}

export function knownEntities(): Known {
  const weaponMap = new Map<string, string>();
  for (const weapon of weapons()) {
    weaponMap.set(normalize(weapon.name), weapon.id);
    weaponMap.set(normalize(weapon.id), weapon.id);
    for (const alias of weapon.aliases) weaponMap.set(normalize(alias), weapon.id);
  }

  const attachmentMap = new Map<string, string>();
  for (const attachment of attachments()) {
    /*
     * Só peça global entra no reconhecimento por nome.
     *
     * As específicas de arma repetem nome entre si — há 283 carregadores, e
     * dezenas se chamam "30 Rnd". Casar "30 Rnd" pelo nome escolheria uma delas
     * a esmo, e o patch note quase sempre diz de qual arma está falando numa
     * frase que este casamento não lê. Elas ficam para o revisor.
     */
    if (attachment.scope !== 'global') continue;
    attachmentMap.set(normalize(attachment.name), attachment.id);
    for (const alias of attachment.aliases) attachmentMap.set(normalize(alias), attachment.id);
  }

  return { weapons: weaponMap, attachments: attachmentMap };
}

/**
 * Acha a entidade citada na frase.
 *
 * Procura do nome mais longo para o mais curto, senão "M4" casaria antes de
 * "M4A1" e a mudança iria para a arma errada.
 */
function findEntity(line: string, known: Known) {
  const text = normalize(line);

  const search = (map: Map<string, string>) => {
    const candidates = [...map.keys()].filter((key) => key.length >= 3 && text.includes(key));
    candidates.sort((a, b) => b.length - a.length);
    return candidates.length ? { key: candidates[0], id: map.get(candidates[0])! } : null;
  };

  const weapon = search(known.weapons);
  if (weapon) return { entityType: 'weapon' as const, ...weapon };

  const attachment = search(known.attachments);
  if (attachment) return { entityType: 'attachment' as const, ...attachment };

  return null;
}

/* --------------------------- leitura das operações --------------------------- */

/** "reduced by 10%" → percentagem negativa; "increased by 5%" → positiva. */
const PERCENTAGE =
  /\b(increased|reduced|decreased|lowered|raised|buffed|nerfed)\b[^.\n]*?\bby\b\s*([\d.,]+)\s*%/i;

/** "from 800 to 820" — os dois números vêm da fonte, então os dois valem. */
const FROM_TO = /\bfrom\s+([\d.,]+)\s+to\s+([\d.,]+)/i;

/** "Recoil: 0.8 → 0.6", a forma de tabela. */
const ARROW = /([\d.,]+)\s*(?:→|->|=>)\s*([\d.,]+)/;

const DOWNWARD = /\b(reduced|decreased|lowered|nerfed)\b/i;

const number = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'));

/**
 * O campo citado, quando ele é um dos que o catálogo entende.
 *
 * A lista é curta de propósito: nome de estatística que não está aqui vira
 * campo desconhecido e manda a mudança para revisão, em vez de criar uma chave
 * nova no catálogo a cada sinônimo que a EA usar.
 */
const FIELDS: [RegExp, string][] = [
  [/\brecoil\b/i, 'recoil'],
  [/\brpm\b|\brate of fire\b|\bfire rate\b/i, 'rpm'],
  [/\bdamage\b/i, 'damage'],
  [/\bmagazine\b|\bmag(azine)? (size|capacity)\b/i, 'magazineCapacity'],
  [/\breload\b/i, 'reload'],
  [/\bads\b|\baim down sights?\b/i, 'adsTime'],
  [/\bvelocity\b|\bmuzzle velocity\b/i, 'velocity'],
  [/\bspread\b/i, 'spread'],
  [/\brange\b/i, 'range'],
  [/\bcost\b|\battachment points?\b/i, 'cost'],
  [/\bheadshot\b/i, 'headshotMultiplier'],
];

function findField(line: string): string | null {
  for (const [pattern, field] of FIELDS) if (pattern.test(line)) return field;
  return null;
}

const ADDED = /\b(added|introduced|new)\b/i;
const REMOVED = /\b(removed|retired|disabled|delisted)\b/i;

/* -------------------------------- o parser -------------------------------- */

/** Uma frase que não fala de arma nem de peça não interessa a este catálogo. */
const RELEVANT =
  /\b(weapon|attachment|rifle|carbine|smg|lmg|dmr|sniper|shotgun|sidearm|barrel|muzzle|magazine|grip|laser|optic|sight|ammo|recoil|damage|rpm|reload|spread|velocity|attachment points?)\b/i;

export function parseLine(line: string, known: Known): PatchChange | null {
  const clean = line.trim();
  if (clean.length < 12 || !RELEVANT.test(clean)) return null;

  const entity = findEntity(clean, known);
  const field = findField(clean);

  const base: PatchChange = {
    kind: 'unknown',
    entityType: entity?.entityType ?? 'unknown',
    entityId: entity?.id ?? null,
    mentioned: entity ? clean.match(/[A-Z][\w-]*(?:\s+[\w-]+)?/)?.[0] ?? null : null,
    field,
    operation: null,
    value: null,
    before: null,
    after: null,
    automation: 'blocked',
    reason: null,
    line: clean,
  };

  /* ------------------------------ adição e remoção ------------------------------ */

  if (ADDED.test(clean) && !field) {
    return {
      ...base,
      kind: entity?.entityType === 'attachment' ? 'attachment_added' : 'weapon_added',
      operation: 'none',
      /*
       * Coisa nova nunca entra sozinha.
       *
       * Uma arma adicionada precisa de id estável, categoria, calibre e a lista
       * inteira de peças que ela aceita — nada disso está no patch note, que
       * anuncia o nome e a temporada. A confirmação vem do BF6 Loadouts, e é
       * `reconcile` quem cruza as duas.
       */
      automation: 'review',
      reason: entity
        ? 'Adição anunciada de entidade que já existe no catálogo — conferir se é reintrodução.'
        : 'Adição anunciada de entidade desconhecida: falta id, categoria e compatibilidade, que o patch note não publica.',
    };
  }

  if (REMOVED.test(clean)) {
    if (!entity) {
      return {
        ...base,
        automation: 'blocked',
        reason: 'Remoção anunciada sem entidade reconhecível na frase.',
      };
    }
    return {
      ...base,
      kind: entity.entityType === 'attachment' ? 'attachment_removed' : 'weapon_removed',
      operation: 'none',
      automation: 'auto',
      reason: null,
    };
  }

  /* -------------------------------- números -------------------------------- */

  const fromTo = clean.match(FROM_TO) ?? clean.match(ARROW);
  if (fromTo && entity && field) {
    const before = number(fromTo[1]);
    const after = number(fromTo[2]);
    return {
      ...base,
      kind: field === 'cost' ? 'cost_changed' : 'stat_changed',
      operation: 'set',
      value: after,
      before,
      after,
      automation: 'auto',
    };
  }

  const percentage = clean.match(PERCENTAGE);
  if (percentage) {
    const magnitude = number(percentage[2]);
    const signed = DOWNWARD.test(percentage[1]) ? -magnitude : magnitude;

    return {
      ...base,
      kind: field === 'cost' ? 'cost_changed' : 'stat_changed',
      operation: 'percentage',
      value: signed,
      // A fonte diz a proporção e nada mais. Os dois lados ficam nulos.
      before: null,
      after: null,
      automation: entity && field ? 'auto' : 'review',
      reason: entity
        ? field
          ? null
          : 'Proporção reconhecida, mas o campo alterado não foi identificado.'
        : 'Proporção reconhecida, mas a entidade citada não existe no catálogo.',
    };
  }

  /* ------------------------------- sem número ------------------------------- */

  if (entity && field) {
    return {
      ...base,
      kind: 'stat_changed',
      operation: 'none',
      automation: 'review',
      reason: 'Mudança descrita sem número: precisa de medição de outra fonte.',
    };
  }

  return null;
}

export function parseNote(note: PatchNote, known: Known): PatchChange[] {
  return note.rawContent
    .split('\n')
    .map((line) => parseLine(line, known))
    .filter((change): change is PatchChange => change !== null);
}

function main(): void {
  const version = process.argv[2];

  if (!version || !isGameVersion(version)) {
    console.error('uso: npm run catalog:parse-patch -- <versão>');
    process.exit(1);
  }

  const path = join(PATCHES, `${version}.json`);
  const note = readJson<PatchNote>(path);
  const changes = parseNote(note, knownEntities());

  writeJson(path, { ...note, changes });

  const byLevel = changes.reduce<Record<string, number>>((count, change) => {
    count[change.automation] = (count[change.automation] ?? 0) + 1;
    return count;
  }, {});

  log('patch lido', { 'versão': version, mudanças: changes.length, ...byLevel });

  if (!changes.length) {
    /*
     * Patch note que não produz nenhuma mudança legível é suspeito.
     *
     * Pode ser um patch só de correção de servidor — acontece —, mas pode ser o
     * parser tendo deixado de entender o formato. Como não dá para distinguir
     * os dois daqui, o pipeline para e chama gente: o item 33 chama isso de
     * `blocked`, e é melhor uma issue a mais do que um catálogo intacto quando
     * o jogo mudou.
     */
    console.warn('nenhuma mudança reconhecida — revise o formato do patch note antes de seguir.');
    process.exit(3);
  }
}

if (process.argv[1] && process.argv[1].endsWith('parse-patch-note.ts')) main();
