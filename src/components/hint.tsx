'use client';

import { Tooltip } from 'antd';
import { cloneElement, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';

/**
 * Um balão de dica que some quando o site roda como aplicativo.
 *
 * Instalado na tela inicial, o site é usado com o dedo — e balão de dica em
 * tela de toque é um estorvo: ele abre no toque que era para acionar o botão,
 * fica preso até o toque seguinte e cobre justamente o que a pessoa quis tocar.
 * No navegador, com ponteiro, ele continua sendo útil e continua lá.
 *
 * A dica não se perde no caminho: fora do balão, ela vira o atributo `title` do
 * próprio elemento. Nada aparece ao toque, e quem navega por teclado ou leitor
 * de tela continua alcançando o texto.
 */

/** Assina a mudança de modo de exibição — instalar ou desinstalar o app troca isso. */
function subscribe(onChange: () => void) {
  const query = window.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/*
 * `display-mode` cobre Android e desktop; o `navigator.standalone` é a resposta
 * do iOS, que só implementou o media query bem depois e ainda aparece em
 * aparelho antigo.
 */
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/*
 * No servidor a resposta é sempre "não é aplicativo".
 *
 * O HTML é gerado no build, e `useSyncExternalStore` exige um valor para essa
 * hora. Marcar `false` deixa o primeiro quadro igual ao do navegador comum —
 * quem abriu pelo app perde os balões no quadro seguinte, o que é justamente o
 * que se quer.
 */
const onServer = () => false;

export function useStandalone(): boolean {
  return useSyncExternalStore(subscribe, isStandalone, onServer);
}

export function Hint({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactElement<{ title?: string }>;
}) {
  const standalone = useStandalone();

  if (standalone) {
    // `title` só aceita texto; dica montada com JSX simplesmente não vira atributo.
    return typeof label === 'string' ? cloneElement(children, { title: label }) : children;
  }

  return <Tooltip title={label}>{children}</Tooltip>;
}
