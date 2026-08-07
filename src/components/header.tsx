'use client';

import Link from 'next/link';
import { TransitionLink } from '@/components/view-transition';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BUILD_DATE } from '@/data/build';
import { seasonLabel, seasonOn } from '@/data/season';

/**
 * Cabeçalho comum às telas.
 *
 * O menu fica sempre visível — montar e comparar são as duas coisas que o
 * jogador faz aqui, e esconder uma delas atrás de um ícone seria repetir o
 * problema do site que serviu de referência.
 */

/** `curto` é o rótulo do celular, onde o nome inteiro quebraria em três linhas. */
const SECTIONS = [
  { href: '/', name: 'Todas as Armas', curto: 'Armas' },
  { href: '/montar/', name: 'Montar', curto: 'Montar' },
  { href: '/comparar/', name: 'Comparar', curto: 'Comparar' },
  { href: '/meta/', name: 'Meta', curto: 'Meta' },
];

/**
 * Etiqueta da temporada no ar — some sozinha quando a temporada encerra, junto
 * com o tema dela. Ver `src/data/season.ts`.
 */
function SeasonBadge() {
  const date = new Date(BUILD_DATE);
  const season = seasonOn(date);
  if (!season) return null;

  return (
    <span
      className="bevel-sm hidden shrink-0 px-2 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase sm:inline-block"
      title={`Temporada ${season.number}: ${season.name} — ${season.summary}`}
      style={{
        color: 'var(--color-cyan-400)',
        border: '1px solid color-mix(in oklab, var(--color-cyan-500) 45%, transparent)',
        background: 'color-mix(in oklab, var(--color-cyan-500) 10%, transparent)',
      }}
    >
      {seasonLabel(date)}
    </span>
  );
}

/** Quanto dura o esmaecimento entre os temas — o mesmo valor está no CSS. */
const THEME_FADE_MS = 320;

function useTheme() {
  const [light, setLight] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = light ? 'light' : 'dark';

    // Na primeira renderização não há de onde transicionar, e marcar o `<html>`
    // faria a página inteira nascer esmaecendo.
    if (first.current) {
      first.current = false;
      return;
    }

    root.dataset.themeSwitching = '';
    const timer = setTimeout(() => delete root.dataset.themeSwitching, THEME_FADE_MS);
    return () => clearTimeout(timer);
  }, [light]);

  return { light, toggle: () => setLight((v) => !v) };
}

function ThemeButton({ theme }: { theme: { light: boolean; toggle: () => void } }) {
  return (
    <button
      type="button"
      onClick={theme.toggle}
      className="touch px-2 text-base"
      aria-label={theme.light ? 'Usar tema escuro' : 'Usar tema claro'}
      style={{ color: 'var(--text-dim)' }}
    >
      {theme.light ? '☾' : '☀'}
    </button>
  );
}

export function AppHeader({ subtitle, actions }: { subtitle?: string; actions?: ReactNode }) {
  const pathname = usePathname();
  const theme = useTheme();

  return (
    <header
      className="pt-safe sticky top-0 z-30 border-b px-3 pb-2 backdrop-blur"
      style={{
        background: 'color-mix(in oklab, var(--bg) 88%, transparent)',
        borderColor: 'var(--border-soft)',
      }}
    >
      {/*
        No celular o cabeçalho tem duas linhas: identificação e ações em cima,
        seções embaixo. Tudo numa linha só, o nome da tela atual disputava
        espaço com quatro links e o botão de compartilhar — "Todas as Armas"
        quebrava em três linhas e "Meta" sumia atrás do botão.
      */}
      <div className="mx-auto flex max-w-[1600px] flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-start lg:gap-4">
          <Link href="/" className="flex min-w-0 items-baseline gap-2 lg:block">
            <h1 className="font-display truncate text-lg leading-tight font-bold tracking-wide">
              ARSENAL <span style={{ color: 'var(--accent)' }}>BF6</span>
            </h1>
            {subtitle && (
              <p className="truncate text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {subtitle}
              </p>
            )}
          </Link>

          <SeasonBadge />

          {/* No celular as ações sobem para esta linha; no computador ficam à direita. */}
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <ThemeButton theme={theme} />
            {actions}
          </div>
        </div>

        <nav
          aria-label="Seções"
          className="scroll-x -mx-1 flex gap-1 px-1 lg:mx-0 lg:overflow-visible lg:px-0"
        >
          {SECTIONS.map((section) => {
            const active = pathname === section.href || pathname === section.href.replace(/\/$/, '');
            return (
              <TransitionLink
                key={section.href}
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className="bevel-sm shrink-0 px-3 py-1.5 text-sm font-semibold whitespace-nowrap"
                style={{
                  background: active ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                <span className="lg:hidden">{section.curto}</span>
                <span className="hidden lg:inline">{section.name}</span>
              </TransitionLink>
            );
          })}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeButton theme={theme} />
          {actions}
        </div>
      </div>
    </header>
  );
}
