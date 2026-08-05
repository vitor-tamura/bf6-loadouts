'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { ARMAS_POR_ID } from '@/dados/armas';
import type { IdClasse, IdSlot } from '@/dados/tipos';
import { codificarLoadout, decodificarLoadout, PARAM_LOADOUT } from '@/lib/compartilhar';
import { limparIncompativeis, LOADOUT_VAZIO, type Loadout } from '@/lib/loadout';

interface EstadoLoadout {
  loadout: Loadout;
  /** Alterna entre montador e comparação com a arma de fábrica. */
  compararComBase: boolean;

  definirClasse: (classe: IdClasse) => void;
  definirArma: (id: string | null) => void;
  definirAcessorio: (slot: IdSlot, id: string | null) => void;
  definirSecundaria: (id: string | null) => void;
  definirGadget: (posicao: 1 | 2, id: string | null) => void;
  definirGranada: (id: string | null) => void;
  alternarComparacao: () => void;
  limparAcessorios: () => void;
  carregar: (loadout: Loadout) => void;
  resetar: () => void;
}

export const useLoadout = create<EstadoLoadout>((set) => ({
  loadout: LOADOUT_VAZIO,
  compararComBase: true,

  definirClasse: (classe) =>
    set((s) => {
      const arma = s.loadout.arma ? ARMAS_POR_ID.get(s.loadout.arma) : null;
      // Trocar de classe mantém a arma: em BF6 qualquer classe usa qualquer
      // categoria, o que muda é o bônus da arma-assinatura.
      return { loadout: limparIncompativeis({ ...s.loadout, classe, arma: arma?.id ?? null }) };
    }),

  definirArma: (id) =>
    set((s) => ({
      // Acessórios do slot que a nova arma não tem simplesmente somem.
      loadout: limparIncompativeis({ ...s.loadout, arma: id }),
    })),

  definirAcessorio: (slot, id) =>
    set((s) => {
      const acessorios = { ...s.loadout.acessorios };
      if (id) acessorios[slot] = id;
      else delete acessorios[slot];
      return { loadout: { ...s.loadout, acessorios } };
    }),

  definirSecundaria: (id) => set((s) => ({ loadout: { ...s.loadout, secundaria: id } })),

  definirGadget: (posicao, id) =>
    set((s) => {
      const chave = posicao === 1 ? 'gadget1' : 'gadget2';
      const outro = posicao === 1 ? 'gadget2' : 'gadget1';
      // O mesmo gadget não pode ocupar os dois espaços.
      const limpaOutro = id && s.loadout[outro] === id ? { [outro]: null } : {};
      return { loadout: { ...s.loadout, [chave]: id, ...limpaOutro } };
    }),

  definirGranada: (id) => set((s) => ({ loadout: { ...s.loadout, granada: id } })),

  alternarComparacao: () => set((s) => ({ compararComBase: !s.compararComBase })),

  limparAcessorios: () => set((s) => ({ loadout: { ...s.loadout, acessorios: {} } })),

  carregar: (loadout) => set({ loadout: limparIncompativeis(loadout) }),

  resetar: () => set({ loadout: LOADOUT_VAZIO }),
}));

/**
 * Mantém o loadout e a URL em sincronia.
 *
 * A URL é a única memória da aplicação: recarregar a página não perde o
 * trabalho e compartilhar é copiar o endereço. Por isso não há localStorage —
 * seria uma segunda fonte de verdade para o mesmo dado.
 */
export function useSincronizarUrl() {
  const loadout = useLoadout((s) => s.loadout);
  const carregar = useLoadout((s) => s.carregar);

  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get(PARAM_LOADOUT);
    if (!codigo) return;
    const recuperado = decodificarLoadout(codigo);
    if (recuperado) carregar(recuperado);
  }, [carregar]);

  useEffect(() => {
    if (!loadout.arma) return;
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM_LOADOUT, codificarLoadout(loadout));
    window.history.replaceState(null, '', url);
  }, [loadout]);
}
