import { WEAPONS_BY_ID } from '@/data/weapons';
import { CLASSES } from '@/data/classes';
import type { ClassId, SlotId, Weapon } from '@/data/types';
import { EMPTY_LOADOUT, stripIncompatible, type Loadout } from './loadout';

/**
 * O loadout inteiro viaja dentro da URL — não há servidor nem banco, então o
 * link nunca expira e continua funcionando com a aplicação hospedada em
 * qualquer lugar.
 *
 * Formato antes de codificar (versão 1):
 *
 *   1~<arma>~<slot:acessorio,slot:acessorio>~<classe>~<secundária>~<g1|g2>~<granada>
 *
 * O prefixo de versão permite mudar o formato depois sem quebrar links antigos.
 * A leitura é tolerante: qualquer id desconhecido é descartado em vez de
 * derrubar a página, o que importa quando o dataset é atualizado a cada
 * temporada.
 */

const VERSION = '1';
const FIELD_SEP = '~';
const LIST_SEP = ',';
const PAIR_SEP = ':';
const GADGET_SEP = '|';

/** Abreviações de slot, para encurtar o link. */
const SLOT_CODE: Record<SlotId, string> = {
  sight: 'si',
  muzzle: 'mz',
  barrel: 'br',
  underbarrel: 'ub',
  magazine: 'mg',
  ammo: 'am',
  ergonomics: 'er',
  opticAccessory: 'oa',
  leftRail: 'lr',
  rightRail: 'rr',
};

const SLOT_BY_CODE = new Map<string, SlotId>(
  (Object.entries(SLOT_CODE) as [SlotId, string][]).map(([slot, code]) => [code, slot]),
);

const CLASS_IDS = new Set<string>(CLASSES.map((c) => c.id));

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary =
    typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** `si:abc,mz:def` — os acessórios de uma arma, na ordem dos slots dela. */
function encodeAttachments(
  chosen: Partial<Record<SlotId, string>>,
  weapon: Weapon | undefined,
): string {
  return (weapon?.slots ?? [])
    .map((slot) => {
      const id = chosen[slot];
      return id ? `${SLOT_CODE[slot]}${PAIR_SEP}${id}` : null;
    })
    .filter(Boolean)
    .join(LIST_SEP);
}

function decodeAttachments(text: string): Partial<Record<SlotId, string>> {
  const chosen: Partial<Record<SlotId, string>> = {};
  for (const pair of text.split(LIST_SEP)) {
    if (!pair) continue;
    const splitAt = pair.indexOf(PAIR_SEP);
    if (splitAt < 0) continue;
    const slot = SLOT_BY_CODE.get(pair.slice(0, splitAt));
    const id = pair.slice(splitAt + 1);
    if (slot && id) chosen[slot] = id;
  }
  return chosen;
}

export function encodeLoadout(loadout: Loadout): string {
  const weapon = WEAPONS_BY_ID.get(loadout.weapon ?? '');
  const sidearm = WEAPONS_BY_ID.get(loadout.sidearm ?? '');
  const attachments = encodeAttachments(loadout.attachments, weapon);

  const gadgets = [loadout.gadget1 ?? '', loadout.gadget2 ?? ''].join(GADGET_SEP);

  const fields = [
    VERSION,
    loadout.weapon ?? '',
    attachments,
    loadout.playerClass,
    loadout.sidearm ?? '',
    gadgets === GADGET_SEP ? '' : gadgets,
    loadout.throwable ?? '',
    // Último campo, e por isso o formato antigo continua sendo lido: um link
    // sem ele simplesmente chega com a secundária sem acessórios.
    encodeAttachments(loadout.sidearmAttachments, sidearm),
  ];

  // Campos vazios no fim não precisam viajar.
  while (fields.length > 2 && fields[fields.length - 1] === '') fields.pop();

  return toBase64Url(fields.join(FIELD_SEP));
}

export function decodeLoadout(code: string): Loadout | null {
  if (!code) return null;

  let text: string;
  try {
    text = fromBase64Url(code);
  } catch {
    return null;
  }

  const fields = text.split(FIELD_SEP);
  if (fields[0] !== VERSION) return null;

  const [
    ,
    weaponId = '',
    attachmentsText = '',
    classText = '',
    sidearm = '',
    gadgetsText = '',
    throwable = '',
    sidearmAttachmentsText = '',
  ] = fields;

  const [gadget1 = '', gadget2 = ''] = gadgetsText.split(GADGET_SEP);

  const raw: Loadout = {
    ...EMPTY_LOADOUT,
    playerClass: CLASS_IDS.has(classText) ? (classText as ClassId) : EMPTY_LOADOUT.playerClass,
    weapon: WEAPONS_BY_ID.has(weaponId) ? weaponId : null,
    attachments: decodeAttachments(attachmentsText),
    sidearm: WEAPONS_BY_ID.has(sidearm) ? sidearm : null,
    sidearmAttachments: decodeAttachments(sidearmAttachmentsText),
    gadget1: gadget1 || null,
    gadget2: gadget2 || null,
    throwable: throwable || null,
  };

  return stripIncompatible(raw);
}

/**
 * URL completa do loadout, pronta para copiar.
 *
 * O código vai como parâmetro de busca em vez de segmento de caminho porque a
 * aplicação é exportada estaticamente: uma rota `/l/[codigo]` exigiria conhecer
 * todos os loadouts possíveis no momento do build.
 */
export const LOADOUT_PARAM = 'l';

/**
 * Onde o link do loadout abre.
 *
 * A raiz é o catálogo; o montador tem rota própria. Links antigos apontando
 * para `/?l=…` continuam válidos — a home reencaminha para cá com o código
 * intacto.
 */
export const BUILDER_PATH = '/montar/';

export function loadoutUrl(loadout: Loadout, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${BUILDER_PATH}?${LOADOUT_PARAM}=${encodeLoadout(loadout)}`;
}

/** Onde o cartão em imagem é desenhado. */
export const IMAGE_PATH = '/api/loadout/imagem/';

/**
 * URL da imagem do loadout, pronta para colar.
 *
 * O cartão sempre teve endereço próprio — é uma rota GET com o mesmo código do
 * link —, mas a única forma de chegar nele era o botão de baixar, que gastava
 * um arquivo no aparelho para mostrar o que um endereço já mostra. Quem cola em
 * conversa, fórum ou aba nova quer isto aqui.
 */
export function loadoutImageUrl(loadout: Loadout, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${IMAGE_PATH}?${LOADOUT_PARAM}=${encodeLoadout(loadout)}`;
}
