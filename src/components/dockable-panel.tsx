'use client';

import { Hint } from '@/components/hint';
import { Button } from 'antd';
import { motion, useDragControls } from 'motion/react';
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

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
 *
 * O arraste é o do Motion. Era feito à mão, com `pointermove` no `window` —
 * ouvinte no cabeçalho deixava o painel para trás num movimento rápido, porque
 * o ponteiro anda mais que o React re-renderiza. `drag` resolve isso no
 * compositor, sem passar por estado do React a cada quadro, e `dragConstraints`
 * cuida de não deixar o bloco sair pela borda.
 */

export type PanelMode = 'fixo' | 'encolhido' | 'solto';

const FLOATING_WIDTH = 300;

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
  const boundsRef = useRef<HTMLDivElement>(null);
  const controls = useDragControls();

  const floating = mode === 'solto';
  const collapsed = mode === 'encolhido';

  /*
   * O arraste começa pelo cabeçalho, não pelo bloco inteiro: dentro dele há uma
   * lista que rola e sessenta e oito armas para clicar, e arrastar a partir
   * delas tornaria a lista inutilizável.
   */
  const startDrag = (e: ReactPointerEvent) => {
    if (floating) controls.start(e);
  };

  const panel = (
    <motion.section
      className={`card bevel pointer-events-auto flex flex-col ${className}`}
      drag={floating}
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={boundsRef}
      dragElastic={0}
      style={
        floating
          ? {
              position: 'absolute',
              left: 24,
              top: 96,
              width: FLOATING_WIDTH,
              maxHeight: 'calc(100dvh - 140px)',
              boxShadow: '0 18px 40px rgb(0 0 0 / 0.45)',
            }
          : undefined
      }
    >
      <header
        className={`flex items-center gap-1 px-2 py-1.5 ${floating ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border-soft)' }}
        onPointerDown={startDrag}
      >
        <h2 className="label flex-1 truncate">{title}</h2>

        {/*
          Só no computador: numa tela de celular não há para onde arrastar, e a
          navegação por abas já resolve a disputa por espaço.
        */}
        <span className="hidden items-center gap-1 lg:flex">
          <PanelButton
            label={collapsed ? 'Expandir a lista' : 'Encolher a lista'}
            onClick={() => onModeChange(collapsed ? 'fixo' : 'encolhido')}
          >
            {collapsed ? '▢' : '—'}
          </PanelButton>

          <PanelButton
            label={floating ? 'Prender a lista na coluna' : 'Soltar a lista da página'}
            onClick={() => onModeChange(floating ? 'fixo' : 'solto')}
          >
            {floating ? '⇱' : '⇲'}
          </PanelButton>
        </span>
      </header>

      {!collapsed && <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">{children}</div>}
    </motion.section>
  );

  if (!floating) return panel;

  /*
   * Solto, o painel corre dentro desta moldura, que é a janela inteira. O
   * Motion mede o elemento de `dragConstraints` para saber até onde pode ir, e
   * ele precisa ser um ancestral — daí a moldura existir de fato, e não como
   * conta de `window.innerWidth`. Ela não recebe cliques: só o painel recebe.
   */
  return (
    <div ref={boundsRef} className="pointer-events-none fixed inset-0 z-40">
      {panel}
    </div>
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
    <Hint label={label}>
      <Button
        type="text"
        size="small"
        onClick={onClick}
        aria-label={label}
        className="touch shrink-0 px-1.5 text-xs leading-none"
        style={{ color: 'var(--text-dim)' }}
      >
        {children}
      </Button>
    </Hint>
  );
}
