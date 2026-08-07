'use client';

import { Button, Tooltip } from 'antd';
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
  const limites = useRef<HTMLDivElement>(null);
  const controls = useDragControls();

  const solto = mode === 'solto';
  const encolhido = mode === 'encolhido';

  /*
   * O arraste começa pelo cabeçalho, não pelo bloco inteiro: dentro dele há uma
   * lista que rola e sessenta e oito armas para clicar, e arrastar a partir
   * delas tornaria a lista inutilizável.
   */
  const pegar = (e: ReactPointerEvent) => {
    if (solto) controls.start(e);
  };

  const painel = (
    <motion.section
      className={`card bevel pointer-events-auto flex flex-col ${className}`}
      drag={solto}
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={limites}
      dragElastic={0}
      style={
        solto
          ? {
              position: 'absolute',
              left: 24,
              top: 96,
              width: LARGURA_SOLTO,
              maxHeight: 'calc(100dvh - 140px)',
              boxShadow: '0 18px 40px rgb(0 0 0 / 0.45)',
            }
          : undefined
      }
    >
      <header
        className={`flex items-center gap-1 px-2 py-1.5 ${solto ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ borderBottom: encolhido ? 'none' : '1px solid var(--border-soft)' }}
        onPointerDown={pegar}
      >
        <h2 className="label flex-1 truncate">{title}</h2>

        {/*
          Só no computador: numa tela de celular não há para onde arrastar, e a
          navegação por abas já resolve a disputa por espaço.
        */}
        <span className="hidden items-center gap-1 lg:flex">
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
        </span>
      </header>

      {!encolhido && <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">{children}</div>}
    </motion.section>
  );

  if (!solto) return painel;

  /*
   * Solto, o painel corre dentro desta moldura, que é a janela inteira. O
   * Motion mede o elemento de `dragConstraints` para saber até onde pode ir, e
   * ele precisa ser um ancestral — daí a moldura existir de fato, e não como
   * conta de `window.innerWidth`. Ela não recebe cliques: só o painel recebe.
   */
  return (
    <div ref={limites} className="pointer-events-none fixed inset-0 z-40">
      {painel}
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
    <Tooltip title={label}>
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
    </Tooltip>
  );
}
