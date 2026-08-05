'use client';

import { useMemo, useState } from 'react';
import { WEAPONS, CATEGORY_ORDER } from '@/data/weapons';
import { CLASSES, CATEGORY_NAMES, SHORT_CATEGORY_NAMES } from '@/data/classes';
import type { Weapon, WeaponCategory } from '@/data/types';

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
  const [search, setBusca] = useState('');
  const [filter, setFiltro] = useState<WeaponCategory | 'todas'>('todas');

  const available = useMemo(
    () => WEAPONS.filter((a) => categories.includes(a.category)),
    [categories],
  );

  const result = useMemo(() => {
    const term = normalize(search.trim());
    return available.filter((weapon) => {
      if (filter !== 'todas' && weapon.category !== filter) return false;
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
      <h2 className="rotulo mb-2">{title}</h2>

      <label className="block">
        <span className="sr-only">Buscar arma</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar arma…"
          className="chanfro-sm toque w-full px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--superficie-alta)', border: '1px solid var(--borda)' }}
        />
      </label>

      <div className="rolagem-oculta -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <FilterChip active={filter === 'todas'} onClick={() => setFiltro('todas')}>
          Todas
        </FilterChip>
        {categoriesWithWeapons.map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => setFiltro(c)}>
            {SHORT_CATEGORY_NAMES[c]}
          </FilterChip>
        ))}
      </div>

      <div className="mt-3 space-y-4">
        {[...byCategory.entries()].map(([category, armas]) => (
          <div key={category}>
            <h3 className="rotulo mb-1.5">{CATEGORY_NAMES[category]}</h3>
            <ul className="grid gap-1.5">
              {armas.map((weapon) => (
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
          <p className="py-6 text-center text-sm" style={{ color: 'var(--texto-fraco)' }}>
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
      className="chanfro-sm shrink-0 px-3 py-2 text-xs whitespace-nowrap transition-colors"
      style={{
        background: active ? 'var(--destaque)' : 'var(--superficie-alta)',
        color: active ? '#14170f' : 'var(--texto-suave)',
        border: `1px solid ${active ? 'var(--destaque)' : 'var(--borda)'}`,
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
      className="chanfro-sm toque w-full px-3 py-2 text-left transition-colors"
      style={{
        background: selected ? 'color-mix(in oklab, var(--destaque) 16%, var(--superficie))' : 'var(--superficie)',
        border: `1px solid ${selected ? 'var(--destaque)' : 'var(--borda-suave)'}`,
      }}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display text-base font-semibold tracking-wide">{weapon.name}</span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
          {weapon.category === 'corpo-a-corpo' ? '—' : `${weapon.rpm} RPM`}
        </span>
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
        {playerClass && <span style={{ color: playerClass.color }}>{playerClass.name}</span>}
        {weapon.season > 0 && <span>Temporada {weapon.season}</span>}
        {weapon.provenance === 'curado' && <span title="Valores aproximados">≈</span>}
      </span>
    </button>
  );
}
