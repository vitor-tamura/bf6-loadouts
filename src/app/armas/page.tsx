'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AppHeader } from '@/components/header';
import { WeaponPreview } from '@/components/weapon-preview';
import { CATEGORY_NAMES, CLASSES, SHORT_CATEGORY_NAMES } from '@/data/classes';
import { CATEGORY_ORDER, WEAPONS } from '@/data/weapons';
import type { ClassId, Weapon, WeaponCategory } from '@/data/types';
import { damagePerShot, shotsToKill, timeToKill } from '@/lib/ballistics';
import { encodeLoadout } from '@/lib/share';
import { EMPTY_LOADOUT } from '@/lib/loadout';
import { baseStats } from '@/lib/stats';
import { pointerGlow } from '@/components/pointer-glow';

/**
 * Catálogo completo.
 *
 * Todas as armas de uma vez, com o desenho e os números que decidem a escolha à
 * vista. Clicar em uma leva direto ao montador já com ela equipada — a lista
 * existe para escolher, não só para consultar.
 */

/** Remove acentos para que "precisao" também encontre "precisão". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

type SortKey = 'nome' | 'dano' | 'cadencia' | 'ttk' | 'alcance';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'nome', label: 'Nome' },
  { id: 'dano', label: 'Dano' },
  { id: 'cadencia', label: 'Cadência' },
  { id: 'ttk', label: 'Tempo para matar' },
  { id: 'alcance', label: 'Velocidade' },
];

export default function WeaponsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<WeaponCategory | 'all'>('all');
  const [playerClass, setPlayerClass] = useState<ClassId | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('nome');

  const list = useMemo(() => {
    const term = normalize(search.trim());

    const filtered = WEAPONS.filter((weapon) => {
      if (category !== 'all' && weapon.category !== category) return false;
      if (playerClass !== 'all' && weapon.signatureClass !== playerClass) return false;
      if (!term) return true;
      return (
        normalize(weapon.name).includes(term) ||
        normalize(CATEGORY_NAMES[weapon.category]).includes(term) ||
        normalize(weapon.summary).includes(term)
      );
    });

    const withStats = filtered.map((weapon) => ({ weapon, stats: baseStats(weapon) }));

    withStats.sort((a, b) => {
      switch (sort) {
        case 'dano':
          return damagePerShot(b.stats, 0) - damagePerShot(a.stats, 0);
        case 'cadencia':
          return b.stats.rpm - a.stats.rpm;
        case 'ttk': {
          const ta = timeToKill(a.stats, 0);
          const tb = timeToKill(b.stats, 0);
          return (Number.isFinite(ta) ? ta : Infinity) - (Number.isFinite(tb) ? tb : Infinity);
        }
        case 'alcance':
          return b.stats.velocity - a.stats.velocity;
        default:
          return a.weapon.name.localeCompare(b.weapon.name, 'pt-BR');
      }
    });

    return withStats;
  }, [search, category, playerClass, sort]);

  const byCategory = useMemo(() => {
    const map = new Map<WeaponCategory, typeof list>();
    for (const item of list) {
      const bucket = map.get(item.weapon.category) ?? [];
      bucket.push(item);
      map.set(item.weapon.category, bucket);
    }
    return map;
  }, [list]);

  // Agrupar por categoria só ajuda quando a ordenação é alfabética; nas demais,
  // o que interessa é o ranking contínuo.
  const grouped = sort === 'nome' && category === 'all';

  return (
    <div className="min-h-dvh">
      <AppHeader subtitle="Todas as armas" />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        <div className="card bevel mb-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-[200px] flex-1">
              <span className="sr-only">Buscar arma</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar arma…"
                className="bevel-sm touch w-full px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
              />
            </label>

            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
              Ordenar por
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bevel-sm touch px-2 py-2 text-sm"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="scroll-x -mx-1 mt-2 flex gap-1.5 px-1 pb-1">
            <Chip active={category === 'all'} onClick={() => setCategory('all')}>
              Todas as categorias
            </Chip>
            {CATEGORY_ORDER.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {SHORT_CATEGORY_NAMES[c]}
              </Chip>
            ))}
          </div>

          <div className="scroll-x -mx-1 mt-1.5 flex gap-1.5 px-1 pb-1">
            <Chip active={playerClass === 'all'} onClick={() => setPlayerClass('all')}>
              Todas as classes
            </Chip>
            {CLASSES.map((c) => (
              <Chip
                key={c.id}
                active={playerClass === c.id}
                onClick={() => setPlayerClass(c.id)}
                color={c.color}
              >
                {c.name}
              </Chip>
            ))}
          </div>

          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {list.length} {list.length === 1 ? 'arma encontrada' : 'armas encontradas'}
          </p>
        </div>

        {list.length === 0 && (
          <p className="card bevel p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
            Nenhuma arma encontrada com esses filtros.
          </p>
        )}

        {grouped ? (
          CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => (
            <section key={c} className="mb-5">
              <h2 className="label mb-2">
                {CATEGORY_NAMES[c]} · {byCategory.get(c)!.length}
              </h2>
              <Grid items={byCategory.get(c)!} />
            </section>
          ))
        ) : (
          <Grid items={list} />
        )}

        <p className="pb-safe mt-6 text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>
          Estatísticas das armas sem acessórios. Projeto de fã, sem vínculo com a EA ou a DICE.
        </p>
      </main>
    </div>
  );
}

function Chip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  const tint = color ?? 'var(--accent)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...pointerGlow()}
      className="chip bevel-sm shrink-0 px-3 py-2 text-xs whitespace-nowrap"
      style={{
        background: active ? tint : 'var(--surface-raised)',
        color: active ? '#14170f' : 'var(--text-soft)',
        border: `1px solid ${active ? tint : 'var(--border)'}`,
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

function Grid({ items }: { items: { weapon: Weapon; stats: ReturnType<typeof baseStats> }[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(({ weapon, stats }) => (
        <li key={weapon.id}>
          <WeaponCard weapon={weapon} stats={stats} />
        </li>
      ))}
    </ul>
  );
}

function WeaponCard({ weapon, stats }: { weapon: Weapon; stats: ReturnType<typeof baseStats> }) {
  const signature = CLASSES.find((c) => c.id === weapon.signatureClass);
  const melee = weapon.category === 'melee';
  const ttk = timeToKill(stats, 0);

  // Abrir o montador já com a arma equipada é o que se espera de um catálogo.
  const href = `/?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link
      href={href}
      className="card bevel block h-full p-2"
      style={{ borderColor: 'var(--border-soft)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display truncate text-base leading-tight font-semibold">{weapon.name}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {SHORT_CATEGORY_NAMES[weapon.category]}
            {signature && (
              <>
                {' · '}
                <span style={{ color: signature.color }}>{signature.name}</span>
              </>
            )}
          </p>
        </div>
        {weapon.season > 0 && (
          <span
            className="bevel-sm shrink-0 px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: 'var(--surface-raised)', color: 'var(--accent)' }}
          >
            T{weapon.season}
          </span>
        )}
      </div>

      <WeaponPreview weapon={weapon} className="my-1 w-full" />

      <p className="mb-1.5 line-clamp-2 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
        {weapon.summary}
      </p>

      {!melee && (
        <dl className="grid grid-cols-4 gap-1 text-center">
          <Stat label="Dano" value={damagePerShot(stats, 0).toFixed(0)} />
          <Stat label="RPM" value={String(stats.rpm)} />
          <Stat label="TTK" value={Number.isFinite(ttk) ? `${Math.round(ttk)}` : '—'} unit="ms" />
          <Stat label="Tiros" value={String(shotsToKill(stats, 0))} />
        </dl>
      )}
    </Link>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bevel-sm px-1 py-1" style={{ background: 'var(--surface-raised)' }}>
      <dt className="label text-[9px]">{label}</dt>
      <dd className="font-mono text-sm leading-tight">
        {value}
        {unit && <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{unit}</span>}
      </dd>
    </div>
  );
}
