'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Cabeçalho comum às telas.
 *
 * O menu fica sempre visível — montar e comparar são as duas coisas que o
 * jogador faz aqui, e esconder uma delas atrás de um ícone seria repetir o
 * problema do site que serviu de referência.
 */

const SECOES = [
  { href: '/', nome: 'Montar' },
  { href: '/comparar/', nome: 'Comparar' },
];

function useTema() {
  const [claro, setClaro] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.tema = claro ? 'claro' : 'escuro';
  }, [claro]);

  return { claro, alternar: () => setClaro((v) => !v) };
}

export function Cabecalho({ subtitulo, acoes }: { subtitulo?: string; acoes?: ReactNode }) {
  const caminho = usePathname();
  const tema = useTema();

  return (
    <header
      className="pt-seguro sticky top-0 z-30 border-b px-3 pb-2 backdrop-blur"
      style={{
        background: 'color-mix(in oklab, var(--fundo) 88%, transparent)',
        borderColor: 'var(--borda-suave)',
      }}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="min-w-0 shrink-0">
            <h1 className="font-display truncate text-lg leading-tight font-bold tracking-wide">
              ARSENAL <span style={{ color: 'var(--destaque)' }}>BF6</span>
            </h1>
            {subtitulo && (
              <p className="truncate text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
                {subtitulo}
              </p>
            )}
          </Link>

          <nav aria-label="Seções" className="flex gap-1">
            {SECOES.map((secao) => {
              const ativa = caminho === secao.href || caminho === secao.href.replace(/\/$/, '');
              return (
                <Link
                  key={secao.href}
                  href={secao.href}
                  aria-current={ativa ? 'page' : undefined}
                  className="chanfro-sm px-3 py-1.5 text-sm font-semibold transition-colors"
                  style={{
                    background: ativa ? 'color-mix(in oklab, var(--destaque) 18%, transparent)' : 'transparent',
                    color: ativa ? 'var(--destaque)' : 'var(--texto-fraco)',
                  }}
                >
                  {secao.nome}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={tema.alternar}
            className="toque px-2 text-base"
            aria-label={tema.claro ? 'Usar tema escuro' : 'Usar tema claro'}
            style={{ color: 'var(--texto-fraco)' }}
          >
            {tema.claro ? '☾' : '☀'}
          </button>
          {acoes}
        </div>
      </div>
    </header>
  );
}
