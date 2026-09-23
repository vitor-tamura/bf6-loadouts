'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Velocidade da leitura, em pixels por segundo — devagar o bastante para acompanhar. */
const PIXELS_POR_SEGUNDO = 35;

/**
 * Texto de uma linha que desliza quando não cabe.
 *
 * A etiqueta do cartão de tendência tem largura de etiqueta, e o assunto do dia
 * nem sempre — "discussão sobre laser de mira" cortava no meio da palavra, e o
 * que sobrava não dizia nada. Quebrar linha empurrava a foto para baixo em um
 * cartão e não no vizinho, desalinhando a grade.
 *
 * O texto fica numa linha só; se ele passa da largura, vai até o fim e volta,
 * com uma pausa em cada ponta para dar tempo de ler. Texto que cabe fica
 * parado. Passar o mouse pausa, e quem pediu menos movimento ao sistema vê o
 * texto quebrando linha, inteiro, sem animação.
 */
export function SlidingText({ children, className }: { children: string; className?: string }) {
  const caixa = useRef<HTMLSpanElement>(null);
  const texto = useRef<HTMLSpanElement>(null);
  const [sobra, setSobra] = useState(0);

  useLayoutEffect(() => {
    const medir = () => {
      if (!caixa.current || !texto.current) return;
      const diferenca = texto.current.scrollWidth - caixa.current.clientWidth;
      // Um ou dois pixels de sobra são arredondamento, não texto escondido.
      setSobra(diferenca > 2 ? diferenca : 0);
    };

    medir();
    if (typeof ResizeObserver === 'undefined' || !caixa.current) return;
    const observador = new ResizeObserver(medir);
    observador.observe(caixa.current);
    return () => observador.disconnect();
  }, [children]);

  // A viagem ocupa 70% do ciclo; o resto são as pausas nas duas pontas.
  const duracao = Math.max(3, sobra / PIXELS_POR_SEGUNDO / 0.7);

  return (
    <span
      ref={caixa}
      title={sobra ? children : undefined}
      className={`sliding-text ${sobra ? 'sliding-text--on' : ''} ${className ?? ''}`}
      style={{ '--slide': `-${sobra}px`, '--slide-duration': `${duracao}s` } as CSSProperties}
    >
      <span ref={texto} className="sliding-text__inner">
        {children}
      </span>
    </span>
  );
}
