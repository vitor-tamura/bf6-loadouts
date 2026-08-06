'use client';

import Link from 'next/link';
import { AppHeader } from '@/components/header';
import { SeasonTag } from '@/components/season-tag';
import { SiteFooter } from '@/components/site-footer';
import { WeaponPreview } from '@/components/weapon-preview';
import { CATEGORY_NAMES, CLASSES } from '@/data/classes';
import {
  ATUALIZADO_EM,
  DESTAQUES,
  FONTES,
  POR_CATEGORIA,
  TEMPORADA_DO_META,
  type IndicacaoMeta,
} from '@/data/meta';
import { WEAPONS_BY_ID } from '@/data/weapons';
import { EMPTY_LOADOUT } from '@/lib/loadout';
import { BUILDER_PATH, encodeLoadout } from '@/lib/share';
import { baseStats } from '@/lib/stats';
import { shotsToKill, timeToKill } from '@/lib/ballistics';

/**
 * O meta da temporada.
 *
 * A tela existe para responder "o que está forte agora", pergunta que os
 * números do site sozinhos não respondem — eles dizem o que a arma faz, não o
 * que a comunidade está usando. Como não há fonte pública de uso real, aqui é
 * leitura de guia, e a tela repete isso onde não dá para não ver: no alto, em
 * cada indicação e no rodapé.
 */

const dataCurta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function MetaPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader subtitle="O que está forte agora" />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        <section className="card bevel mb-3 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-display text-xl font-bold tracking-wide">
              Meta da Temporada {TEMPORADA_DO_META}
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
              revisado em {dataCurta(ATUALIZADO_EM)}
            </p>
          </div>

          <p className="mt-2 max-w-[70ch] text-[12px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
            Esta lista é <strong>opinião da comunidade, não medição</strong>. Não existe fonte
            pública de uso real no Battlefield 6 — as APIs abertas servem estatística por jogador, e
            quem tem os números agregados não os publica. O que está aqui é a leitura de guias da
            temporada, com a fonte e a data de cada indicação à vista.
          </p>
        </section>

        <section className="mb-3">
          <h2 className="label mb-2">Mais citadas</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {DESTAQUES.map((indicacao, posicao) => (
              <li key={indicacao.weapon}>
                <CartaoMeta indicacao={indicacao} posicao={posicao + 1} />
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-3">
          <h2 className="label mb-2">Por categoria</h2>
          <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {POR_CATEGORIA.map((bloco) => (
              <div key={bloco.category} className="card bevel p-3">
                <h3 className="label mb-2">{CATEGORY_NAMES[bloco.category]}</h3>
                <CartaoMeta indicacao={bloco.melhor} destaque />
                {bloco.mencoes.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {bloco.mencoes.map((m) => (
                      <li key={m.weapon}>
                        <LinhaMencao indicacao={m} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="card bevel p-3">
          <h2 className="label mb-2">De onde saiu</h2>
          <ul className="space-y-1.5 text-[12px]">
            {FONTES.map((f, i) => (
              <li key={f.url} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  [{i + 1}]
                </span>
                {f.pais === 'BR' && (
                  <span
                    className="bevel-sm px-1 py-px text-[9px] font-semibold"
                    title="Publicação brasileira"
                    style={{
                      color: 'var(--accent)',
                      border: '1px solid color-mix(in oklab, var(--accent) 45%, transparent)',
                    }}
                  >
                    BR
                  </span>
                )}
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {f.nome}
                </a>
                <span style={{ color: 'var(--text-dim)' }}>· {dataCurta(f.data)}</span>
                {f.janela === 'lancamento' && (
                  <span style={{ color: 'var(--text-dim)' }}>· leitura do lançamento</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-[80ch] text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            Só entram leituras publicadas depois do patch da temporada — guia de lançamento
            descreve um jogo que já mudou de balanceamento quatro vezes. Escopetas e pistolas não
            aparecem porque nenhuma das fontes as ranqueia: preferimos o vazio a uma posição
            inventada.
          </p>
        </section>

        <SiteFooter note="Ranking de opinião, mantido à mão. Os números das armas continuam vindo do dataset." />
      </main>
    </div>
  );
}

/** Cartão de arma indicada, com o link que já abre o montador com ela. */
function CartaoMeta({
  indicacao,
  posicao,
  destaque = false,
}: {
  indicacao: IndicacaoMeta;
  posicao?: number;
  destaque?: boolean;
}) {
  const weapon = WEAPONS_BY_ID.get(indicacao.weapon);
  if (!weapon) return null;

  const stats = baseStats(weapon);
  const ttk = timeToKill(stats, 0);
  const tiros = shotsToKill(stats, 0);
  const classe = CLASSES.find((c) => c.id === weapon.signatureClass);
  const href = `${BUILDER_PATH}?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link
      href={href}
      className={`card bevel block p-2.5 ${destaque ? '' : 'h-full'}`}
      style={{
        borderColor: destaque ? 'var(--accent)' : 'var(--border-soft)',
        background: destaque ? 'color-mix(in oklab, var(--accent) 8%, transparent)' : undefined,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display truncate text-base font-semibold tracking-wide">
          {posicao && (
            <span className="mr-1.5 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
              {posicao}º
            </span>
          )}
          {weapon.name}
        </span>
        <SeasonTag season={weapon.season} size="sm" />
      </div>

      {!posicao && <WeaponPreview weapon={weapon} className="my-1 w-full" />}

      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
        {indicacao.porque}
      </p>

      <p
        className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px]"
        style={{ color: 'var(--text-dim)' }}
      >
        {classe && <span style={{ color: classe.color }}>{classe.name}</span>}
        <span>{weapon.rpm} RPM</span>
        {tiros === 1 ? (
          <span>1 tiro</span>
        ) : (
          Number.isFinite(ttk) && <span>{Math.round(ttk)} ms</span>
        )}
        <span>{indicacao.fontes.map((f) => `[${f + 1}]`).join(' ')}</span>
      </p>
    </Link>
  );
}

function LinhaMencao({ indicacao }: { indicacao: IndicacaoMeta }) {
  const weapon = WEAPONS_BY_ID.get(indicacao.weapon);
  if (!weapon) return null;

  const href = `${BUILDER_PATH}?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link href={href} className="tile bevel-sm block px-2 py-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display truncate text-sm font-semibold">{weapon.name}</span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
          {indicacao.fontes.map((f) => `[${f + 1}]`).join(' ')}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
        {indicacao.porque}
      </span>
    </Link>
  );
}
