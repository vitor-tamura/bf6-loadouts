'use client';

import { Hint } from '@/components/hint';
import { Card, Segmented, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { AppHeader } from '@/components/header';
import { SeasonTag } from '@/components/season-tag';
import { SiteFooter } from '@/components/site-footer';
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
 *
 * As duas tabelas passaram a ser `Table` do Ant Design. Na grade do arsenal isso
 * apagou o código de ordenação escrito à mão — cabeçalho clicável, seta de
 * direção, `aria-sort` — que agora vem do componente. As barras espelhadas
 * ficaram como estavam: não há equivalente que cresça do centro para os lados.
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
    'Sem visada': clamp(stats.hipfire),
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
  key: string;
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
  ].map((row) => ({ ...row, key: row.label }));
}

/* ------------------------------- grade geral ------------------------------- */

interface GridRow {
  key: string;
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
      key: weapon.id,
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

/** As armas agrupadas por categoria, como o seletor precisa delas. */
const WEAPON_OPTIONS = CATEGORY_ORDER.filter((c) => c !== 'melee').map((category) => ({
  label: CATEGORY_NAMES[category],
  options: WEAPONS.filter((w) => w.category === category).map((w) => ({
    label: w.name,
    value: w.id,
  })),
}));

const CATEGORY_OPTIONS = [
  { label: 'Todas', value: 'all' as const },
  ...CATEGORY_ORDER.filter((c) => c !== 'melee').map((c) => ({
    label: SHORT_CATEGORY_NAMES[c],
    value: c,
  })),
];

const formatNumber = (v: number) => v.toFixed(1).replace('.', ',');

export default function ComparePage() {
  const [idA, setIdA] = useState('ak4d');
  const [idB, setIdB] = useState('m4a1');
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

  const grid = useMemo(
    () =>
      buildGrid().filter(
        (row) => categoryFilter === 'all' || row.category === SHORT_CATEGORY_NAMES[categoryFilter],
      ),
    [categoryFilter],
  );

  /** As três colunas do confronto: o rótulo e um valor de cada arma. */
  const duelColumns: ColumnsType<DuelRow> = [
    {
      title: 'Estatística',
      dataIndex: 'label',
      key: 'label',
      className: 'text-left',
      render: (label: string) => <span style={{ color: 'var(--text-soft)' }}>{label}</span>,
    },
    {
      title: <span style={{ color: COLOR_A }}>{weaponA.name}</span>,
      dataIndex: 'a',
      key: 'a',
      align: 'right',
      render: (value: string, row) => <DuelValue value={value} wins={row.advantage > 0} />,
    },
    {
      title: <span style={{ color: COLOR_B }}>{weaponB.name}</span>,
      dataIndex: 'b',
      key: 'b',
      align: 'right',
      render: (value: string, row) => <DuelValue value={value} wins={row.advantage < 0} />,
    },
  ];

  /*
   * A grade do arsenal.
   *
   * Cada coluna começa pela ordem que responde à pergunta que ela faz — DPS pelo
   * maior, tempo de mira pelo menor. É o que `defaultSortOrder` faz na primeira
   * e `sortDirections` nas demais: a primeira batida do cabeçalho já traz a
   * ponta que interessa, em vez de obrigar a um segundo clique.
   */
  const gridColumns: ColumnsType<GridRow> = [
    {
      title: 'Arma',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left',
      width: 260,
      sorter: (x, y) => x.name.localeCompare(y.name, 'pt-BR'),
      render: (_: string, row) => (
        <span className="flex items-center gap-1.5">
          <span className="font-display text-sm font-semibold tracking-wide">{row.name}</span>
          {row.approximate && (
            <Hint label="Valores aproximados">
              <span style={{ color: 'var(--text-dim)' }}>≈</span>
            </Hint>
          )}
          <SeasonTag season={row.season} size="sm" />
          <SideButton side="A" color={COLOR_A} active={row.id === idA} onClick={() => setIdA(row.id)} weaponName={row.name} />
          <SideButton side="B" color={COLOR_B} active={row.id === idB} onClick={() => setIdB(row.id)} weaponName={row.name} />
        </span>
      ),
    },
    {
      title: 'Categoria',
      dataIndex: 'category',
      key: 'category',
      align: 'right',
      width: 110,
      sorter: (x, y) => x.category.localeCompare(y.category, 'pt-BR'),
      render: (c: string) => (
        <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {c}
        </span>
      ),
    },
    numericColumn('Acess.', 'attachments', (v) => String(v), 'descend'),
    numericColumn('Dano', 'damage', formatNumber, 'descend'),
    numericColumn('RPM', 'rpm', (v) => String(v), 'descend'),
    numericColumn('DPS', 'dps', (v) => String(Math.round(v)), 'descend', 'dps'),
    numericColumn('TTK ms', 'ttk', (v) => (v === 0 ? '1 tiro' : String(Math.round(v))), 'ascend'),
    numericColumn('Carreg.', 'magazine', (v) => String(v), 'descend'),
    numericColumn('Recarga s', 'reload', (v) => v.toFixed(2).replace('.', ','), 'ascend'),
    numericColumn('ADS ms', 'ads', (v) => String(Math.round(v)), 'ascend'),
    numericColumn('Queda m', 'range', (v) => (v === 999 ? '∞' : String(Math.round(v))), 'descend'),
    numericColumn('Mob.', 'mobility', (v) => String(Math.round(v)), 'descend'),
  ];

  return (
    <div className="min-h-dvh">
      <AppHeader subtitle="Comparar armas" />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        {/* Seleção das duas armas */}
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <WeaponPicker label="Arma A" color={COLOR_A} value={idA} onChange={setIdA} />
          <WeaponPicker label="Arma B" color={COLOR_B} value={idB} onChange={setIdB} />
          <Typography.Text className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
            Valores de fábrica, sem acessórios.
          </Typography.Text>
        </div>

        {/* Confronto direto */}
        <Card
          variant="outlined"
          className="card bevel mb-3"
          styles={{ body: { padding: 16 } }}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <h2 className="label mb-3">Confronto direto</h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <DuelCard weapon={weaponA} color={COLOR_A} side="A" />
            <DuelCard weapon={weaponB} color={COLOR_B} side="B" />
          </div>

          {/*
            As barras espelhadas continuam feitas à mão: elas crescem do centro
            para fora, uma para cada lado, e o `Progress` do antd só sabe crescer
            da esquerda para a direita.
          */}
          <div className="grid gap-2.5">
            {Object.keys(scoresA).map((key) => (
              <MirrorRow key={key} label={key} a={scoresA[key]} b={scoresB[key]} />
            ))}
          </div>
        </Card>

        {/* Tabela do confronto */}
        <Card
          variant="outlined"
          className="card bevel mb-3"
          styles={{ body: { padding: 0 } }}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <Table<DuelRow>
            columns={duelColumns}
            dataSource={rows}
            pagination={false}
            size="small"
            scroll={{ x: 520 }}
          />
        </Card>

        {/* Curvas sobrepostas */}
        <div className="mb-3 grid gap-3 lg:grid-cols-2">
          <ComparisonChart title="Dano por distância" series={series} maxDistance={maxDistance} kind="damage" />
          <ComparisonChart title="Queda da bala" series={series} maxDistance={maxDistance} kind="drop" />
        </div>

        {/* Arsenal inteiro, ordenável */}
        <Card
          variant="outlined"
          className="card bevel"
          styles={{ body: { padding: 0 } }}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <h2 className="label">Arsenal · {grid.length} armas</h2>
            <Segmented
              options={CATEGORY_OPTIONS}
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(v as WeaponCategory | 'all')}
              size="small"
              className="bevel-sm max-w-full overflow-x-auto"
            />
          </div>

          <Table<GridRow>
            columns={gridColumns}
            dataSource={grid}
            pagination={false}
            size="small"
            sticky
            scroll={{ x: 1100, y: '70dvh' }}
            rowClassName={(row) => (row.id === idA ? 'linha-a' : row.id === idB ? 'linha-b' : '')}
          />
        </Card>

        <SiteFooter note="O sinal ≈ marca armas com valores aproximados." />
      </main>

      {/*
        As duas linhas em confronto ficam tingidas na grade. Vai em CSS porque
        `rowClassName` entrega o nome da classe, não o estilo, e a cor precisa
        sobreviver ao hover da própria tabela.
      */}
      <style>{`
        .linha-a > td { background: color-mix(in oklab, ${COLOR_A} 14%, transparent) !important; }
        .linha-b > td { background: color-mix(in oklab, ${COLOR_B} 14%, transparent) !important; }
      `}</style>
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

/** Coluna numérica da grade — todas seguem o mesmo molde. */
function numericColumn(
  title: string,
  key: keyof GridRow,
  render: (v: number) => string,
  initialOrder: 'ascend' | 'descend',
  preset?: 'dps',
): ColumnsType<GridRow>[number] {
  return {
    title,
    dataIndex: key,
    key: String(key),
    align: 'right',
    width: 96,
    sorter: (x: GridRow, y: GridRow) => (x[key] as number) - (y[key] as number),
    sortDirections: initialOrder === 'descend' ? ['descend', 'ascend'] : ['ascend', 'descend'],
    defaultSortOrder: preset === 'dps' ? 'descend' : undefined,
    render: (v: number) => <span className="font-mono text-[12px]">{render(v)}</span>,
  };
}

function DuelValue({ value, wins }: { value: string; wins: boolean }) {
  return (
    <span
      className="font-mono"
      style={{ color: wins ? 'var(--color-positive)' : 'var(--text)', fontWeight: wins ? 700 : 400 }}
    >
      {value}
    </span>
  );
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
      {/*
        Busca por digitação: são 63 armas em oito grupos, e rolar a lista até a
        letra certa era o jeito mais lento de trocar de arma.
      */}
      <Select
        value={value}
        onChange={onChange}
        options={WEAPON_OPTIONS}
        showSearch
        optionFilterProp="label"
        className="bevel-sm touch"
        style={{ width: 190, borderColor: color }}
        popupMatchSelectWidth={240}
      />
    </label>
  );
}

function DuelCard({ weapon, color, side }: { weapon: Weapon; color: string; side: 'A' | 'B' }) {
  return (
    <div className="bevel-sm p-2" style={{ border: `1px solid ${color}`, background: 'var(--surface-raised)' }}>
      <div className="flex items-baseline gap-2">
        <Tag className="font-display m-0 px-1.5 text-xs font-bold" style={{ background: color, color: '#fff', border: 'none' }}>
          {side}
        </Tag>
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
    <Hint label={`Definir ${weaponName} como arma ${side}`}>
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
    </Hint>
  );
}
