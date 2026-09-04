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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AutomationLevel } from '../../src/catalog/catalog.types.ts';
import { PATCHES, isGameVersion, log, readJson, writeJson } from './lib/io.ts';
import { attachments, weapons } from './lib/store.ts';
import type { PatchNote } from './fetch-patch-note.ts';
import { BALANCE_LOG_PATH, type BalanceLog, type BalancePatch } from './fetch-balance-log.ts';

/**
 * O corpo útil do patch note.
 *
 * A página vem com o site inteiro em volta: menu, seletor de data de
 * nascimento, links de loja. Nada disso é patch note, e deixar tudo passar
 * multiplica as chances de o parser reconhecer uma "mudança" num item de menu.
 * O corpo começa no anúncio da versão e vai até o fim.
 */
/**
 * O texto tem cara de patch note?
 *
 * Existe uma diferença que o pipeline precisa saber fazer: um patch de
 * correções — deploy, animação, som, interface — legitimamente não muda nada do
 * catálogo, e concluir "nenhuma mudança" ali é acertar. Já um texto que o
 * parser não entendeu produz o mesmo zero, e ali concluir a mesma coisa é
 * deixar o jogo mudar sem ninguém ver.
 *
 * O que separa os dois é a estrutura: patch note da EA tem changelog e seções
 * em caixa alta. Achando isso, zero mudanças é resposta; não achando, é falha.
 */
export function looksLikePatchNote(body: string): boolean {
  if (/CHANGELOG|Major Updates? for/i.test(body)) return true;

  // Seções no formato "WEAPONS:", "VEHICLES:", "UI & HUD:".
  const sections = body.match(/\n\s*[A-Z][A-Z &/-]{3,30}:\s/g) ?? [];
  return sections.length >= 3;
}

export function bodyOf(raw: string): string {
  const start = raw.search(/Game Updates?\s*\n|CHANGELOG|Major Updates? for/i);
  return start > 0 ? raw.slice(start) : raw;
}

/**
 * A lista de armas que uma frase declara explicitamente.
 *
 * "is available for the M87A1, M1014, 18.5KS-K, and DB-12" é a EA dizendo, com
 * todas as letras, em que armas a peça entra. É a única forma de compatibilidade
 * que o pipeline aceita sem revisão — o resto vira pendência.
 */
const AVAILABLE_FOR =
  /\b(?:available|usable|equippable)\s+(?:for|on)\s+(?:the\s+)?(.+?)(?:\.\s|\.$|;|$)/i;

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
  /** As armas citadas, quando a frase declara compatibilidade. */
  weaponIds?: string[];
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
 * O padrão que reconhece o nome de uma entidade dentro de uma frase.
 *
 * Não basta procurar a substring: o nome precisa estar sozinho. Sem fronteira,
 * `light` casa dentro de "slightly" — e foi assim que "Fall damage is now
 * slightly reduced when falling into shallow water" virou uma mudança de dano
 * do cano Light. O separador flexível entre os caracteres é o que faz `m60`
 * reconhecer "M/60" e `18.5ks-k` reconhecer "18.5KS-K".
 */
function namePattern(key: string): RegExp {
  const body = key.split('').join('[^a-z0-9]*');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'i');
}

const patterns = new Map<string, RegExp>();

function matchName(line: string, key: string): RegExpExecArray | null {
  let pattern = patterns.get(key);
  if (!pattern) {
    pattern = namePattern(key);
    patterns.set(key, pattern);
  }
  return pattern.exec(line);
}

function matchesName(line: string, key: string): boolean {
  return matchName(line, key) !== null;
}

/**
 * Acha a entidade citada na frase.
 *
 * Procura do nome mais longo para o mais curto, senão "M4" casaria antes de
 * "M4A1" e a mudança iria para a arma errada.
 */
function search(line: string, map: Map<string, string>) {
  const candidates = [...map.keys()]
    .filter((key) => key.length >= 3 && matchesName(line, key))
    .sort((a, b) => b.length - a.length);
  return candidates.length ? { key: candidates[0], id: map.get(candidates[0])! } : null;
}

