'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Bloco que o jogador pode encolher ou soltar da página.
 *
 * A lista de armas ocupa uma coluna inteira o tempo todo, mesmo depois que a
 * arma já foi escolhida — e é justamente aí que o espaço faz falta para os
 * números. Encolher devolve a largura; soltar transforma o bloco em um painel
 * que flutua onde o jogador quiser, para ele trocar de arma sem perder de vista
 * o que estava lendo.
 *
 * Só vale no computador: em tela de celular não há espaço sobrando para onde
 * arrastar, e as abas já resolvem a disputa por área.
 */

export type PanelMode = 'fixo' | 'encolhido' | 'solto';

interface Position {
  x: number;
  y: number;
}

/** Onde o painel nasce quando é solto, se ainda não foi arrastado. */
const POSICAO_INICIAL: Position = { x: 24, y: 96 };
const LARGURA_SOLTO = 300;

export function DockablePanel({
  title,
  mode,
  onModeChange,
  children,
  className = '',
}: {
  title: string;
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  children: ReactNode;
  className?: string;
}) {
  const [position, setPosition] = useState<Position>(POSICAO_INICIAL);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);

  /*
   * O arraste corre no `window`, não no cabeçalho.
   *
   * Preso ao cabeçalho, um movimento rápido de mouse escapa do elemento e o
   * painel fica para trás — o ponteiro anda mais que o React re-renderiza.
   */
  useEffect(() => {
    if (mode !== 'solto') return;

    const mover = (e: PointerEvent) => {
      const alvo = dragging.current;
      if (!alvo) return;
      // Mantém o painel dentro da janela: um bloco arrastado para fora não
      // volta, porque o cabeçalho vai junto.
      const x = Math.min(Math.max(0, e.clientX - alvo.dx), window.innerWidth - LARGURA_SOLTO);
      const y = Math.min(Math.max(0, e.clientY - alvo.dy), window.innerHeight - 80);
      setPosition({ x, y });
    };
    const soltar = () => {
      dragging.current = null;
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
  }, [mode]);

  const iniciarArraste = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== 'solto') return;
      dragging.current = { dx: e.clientX - position.x, dy: e.clientY - position.y };
    },
    [mode, position],
  );

  const solto = mode === 'solto';
  const encolhido = mode === 'encolhido';

  return (
    <section
      className={`card bevel flex flex-col ${className}`}
      style={
        solto
          ? {
              position: 'fixed',
              left: position.x,
              top: position.y,
              width: LARGURA_SOLTO,
              maxHeight: 'calc(100dvh - 140px)',
              zIndex: 40,
              boxShadow: '0 18px 40px rgb(0 0 0 / 0.45)',
            }
          : undefined
      }
    >
      <header
        className={`flex items-center gap-1 px-2 py-1.5 ${solto ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ borderBottom: encolhido ? 'none' : '1px solid var(--border-soft)' }}
        onPointerDown={iniciarArraste}
      >
        <h2 className="label flex-1 truncate">{title}</h2>

        <PanelButton
          label={encolhido ? 'Expandir a lista' : 'Encolher a lista'}
          onClick={() => onModeChange(encolhido ? 'fixo' : 'encolhido')}
        >
          {encolhido ? '▢' : '—'}
        </PanelButton>

        <PanelButton
          label={solto ? 'Prender a lista na coluna' : 'Soltar a lista da página'}
          onClick={() => onModeChange(solto ? 'fixo' : 'solto')}
        >
          {solto ? '⇱' : '⇲'}
        </PanelButton>
      </header>

      {!encolhido && <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">{children}</div>}
    </section>
  );
}

function PanelButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="touch shrink-0 px-1.5 text-xs leading-none"
      style={{ color: 'var(--text-dim)' }}
    >
      {children}
    </button>
  );
}
