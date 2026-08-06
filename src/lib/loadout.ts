import { ATTACHMENTS_BY_ID, isCompatible } from '@/data/attachments';
import { WEAPONS_BY_ID } from '@/data/weapons';
import { GADGETS_BY_ID } from '@/data/gadgets';
import type { Attachment, Weapon, ClassId, SlotId } from '@/data/types';

export interface Loadout {
  playerClass: ClassId;
  /** Arma principal — pode ser de qualquer categoria. */
  weapon: string | null;
  /** Um acessório por slot. */
  attachments: Partial<Record<SlotId, string>>;
  /** Secundária: pistola ou corpo a corpo. */
  sidearm: string | null;
  /**
   * Acessórios da secundária, no mesmo formato dos da principal.
   *
   * Ela tem orçamento próprio no jogo — os pontos gastos na pistola não saem
   * dos cem da arma principal —, então os dois conjuntos vivem lado a lado em
   * vez de compartilharem um mapa só.
   */
  sidearmAttachments: Partial<Record<SlotId, string>>;
  gadget1: string | null;
  gadget2: string | null;
  throwable: string | null;
}

export const EMPTY_LOADOUT: Loadout = {
  playerClass: 'assault',
  weapon: null,
  attachments: {},
  sidearm: null,
  sidearmAttachments: {},
  gadget1: null,
  gadget2: null,
  throwable: null,
};

/** Lista de acessórios escolhidos, na ordem dos slots da arma. */
export function loadoutAttachments(
  chosen: Partial<Record<SlotId, string>>,
  weapon: Weapon | null,
): Attachment[] {
  if (!weapon) return [];
  const list: Attachment[] = [];
  for (const slot of weapon.slots) {
    const id = chosen[slot];
    if (!id) continue;
    const attachment = ATTACHMENTS_BY_ID.get(id);
    if (attachment && isCompatible(attachment, weapon)) list.push(attachment);
  }
  return list;
}

/**
 * Remove do loadout tudo que não faz sentido para a arma atual: acessórios de
 * slots que ela não possui ou incompatíveis com a categoria. Usado ao trocar de
 * arma e ao abrir um link compartilhado.
 */
export function stripIncompatible(loadout: Loadout): Loadout {
  const weapon = loadout.weapon ? WEAPONS_BY_ID.get(loadout.weapon) : null;
  const sidearm = loadout.sidearm ? WEAPONS_BY_ID.get(loadout.sidearm) : null;

  const attachments = keepValidAttachments(loadout.attachments, weapon ?? null);
  const sidearmAttachments = keepValidAttachments(loadout.sidearmAttachments, sidearm ?? null);

  const keepValidGadget = (id: string | null) => {
    if (!id) return null;
    const g = GADGETS_BY_ID.get(id);
    if (!g) return null;
    return g.playerClass === loadout.playerClass || g.playerClass === 'all' ? id : null;
  };

  return {
    ...loadout,
    attachments,
    sidearmAttachments,
    gadget1: keepValidGadget(loadout.gadget1),
    gadget2: keepValidGadget(loadout.gadget2),
  };
}

/** Só o que cabe nos slots daquela arma e é compatível com ela. */
function keepValidAttachments(
  chosen: Partial<Record<SlotId, string>>,
  weapon: Weapon | null,
): Partial<Record<SlotId, string>> {
  if (!weapon) return {};
  const kept: Partial<Record<SlotId, string>> = {};
  for (const slot of weapon.slots) {
    const id = chosen[slot];
    if (!id) continue;
    const attachment = ATTACHMENTS_BY_ID.get(id);
    if (attachment && attachment.slot === slot && isCompatible(attachment, weapon)) {
      kept[slot] = id;
    }
  }
  return kept;
}

/** Nome curto do loadout, usado em título de página e no compartilhamento. */
export function loadoutName(loadout: Loadout): string {
  const weapon = loadout.weapon ? WEAPONS_BY_ID.get(loadout.weapon) : null;
  return weapon ? weapon.name : 'Novo loadout';
}
