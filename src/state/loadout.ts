'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { WEAPONS_BY_ID } from '@/data/weapons';
import type { ClassId, SlotId } from '@/data/types';
import { encodeLoadout, decodeLoadout, LOADOUT_PARAM } from '@/lib/share';
import { stripIncompatible, EMPTY_LOADOUT, type Loadout } from '@/lib/loadout';

interface LoadoutState {
  loadout: Loadout;
  /** Alterna entre montador e comparação com a arma de fábrica. */
  compareWithBase: boolean;

  setPlayerClass: (playerClass: ClassId) => void;
  setWeapon: (id: string | null) => void;
  setAttachment: (slot: SlotId, id: string | null) => void;
  setSidearm: (id: string | null) => void;
  setSidearmAttachment: (slot: SlotId, id: string | null) => void;
  setGadget: (trackPointer: 1 | 2, id: string | null) => void;
  setThrowable: (id: string | null) => void;
  toggleBaseComparison: () => void;
  clearAttachments: () => void;
  clearSidearmAttachments: () => void;
  loadLoadout: (loadout: Loadout) => void;
  resetLoadout: () => void;
}

export const useLoadout = create<LoadoutState>((set) => ({
  loadout: EMPTY_LOADOUT,
  compareWithBase: true,

  setPlayerClass: (playerClass) =>
    set((s) => {
      const weapon = s.loadout.weapon ? WEAPONS_BY_ID.get(s.loadout.weapon) : null;
      // Trocar de classe mantém a arma: em BF6 qualquer classe usa qualquer
      // categoria, o que muda é o bônus da arma-assinatura.
      return { loadout: stripIncompatible({ ...s.loadout, playerClass, weapon: weapon?.id ?? null }) };
    }),

  setWeapon: (id) =>
    set((s) => ({
      // Acessórios do slot que a nova arma não tem simplesmente somem.
      loadout: stripIncompatible({ ...s.loadout, weapon: id }),
    })),

  setAttachment: (slot, id) =>
    set((s) => {
      const attachments = { ...s.loadout.attachments };
      if (id) attachments[slot] = id;
      else delete attachments[slot];
      return { loadout: { ...s.loadout, attachments } };
    }),

  // Trocar de secundária limpa o que estava nela: os acessórios de uma pistola
  // não valem para outra, e mantê-los só produziria slots fantasma.
  setSidearm: (id) =>
    set((s) => ({ loadout: { ...s.loadout, sidearm: id, sidearmAttachments: {} } })),

  setSidearmAttachment: (slot, id) =>
    set((s) => {
      const sidearmAttachments = { ...s.loadout.sidearmAttachments };
      if (id) sidearmAttachments[slot] = id;
      else delete sidearmAttachments[slot];
      return { loadout: { ...s.loadout, sidearmAttachments } };
    }),

  setGadget: (trackPointer, id) =>
    set((s) => {
      const statKey = trackPointer === 1 ? 'gadget1' : 'gadget2';
      const otherSlot = trackPointer === 1 ? 'gadget2' : 'gadget1';
      // O mesmo gadget não pode ocupar os dois espaços.
      const clearOther = id && s.loadout[otherSlot] === id ? { [otherSlot]: null } : {};
      return { loadout: { ...s.loadout, [statKey]: id, ...clearOther } };
    }),

  setThrowable: (id) => set((s) => ({ loadout: { ...s.loadout, throwable: id } })),

  toggleBaseComparison: () => set((s) => ({ compareWithBase: !s.compareWithBase })),

  // Limpar devolve a arma de fábrica — e de fábrica ela vem com munição.
  clearAttachments: () =>
    set((s) => ({ loadout: stripIncompatible({ ...s.loadout, attachments: {} }) })),

  clearSidearmAttachments: () =>
    set((s) => ({ loadout: stripIncompatible({ ...s.loadout, sidearmAttachments: {} }) })),

  loadLoadout: (loadout) => set({ loadout: stripIncompatible(loadout) }),

  resetLoadout: () => set({ loadout: EMPTY_LOADOUT }),
}));

/**
 * Mantém o loadout e a URL em sincronia.
 *
 * A URL é a única memória da aplicação: recarregar a página não perde o
 * trabalho e compartilhar é copiar o endereço. Por isso não há localStorage —
 * seria uma segunda fonte de verdade para o mesmo dado.
 */
export function useUrlSync() {
  const loadout = useLoadout((s) => s.loadout);
  const loadLoadout = useLoadout((s) => s.loadLoadout);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get(LOADOUT_PARAM);
    if (!code) return;
    const restored = decodeLoadout(code);
    if (restored) loadLoadout(restored);
  }, [loadLoadout]);

  useEffect(() => {
    if (!loadout.weapon) return;
    const url = new URL(window.location.href);
    url.searchParams.set(LOADOUT_PARAM, encodeLoadout(loadout));
    window.history.replaceState(null, '', url);
  }, [loadout]);
}
