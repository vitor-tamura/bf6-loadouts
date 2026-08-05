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
  gadget1: string | null;
  gadget2: string | null;
  throwable: string | null;
}

export const EMPTY_LOADOUT: Loadout = {
  playerClass: 'assalto',
  weapon: null,
  attachments: {},
  sidearm: null,
  gadget1: null,
  gadget2: null,
  throwable: null,
};

/** Lista de acessórios do loadout, na ordem dos slots da arma. */
export function loadoutAttachments(loadout: Loadout, weapon: Weapon | null): Attachment[] {
  if (!weapon) return [];
  const list: Attachment[] = [];
  for (const slot of weapon.slots) {
    const id = loadout.attachments[slot];
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
  if (!weapon) return { ...loadout, attachments: {} };

  const attachments: Partial<Record<SlotId, string>> = {};
  for (const slot of weapon.slots) {
    const id = loadout.attachments[slot];
    if (!id) continue;
    const attachment = ATTACHMENTS_BY_ID.get(id);
    if (attachment && attachment.slot === slot && isCompatible(attachment, weapon)) {
      attachments[slot] = id;
    }
  }

  const keepValidGadget = (id: string | null) => {
    if (!id) return null;
    const g = GADGETS_BY_ID.get(id);
    if (!g) return null;
    return g.playerClass === loadout.playerClass || g.playerClass === 'todas' ? id : null;
  };

  return {
    ...loadout,
    attachments,
    gadget1: keepValidGadget(loadout.gadget1),
    gadget2: keepValidGadget(loadout.gadget2),
  };
}

/** Nome curto do loadout, usado em título de página e no compartilhamento. */
export function loadoutName(loadout: Loadout): string {
  const weapon = loadout.weapon ? WEAPONS_BY_ID.get(loadout.weapon) : null;
  return weapon ? weapon.name : 'Novo loadout';
}
