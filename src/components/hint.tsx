'use client';

import { cloneElement, type ReactElement, type ReactNode } from 'react';

/**
 * Uma dica que não vira balão.
 *
 * O site tinha `Tooltip` em vinte lugares. No computador eles funcionavam; no
 * celular e no aplicativo instalado, não — balão em tela de toque abre no toque
 * que era para acionar o botão, fica preso até o toque seguinte e cobre
 * justamente o que a pessoa quis tocar. Como a maior parte dos acessos é por
 * telefone, os balões saíram de vez.
 *
 * O texto não se perde: vira o nome acessível do elemento. Nada aparece na
 * tela, e quem usa leitor de tela continua ouvindo a explicação.
 *
 * Onde a dica era a única fonte da informação — o `≈` das armas aproximadas, a
 * etiqueta de temporada — vale, com o tempo, trazer o texto para a tela em vez
 * de deixá-lo só aqui.
 */
export function Hint({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactElement<{ 'aria-label'?: string }>;
}) {
  // Só texto vira nome acessível; dica montada com JSX passa direto.
  return typeof label === 'string' ? cloneElement(children, { 'aria-label': label }) : children;
}
