'use client';

import type { MouseEvent } from 'react';

/**
 * Handlers que informam ao CSS onde o ponteiro está dentro do elemento.
 *
 * O elemento ganha `--px` e `--py` em pixels, e o estilo faz o resto — é lá que
 * mora a aparência do realce, não aqui. Guardar isso em custom properties evita
 * re-renderizar o React a cada movimento do mouse: quem muda é só o estilo
 * inline daquele nó.
 *
 * Aplicado nos chips de filtro, onde o realce acompanha o ponteiro e clareia de
 * leve a região por onde ele passa.
 */
export function pointerGlow() {
  return {
    onMouseMove: (event: MouseEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty('--px', `${event.clientX - box.left}px`);
      event.currentTarget.style.setProperty('--py', `${event.clientY - box.top}px`);
    },
  };
}
