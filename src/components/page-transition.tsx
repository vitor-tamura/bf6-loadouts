'use client';

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';

/**
 * Troca de tela em cortina.
 *
 * Uma faixa inclinada varre a tela da esquerda para a direita, cobre tudo,
 * espera a tela nova montar e segue saindo pela direita — o movimento nunca
 * volta pelo caminho que veio. Cobrir a troca esconde o pior da navegação: o
 * catálogo tem 68 cartões com foto, e sem isso o quadro seguinte à navegação
 * mostra a página nova ainda se armando.
 *
 * Antes isto era View Transitions API, que faz o cruzamento no navegador de
 * graça mas não dá controle sobre o que aparece no meio, e só funciona onde o
 * navegador implementa. O efeito é o `curtains wipe` do Motion, que na versão
 * oficial vem do hook `useCurtains` — parte do Motion+, pago. O que ele resolve
 * e está reproduzido aqui é a ordem dos eventos: cobrir, só então navegar,
 * revelar só quando a tela nova estiver de pé.
 *
 * A interceptação é global, num ouvinte de clique só: assim os cartões de arma,
 * as indicações do meta e o menu passam pela cortina sem que cada um precise
 * saber que ela existe.
 */

/*
 * Quanto dura cada metade do movimento, e com que curva.
 *
 * As duas metades não são simétricas de propósito. A entrada é curta e sai do
 * lugar sem tranco, porque ela responde a um clique e qualquer atraso aí vira
 * sensação de travamento. A saída é bem mais longa e desacelera até parar: é
 * ela que a pessoa realmente vê, já lendo a tela nova por trás, e é o freio
 * longo no fim que faz o movimento passar de brusco a macio.
 */
const ENTER_MS = 440;
const EXIT_MS = 620;

/** Aceleração e freio equilibrados na ida. */
const ENTER_EASE = [0.5, 0, 0.25, 1] as const;
/** Freio longo na volta — a faixa perde velocidade bem antes de sumir. */
const EXIT_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Se a navegação não chegar, a cortina abre assim mesmo.
 *
 * Uma tela coberta para sempre é muito pior do que um corte seco: a pessoa fica
 * sem saber se o site morreu ou se ela é que não clicou direito.
 */
const FAILSAFE_MS = 1600;

/** A inclinação da faixa, em graus — a mesma ideia do `angle` do exemplo. */
const SKEW_ANGLE = 14;

type Phase = 'idle' | 'covering' | 'covered' | 'revealing';

/** Só entra na cortina o que é navegação de verdade dentro do site. */
function isInternalNavigation(a: HTMLAnchorElement, event: MouseEvent): boolean {
  // Modificadores abrem em outra aba: deixa o navegador cuidar.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (event.button !== 0) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download')) return false;

  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Âncora na mesma página rola, não navega.
  if (url.pathname === window.location.pathname && url.hash) return false;
  return true;
}

const withoutTrailingSlash = (path: string) => path.replace(/\/$/, '') || '/';

export function PageCurtain({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('idle');
  const target = useRef<string | null>(null);

  const cover = useCallback(
    (href: string) => {
      target.current = href;
      setPhase('covering');
    },
    [],
  );

  /*
   * Um ouvinte para o site inteiro.
   *
   * Fica na fase de captura para decidir antes do `Link` do Next, que também
   * escuta o clique e navegaria por baixo da cortina.
   */
  useEffect(() => {
    if (reducedMotion) return;

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;

      const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !isInternalNavigation(a, event)) return;

      const url = new URL(a.href, window.location.href);
      const href = `${url.pathname}${url.search}`;
      if (withoutTrailingSlash(url.pathname) === withoutTrailingSlash(pathname) && !url.search) return;

      event.preventDefault();
      cover(href);
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pathname, cover, reducedMotion]);

  /* Coberta a tela, a navegação acontece escondida. */
  useEffect(() => {
    if (phase !== 'covered' || !target.current) return;
    startTransition(() => router.push(target.current!));
  }, [phase, router]);

  /* A tela nova chegou: pode abrir. */
  useEffect(() => {
    if (phase !== 'covered' || !target.current) return;
    if (withoutTrailingSlash(new URL(target.current, 'http://x').pathname) !== withoutTrailingSlash(pathname)) return;
    setPhase('revealing');
  }, [pathname, phase]);

  /* Rede de segurança: navegação que não chega não deixa a tela coberta. */
  useEffect(() => {
    if (phase !== 'covered') return;
    const timer = setTimeout(() => setPhase('revealing'), FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <>
      {children}

      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[100]"
            initial={{ x: '-115%' }}
            animate={{ x: phase === 'revealing' ? '115%' : '0%' }}
            exit={{ x: '115%' }}
            transition={{
              duration: (phase === 'revealing' ? EXIT_MS : ENTER_MS) / 1000,
              ease: phase === 'revealing' ? [...EXIT_EASE] : [...ENTER_EASE],
            }}
            onAnimationComplete={() => {
              setPhase((current) => {
                if (current === 'covering') return 'covered';
                if (current === 'revealing') return 'idle';
                return current;
              });
            }}
            style={{
              /*
               * A faixa é mais larga que a tela e inclinada. Sem a sobra, o
               * canto que a inclinação deixa para trás mostraria uma nesga da
               * página justo no instante em que ela deveria estar coberta.
               *
               * A inclinação vai aqui como número, e não como `transform` em
               * texto: o Motion escreve o `transform` do elemento para animar o
               * `x`, e um `transform` declarado por fora era apagado no
               * caminho — a faixa cobria reta.
               */
              width: '140vw',
              left: '-20vw',
              skewX: -SKEW_ANGLE,
              background: 'var(--bg)',
              /*
               * A borda de ataque era uma linha dura de 2 px, e o corte contra a
               * página aparecia a cada varrida. Agora é uma linha fina com halo:
               * o brilho antecipa a chegada da faixa e dissolve o limite entre
               * ela e o que está por baixo. O halo só existe para fora da faixa,
               * então não abre nenhuma fresta no instante em que a tela precisa
               * estar coberta.
               */
              borderRight: '1px solid var(--accent)',
              boxShadow: '10px 0 34px -6px color-mix(in oklab, var(--accent) 45%, transparent)',
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Link de navegação.
 *
 * Sobrou como nome porque as telas o chamam assim; a cortina hoje vem do
 * ouvinte global, então aqui é o `Link` do Next e nada mais.
 */
export function TransitionLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} />;
}
