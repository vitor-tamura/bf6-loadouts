'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WEAPONS, CATEGORY_ORDER } from '@/data/weapons';
import { CLASSES, CATEGORY_NAMES, SHORT_CATEGORY_NAMES } from '@/data/classes';
import type { Weapon, WeaponCategory } from '@/data/types';
import { weaponImagePath } from './weapon-preview/manifest';

/**
 * Escolha da arma.
 *
 * O menu do site que serviu de referência esconde as armas atrás de vários
 * cliques. Aqui tudo fica em uma tela: busca, filtro por categoria e a lista
 * inteira, com o essencial de cada arma visível antes de escolher.
 */

/** Remove acentos para que "precisao" encontre "precisão". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function WeaponSelector({
  selected,
  onSelect,
  categories = CATEGORY_ORDER,
  title = 'Arma principal',
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  categories?: WeaponCategory[];
  title?: string;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<WeaponCategory | 'all'>('all');

  const available = useMemo(
    () => WEAPONS.filter((a) => categories.includes(a.category)),
    [categories],
  );

  const result = useMemo(() => {
    const term = normalize(search.trim());
    return available.filter((weapon) => {
      if (filter !== 'all' && weapon.category !== filter) return false;
      if (!term) return true;
      return (
        normalize(weapon.name).includes(term) ||
        normalize(CATEGORY_NAMES[weapon.category]).includes(term) ||
        normalize(weapon.summary).includes(term)
      );
    });
  }, [available, search, filter]);

  const byCategory = useMemo(() => {
    const map = new Map<WeaponCategory, Weapon[]>();
    for (const weapon of result) {
      const list = map.get(weapon.category) ?? [];
      list.push(weapon);
      map.set(weapon.category, list);
    }
    return map;
  }, [result]);

  const categoriesWithWeapons = categories.filter((c) => available.some((a) => a.category === c));

  return (
    <section>
      <h2 className="label mb-2">{title}</h2>

      <label className="block">
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

      <div className="scroll-x -mx-1 mt-2 flex gap-1.5 px-1 pb-1">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todas
        </FilterChip>
        {categoriesWithWeapons.map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {SHORT_CATEGORY_NAMES[c]}
          </FilterChip>
        ))}
      </div>

      <div className="mt-3 space-y-4">
        {[...byCategory.entries()].map(([category, weaponList]) => (
          <div key={category}>
            <h3 className="label mb-1.5">{CATEGORY_NAMES[category]}</h3>
            <ul className="grid gap-1.5">
              {weaponList.map((weapon) => (
                <li key={weapon.id}>
                  <WeaponCard
                    weapon={weapon}
                    selected={weapon.id === selected}
                    onSelect={() => onSelect(weapon.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {result.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
            Nenhuma arma encontrada para “{search}”.
          </p>
        )}
      </div>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="bevel-sm shrink-0 px-3 py-2 text-xs whitespace-nowrap transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'var(--surface-raised)',
        color: active ? '#14170f' : 'var(--text-soft)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

function WeaponCard({
  weapon,
  selected,
  onSelect,
}: {
  weapon: Weapon;
  selected: boolean;
  onSelect: () => void;
}) {
  const playerClass = CLASSES.find((c) => c.id === weapon.signatureClass);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="bevel-sm touch flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
      style={{
        background: selected ? 'color-mix(in oklab, var(--accent) 16%, var(--surface))' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-soft)'}`,
      }}
    >
      {/*
        A foto vale mais que o nome aqui: quem procura a secundária costuma
        reconhecer a pistola de vista antes de lembrar da sigla. Corpo a corpo
        não tem foto e simplesmente não reserva o espaço.
      */}
      <WeaponThumb weapon={weapon} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-display truncate text-base font-semibold tracking-wide">
            {weapon.name}
          </span>
          <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
            {weapon.category === 'melee' ? '—' : `${weapon.rpm} RPM`}
          </span>
        </span>
        <span
          className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
          style={{ color: 'var(--text-dim)' }}
        >
          {playerClass && <span style={{ color: playerClass.color }}>{playerClass.name}</span>}
          {weapon.season > 0 && <span>Temporada {weapon.season}</span>}
          {weapon.provenance === 'curated' && <span title="Valores aproximados">≈</span>}
        </span>
      </span>
    </button>
  );
}

/**
 * Miniatura da arma na lista.
 *
 * A foto é a mesma do preview, só menor. Se ela não existir — corpo a corpo, ou
 * uma arma nova ainda sem arte —, o espaço não é reservado: uma moldura vazia
 * repetida em toda a lista pesa mais do que ajuda.
 */
function WeaponThumb({ weapon }: { weapon: Weapon }) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => setBroken(false), [weapon.id]);

  // Ver a nota em weapon-preview: uma imagem que já falhou antes da hidratação
  // não dispara `onError` de novo.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, [weapon.id]);

  if (broken) return null;

  return (
    <img
      ref={ref}
      src={weaponImagePath(weapon.id)}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-10 w-20 shrink-0 object-contain"
    />
  );
}