/**
 * A peça citada numa frase, ignorando as armas.
 *
 * `findEntity` devolve o que achar primeiro e procura armas antes — numa frase
 * como "The Extended Barrel ... is available for the M87A1, M1014, 18.5KS-K,
 * and DB-12" ele acha a M87A1 e para. Quem pergunta "que peça é esta?" precisa
 * procurar só entre peças, senão a resposta é sempre a primeira arma da lista.
 */
export function findAttachment(line: string, known: Known) {
  return search(line, known.attachments);
}

function findEntity(line: string, known: Known) {
  const search = (map: Map<string, string>) => {
    const candidates = [...map.keys()]
      .filter((key) => key.length >= 3 && matchesName(line, key))
      .sort((a, b) => b.length - a.length);
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

/** "was not being removed" é defeito corrigido, não conteúdo retirado. */
const NOT_REMOVED = /\b(not|never|no longer|without)\b/i;

/**
 * O que sai do jogo é a peça citada aqui, e não a arma que a hospeda.
 *
 * Aparecendo entre o nome e o verbo, qualquer um destes é sinal de que quem
 * levou o "removed" foi ele, não a entidade: "the M87A1 laser sight ...
 * removed" tira a mira, e a M87A1 é só onde ela estava montada.
 */
const REMOVED_PART =
  /\b(sights?|barrels?|muzzles?|magazines?|grips?|lasers?|stocks?|ammo|attachments?|modifiers?|effects?|bugs?|issues?|buttons?|icons?|options?|skins?|animations?|sounds?|indicators?)\b/i;

/**
 * A entidade é o que saiu, ou o lugar de onde saiu outra coisa?
 *
 * "The DB-12 shotgun has been removed from the store rotation" tira a arma.
 * "An unintended recoil modifier has been removed from VSSM barrel
 * attachments" tira um modificador de dentro do cano — e foi lida como a saída
 * da VSSM do jogo, que desapareceu do catálogo inteiro, com a compatibilidade
 * junto, num patch que só acertou um cano.
 *
 * O que separa as duas é a ordem em que a frase se monta: o que sai vem antes
 * do verbo, e o que vem depois, atrás de "from", é a origem. Só isso ainda não
 * basta — entre o nome e o verbo não pode haver negativa nem outro substantivo
 * levando o "removed" embora.
 */
function removesEntity(line: string, key: string, entityType: 'weapon' | 'attachment'): boolean {
  const name = matchName(line, key);
  const verb = REMOVED.exec(line);
  if (!name || !verb) return false;

  // Verbo antes do nome: a entidade está do lado do "from", como origem.
  if (verb.index < name.index) return false;

  let between = line.slice(name.index + name[0].length, verb.index);

  /*
   * O substantivo colado ao nome de uma peça é o tipo dela, não outra coisa: em
   * "The 50 MW Violet laser has been removed from the game", quem sai é o
   * laser, que é a própria peça. Numa arma o mesmo substantivo diz o contrário
   * — "the M87A1 laser sight ... removed" tira a mira e deixa a arma.
   */
  if (entityType === 'attachment') {
    between = between.replace(new RegExp(`^\\s*${REMOVED_PART.source}`, 'i'), '');
  }

  return !NOT_REMOVED.test(between) && !REMOVED_PART.test(between);
}

/**
 * O que distingue balanceamento de correção de interface.
 *
 * Um patch note fala muito mais de botão, ícone e animação do que de dano. Sem
 * este filtro, qualquer frase que cite uma arma e a palavra "magazine" vira
 * mudança de carregador.
 */
const CHANGE_VERB =
  /\b(increased|reduced|decreased|lowered|raised|buffed|nerfed|adjusted|tuned|changed|updated|rebalanced|now deals|no longer deals)\b/i;

/**
 * A peça parou de valer em alguma arma.
 *
 * "The Match Trigger attachment no longer affects fully automatic fire on the
 * BROD and EF88" foi a única mudança de arma da 1.4.2.5, e o parser a largou:
 * não tem número, não diz "removed", e nenhum dos campos de `FIELDS` aparece
 * nela — "fully automatic fire" não é `fire rate`. Sem mudança nenhuma
 * reconhecida e com o texto tendo cara de patch note, o pipeline concluiu
 * "patch de correções" e escreveu a 1.4.2.5 como cópia da 1.4.2.0.
 *
 * O que a frase diz é que a relação entre uma peça e umas armas acabou — que é
 * `compatibility_removed`, e não uma estatística sem número. Vai para revisão,
 * nunca para aplicação automática: "deixou de afetar" pode ser a peça sumindo
 * do Gunsmith daquelas armas ou apenas o efeito dela zerando nelas, e o texto
 * não distingue as duas. Quem revisa distingue; adivinhar aqui apagaria uma
 * compatibilidade que talvez continue existindo.
 */
const STOPS_AFFECTING =
  /\bno longer\b[^.\n]*?\b(affects?|applies|applied|works?|functions?|grants?|provides?|modifies|impacts?)\b/i;

/** "on the BROD and EF88", "for the M87A1" — em que armas a peça deixou de valer. */
const AFFECTED_WEAPONS = /\b(?:on|for|with|to)\s+(?:the\s+)?([^.\n]+?)(?:\.|$)/i;

/**
 * O nome do que entrou, quando a frase o diz.
 *
 * Um nome próprio seguido do tipo: "Interdictor sniper rifle", "EOD Bot Arm
 * melee weapon", "XM-99 Prototype assault rifle". É o que permite dizer o que
 * apareceu no jogo em vez de mandar ao Pull Request o parágrafo inteiro com a
 * entidade em branco, que é como o anúncio da 1.4.2.0 chegou.
 */
const NEW_NAME = new RegExp(
  '\\b([A-Z0-9][\\w.-]*(?:[ -][A-Z0-9][\\w.-]*){0,3})\\s+' +
    '((?:assault |sniper |battle |marksman |melee |light )?' +
    '(?:rifles?|carbines?|shotguns?|sidearms?|pistols?|SMGs?|LMGs?|DMRs?|weapons?|' +
    'sights?|optics?|scopes?|barrels?|muzzles?|magazines?|grips?|lasers?|stocks?|ammo))\\b',
  'g',
);

/** A distância em que o anúncio ainda está falando do mesmo assunto. */
const NEARBY = 60;

/**
 * Um nome próprio de duas palavras ou mais — "Match Grade Ammo".
 *
 * A maiúscula sozinha não serve de sinal: toda frase começa com uma. Duas
 * seguidas são o que separa o nome de algo do jogo de uma regra geral escrita
 * em prosa.
 */
const PROPER_NAME = /\b[A-Z][\w.-]*(?:[ -][A-Z][\w.-]*)+/;

/**
 * O que a frase anuncia, ou nada quando ela não nomeia coisa alguma.
 *
 * A palavra "new" solta não é anúncio de arma: "New Airplane Control Assist
 * offers an alternative way to pilot airplanes, alongside improvements to (…)
 * Patrol Boat weapons" tem as duas peças do padrão — o verbo e um nome com
 * cara de arma — separadas por cinquenta palavras de assunto nenhum. O que
 * amarra as duas é a vizinhança: o nome vem colado ao anúncio, antes dele na
 * voz passiva ("The EOD Bot Arm melee weapon has been added") ou depois na
 * ativa ("bringing (…) the Interdictor sniper rifle").
 */
function newlyNamed(line: string): string | null {
  const verb = ADDED.exec(line);
  if (!verb) return null;

  /** "The EOD Bot Arm melee weapon" é a peça; o artigo é da frase. */
  const trim = (name: string) => {
    const clean = name.trim().replace(/^(?:The|A|An|New)\s+/, '');
    return clean.length >= 3 ? clean : null;
  };

  const after = line.slice(verb.index + verb[0].length);
  NEW_NAME.lastIndex = 0;
  const forward = NEW_NAME.exec(after);
  if (forward && forward.index <= NEARBY) return trim(forward[0]);

  // Voz passiva: o nome ficou para trás, e vale o último antes do verbo.
  const before = line.slice(0, verb.index);
  NEW_NAME.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  for (let match = NEW_NAME.exec(before); match; match = NEW_NAME.exec(before)) last = match;

  if (last && before.length - (last.index + last[0].length) <= NEARBY) return trim(last[0]);
  return null;
}

/* -------------------------------- o parser -------------------------------- */

/** Uma frase que não fala de arma nem de peça não interessa a este catálogo. */
const RELEVANT =
  /\b(weapon|attachment|rifle|carbine|smg|lmg|dmr|sniper|shotgun|sidearm|barrel|muzzle|magazine|grip|laser|optic|sight|ammo|recoil|damage|rpm|reload|spread|velocity|attachment points?)\b/i;

/**
 * O que a fonte de registro diz sobre uma linha, quando ela a tem.
 *
 * O BF6 Balance Log publica o mesmo changelog com duas coisas que a página da
 * EA não tem: a categoria em que a linha está — `WEAPONS` é afirmação de que a
 * linha é de arma, e não inferência a partir do texto — e os identificadores
 * das armas e peças que ela nomeia. É como a BROD 3 aparece numa frase em que a
 * EA escreveu só "BROD": o casamento vem feito por quem lê o jogo.
 *
 * É contexto, não veredito. Quando ele existe, decide o que o texto sozinho não
 * decidiu; quando não existe, o parser trabalha como sempre trabalhou.
 */
export interface LineContext {
  /** O subtítulo em que a fonte agrupou a linha — `WEAPONS`, `ATTACHMENTS`. */
  group: string | null;
  weaponIds: string[];
  attachmentIds: string[];
}

/** Os identificadores da fonte de registro traduzidos para ids do catálogo. */
export function resolveItems(items: string[], known: Known): Omit<LineContext, 'group'> {
  const weaponIds: string[] = [];
  const attachmentIds: string[] = [];

  for (const item of items) {
    const key = normalize(item);
    const weapon = known.weapons.get(key);
    if (weapon) {
      weaponIds.push(weapon);
      continue;
    }

    /*
     * O que não resolve é ignorado sem alarde: a fonte marca slot e classe na
     * mesma lista dos nomes — `scopes`, `barrels`, `recon` —, e isso é
     * vocabulário dela, não peça que o catálogo devesse ter.
     */
    const attachment = known.attachments.get(key);
    if (attachment) attachmentIds.push(attachment);
  }

  return { weaponIds: [...new Set(weaponIds)], attachmentIds: [...new Set(attachmentIds)] };
}

/** A fonte de registro classificou esta linha como mudança de arma ou de peça. */
const WEAPON_GROUP = /^(WEAPONS?|ATTACHMENTS?|GUNSMITH)$/i;

/**
 * A linha conserta como a arma aparece, não como ela se comporta.
 *
 * A categoria `WEAPONS` da fonte de registro é ampla: cabe o ajuste de dano e
 * cabe "The EF88 Canted Iron Sight icon now displays in the correct position".
 * A segunda não muda nada que este catálogo guarde — ele registra número, custo
 * e compatibilidade, não posição de ícone —, e mandá-la para revisão gasta a
 * atenção de quem revisa no que não tem o que decidir. Seis linhas dessas por
 * patch ensinam a passar os olhos, e é a sétima, que importava, que se perde.
 */
const PRESENTATION =
  /\b(icons?|texts?|descriptions?|labels?|displays?|displayed|animations?|poses?|visuals?|models?|alignment|aligned?|clipping|clip into|appears?|appearance|floating|VFX|sound|audio|subtitles?|menus?|HUD)\b/i;

export function parseLine(
  line: string,
  known: Known,
  contexto: LineContext | null = null,
): PatchChange | null {
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
    const named = entity ? entity.key : newlyNamed(clean);

    /*
     * Anúncio que não nomeia nada não é anúncio de conteúdo.
     *
     * "Vehicle and Aerial Combat Improvements: New Airplane Control Assist (…)"
     * virava uma arma nova a revisar, e quem abria a pendência encontrava um
     * parágrafo sobre pilotagem. Sem nome, não há o que cadastrar — e o texto
     * continua no patch note guardado, para auditoria.
     */
    if (!named) return null;

    return {
      ...base,
      kind: entity?.entityType === 'attachment' ? 'attachment_added' : 'weapon_added',
      mentioned: entity ? base.mentioned : named,
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
        : `Adição anunciada de "${named}", que o catálogo não tem: falta id, categoria e compatibilidade, que o patch note não publica.`,
    };
  }

  if (REMOVED.test(clean)) {
    /*
     * Remoção sem entidade não é bloqueio, é assunto alheio.
     *
     * Patch note remove muita coisa que não é arma nem peça — botão, ícone,
     * som, geometria de mapa. Tratar cada uma como "não consegui ler" abriria
     * uma issue de revisão manual por patch, e quem for atendê-la vai
     * encontrar "The Challenges button has been removed from the in-game
     * attachment screen". O texto fica guardado no patch note para auditoria.
     */
    if (!entity) return null;

    /*
     * Citar a entidade numa frase de remoção não é a entidade ter sido
     * removida. Quando ela não é o alvo, a frase continua sendo notícia sobre
     * ela — vai marcada, e quem revisa diz o que saiu.
     */
    if (!removesEntity(clean, entity.key, entity.entityType)) {
      return {
        ...base,
        kind: field ? 'stat_changed' : 'unknown',
        operation: 'none',
        automation: 'review',
        reason: 'A frase remove algo de dentro da entidade, não a entidade do jogo.',
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

  /* --------------------------- a peça deixou de valer --------------------------- */

  const parou = STOPS_AFFECTING.exec(clean);
  if (parou) {
    const attachment = findAttachment(clean, known);

    /*
     * A lista de armas se procura depois do verbo, e não na frase inteira: "no
     * longer affects fully automatic fire on the BROD and EF88" tem um "on" só,
     * mas frase com dois — "on the M4A1 when used with the Extended Barrel" —
     * pediria a primeira e traria a errada.
     */
    const depois = clean.slice(parou.index + parou[0].length);
    const alvo = depois.match(AFFECTED_WEAPONS);
    const daFrase = alvo ? weaponsIn(alvo[1], known) : { ids: [], unresolved: [] };

    /*
     * A fonte de registro completa o que a EA abreviou. Ela escreveu "the BROD"
     * e o catálogo tem `brod3`: a frase sozinha resolve uma arma das duas, e o
     * `data-item` da fonte resolve as duas.
     */
    const ids = [...new Set([...daFrase.ids, ...(contexto?.weaponIds ?? [])])];
    const peca = attachment?.id ?? contexto?.attachmentIds[0] ?? null;

    if (peca && ids.length) {
      const naoResolvidas = daFrase.unresolved.filter(
        (nome) => !known.weapons.get(normalize(nome)),
      );

      return {
        ...base,
        kind: 'compatibility_removed',
        entityType: 'attachment',
        entityId: peca,
        weaponIds: ids,
        operation: 'none',
        automation: 'review',
        reason:
          'A peça deixou de valer nestas armas. Conferir se ela saiu do Gunsmith delas ou se só o efeito zerou' +
          (naoResolvidas.length ? `; nomes não reconhecidos na frase: ${naoResolvidas.join(', ')}` : '') +
          '.',
      };
    }
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

  /*
   * Sem número, só vale se a frase disser que algo mudou.
   *
   * Citar uma arma e uma estatística não é anunciar mudança: "Magazine
   * attachment indicator alignment has been improved when customising the M/60"
   * fala de alinhamento de ícone, e virava uma alteração de carregador da M60.
   * O verbo é o que separa a nota de correção da nota de balanceamento.
   */
  /*
   * Entidade que o catálogo não conhece some se esta frase virar nulo — e some
   * justamente onde mais importa: "Match Grade Ammo now deals the intended
   * damage against swimming soldiers" fala de uma munição que não está em
   * `data/entities`, e o silêncio faz a lacuna passar por ausência de mudança.
   *
   * O que a autoriza a entrar sem entidade é haver nome próprio na frase. "Fall
   * damage is now slightly reduced when falling into shallow water" tem campo e
   * verbo e não nomeia coisa alguma do jogo: sem esta condição, toda regra
   * geral de dano viraria pendência de uma arma que ninguém citou.
   */
  const proper = PROPER_NAME.exec(clean);

  if (field && CHANGE_VERB.test(clean) && (entity || proper)) {
    return {
      ...base,
      kind: 'stat_changed',
      // Sem id, o nome próprio da frase é o que identifica a pendência.
      mentioned: entity ? base.mentioned : (proper?.[0] ?? null),
      operation: 'none',
      automation: 'review',
      reason: entity
        ? 'Mudança descrita sem número: precisa de medição de outra fonte.'
        : 'Mudança descrita sem número, e a entidade citada não existe no catálogo.',
    };
  }

  /* ------------------------- a rede embaixo de tudo ------------------------- */

  /*
   * Linha que a fonte de registro pôs sob `WEAPONS` não some calada.
   *
   * Tudo acima é o parser decidindo, pelo texto, se a frase é do catálogo. Ele
   * erra por omissão — e a omissão é o erro caro, porque produz o mesmo zero de
   * um patch que legitimamente não mexeu em arma. Foi assim que a 1.4.2.5 virou
   * cópia da 1.4.2.0.
   *
   * Aqui a classificação não é inferida: veio de fora, de quem separou o
   * changelog por categoria. Se a fonte diz que a linha é de arma e nomeia
   * entidades que o catálogo tem, ela vira pendência com nome e id — o revisor
   * lê uma frase e decide. É o que separa "o patch não mexeu em arma" de "o
   * parser não entendeu a frase", que era exatamente a distinção que faltava.
   */
  if (contexto && WEAPON_GROUP.test(contexto.group ?? '') && !PRESENTATION.test(clean)) {
    const ids = contexto.weaponIds;
    const peca = contexto.attachmentIds[0] ?? null;
    if (!ids.length && !peca) return null;

    return {
      ...base,
      kind: 'unknown',
      entityType: peca ? 'attachment' : 'weapon',
      entityId: peca ?? ids[0] ?? null,
      weaponIds: ids.length ? ids : undefined,
      mentioned: base.mentioned,
      operation: 'none',
      automation: 'review',
      reason:
        'A fonte de registro classificou esta linha como mudança de arma, e o texto não diz campo nem número — ler a frase e decidir.',
    };
  }

  return null;
}

/**
 * As armas nomeadas numa lista em prosa.
 *
 * "M87A1, M1014, 18.5KS-K, and DB-12" vira quatro ids. Um nome que não resolve
 * derruba a frase inteira para revisão em vez de entrar pela metade: meia lista
 * de compatibilidade é pior que nenhuma, porque parece completa.
 */
function weaponsIn(text: string, known: Known): { ids: string[]; unresolved: string[] } {
  const ids: string[] = [];
  const unresolved: string[] = [];

  for (const raw of text.split(/,| and | e /i)) {
    const name = raw.replace(/\b(the|weapons?|attachments?)\b/gi, '').trim();
    if (name.length < 2) continue;

    const id = known.weapons.get(normalize(name));
    if (id) ids.push(id);
    else unresolved.push(name);
  }

  return { ids: [...new Set(ids)], unresolved };
}

/**
 * O anúncio de conteúdo novo, que vem em prosa e não em lista de mudanças.
 *
 * Uma temporada começa assim: "Season 4 introduces the Extended Barrel and 1P86
 * LPVO sight. The Extended Barrel ... is available for the M87A1, M1014,
 * 18.5KS-K, and DB-12." Não há bullet, não há campo, não há número — há um
 * parágrafo. É de lá que saem as peças novas e, quando a EA se dá ao trabalho
 * de listar, a compatibilidade delas.
 */
export function parseAnnouncements(body: string, known: Known): PatchChange[] {
  const changes: PatchChange[] = [];

  for (const sentence of body.split(/(?<=\.)\s+/)) {
    const clean = sentence.replace(/\s+/g, ' ').trim();
    if (clean.length < 20) continue;

    const available = clean.match(AVAILABLE_FOR);
    if (!available) continue;

    // Só entre peças: a frase lista armas, e procurar "a primeira entidade"
    // devolveria uma delas.
    const attachment = findAttachment(clean, known);
    const { ids, unresolved } = weaponsIn(available[1], known);
    if (!ids.length) continue;

    changes.push({
      kind: 'compatibility_added',
      entityType: 'attachment',
      entityId: attachment?.id ?? null,
      weaponIds: ids,
      mentioned: null,
      field: null,
      operation: 'none',
      value: null,
      before: null,
      after: null,
      /*
       * Compatibilidade explícita é aplicável — desde que os dois lados
       * resolvam. Peça desconhecida ou arma que não casou vira revisão: criar a
       * relação com uma das pontas em aberto seria inventar metade dela.
       */
      automation: attachment && !unresolved.length ? 'auto' : 'review',
      reason: !attachment
        ? 'A peça citada não existe no catálogo — provavelmente é nova e precisa ser criada primeiro.'
        : unresolved.length
          ? `Armas não reconhecidas na lista: ${unresolved.join(', ')}.`
          : null,
      line: clean,
    });
  }

  return changes;
}

/**
 * O contexto de cada linha, indexado pelo texto que a EA publicou.
 *
 * A chave é o texto normalizado porque é a única coisa que as duas fontes têm
 * em comum: a fonte de registro transcreve a EA palavra por palavra, e o que
 * varia entre as duas é espaço em branco e aspas tipográficas.
 */
function contextos(registro: BalancePatch | null, known: Known): Map<string, LineContext> {
  const mapa = new Map<string, LineContext>();
  if (!registro) return mapa;

  for (const linha of registro.weaponLines) {
    mapa.set(chaveDeLinha(linha.text), {
      group: linha.group,
      ...resolveItems(linha.items, known),
    });
  }

  return mapa;
}

/** Espaço, aspas e travessão não distinguem uma frase da mesma frase. */
const chaveDeLinha = (texto: string) =>
  texto
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export function parseNote(
  note: PatchNote,
  known: Known,
  registro: BalancePatch | null = null,
): PatchChange[] {
  const body = bodyOf(note.rawContent);
  const contexto = contextos(registro, known);

  const lines = body
    .split('\n')
    .map((line) => parseLine(line, known, contexto.get(chaveDeLinha(line)) ?? null))
    .filter((change): change is PatchChange => change !== null);

  /*
   * As duas leituras se completam e podem repetir a mesma frase — a linha a
   * linha vê "available for" como texto sem número, e o anúncio a vê como
   * compatibilidade. Quando isso acontece, a leitura mais específica fica.
   */
  const announcements = parseAnnouncements(body, known);
  const announced = new Set(announcements.map((change) => change.line));

  return [...lines.filter((change) => !announced.has(change.line)), ...announcements];
}

/**
 * O registro desta versão, se `catalog:fetch-balance-log` já tiver rodado.
 *
 * Ausente não é erro: o parser existia antes desta fonte e continua lendo o
 * texto da EA sozinho. O que ela acrescenta é a categoria e os ids — e é por
 * isso que rodá-la antes vale a pena, não por ela ser obrigatória.
 */
export function registroDe(version: string): BalancePatch | null {
  if (!existsSync(BALANCE_LOG_PATH)) return null;

  try {
    const balanceLog = readJson<BalanceLog>(BALANCE_LOG_PATH);
    return balanceLog.patches.find((patch) => patch.version === version) ?? null;
  } catch {
    return null;
  }
}

function main(): void {
  const version = process.argv[2];

  if (!version || !isGameVersion(version)) {
    console.error('uso: npm run catalog:parse-patch -- <versão>');
    process.exit(1);
  }

  const path = join(PATCHES, `${version}.json`);
  const note = readJson<PatchNote>(path);
  const changes = parseNote(note, knownEntities(), registroDe(version));

  writeJson(path, { ...note, changes });

  const byLevel = changes.reduce<Record<string, number>>((count, change) => {
    count[change.automation] = (count[change.automation] ?? 0) + 1;
    return count;
  }, {});

  log('patch lido', { 'versão': version, mudanças: changes.length, ...byLevel });

  if (!changes.length) {
    if (looksLikePatchNote(bodyOf(note.rawContent))) {
      // Patch de correção: o changelog está lá, e nada nele toca no catálogo.
      log('nenhuma mudança de catálogo neste patch — o texto é de correções');
      return;
    }

    console.warn('nenhuma mudança reconhecida e o texto não parece um patch note — revise o formato.');
    process.exit(3);
  }
}

if (process.argv[1] && process.argv[1].endsWith('parse-patch-note.ts')) main();
