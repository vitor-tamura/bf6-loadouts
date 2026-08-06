'use client';

import { useMemo, useState } from 'react';
import { AppHeader } from '@/components/header';
import { ComparisonChart, type Series } from '@/components/charts';
import { WeaponPreview } from '@/components/weapon-preview';
import { CATEGORY_NAMES, SHORT_CATEGORY_NAMES } from '@/data/classes';
import { CATEGORY_ORDER, WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import { attachmentsForWeapon } from '@/data/attachments';
import type { Weapon, WeaponCategory } from '@/data/types';
import {
  analysisDistance,
  damagePerSecond,
  damagePerShot,
  effectiveRange,
  shotsToKill,
  timeToKill,
} from '@/lib/ballistics';
import { baseStats, type EffectiveStats } from '@/lib/stats';

/**
 * Confronto direto entre duas armas.
 *
 * O formato segue o protótipo do usuário: as estatísticas de 0 a 100 aparecem em
 * barras espelhadas, crescendo do centro para os lados, com o vencedor de cada
 * linha destacado — a diferença entre duas armas fica visível sem precisar
 * comparar números um a um. Abaixo, a grade traz o arsenal inteiro e permite
 * jogar qualquer arma para o lado A ou B com um clique.
 */

/** Azul e laranja do protótipo: leem bem lado a lado nos dois temas. */
const COLOR_A = '#3987e5';
const COLOR_B = '#d95926';

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** As sete barras espelhadas, todas normalizadas de 0 a 100. */
function scores(stats: EffectiveStats): Record<string, number> {
  const range = effectiveRange(stats);
  return {
    Dano: clamp(damagePerShot(stats, 0)),
    Cadência: clamp(stats.rpm / 12),
    // Dano constante em toda distância vale como alcance máximo.
    Alcance: range === 0 ? 100 : clamp((range / 90) * 100),
    Precisão: clamp(stats.accuracy),
    Controle: clamp(stats.control),
    Quadril: clamp(stats.hipfire),
    Mobilidade: clamp(stats.mobility),
  };
}

/** Como cada degrau de dano é escrito na tabela: "33,4 / 25 / 20". */
function damageRangeText(stats: EffectiveStats): string {
  return stats.damage.map((step) => (step.damage * stats.pellets).toFixed(1).replace('.', ',')).join(' / ');
}

function dropText(stats: EffectiveStats): string {
  if (stats.damage.length < 2) return 'Sem queda';
  return `${stats.damage.slice(1).map((s) => Math.round(s.distance)).join(' / ')} m`;
}

interface DuelRow {
  label: string;
  a: string;
  b: string;
  /** Positivo quando A leva vantagem, negativo quando B leva. */
  advantage: number;
}

function duelRows(a: EffectiveStats, b: EffectiveStats): DuelRow[] {
  const ttkA = timeToKill(a, 0);
  const ttkB = timeToKill(b, 0);
  const rangeA = effectiveRange(a);
  const rangeB = effectiveRange(b);
  const ms = (v: number) => (v === 0 ? '1 tiro' : `${Math.round(v)} ms`);

  return [
    {
      label: 'Dano por faixa',
      a: damageRangeText(a),
      b: damageRangeText(b),
      advantage: damagePerShot(a, 0) - damagePerShot(b, 0),
    },
    {
      label: 'DPS sustentado',
      a: String(Math.round(damagePerSecond(a))),
      b: String(Math.round(damagePerSecond(b))),
      advantage: damagePerSecond(a) - damagePerSecond(b),
    },
    { label: 'TTK 100 PV', a: ms(ttkA), b: ms(ttkB), advantage: ttkB - ttkA },
    {
      label: 'Tiros para abater',
      a: String(shotsToKill(a, 0)),
      b: String(shotsToKill(b, 0)),
      advantage: shotsToKill(b, 0) - shotsToKill(a, 0),
    },
    {
      label: 'Tiros para abater a 50 m',
      a: String(shotsToKill(a, 50)),
      b: String(shotsToKill(b, 50)),
      advantage: shotsToKill(b, 50) - shotsToKill(a, 50),
    },
    { label: 'Cadência', a: `${a.rpm} RPM`, b: `${b.rpm} RPM`, advantage: a.rpm - b.rpm },
    { label: 'Carregador', a: `${a.magazine}`, b: `${b.magazine}`, advantage: a.magazine - b.magazine },
    {
      label: 'Recarga',
      a: `${a.reload.toFixed(2)} s`,
      b: `${b.reload.toFixed(2)} s`,
      advantage: b.reload - a.reload,
    },
    {
      label: 'Tempo de mira',
      a: `${Math.round(a.adsMs)} ms`,
      b: `${Math.round(b.adsMs)} ms`,
      advantage: b.adsMs - a.adsMs,
    },
    {
      label: 'Velocidade do projétil',
      a: `${Math.round(a.velocity)} m/s`,
      b: `${Math.round(b.velocity)} m/s`,
      advantage: a.velocity - b.velocity,
    },
    {
      label: 'Alcance efetivo',
      a: rangeA > 0 ? `${Math.round(rangeA)} m` : 'constante',
      b: rangeB > 0 ? `${Math.round(rangeB)} m` : 'constante',
      advantage: (rangeA || 999) - (rangeB || 999),
    },
    { label: 'Queda de dano', a: dropText(a), b: dropText(b), advantage: 0 },
    {
      label: 'Multiplicador na cabeça',
      a: `${String(a.headshot).replace('.', ',')}×`,
      b: `${String(b.headshot).replace('.', ',')}×`,
      advantage: a.headshot - b.headshot,
    },
    {
      label: 'Recuo vertical',
      a: a.verticalRecoil.toFixed(2).replace('.', ','),
      b: b.verticalRecoil.toFixed(2).replace('.', ','),
      advantage: b.verticalRecoil - a.verticalRecoil,
    },
  ];
}

/* ------------------------------- grade geral ------------------------------- */

type GridKey =
  | 'name'
  | 'category'
  | 'attachments'
  | 'damage'
  | 'rpm'
  | 'dps'
  | 'ttk'
  | 'magazine'
  | 'reload'
  | 'ads'
  | 'range'
  | 'mobility';

/**
 * Ordenação: 1 é crescente, -1 é decrescente. Cada coluna começa pela ordem que
 * responde à pergunta que ela faz — DPS pelo maior, tempo de mira pelo menor.
 */
const GRID_COLUMNS: { key: GridKey; label: string; direction: 1 | -1 }[] = [
  { key: 'name', label: 'Arma', direction: 1 },
  { key: 'category', label: 'Categoria', direction: 1 },
  { key: 'attachments', label: 'Acess.', direction: -1 },
  { key: 'damage', label: 'Dano', direction: -1 },
  { key: 'rpm', label: 'RPM', direction: -1 },
  { key: 'dps', label: 'DPS', direction: -1 },
  { key: 'ttk', label: 'TTK ms', direction: 1 },
  { key: 'magazine', label: 'Carreg.', direction: -1 },
  { key: 'reload', label: 'Recarga s', direction: 1 },
  { key: 'ads', label: 'ADS ms', direction: 1 },
  { key: 'range', label: 'Queda m', direction: -1 },
  { key: 'mobility', label: 'Mob.', direction: -1 },
];

interface GridRow {
  id: string;
  name: string;
  category: string;
  approximate: boolean;
  season: number;
  attachments: number;
  damage: number;
  rpm: number;
  dps: number;
  ttk: number;
  magazine: number;
  reload: number;
  ads: number;
  range: number;
  mobility: number;
}

function buildGrid(): GridRow[] {
  return WEAPONS.filter((w) => w.category !== 'melee').map((weapon) => {
    const stats = baseStats(weapon);
    const range = effectiveRange(stats);
    return {
      id: weapon.id,
      name: weapon.name,
      category: SHORT_CATEGORY_NAMES[weapon.category],
      approximate: weapon.provenance === 'curated',
      season: weapon.season,
      attachments: [...attachmentsForWeapon(weapon).values()].reduce((total, list) => total + list.length, 0),
      damage: damagePerShot(stats, 0),
      rpm: stats.rpm,
      dps: damagePerSecond(stats),
      ttk: timeToKill(stats, 0),
      magazine: stats.magazine,
      reload: stats.reload,
      ads: stats.adsMs,
      // Sem queda de dano, a arma vai para o topo quando se ordena por alcance.
      range: range === 0 ? 999 : range,
      mobility: stats.mobility,
    };
  });
}

export default function ComparePage() {
  const [idA, setIdA] = useState('ak4d');
  const [idB, setIdB] = useState('m4a1');
  const [sortKey, setSortKey] = useState<GridKey>('dps');
  const [sortDirection, setSortDirection] = useState<1 | -1>(-1);
  const [categoryFilter, setCategoryFilter] = useState<WeaponCategory | 'all'>('all');

  const weaponA = WEAPONS_BY_ID.get(idA)!;
  const weaponB = WEAPONS_BY_ID.get(idB)!;
  const statsA = useMemo(() => baseStats(weaponA), [weaponA]);
  const statsB = useMemo(() => baseStats(weaponB), [weaponB]);

  const scoresA = scores(statsA);
  const scoresB = scores(statsB);
  const rows = duelRows(statsA, statsB);

  const maxDistance = Math.max(analysisDistance(statsA), analysisDistance(statsB));
  const series: Series[] = [
    { name: weaponA.name, color: COLOR_A, stats: statsA },
    { name: weaponB.name, color: COLOR_B, stats: statsB },
  ];

  const grid = useMemo(() => {
    const list = buildGrid().filter(
      (row) => categoryFilter === 'all' || row.category === SHORT_CATEGORY_NAMES[categoryFilter],
    );
    return list.sort((x, y) => {
      const a = x[sortKey];
      const b = y[sortKey];
      const result = typeof a === 'string' ? a.localeCompare(b as string, 'pt-BR') : a - (b as number);
      return result * sortDirection;
    });
  }, [sortKey, sortDirection, categoryFilter]);

  function sortBy(column: { key: GridKey; direction: 1 | -1 }) {
    if (sortKey === column.key) setSortDirection((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(column.key);
      setSortDirection(column.direction);
    }
  }

  return (
    <div className="min-h-dvh">
      <AppHeader subtitle="Comparar armas" />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        {/* Seleção das duas armas */}
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <WeaponPicker label="Arma A" color={COLOR_A} value={idA} onChange={setIdA} />
          <WeaponPicker label="Arma B" color={COLOR_B} value={idB} onChange={setIdB} />
          <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
            Valores de fábrica, sem acessórios.
          </p>
        </div>

        {/* Confronto direto */}
        <section className="card bevel mb-3 p-4">
          <h2 className="label mb-3">Confronto direto</h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <DuelCard weapon={weaponA} color={COLOR_A} side="A" />
            <DuelCard weapon={weaponB} color={COLOR_B} side="B" />
          </div>

          {/* Barras espelhadas */}
          <div className="grid gap-2.5">
            {Object.keys(scoresA).map((key) => (
              <MirrorRow key={key} label={key} a={scoresA[key]} b={scoresB[key]} />
            ))}
          </div>
        </section>

        {/* Tabela do confronto */}
        <section className="card bevel mb-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <caption className="sr-only">Estatísticas das duas armas em confronto</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="label px-3 py-2 text-left"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  Estatística
                </th>
                <th
                  scope="col"
                  className="font-display px-3 py-2 text-right text-sm font-bold tracking-wide"
                  style={{ color: COLOR_A, borderBottom: '1px solid var(--border)' }}
                >
                  {weaponA.name}
                </th>
                <th
                  scope="col"
                  className="font-display px-3 py-2 text-right text-sm font-bold tracking-wide"
                  style={{ color: COLOR_B, borderBottom: '1px solid var(--border)' }}
                >
                  {weaponB.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <th
                    scope="row"
                    className="px-3 py-1.5 text-left font-normal"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {row.label}
                  </th>
                  <td
                    className="px-3 py-1.5 text-right font-mono"
                    style={{
                      color: row.advantage > 0 ? 'var(--color-positive)' : 'var(--text)',
                      fontWeight: row.advantage > 0 ? 700 : 400,
                    }}
                  >
                    {row.a}
                  </td>
                  <td
                    className="px-3 py-1.5 text-right font-mono"
                    style={{
                      color: row.advantage < 0 ? 'var(--color-positive)' : 'var(--text)',
                      fontWeight: row.advantage < 0 ? 700 : 400,
                    }}
                  >
                    {row.b}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Curvas sobrepostas */}
        <div className="mb-3 grid gap-3 lg:grid-cols-2">
          <ComparisonChart title="Dano por distância" series={series} maxDistance={maxDistance} kind="damage" />
          <ComparisonChart title="Queda da bala" series={series} maxDistance={maxDistance} kind="drop" />
        </div>

        {/* Arsenal inteiro, ordenável */}
        <section className="card bevel">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <h2 className="label">Arsenal · {grid.length} armas</h2>
            <div className="scroll-x flex gap-1.5">
              <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
                Todas
              </FilterChip>
              {CATEGORY_ORDER.filter((c) => c !== 'melee').map((c) => (
                <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
                  {SHORT_CATEGORY_NAMES[c]}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="max-h-[70dvh] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <caption className="sr-only">
                Todas as armas, ordenáveis por qualquer estatística. Use os botões A e B para
                escolher quem entra no confronto.
              </caption>
              <thead>
                <tr>
                  {GRID_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        sortKey === column.key
                          ? sortDirection === -1
                            ? 'descending'
                            : 'ascending'
                          : 'none'
                      }
                      className={`label sticky top-0 z-10 px-3 py-2 ${column.key === 'name' ? 'text-left' : 'text-right'}`}
                      style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
                    >
                      <button
                        type="button"
                        onClick={() => sortBy(column)}
                        className="label"
                        style={{ color: sortKey === column.key ? 'var(--text)' : undefined }}
                      >
                        {column.label}
                        {sortKey === column.key && (
                          <span className="ml-1 font-mono text-[9px]" style={{ color: 'var(--accent)' }}>
                            {sortDirection === -1 ? '▼' : '▲'}
                          </span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid var(--border-soft)',
                      background:
                        row.id === idA
                          ? `color-mix(in oklab, ${COLOR_A} 14%, transparent)`
                          : row.id === idB
                            ? `color-mix(in oklab, ${COLOR_B} 14%, transparent)`
                            : undefined,
                    }}
                  >
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="font-display text-sm font-semibold tracking-wide">
                          {row.name}
                        </span>
                        {row.approximate && (
                          <span title="Valores aproximados" style={{ color: 'var(--text-dim)' }}>
                            ≈
                          </span>
                        )}
                        {row.season > 0 && (
                          <span className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>
                            T{row.season}
                          </span>
                        )}
                        <SideButton
                          side="A"
                          color={COLOR_A}
                          active={row.id === idA}
                          onClick={() => setIdA(row.id)}
                          weaponName={row.name}
                        />
                        <SideButton
                          side="B"
                          color={COLOR_B}
                          active={row.id === idB}
                          onClick={() => setIdB(row.id)}
                          weaponName={row.name}
                        />
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      {row.category}
                    </td>
                    <Cell>{row.attachments}</Cell>
                    <Cell>{row.damage.toFixed(1).replace('.', ',')}</Cell>
                    <Cell>{row.rpm}</Cell>
                    <Cell>{Math.round(row.dps)}</Cell>
                    <Cell>{row.ttk === 0 ? '1 tiro' : Math.round(row.ttk)}</Cell>
                    <Cell>{row.magazine}</Cell>
                    <Cell>{row.reload.toFixed(2).replace('.', ',')}</Cell>
                    <Cell>{Math.round(row.ads)}</Cell>
                    <Cell>{row.range === 999 ? '∞' : Math.round(row.range)}</Cell>
                    <Cell>{Math.round(row.mobility)}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="pb-safe mt-6 text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>
          Projeto de fã, sem vínculo com a EA ou a DICE. O sinal ≈ marca armas com valores
          aproximados.
        </p>
      </main>
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-1.5 text-right font-mono text-[12px]">{children}</td>;
}

function WeaponPicker({
  label,
  color,
  value,
  onChange,
}: {
  label: string;
  color: string;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="label" style={{ color }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bevel-sm touch px-2 py-2 text-sm"
        style={{
          background: 'var(--surface-raised)',
          border: `1px solid ${color}`,
          color: 'var(--text)',
        }}
      >
        {CATEGORY_ORDER.filter((c) => c !== 'melee').map((category) => (
          <optgroup key={category} label={CATEGORY_NAMES[category]}>
            {WEAPONS.filter((w) => w.category === category).map((weapon) => (
              <option key={weapon.id} value={weapon.id}>
                {weapon.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function DuelCard({ weapon, color, side }: { weapon: Weapon; color: string; side: 'A' | 'B' }) {
  return (
    <div className="bevel-sm p-2" style={{ border: `1px solid ${color}`, background: 'var(--surface-raised)' }}>
      <div className="flex items-baseline gap-2">
        <span
          className="font-display px-1.5 text-xs font-bold"
          style={{ background: color, color: '#fff' }}
        >
          {side}
        </span>
        <span className="font-display truncate text-base font-semibold tracking-wide">
          {weapon.name}
        </span>
        <span className="ml-auto text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {SHORT_CATEGORY_NAMES[weapon.category]}
        </span>
      </div>
      <WeaponPreview weapon={weapon} className="mx-auto w-full max-w-[420px]" />
    </div>
  );
}

/**
 * Barra espelhada: as duas armas crescem do centro para fora, então a diferença
 * aparece como assimetria — não é preciso ler os números para ver quem ganha.
 */
function MirrorRow({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div className="grid items-center gap-2 [grid-template-columns:36px_1fr_92px_1fr_36px] sm:[grid-template-columns:48px_1fr_110px_1fr_48px]">
      <span
        className="text-right font-mono text-xs"
        style={{ color: a > b ? 'var(--color-positive)' : 'var(--text-soft)', fontWeight: a > b ? 700 : 400 }}
      >
        {a}
      </span>

      <span className="relative block h-2" style={{ background: 'var(--border-soft)' }}>
        <span
          className="absolute top-0 right-0 bottom-0 transition-[width] duration-300"
          style={{ width: `${a}%`, background: COLOR_A }}
        />
      </span>

      <span className="label text-center">{label}</span>

      <span className="relative block h-2" style={{ background: 'var(--border-soft)' }}>
        <span
          className="absolute top-0 bottom-0 left-0 transition-[width] duration-300"
          style={{ width: `${b}%`, background: COLOR_B }}
        />
      </span>

      <span
        className="font-mono text-xs"
        style={{ color: b > a ? 'var(--color-positive)' : 'var(--text-soft)', fontWeight: b > a ? 700 : 400 }}
      >
        {b}
      </span>
    </div>
  );
}

function SideButton({
  side,
  color,
  active,
  onClick,
  weaponName,
}: {
  side: 'A' | 'B';
  color: string;
  active: boolean;
  onClick: () => void;
  weaponName: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Definir ${weaponName} como arma ${side}`}
      className="font-mono text-[10px]"
      style={{
        width: 20,
        height: 20,
        background: active ? color : 'var(--surface-raised)',
        color: active ? '#fff' : 'var(--text-dim)',
      }}
    >
      {side}
    </button>
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
      className="bevel-sm shrink-0 px-3 py-1.5 text-xs whitespace-nowrap"
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
