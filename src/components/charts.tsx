'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  damageCurve,
  dropCurve,
  damagePerShot,
  bulletDrop,
  timeToKill,
  shotsToKill,
  type CurvePoint,
} from '@/lib/ballistics';
import type { EffectiveStats } from '@/lib/stats';

/**
 * Gráficos desenhados à mão em SVG.
 *
 * São dois gráficos pequenos, lidos no celular, que precisam responder a cada
 * acessório trocado e funcionar nos dois temas. Uma biblioteca de gráficos
 * traria muito mais peso e menos controle do que as poucas contas de escala
 * necessárias aqui.
 */

const L = 640;
const A = 250;
const MARGIN = { topo: 18, direita: 14, base: 34, esquerda: 44 };
const AREA = {
  x: MARGIN.esquerda,
  y: MARGIN.topo,
  width: L - MARGIN.esquerda - MARGIN.direita,
  height: A - MARGIN.topo - MARGIN.base,
};

function scaleX(value: number, max: number): number {
  return AREA.x + (value / max) * AREA.width;
}

function scaleY(value: number, max: number): number {
  return AREA.y + AREA.height - (value / Math.max(max, 1e-6)) * AREA.height;
}

/**
 * Coordenadas com duas casas decimais.
 *
 * A precisão extra não muda nada na tela — o SVG tem 640 unidades de largura — e
 * o arredondamento evita divergência de última casa entre o HTML pré-renderizado
 * e o que o navegador recalcula, que o React acusaria como erro de hidratação.
 */
