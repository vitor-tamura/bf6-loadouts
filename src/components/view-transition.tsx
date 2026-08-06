'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, startTransition, type ComponentProps } from 'react';

/**
 * Troca de tela com View Transitions.
 *
 * Sem isso a navegação é um corte seco: a tela antiga some e a nova aparece no
 * quadro seguinte. A API do navegador tira uma foto do antes, deixa o React
 * pintar o depois e cruza as duas.
 *
 * O laço aqui existe porque `router.push` não é síncrono — ele agenda a
 * navegação e volta na hora. `startViewTransition` precisa de uma promessa que
 * só resolva quando a tela nova estiver montada, e é [TransitionWatcher], no
 * layout, que resolve essa promessa ao ver o caminho mudar.
 *
 * Não uso o `<ViewTransition>` do React porque ele vive nas versões canary, e
 * trocar o React do projeto por causa de uma animação sairia caro demais. Sem
 * suporte no navegador, a navegação acontece igual, só que sem o cruzamento.
 */

/** A navegação é uma de cada vez; não há o que empilhar. */
let finishNavigation: (() => void) | null = null;

/** Se a rota não mudar (link para a própria tela, erro), a tela não pode travar. */
const SAFETY_MS = 1200;

export function TransitionLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;

        // Modificadores abrem em outra aba: deixa o navegador cuidar.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!document.startViewTransition) return;
        if (href.replace(/\/$/, '') === pathname.replace(/\/$/, '')) return;

        event.preventDefault();
        document.startViewTransition(
          () =>
            new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, SAFETY_MS);
              finishNavigation = () => {
                clearTimeout(timer);
                resolve();
              };
              startTransition(() => router.push(href));
            }),
        );
      }}
      {...props}
    />
  );
}

/** Vive no layout e avisa quando a tela nova entrou. */
export function TransitionWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    finishNavigation?.();
    finishNavigation = null;
  }, [pathname]);

  return null;
}
