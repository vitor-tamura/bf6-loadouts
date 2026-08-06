import type { ReactNode } from 'react';

/**
 * Rodapé comum às telas.
 *
 * Junta o que precisa aparecer em toda página — o aviso de projeto de fã e o
 * link para o código — e deixa cada tela acrescentar a sua própria nota de
 * leitura. Antes cada página repetia o aviso por conta própria, com redações
 * diferentes.
 */

const REPO = 'https://github.com/vitor-tamura/bf6-loadouts';

export function SiteFooter({ note, className = '' }: { note?: ReactNode; className?: string }) {
  return (
    <footer
      className={`pb-safe mt-6 space-y-1 text-center text-[11px] ${className}`}
      style={{ color: 'var(--text-dim)' }}
    >
      {note && <p>{note}</p>}
      <p>
        Projeto de fã, sem vínculo com a EA ou a DICE. Battlefield é marca registrada da Electronic
        Arts.
      </p>
      <p>
        <a
          href={REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 underline underline-offset-2"
          style={{ color: 'var(--text-soft)' }}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l-4-6 4-6M15 6l4 6-4 6" />
          </svg>
          Código aberto no GitHub
        </a>
      </p>
    </footer>
  );
}
