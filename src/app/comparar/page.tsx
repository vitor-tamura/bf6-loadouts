'use client';

import { Hint } from '@/components/hint';
import { Card, Modal, Segmented, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/header';
import { SeasonTag } from '@/components/season-tag';
import { SiteFooter } from '@/components/site-footer';
import { ComparisonChart, type Series } from '@/components/charts';
import { WeaponPreview } from '@/components/weapon-preview';
import { WeaponSelector } from '@/components/weapon-selector';
import { SHORT_CATEGORY_NAMES } from '@/data/classes';
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
import { analyzeMatchup, GAME_MODES, type GameMode } from '@/lib/matchup';
import { useDesktop } from '@/lib/media';

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
  // O modo escolhido muda o peso de cada estatística na leitura do confronto.
  const [mode, setMode] = useState<GameMode>('multiplayer');
  const desktop = useDesktop();
  // Qual dos dois lados está escolhendo arma — nenhum, quando a lista está fechada.
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);

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
        {/*
          Não há mais seletor no topo.
          Trocar de arma é tocar na foto dela, logo abaixo — um alvo grande, com
          a imagem à vista, que abre a lista inteira com miniaturas. Os dois
          campos que ficavam aqui faziam o mesmo por um caminho pior: em tela de
          celular viravam duas caixas de três centímetros, lado a lado, com o
          nome da arma cortado.
        */}
        <p className="mb-3 text-[11px]" style={{ color: 'var(--text-dim)' }}>
          Valores de fábrica, sem acessórios.
        </p>

        {/* Confronto direto */}
        <Card
          variant="outlined"
          className="card bevel mb-3"
          styles={{ body: { padding: 16 } }}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <h2 className="label mb-3">Confronto direto</h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <DuelCard weapon={weaponA} color={COLOR_A} side="A" onPick={() => setPicking('a')} />
            <DuelCard weapon={weaponB} color={COLOR_B} side="B" onPick={() => setPicking('b')} />
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

          <MatchupReading
            idA={idA}
            idB={idB}
            statsA={statsA}
            statsB={statsB}
            nameA={weaponA.name}
            nameB={weaponB.name}
            mode={mode}
            onModeChange={setMode}
          />
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
            /*
             * A altura fixa é coisa de computador.
             *
             * No celular ela cria uma janela de 590 px que rola por dentro: o
             * polegar entra nela ao descer a página e a rolagem trava ali,
             * porque a tabela consome o gesto antes do documento. Sem a altura,
             * a tabela cresce e quem rola é a página, como no resto da tela. A
             * rolagem lateral continua, que é a única saída para doze colunas.
             */
            scroll={{ x: 1100, y: desktop ? '70dvh' : undefined }}
            rowClassName={(row) => (row.id === idA ? 'linha-a' : row.id === idB ? 'linha-b' : '')}
          />
        </Card>

        <SiteFooter note="O sinal ≈ marca armas com valores aproximados." />
      </main>

      {picking && (
        <WeaponPickerModal
          side={picking === 'a' ? 'A' : 'B'}
          color={picking === 'a' ? COLOR_A : COLOR_B}
          selected={picking === 'a' ? idA : idB}
          onSelect={picking === 'a' ? setIdA : setIdB}
          onClose={() => setPicking(null)}
        />
      )}

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

/**
 * A leitura do confronto, em frases.
 *
 * A tabela abaixo tem quatorze linhas de números e responde tudo — desde que a
 * pessoa saiba o que perguntar. Esta leitura responde a pergunta que traz
 * alguém a esta tela: qual das duas levar, e para qual modo. Ela sai das mesmas
 * estatísticas que estão na tela, comparadas por eixos e pesadas pelo modo
 * escolhido; ver `src/lib/matchup.ts`.
 *
 * O botão de modo fica junto do texto, e não no topo da página, porque é ele
 * que muda o que o texto diz — no multiplayer decide quem mata primeiro e vira
 * mais rápido; no REDSEC, quem alcança longe e aguenta a briga com um pente.
 */
