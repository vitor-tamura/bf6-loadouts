'use client';

import { Hint } from '@/components/hint';
import Link from 'next/link';
import { Button, Layout, Menu, Tag } from 'antd';
import { TransitionLink } from '@/components/page-transition';
import { usePathname } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { BUILD_DATE } from '@/data/build';
import { seasonLabel, seasonOn } from '@/data/season';
import { useTheme } from '@/components/theme';

/**
 * Cabeçalho comum às telas.
 *
 * O menu fica sempre visível — montar e comparar são as duas coisas que o
 * jogador faz aqui, e esconder uma delas atrás de um ícone seria repetir o
 * problema do site que serviu de referência.
 *
 * A navegação passou a ser o `Menu` do Ant Design, que já traz seleção, foco
 * pelo teclado e o traço sob o item ativo. O arranjo em duas linhas no celular
 * é do site e continua a cargo do Tailwind: o menu do antd resolve o item, não
 * o lugar dele na tela.
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

  /*
   * Quem esconde a etiqueta no celular é o invólucro, não a etiqueta.
   * `.ant-tag` declara o próprio `display: inline-block` com a mesma
   * especificidade do `hidden` do Tailwind, e vencia por ordem no arquivo — a
   * etiqueta aparecia em 390px e empurrava "ARSENAL BF6" para as reticências.
   */
  return (
    <span className="hidden shrink-0 sm:inline-block">
      <Hint label={`Temporada ${season.number}: ${season.name} — ${season.summary}`}>
        <Tag
          color="cyan"
          className="bevel-sm text-[10px] font-semibold tracking-[0.14em] uppercase"
          style={{ marginInlineEnd: 0 }}
        >
          {seasonLabel(date)}
        </Tag>
      </Hint>
    </span>
  );
}

function ThemeButton() {
  const theme = useTheme();
  return (
    <Button
      type="text"
      onClick={theme.toggle}
      className="touch"
      aria-label={theme.light ? 'Usar tema escuro' : 'Usar tema claro'}
      style={{ color: 'var(--text-dim)', fontSize: 16 }}
    >
      {theme.light ? '☾' : '☀'}
    </Button>
  );
}

export function AppHeader({ subtitle, actions }: { subtitle?: string; actions?: ReactNode }) {
  const pathname = usePathname();

  /*
   * O item ativo é o caminho atual, com e sem a barra final: as rotas são
   * geradas com `trailingSlash`, mas o `usePathname` devolve o endereço como
   * ele está na barra do navegador, e nem sempre os dois coincidem.
   */
  const selected = useMemo(() => {
    const match = SECTIONS.find(
      (s) => pathname === s.href || pathname === s.href.replace(/\/$/, ''),
    );
    return match ? [match.href] : [];
  }, [pathname]);

  const items = useMemo(
    () =>
      SECTIONS.map((section) => ({
        key: section.href,
        label: (
          <TransitionLink href={section.href}>
            <span className="lg:hidden">{section.curto}</span>
            <span className="hidden lg:inline">{section.name}</span>
          </TransitionLink>
        ),
      })),
    [],
  );

  return (
    <Layout.Header
      className="pt-safe sticky top-0 z-30 border-b pb-2 backdrop-blur"
      style={{
        background: 'color-mix(in oklab, var(--bg) 88%, transparent)',
        borderColor: 'var(--border-soft)',
        height: 'auto',
        lineHeight: 'normal',
        // O recuo vai no estilo, não em `px-3`: o antd declara `padding-inline`
        // no próprio `.ant-layout-header`, e a classe do Tailwind perdia para
        // ele — o título nascia colado na borda da tela.
        paddingInline: 12,
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
            <ThemeButton />
            {actions}
          </div>
        </div>

        <Menu
          mode="horizontal"
          aria-label="Seções"
          selectedKeys={selected}
          items={items}
          // Sem isto o antd esconde o que não couber atrás de "···". São quatro
          // itens curtos: no celular é melhor deixá-los rolar de lado do que
          // sumir com metade da navegação.
          disabledOverflow
          /*
           * A rolagem lateral é rede de segurança do celular, e some no
           * computador — lá os quatro itens cabem, e a barra aparecia sem ter o
           * que rolar. É `overflow-x-auto` em vez da `.scroll-x` do site porque
           * as duas vivem na mesma camada do CSS e a variante `lg:` perdia.
           */
          className="min-w-0 flex-1 justify-start overflow-x-auto border-0 bg-transparent lg:flex-none lg:justify-end lg:overflow-x-visible"
          style={{ lineHeight: '2.2rem', scrollbarWidth: 'none' }}
        />

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeButton />
          {actions}
        </div>
      </div>
    </Layout.Header>
  );
}
