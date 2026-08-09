'use client';

import { useSyncExternalStore } from 'react';

/**
 * Responde a uma media query e acompanha as mudanças.
 *
 * Existe porque nem tudo que depende da largura cabe em CSS: a altura da grade
 * do arsenal, por exemplo, é uma prop de componente, não uma classe. Usa
 * `useSyncExternalStore` em vez de estado com efeito porque é exatamente disso
 * que se trata — assinar uma fonte de fora do React.
 *
 * No servidor a resposta é sempre `false`. O HTML é gerado no build, sem tela
 * para medir, e assumir "não bate" faz o primeiro quadro sair no arranjo de
 * celular, que é o mais estreito e o que menos quebra quando o valor certo
 * chega logo depois.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** O ponto em que a tela deixa de ser de celular — o mesmo `lg:` do Tailwind. */
export const useDesktop = () => useMediaQuery('(min-width: 1024px)');
