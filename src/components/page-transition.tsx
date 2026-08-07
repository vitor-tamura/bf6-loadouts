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

/** Quanto dura cada metade do movimento. */
const VARRIDA_MS = 420;

/**
 * Se a navegação não chegar, a cortina abre assim mesmo.
 *
 * Uma tela coberta para sempre é muito pior do que um corte seco: a pessoa fica
 * sem saber se o site morreu ou se ela é que não clicou direito.
 */
const SOCORRO_MS = 1600;

/** A inclinação da faixa, em graus — a mesma ideia do `angle` do exemplo. */
const INCLINACAO = 14;

type Fase = 'parado' | 'cobrindo' | 'coberto' | 'revelando';

/** Só entra na cortina o que é navegação de verdade dentro do site. */
function ehNavegacaoInterna(a: HTMLAnchorElement, event: MouseEvent): boolean {
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

const semBarra = (caminho: string) => caminho.replace(/\/$/, '') || '/';

export function PageCurtain({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduzido = useReducedMotion();

  const [fase, setFase] = useState<Fase>('parado');
  const destino = useRef<string | null>(null);

  const cobrir = useCallback(
    (href: string) => {
      destino.current = href;
      setFase('cobrindo');
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
    if (reduzido) return;

    function aoClicar(event: MouseEvent) {
      if (event.defaultPrevented) return;

      const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !ehNavegacaoInterna(a, event)) return;

      const url = new URL(a.href, window.location.href);
      const alvo = `${url.pathname}${url.search}`;
      if (semBarra(url.pathname) === semBarra(pathname) && !url.search) return;

      event.preventDefault();
      cobrir(alvo);
    }

    document.addEventListener('click', aoClicar, true);
    return () => document.removeEventListener('click', aoClicar, true);
  }, [pathname, cobrir, reduzido]);

  /* Coberta a tela, a navegação acontece escondida. */
  useEffect(() => {
    if (fase !== 'coberto' || !destino.current) return;
    startTransition(() => router.push(destino.current!));
  }, [fase, router]);

  /* A tela nova chegou: pode abrir. */
  useEffect(() => {
    if (fase !== 'coberto' || !destino.current) return;
    if (semBarra(new URL(destino.current, 'http://x').pathname) !== semBarra(pathname)) return;
    setFase('revelando');
  }, [pathname, fase]);

  /* Rede de segurança: navegação que não chega não deixa a tela coberta. */
  useEffect(() => {
    if (fase !== 'coberto') return;
    const timer = setTimeout(() => setFase('revelando'), SOCORRO_MS);
    return () => clearTimeout(timer);
  }, [fase]);

  return (
    <>
      {children}

      <AnimatePresence>
        {fase !== 'parado' && (
          <motion.div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[100]"
            initial={{ x: '-115%' }}
            animate={{ x: fase === 'revelando' ? '115%' : '0%' }}
            exit={{ x: '115%' }}
            transition={{ duration: VARRIDA_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => {
              setFase((atual) => {
                if (atual === 'cobrindo') return 'coberto';
                if (atual === 'revelando') return 'parado';
                return atual;
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
              skewX: -INCLINACAO,
              background: 'var(--bg)',
              borderRight: '2px solid var(--accent)',
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
