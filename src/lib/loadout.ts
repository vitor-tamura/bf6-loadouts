import { ACESSORIOS_POR_ID, ehCompativel } from '@/dados/acessorios';
import { ARMAS_POR_ID } from '@/dados/armas';
import { GADGETS_POR_ID } from '@/dados/gadgets';
import type { Acessorio, Arma, IdClasse, IdSlot } from '@/dados/tipos';

export interface Loadout {
  classe: IdClasse;
  /** Arma principal — pode ser de qualquer categoria. */
  arma: string | null;
  /** Um acessório por slot. */
  acessorios: Partial<Record<IdSlot, string>>;
  /** Secundária: pistola ou corpo a corpo. */
  secundaria: string | null;
  gadget1: string | null;
  gadget2: string | null;
  granada: string | null;
}

export const LOADOUT_VAZIO: Loadout = {
  classe: 'assalto',
  arma: null,
  acessorios: {},
  secundaria: null,
  gadget1: null,
  gadget2: null,
  granada: null,
};

/** Lista de acessórios do loadout, na ordem dos slots da arma. */
export function acessoriosDoLoadout(loadout: Loadout, arma: Arma | null): Acessorio[] {
  if (!arma) return [];
  const lista: Acessorio[] = [];
  for (const slot of arma.slots) {
    const id = loadout.acessorios[slot];
    if (!id) continue;
    const acessorio = ACESSORIOS_POR_ID.get(id);
    if (acessorio && ehCompativel(acessorio, arma)) lista.push(acessorio);
  }
  return lista;
}

/**
 * Remove do loadout tudo que não faz sentido para a arma atual: acessórios de
 * slots que ela não possui ou incompatíveis com a categoria. Usado ao trocar de
 * arma e ao abrir um link compartilhado.
 */
export function limparIncompativeis(loadout: Loadout): Loadout {
  const arma = loadout.arma ? ARMAS_POR_ID.get(loadout.arma) : null;
  if (!arma) return { ...loadout, acessorios: {} };

  const acessorios: Partial<Record<IdSlot, string>> = {};
  for (const slot of arma.slots) {
    const id = loadout.acessorios[slot];
    if (!id) continue;
    const acessorio = ACESSORIOS_POR_ID.get(id);
    if (acessorio && acessorio.slot === slot && ehCompativel(acessorio, arma)) {
      acessorios[slot] = id;
    }
  }

  const gadgetValido = (id: string | null) => {
    if (!id) return null;
    const g = GADGETS_POR_ID.get(id);
    if (!g) return null;
    return g.classe === loadout.classe || g.classe === 'todas' ? id : null;
  };

  return {
    ...loadout,
    acessorios,
    gadget1: gadgetValido(loadout.gadget1),
    gadget2: gadgetValido(loadout.gadget2),
  };
}

/** Nome curto do loadout, usado em título de página e no compartilhamento. */
export function nomeDoLoadout(loadout: Loadout): string {
  const arma = loadout.arma ? ARMAS_POR_ID.get(loadout.arma) : null;
  return arma ? arma.nome : 'Novo loadout';
}
