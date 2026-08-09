'use client';

import { Empty, Input, Tag, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { WEAPONS, CATEGORY_ORDER } from '@/data/weapons';
import { CLASSES, CATEGORY_NAMES, SHORT_CATEGORY_NAMES } from '@/data/classes';
import type { Weapon, WeaponCategory } from '@/data/types';
import { weaponImagePath } from './weapon-preview/manifest';
import { SeasonTag } from './season-tag';

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

/**
 * Estado da busca de armas.
 *
 * Vive fora dos componentes porque a busca e a lista nem sempre ficam juntas:
 * no montador os controles ocupam uma faixa larga no topo e a lista fica na
 * coluna lateral. Quem monta a tela decide onde cada parte entra; o filtro é o
 * mesmo objeto nos dois lugares.
 */
export interface WeaponFilterState {
  search: string;
  setSearch: (value: string) => void;
  category: WeaponCategory | 'all';
  setCategory: (value: WeaponCategory | 'all') => void;
  /** Categorias que de fato têm arma na seleção atual. */
  categories: WeaponCategory[];
  /** Resultado agrupado, na ordem das categorias. */
  byCategory: Map<WeaponCategory, Weapon[]>;
  /** Quantas armas por categoria, ignorando o filtro de categoria. */
  counts: Map<WeaponCategory | 'all', number>;
  total: number;
}

export function useWeaponFilter(categories: WeaponCategory[] = CATEGORY_ORDER): WeaponFilterState {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<WeaponCategory | 'all'>('all');

  const available = useMemo(
    () => WEAPONS.filter((a) => categories.includes(a.category)),
    [categories],
  );

  const matches = (weapon: Weapon, term: string) =>
    !term ||
    normalize(weapon.name).includes(term) ||
    normalize(CATEGORY_NAMES[weapon.category]).includes(term) ||
    normalize(weapon.summary).includes(term);

  const result = useMemo(() => {
    const term = normalize(search.trim());
    return available.filter((w) => (category === 'all' || w.category === category) && matches(w, term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, search, category]);

  const byCategory = useMemo(() => {
    const map = new Map<WeaponCategory, Weapon[]>();
    for (const weapon of result) map.set(weapon.category, [...(map.get(weapon.category) ?? []), weapon]);
    return map;
  }, [result]);

  // Contagem por chip: só a busca conta, senão o chip escolhido zeraria os outros.
  const counts = useMemo(() => {
    const term = normalize(search.trim());
    const map = new Map<WeaponCategory | 'all', number>();
    let all = 0;
    for (const weapon of available) {
      if (!matches(weapon, term)) continue;
      all++;
      map.set(weapon.category, (map.get(weapon.category) ?? 0) + 1);
    }
    map.set('all', all);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, search]);

  return {
    search,
    setSearch,
    category,
    setCategory,
    categories: categories.filter((c) => available.some((a) => a.category === c)),
    byCategory,
    counts,
    total: result.length,
  };
}

/**
 * Busca e chips de categoria.
 *
 * `layout` decide o arranjo porque o mesmo controle serve a dois espaços muito
 * diferentes: a faixa larga do montador, onde título, busca e chips cabem lado
 * a lado, e o modal da secundária, com pouco mais de quatrocentos pixels — ali
 * a mesma linha espreme os chips numa coluna cortada.
 */
export function WeaponFilters({
  filter,
  title = 'Arma principal',
  layout = 'linha',
}: {
  filter: WeaponFilterState;
  title?: string;
  layout?: 'linha' | 'empilhado';
}) {
  const empilhado = layout === 'empilhado';

  const chips = (
    <>
      <FilterChip
        active={filter.category === 'all'}
        onClick={() => filter.setCategory('all')}
        count={filter.counts.get('all') ?? 0}
      >
        Todas
      </FilterChip>
      {filter.categories.map((c) => (
        <FilterChip
          key={c}
          active={filter.category === c}
          onClick={() => filter.setCategory(c)}
          count={filter.counts.get(c) ?? 0}
        >
          {SHORT_CATEGORY_NAMES[c]}
        </FilterChip>
      ))}
    </>
  );

  if (empilhado) {
    return (
      <section>
        <h2 className="label mb-2">{title}</h2>
        <Input
          type="search"
          value={filter.search}
          onChange={(e) => filter.setSearch(e.target.value)}
          placeholder="Buscar arma…"
          allowClear
          aria-label="Buscar arma"
          className="bevel-sm touch w-full"
        />
        <div className="scroll-x -mx-1 mt-2 flex gap-1.5 px-1 pb-1">{chips}</div>
      </section>
    );
  }

  return <FaixaDeBusca filter={filter} title={title} chips={chips} />;
}

/**
 * A faixa de busca do montador, recolhida numa lupa.
 *
 * Aberta, ela come uma tira inteira da largura da tela — e o montador já
 * disputa esse espaço com o preview da arma, a lista e o painel de estatísticas.
 * Fechada, sobra o título, a lupa e um resumo do que está filtrando; o clique
 * abre a caixa de texto na largura toda e os chips sem barra de rolagem, que é
 * o momento em que a busca merece o espaço.
 *
 * O resumo ao lado da lupa não é enfeite: sem ele, uma categoria escolhida
 * sumiria junto com os chips e a lista pareceria ter perdido armas sozinha.
 */
function FaixaDeBusca({
  filter,
  title,
  chips,
}: {
  filter: WeaponFilterState;
  title: string;
  chips: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  const campo = useRef<InputRef>(null);
  const lupa = useRef<HTMLButtonElement>(null);
  const reduzido = useReducedMotion();

  // Abrir a busca e ter de clicar de novo para digitar seria um clique perdido.
  useEffect(() => {
    if (aberta) campo.current?.focus();
  }, [aberta]);

  const termo = filter.search.trim();
  const resumo =
    [
      filter.category === 'all' ? null : SHORT_CATEGORY_NAMES[filter.category],
      termo ? `“${termo}”` : null,
    ]
      .filter(Boolean)
      .join(' · ') || `${filter.total} armas`;

  function fechar() {
    setAberta(false);
    lupa.current?.focus();
  }

  return (
    <section
      onKeyDown={(e) => {
        if (e.key === 'Escape' && aberta) {
          e.stopPropagation();
          fechar();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <h2 className="label shrink-0">{title}</h2>

        <button
          ref={lupa}
          type="button"
          onClick={() => (aberta ? fechar() : setAberta(true))}
          aria-expanded={aberta}
          aria-controls="busca-de-armas"
          aria-label={aberta ? 'Fechar a busca de armas' : 'Buscar arma'}
          className="chip bevel-sm touch shrink-0"
          style={{
            background: aberta ? 'var(--accent)' : 'var(--surface-raised)',
            color: aberta ? '#14170f' : 'var(--text-soft)',
            border: `1px solid ${aberta ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          <IconeLupa />
        </button>

        {/* Fechada, a faixa ainda precisa dizer o que está filtrando. */}
        {!aberta && (
          <span className="truncate text-xs" style={{ color: 'var(--text-dim)' }}>
            {resumo}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {aberta && (
          <motion.div
            id="busca-de-armas"
            /*
             * `overflow-hidden` enquanto a altura anima: sem isso os chips
             * escapam por baixo da faixa antes de ela terminar de abrir.
             */
            className="overflow-hidden"
            initial={reduzido ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduzido ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduzido ? 0 : 0.26, ease: [0.32, 0.72, 0, 1] }}
          >
            <Input
              ref={campo}
              type="search"
              value={filter.search}
              onChange={(e) => filter.setSearch(e.target.value)}
              placeholder="Buscar arma…"
              allowClear
              aria-label="Buscar arma"
              className="bevel-sm touch mt-2 w-full"
            />
            {/* Aberta, a faixa tem largura de sobra: os chips quebram linha em
                vez de virarem uma barrinha rolável de dois itens visíveis. */}
            <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Lupa desenhada à mão — o resto dos ícones do site também é SVG local. */
function IconeLupa() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A lista em si, agrupada por categoria. */
export function WeaponList({
  filter,
  selected,
  onSelect,
}: {
  filter: WeaponFilterState;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const equipada = selected ? WEAPONS.find((w) => w.id === selected) : null;

  return (
    <div className="space-y-4">
      {equipada && <EquippedWeapon weapon={equipada} />}

      {[...filter.byCategory.entries()].map(([category, weaponList]) => (
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

      {filter.total === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          className="py-6"
          description={
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Nenhuma arma encontrada para “{filter.search}”.
            </span>
          }
        />
      )}
    </div>
  );
}

/** Busca e lista juntas, para quem não precisa separá-las — como o seletor de secundária. */
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
  const filter = useWeaponFilter(categories);

  return (
    <section>
      <WeaponFilters filter={filter} title={title} layout="empilhado" />
      <div className="mt-3">
        <WeaponList filter={filter} selected={selected} onSelect={onSelect} />
      </div>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Quantas armas o chip traz. */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Tag.CheckableTag
      checked={active}
      onChange={onClick}
      className="chip bevel-sm touch shrink-0 text-xs whitespace-nowrap"
      style={{
        background: active ? 'var(--accent)' : 'var(--surface-raised)',
        color: active ? '#14170f' : 'var(--text-soft)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        fontWeight: active ? 600 : 500,
        marginInlineEnd: 0,
      }}
    >
      {children}
      {count !== undefined && (
        <span className="ml-1.5 tabular-nums" style={{ opacity: count === 0 ? 0.35 : 0.6 }}>
          {count}
        </span>
      )}
    </Tag.CheckableTag>
  );
}

/**
 * A arma equipada, em bloco próprio no alto da lista.
 *
 * Rolando sessenta e três armas, a escolhida some da vista — e ela é o assunto
 * de tudo que está à direita na tela. Aqui ela fica presa no topo, com a foto
 * grande e os números que identificam a arma, para o jogador nunca precisar
 * procurar o que está montando.
 */
function EquippedWeapon({ weapon }: { weapon: Weapon }) {
  const playerClass = CLASSES.find((c) => c.id === weapon.signatureClass);

  return (
    <div
      className="bevel-sm sticky top-0 z-10 p-2.5"
      style={{
        background: 'color-mix(in oklab, var(--accent) 14%, var(--surface))',
        border: '1px solid var(--accent)',
        boxShadow: '0 8px 20px color-mix(in oklab, var(--accent) 18%, transparent)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label" style={{ color: 'var(--accent)' }}>
          Montando agora
        </span>
        <SeasonTag season={weapon.season} size="sm" />
      </div>

      <WeaponThumb weapon={weapon} className="my-1 h-16 w-full object-contain" />

      <p className="font-display truncate text-lg leading-tight font-bold tracking-wide">
        {weapon.name}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
        {playerClass && <span style={{ color: playerClass.color }}>{playerClass.name}</span>}
        <span>{CATEGORY_NAMES[weapon.category]}</span>
        {weapon.category !== 'melee' && <span className="font-mono">{weapon.rpm} RPM</span>}
      </p>
    </div>
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
      className="tile bevel-sm touch relative flex w-full items-center gap-2.5 py-2 pr-2.5 pl-3 text-left"
      style={
        {
          /*
           * A arma equipada não pode ser só "mais um item com a borda de outra
           * cor": numa lista de sessenta e três, o olho volta a ela o tempo
           * todo. Fundo mais forte, faixa na lateral e brilho em volta marcam
           * qual arma está na mão sem precisar procurar.
           */
          '--tile-bg': selected
            ? 'color-mix(in oklab, var(--accent) 26%, var(--surface))'
            : 'var(--surface)',
          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-soft)'}`,
          boxShadow: selected
            ? '0 0 0 1px var(--accent), 0 6px 18px color-mix(in oklab, var(--accent) 22%, transparent)'
            : undefined,
        } as CSSProperties
      }
    >
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: 'var(--accent)' }}
        />
      )}
      {/*
        A foto vale mais que o nome aqui: quem procura a secundária costuma
        reconhecer a pistola de vista antes de lembrar da sigla. Corpo a corpo
        não tem foto e simplesmente não reserva o espaço.
      */}
      <WeaponThumb weapon={weapon} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className="font-display truncate text-base font-semibold tracking-wide"
            style={selected ? { color: 'var(--accent)' } : undefined}
          >
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
          {selected && (
            <span className="label" style={{ color: 'var(--accent)' }}>
              equipada
            </span>
          )}
          {playerClass && <span style={{ color: playerClass.color }}>{playerClass.name}</span>}
          <SeasonTag season={weapon.season} size="sm" />
          {weapon.provenance === 'curated' && (
            <Tooltip title="Valores aproximados">
              <span>≈</span>
            </Tooltip>
          )}
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
function WeaponThumb({ weapon, className = 'h-9 w-16' }: { weapon: Weapon; className?: string }) {
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
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