function MatchupReading({
  idA,
  idB,
  statsA,
  statsB,
  nameA,
  nameB,
  mode,
  onModeChange,
}: {
  idA: string;
  idB: string;
  statsA: EffectiveStats;
  statsB: EffectiveStats;
  nameA: string;
  nameB: string;
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
}) {
  const reading = useMemo(
    () => analyzeMatchup(statsA, statsB, nameA, nameB, mode),
    [statsA, statsB, nameA, nameB, mode],
  );

  const { text: written, loading } = useWrittenReading(idA, idB, mode);

  const color =
    reading.winner === 'a' ? COLOR_A : reading.winner === 'b' ? COLOR_B : 'var(--text-soft)';

  return (
    <section
      className="bevel-sm mt-4 p-3"
      style={{
        border: '1px solid var(--border-soft)',
        background: 'var(--surface-raised)',
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="label flex items-center gap-2">
          Leitura do confronto
          {/*
            O indicador diz o que está acontecendo sem tirar nada da tela: a
            leitura por regras já está escrita abaixo, e o que se espera é a
            versão do modelo, que pode não vir. Um esqueleto piscando no lugar
            do texto seria pior — esconderia uma resposta que já existe.
          */}
          {loading && (
            <span
              className="flex items-center gap-1 text-[10px] font-normal normal-case"
              style={{ color: 'var(--text-dim)' }}
            >
              <Spin size="small" />
              gerando análise…
            </span>
          )}
        </h3>
        <Segmented
          options={GAME_MODES}
          value={mode}
          onChange={(v) => onModeChange(v as GameMode)}
          size="small"
          className="bevel-sm"
        />
      </div>

      {/*
        O texto do modelo entra no lugar da análise por regras quando chega, e
        não antes. Assim a seção nunca aparece vazia nem com um esqueleto
        piscando: o que está na tela desde o primeiro quadro já responde a
        pergunta, e a versão escrita só a substitui se vier melhor.
      */}
      {written ? (
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>
          {written}
        </p>
      ) : (
        <>
          <p className="text-[13px] leading-snug font-semibold" style={{ color }}>
            {reading.headline}
          </p>

          <ul className="mt-1.5 space-y-1">
            {reading.points.map((point) => (
              <li
                key={point}
                className="flex gap-1.5 text-[12px] leading-snug"
                style={{ color: 'var(--text-soft)' }}
              >
                <span aria-hidden style={{ color: 'var(--text-dim)' }}>
                  ·
                </span>
                {point}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
        {written ? 'Escrito por IA a partir das' : 'Leitura automática das'} estatísticas desta tela
        — sem acessórios, e sem contar acerto na cabeça.
      </p>
    </section>
  );
}

/**
 * Pede ao servidor a leitura escrita, e desiste em silêncio.
 *
 * A tela já mostra a análise por regras, então falhar aqui não custa nada: sem
 * rede, sem crédito no gateway ou com o modelo fora do ar, o texto simplesmente
 * não chega e o que está na tela continua valendo. O pedido é cancelado quando
 * a arma ou o modo mudam, senão uma resposta atrasada sobrescreveria a
 * comparação seguinte.
 */
function useWrittenReading(
  idA: string,
  idB: string,
  mode: GameMode,
): { text: string | null; loading: boolean } {
  const key = `${idA}|${idB}|${mode}`;
  const [answer, setAnswer] = useState<{ key: string; text: string | null; done: boolean }>({
    key,
    text: null,
    done: false,
  });

  // Trocar de arma limpa o texto na hora, ainda na renderização: um efeito
  // faria isso depois da pintura, e por um quadro a leitura da arma anterior
  // apareceria sob o nome da nova.
  if (answer.key !== key) setAnswer({ key, text: null, done: false });

  useEffect(() => {
    const controller = new AbortController();

    // A barra no fim não é enfeite: o site roda com `trailingSlash`, e sem ela
    // o pedido leva um 308 antes de chegar na rota.
    fetch('/api/matchup/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: idA, b: idB, mode }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { text?: string } | null) => {
        setAnswer({ key, text: data?.text ?? null, done: true });
      })
      .catch((error: unknown) => {
        // Cancelar não é falhar: quem cancelou foi a troca de arma, e o pedido
        // seguinte já está a caminho — marcar `done` aqui apagaria o indicador
        // antes da hora.
        if ((error as { name?: string })?.name === 'AbortError') return;
        setAnswer({ key, text: null, done: true });
      });

    return () => controller.abort();
  }, [idA, idB, mode, key]);

  const current = answer.key === key ? answer : null;
  return { text: current?.text ?? null, loading: !current?.done };
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

/**
 * O cartão da arma em confronto, que também é o botão de trocá-la.
 *
 * A foto é o maior alvo da tela e estava ali só enfeitando: para trocar de arma
 * era preciso subir até o seletor, abrir a lista e ler sessenta e três nomes sem
 * imagem nenhuma. Tocar na própria arma abre a lista com as fotos ao lado, que é
 * como se reconhece uma arma de relance — pelo desenho, não pela sigla.
 */
function DuelCard({
  weapon,
  color,
  side,
  onPick,
}: {
  weapon: Weapon;
  color: string;
  side: 'A' | 'B';
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Trocar a arma ${side}, agora ${weapon.name}`}
      className="bevel-sm w-full p-2 text-left"
      style={{ border: `1px solid ${color}`, background: 'var(--surface-raised)' }}
    >
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
      <span className="mt-1 block text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>
        Toque para trocar
      </span>
    </button>
  );
}

/**
 * A lista de armas com foto, para escolher quem entra no confronto.
 *
 * O `WeaponSelector` do montador já faz exatamente isto — busca, chips de
 * categoria e a lista com miniatura —, então aqui ele é reaproveitado inteiro
 * em vez de ganhar uma segunda versão que envelheceria em separado.
 */
function WeaponPickerModal({
  side,
  color,
  selected,
  onSelect,
  onClose,
}: {
  side: 'A' | 'B';
  color: string;
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      title={
        <span className="font-display text-lg font-semibold" style={{ color }}>
          Escolher a arma {side}
        </span>
      }
      className="bevel"
      width={480}
      styles={{ body: { maxHeight: '70dvh', overflowY: 'auto' } }}
      destroyOnHidden
    >
      <WeaponSelector
        title="Todas as armas"
        selected={selected}
        equippedLabel={`No confronto · lado ${side}`}
        categories={CATEGORY_ORDER.filter((c) => c !== 'melee')}
        onSelect={(id) => {
          onSelect(id);
          onClose();
        }}
      />
    </Modal>
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
