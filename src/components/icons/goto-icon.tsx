/**
 * Seta que sai da caixa: o botão leva para outra tela.
 *
 * Mesmo traço em `currentColor` do [GadgetIcon] e do [AttachmentIcon], para o
 * ícone herdar a cor do botão em que estiver — inclusive quando ele fica
 * destacado e o texto vira claro.
 *
 * É decorativo: quem carrega o sentido é o texto do botão ao lado, então ele
 * sai da árvore de acessibilidade em vez de virar um segundo rótulo.
 */
export function GotoIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* A caixa aberta no canto de onde a seta escapa. */}
      <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M15 3h6v6" />
      <path d="M10 14 20.5 3.5" />
    </svg>
  );
}