function linePath(points: CurvePoint[], maxX: number, maxY: number): string {
  return points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${scaleX(p.distance, maxX).toFixed(2)} ${scaleY(p.value, maxY).toFixed(2)}`,
    )
    .join(' ');
}

/** Escolhe marcas de eixo redondas dentro do intervalo. */
function axisTicks(max: number, count = 5): number[] {
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const stepSize = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((p) => p >= raw) ?? magnitude * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += stepSize) out.push(Number(v.toFixed(6)));
  return out;
}

interface ChartFrameProps {
  title: string;
  legend: ReactNode;
  maxX: number;
  maxY: number;
  labelY: (v: number) => string;
  children: ReactNode;
  /** Chamado com a distância sob o cursor, ou nulo ao sair. */
  onPoint?: (distance: number | null) => void;
  activeDistance?: number | null;
  description: string;
}

function ChartFrame({
  title,
  legend,
  maxX,
  maxY,
  labelY,
  children,
  onPoint,
  activeDistance,
  description,
}: ChartFrameProps) {
  const ref = useRef<SVGSVGElement>(null);

  function trackPointer(event: React.PointerEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg || !onPoint) return;
    const viewBox = svg.getBoundingClientRect();
    const x = ((event.clientX - viewBox.left) / viewBox.width) * L;
    const raw = ((x - AREA.x) / AREA.width) * maxX;
    onPoint(Math.max(0, Math.min(maxX, raw)));
  }

  /*
   * A moldura segue sendo `<figure>`, e não o `Card` do antd.
   *
   * O `Card` renderiza uma `<div>` e não aceita trocar a tag, e aqui a tag é a
   * informação: um gráfico com legenda é `<figure>` + `<figcaption>`, e é isso
   * que faz o leitor de tela anunciar a legenda junto do desenho. A borda que o
   * `Card` traria já vem da classe `.card`.
   */
  return (
    <figure className="card bevel p-3">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="label">
          {title} <span style={{ opacity: 0.6 }}>· metros</span>
        </h3>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {legend}
        </div>
      </figcaption>

      <svg
        ref={ref}
        viewBox={`0 0 ${L} ${A}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={description}
        onPointerMove={trackPointer}
        onPointerDown={trackPointer}
        onPointerLeave={() => onPoint?.(null)}
      >
        {/* Grade e eixo vertical. */}
        {axisTicks(maxY).map((v) => (
          <g key={`y${v}`}>
            <line
              x1={AREA.x}
              x2={AREA.x + AREA.width}
              y1={scaleY(v, maxY)}
              y2={scaleY(v, maxY)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={AREA.x - 7}
              y={scaleY(v, maxY) + 4}
              textAnchor="end"
              fill="var(--text-dim)"
              style={{ font: '500 11px var(--font-sans)' }}
            >
              {labelY(v)}
            </text>
          </g>
        ))}

        {/* Eixo horizontal, em metros. */}
        {axisTicks(maxX).map((v) => (
          <g key={`x${v}`}>
            <line
              y1={AREA.y}
              y2={AREA.y + AREA.height}
              x1={scaleX(v, maxX)}
              x2={scaleX(v, maxX)}
              stroke="var(--grid)"
              strokeWidth={1}
              opacity={0.5}
            />
            <text
              x={scaleX(v, maxX)}
              y={A - 12}
              textAnchor="middle"
              fill="var(--text-dim)"
              style={{ font: '500 11px var(--font-sans)' }}
            >
              {Math.round(v)}
            </text>
          </g>
        ))}
        {children}

        {/* Guia vertical sob o dedo ou o cursor. */}
        {activeDistance != null && (
          <line
            x1={scaleX(activeDistance, maxX)}
            x2={scaleX(activeDistance, maxX)}
            y1={AREA.y}
            y2={AREA.y + AREA.height}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
      </svg>
    </figure>
  );
}

function LegendSwatch({ color, dashed, text }: { color: string; dashed?: boolean; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="8" aria-hidden>
        <line
          x1="0"
          y1="4"
          x2="16"
          y2="4"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      {text}
    </span>
  );
}

/* --------------------------- Comparação entre armas --------------------------- */

/** Cores das séries na comparação, escolhidas para se distinguirem nos dois temas. */
export const SERIES_COLORS = ['#ff8a00', '#5fe3f0', '#7ddc4c', '#c08bff'];

export interface Series {
  name: string;
  color: string;
  stats: EffectiveStats;
}

export function ComparisonChart({
  title,
  series,
  maxDistance,
  kind,
}: {
  title: string;
  series: Series[];
  maxDistance: number;
  kind: 'damage' | 'drop';
}) {
  const [distance, setDistance] = useState<number | null>(null);

  const curves = useMemo(
    () =>
      series.map((serie) => ({
        ...serie,
        points:
          kind === 'damage'
            ? damageCurve(serie.stats, maxDistance)
            : dropCurve(serie.stats, maxDistance).map((p) => ({
                distance: p.distance,
                value: p.value * 100,
              })),
      })),
    [series, maxDistance, kind],
  );

  const maxY = useMemo(() => {
    const values = curves.flatMap((c) => c.points.map((p) => p.value));
    return (values.length ? Math.max(...values) : 1) * 1.15 || 1;
  }, [curves]);

  return (
    <ChartFrame
      title={title}
      legend={
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {/*
            A chave é a posição, não o nome: nada impede comparar uma arma com
            ela mesma, e com dois nomes iguais o React reaproveitava o nó errado
            na troca seguinte — a legenda antiga ficava na tela para sempre.
          */}
          {series.map((s, i) => (
            <LegendSwatch key={i} color={s.color} text={s.name} />
          ))}
        </div>
      }
      maxX={maxDistance}
      maxY={maxY}
      labelY={(v) => String(Math.round(v))}
      onPoint={setDistance}
      activeDistance={distance}
      description={`Comparação de ${kind === 'damage' ? 'dano' : 'queda da bala'} entre ${series
        .map((s) => s.name)
        .join(', ')}`}
    >
      {kind === 'drop' && (
        <text
          x={AREA.x - 34}
          y={AREA.y - 6}
          fill="var(--text-dim)"
          style={{ font: '600 10px var(--font-display)', letterSpacing: '0.12em' }}
        >
          CM
        </text>
      )}

      {curves.map((curve, i) => (
        <path
          key={i}
          d={linePath(curve.points, maxDistance, maxY)}
          fill="none"
          stroke={curve.color}
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Leitura de todas as séries na distância apontada. */}
      {distance != null && (
        <g>
          {curves.map((curve, i) => {
            const value =
              kind === 'damage'
                ? damagePerShot(curve.stats, distance)
                : bulletDrop(curve.stats, distance) * 100;
            return (
              <g key={i}>
                <circle
                  cx={scaleX(distance, maxDistance)}
                  cy={scaleY(value, maxY)}
                  r={4}
                  fill={curve.color}
                />
                <text
                  x={Math.min(scaleX(distance, maxDistance) + 10, L - 130)}
                  y={AREA.y + 14 + i * 15}
                  fill={curve.color}
                  style={{ font: '600 11px var(--font-sans)' }}
                >
                  {curve.name}: {value.toFixed(1)}
                  {kind === 'damage' ? '' : ' cm'}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </ChartFrame>
  );
}

/* ------------------------------ Dano por distância ------------------------------ */

export function DamageChart({
  stats,
  base,
  maxDistance,
  showBase,
}: {
  stats: EffectiveStats;
  base: EffectiveStats;
  maxDistance: number;
  showBase: boolean;
}) {
  const [distance, setDistance] = useState<number | null>(null);

  const curve = useMemo(() => damageCurve(stats, maxDistance), [stats, maxDistance]);
  const baseCurve = useMemo(() => damageCurve(base, maxDistance), [base, maxDistance]);
  const maxY = useMemo(
    () => Math.max(...curve.map((p) => p.value), ...baseCurve.map((p) => p.value)) * 1.15,
    [curve, baseCurve],
  );

  const reading =
    distance == null
      ? null
      : {
          damage: damagePerShot(stats, distance),
          shots: shotsToKill(stats, distance),
          ttk: timeToKill(stats, distance),
        };

  return (
    <ChartFrame
      title="Dano por distância"
      legend={
        <>
          {showBase && <LegendSwatch color="var(--text-dim)" dashed text="de fábrica" />}
          <LegendSwatch color="var(--accent)" text="montada" />
        </>
      }
      maxX={maxDistance}
      maxY={maxY}
      labelY={(v) => String(Math.round(v))}
      onPoint={setDistance}
      activeDistance={distance}
      description={`Dano por disparo de ${Math.round(damagePerShot(stats, 0))} até ${Math.round(
        damagePerShot(stats, maxDistance),
      )} ao longo de ${maxDistance} metros`}
    >
      {showBase && (
        <path
          d={linePath(baseCurve, maxDistance, maxY)}
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.75}
        />
      )}
      <path
        d={linePath(curve, maxDistance, maxY)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />

      {/* Quantos tiros são necessários em cada patamar. */}
      {stats.damage.map((step, i) => {
        const damage = step.damage * stats.pellets;
        if (damage <= 0 || step.distance > maxDistance) return null;
        const nextStep = stats.damage[i + 1]?.distance ?? maxDistance;
        const midpoint = (step.distance + Math.min(nextStep, maxDistance)) / 2;
        return (
          <text
            key={i}
            x={scaleX(midpoint, maxDistance)}
            y={scaleY(damage, maxY) - 8}
            textAnchor="middle"
            fill="var(--text-soft)"
            style={{ font: '600 11px var(--font-display)', letterSpacing: '0.06em' }}
          >
            {Math.ceil(100 / damage)} TIROS
          </text>
        );
      })}

      {reading && distance != null && (
        <g>
          <circle
            cx={scaleX(distance, maxDistance)}
            cy={scaleY(reading.damage, maxY)}
            r={4.5}
            fill="var(--accent)"
          />
          <text
            x={Math.min(scaleX(distance, maxDistance) + 10, L - 140)}
            y={AREA.y + 14}
            fill="var(--text)"
            style={{ font: '600 12px var(--font-sans)' }}
          >
            {Math.round(distance)} m · {reading.damage.toFixed(1)} de dano
          </text>
          <text
            x={Math.min(scaleX(distance, maxDistance) + 10, L - 140)}
            y={AREA.y + 30}
            fill="var(--text-soft)"
            style={{ font: '500 12px var(--font-sans)' }}
          >
            {reading.shots} tiros · {Math.round(reading.ttk)} ms
          </text>
        </g>
      )}
    </ChartFrame>
  );
}

/* ------------------------------- Queda do projétil ------------------------------- */

export function DropChart({
  stats,
  base,
  maxDistance,
  showBase,
}: {
  stats: EffectiveStats;
  base: EffectiveStats;
  maxDistance: number;
  showBase: boolean;
}) {
  const [distance, setDistance] = useState<number | null>(null);

  // Em centímetros: a queda de um fuzil a 100 m é de poucos centímetros e em
  // metros o gráfico ficaria colado no eixo.
  const toCentimeters = (p: CurvePoint) => ({ distance: p.distance, value: p.value * 100 });
  const curve = useMemo(() => dropCurve(stats, maxDistance).map(toCentimeters), [stats, maxDistance]);
  const baseCurve = useMemo(() => dropCurve(base, maxDistance).map(toCentimeters), [base, maxDistance]);
  const maxY = useMemo(
    () => Math.max(...curve.map((p) => p.value), ...baseCurve.map((p) => p.value)) * 1.12 || 1,
    [curve, baseCurve],
  );

  const currentDrop = distance == null ? null : bulletDrop(stats, distance) * 100;

  return (
    <ChartFrame
      title="Queda da bala"
      legend={
        <>
          {showBase && <LegendSwatch color="var(--text-dim)" dashed text="de fábrica" />}
          <LegendSwatch color="var(--color-cyan-400)" text="montada" />
        </>
      }
      maxX={maxDistance}
      maxY={maxY}
      labelY={(v) => `${Math.round(v)}`}
      onPoint={setDistance}
      activeDistance={distance}
      description={`Queda do projétil de até ${Math.round(maxY)} centímetros em ${maxDistance} metros`}
    >
      <text
        x={AREA.x - 34}
        y={AREA.y - 6}
        fill="var(--text-dim)"
        style={{ font: '600 10px var(--font-display)', letterSpacing: '0.12em' }}
      >
        CM
      </text>

      {showBase && (
        <path
          d={linePath(baseCurve, maxDistance, maxY)}
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.75}
        />
      )}
      <path
        d={linePath(curve, maxDistance, maxY)}
        fill="none"
        stroke="var(--color-cyan-400)"
        strokeWidth={2.6}
        strokeLinecap="round"
      />

      {currentDrop != null && distance != null && (
        <g>
          <circle
            cx={scaleX(distance, maxDistance)}
            cy={scaleY(currentDrop, maxY)}
            r={4.5}
            fill="var(--color-cyan-400)"
          />
          <text
            x={Math.min(scaleX(distance, maxDistance) + 10, L - 150)}
            y={AREA.y + 14}
            fill="var(--text)"
            style={{ font: '600 12px var(--font-sans)' }}
          >
            {Math.round(distance)} m · mire {currentDrop.toFixed(1)} cm acima
          </text>
        </g>
      )}
    </ChartFrame>
  );
}
