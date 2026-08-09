'use client';

import dynamic from 'next/dynamic';
import { useMemo, type ReactNode } from 'react';
import { damageCurve, dropCurve, damagePerShot, type CurvePoint } from '@/lib/ballistics';
import { coresDoTema } from '@/lib/antd-theme';
import { useTheme } from './theme';
import type { EffectiveStats } from '@/lib/stats';

/**
 * Os gráficos, desenhados pelo Ant Design Plots.
 *
 * Antes eram SVG escritos à mão aqui dentro. O desenho continua o mesmo — curva
 * de dano em degraus, queda do projétil, comparação entre armas —, mas eixos,
 * grade, legenda, tooltip e a linha guia sob o cursor passaram a vir prontos, e
 * com eles o comportamento que ninguém tinha escrito: reticulado que acompanha
 * o ponteiro, valores de todas as séries de uma vez, redesenho ao redimensionar.
 *
 * A biblioteca entra por `@ant-design/plots`, e não pelo guarda-chuva
 * `@ant-design/charts`: o guarda-chuva reexporta junto o pacote de grafos, que
 * não tem uso nenhum aqui e dobraria o peso baixado à toa.
 *
 * O canvas é montado só no navegador (`ssr: false`). O site é exportado
 * estático, e o G2 mede o elemento para se dimensionar — no HTML pré-gerado não
 * há elemento medido, e o gráfico nasceria com tamanho zero.
 */

const Line = dynamic(() => import('@ant-design/plots').then((m) => m.Line), {
  ssr: false,
  loading: () => <div style={{ height: HEIGHT }} aria-hidden />,
});

const HEIGHT = 250;

/** Um ponto no formato longo que o G2 espera: distância, valor e série. */
interface Point {
  distance: number;
  value: number;
  series: string;
}

const toPoints = (curve: CurvePoint[], series: string): Point[] =>
  curve.map((p) => ({ distance: p.distance, value: p.value, series }));

/** Metros e centímetros escritos como se escreve em português. */
const formatNumber = (v: number, decimals = 1) => v.toFixed(decimals).replace('.', ',');

/**
 * O molde comum aos três gráficos.
 *
 * Eixos sem linha nem marca, grade discreta, legenda em cima e tooltip
 * compartilhada — o mesmo enquadramento que o desenho à mão tinha, agora dito
 * uma vez só.
 */
function useBaseConfig(yLabel: string) {
  const { light } = useTheme();

  return useMemo(() => {
    const c = coresDoTema(light);
    const fontFamily = 'var(--font-sans), system-ui, sans-serif';

    return {
      autoFit: true,
      height: HEIGHT,
      theme: light ? 'classic' : 'classicDark',
      // Fundo transparente: o cartão por baixo já tem a superfície e a trama.
      style: { viewFill: 'transparent', plotFill: 'transparent' },
      axis: {
        x: {
          title: 'metros',
          titleFill: c.textDim,
          titleFontSize: 10,
          labelFill: c.textDim,
          labelFontSize: 11,
          labelFontFamily: fontFamily,
          line: false,
          tick: false,
          grid: true,
          gridStroke: c.border,
          gridStrokeOpacity: 0.5,
        },
        y: {
          title: yLabel,
          titleFill: c.textDim,
          titleFontSize: 10,
          labelFill: c.textDim,
          labelFontSize: 11,
          labelFontFamily: fontFamily,
          line: false,
          tick: false,
          gridStroke: c.border,
        },
      },
      legend: {
        color: {
          position: 'top' as const,
          layout: { justifyContent: 'flex-end' as const },
          itemLabelFill: c.textDim,
          itemLabelFontSize: 11,
          itemLabelFontFamily: fontFamily,
          itemMarkerSize: 10,
        },
      },
      interaction: { tooltip: { shared: true, crosshairs: true, marker: true } },
    };
  }, [light, yLabel]);
}

/** As cores do tema no ar, para o que não cabe no molde. */
function useThemeColors() {
  const { light } = useTheme();
  return useMemo(() => coresDoTema(light), [light]);
}

/**
 * A moldura segue sendo `<figure>` + `<figcaption>`.
 *
 * É a tag que faz o leitor de tela anunciar a legenda junto do desenho, e o
 * canvas em si é opaco para ele — daí o resumo em texto logo abaixo, que continua
 * sendo a única forma de ler o gráfico sem enxergá-lo.
 */
function ChartFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <figure className="card bevel p-3">
      <figcaption className="mb-1">
        <h3 className="label">{title}</h3>
      </figcaption>
      <div role="img" aria-label={description}>
        {children}
      </div>
    </figure>
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
  const isDamage = kind === 'damage';
  const baseConfig = useBaseConfig(isDamage ? 'dano' : 'cm');

  /*
   * Duas armas iguais são um caso real — dá para comparar uma arma com ela
   * mesma —, e aí os dois nomes coincidem. O índice entra no rótulo da série
   * para que as curvas não se fundam numa só na legenda e na escala de cor.
   */
  const seriesLabel = (s: Series, i: number) =>
    series.filter((o) => o.name === s.name).length > 1 ? `${s.name} (${i === 0 ? 'A' : 'B'})` : s.name;

  const data = useMemo(
    () =>
      series.flatMap((s, i) =>
        toPoints(
          isDamage
            ? damageCurve(s.stats, maxDistance)
            : dropCurve(s.stats, maxDistance).map((p) => ({ distance: p.distance, value: p.value * 100 })),
          seriesLabel(s, i),
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, maxDistance, isDamage],
  );

  return (
    <ChartFrame
      title={title}
      description={`Comparação de ${isDamage ? 'dano' : 'queda da bala'} entre ${series
        .map((s) => s.name)
        .join(', ')}`}
    >
      <Line
        {...baseConfig}
        data={data}
        xField="distance"
        yField="value"
        colorField="series"
        // O dano cai em patamares: entre um degrau e o seguinte ele não muda.
        shapeField={isDamage ? 'hv' : 'smooth'}
        scale={{
          color: {
            domain: series.map(seriesLabel),
            range: series.map((s) => s.color),
          },
          /*
           * O eixo de dano nasce no zero.
           *
           * Sozinho, o G2 corta a escala na faixa dos valores — e num gráfico de
           * comparação isso mente: duas armas separadas por seis pontos de dano
           * viram um abismo de meia altura. A queda da bala já começa no zero
           * por natureza e não precisa da amarra.
           */
          y: isDamage ? { domainMin: 0, nice: true } : undefined,
        }}
        style={{ lineWidth: 2.4 }}
        tooltip={{
          title: (d: Point) => `${Math.round(d.distance)} m`,
          items: [
            {
              channel: 'y' as const,
              valueFormatter: (v: number) => (isDamage ? formatNumber(v) : `${formatNumber(v)} cm`),
            },
          ],
        }}
      />
    </ChartFrame>
  );
}

/* ------------------------------ Dano por distância ------------------------------ */

const BUILT = 'montada';
const FACTORY = 'de fábrica';

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
  const baseConfig = useBaseConfig('dano');
  const c = useThemeColors();

  const data = useMemo(() => {
    const built = toPoints(damageCurve(stats, maxDistance), BUILT);
    if (!showBase) return built;
    return [...toPoints(damageCurve(base, maxDistance), FACTORY), ...built];
  }, [stats, base, maxDistance, showBase]);

  /*
   * Quantos tiros cada patamar exige, escrito sobre ele.
   *
   * É a leitura que decide a briga — dano por tiro só importa depois de virar
   * número de tiros — e ela não cabe na tooltip, que só aparece sob o cursor.
   */
  const annotations = useMemo(
    () =>
      stats.damage.flatMap((step, i) => {
        const damage = step.damage * stats.pellets;
        if (damage <= 0 || step.distance > maxDistance) return [];
        const nextStep = stats.damage[i + 1]?.distance ?? maxDistance;
        return [
          {
            type: 'text',
            data: [(step.distance + Math.min(nextStep, maxDistance)) / 2, damage],
            style: {
              text: `${Math.ceil(100 / damage)} TIROS`,
              textAlign: 'center',
              textBaseline: 'bottom',
              dy: -8,
              fill: c.textSoft,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-display), system-ui, sans-serif',
            },
          },
        ];
      }),
    [stats, maxDistance, c.textSoft],
  );

  return (
    <ChartFrame
      title="Dano por distância"
      description={`Dano por disparo de ${Math.round(damagePerShot(stats, 0))} até ${Math.round(
        damagePerShot(stats, maxDistance),
      )} ao longo de ${maxDistance} metros`}
    >
      <Line
        {...baseConfig}
        data={data}
        xField="distance"
        yField="value"
        colorField="series"
        shapeField="hv"
        scale={{
          color: { domain: [FACTORY, BUILT], range: [c.textDim, c.accent] },
          // Pelo mesmo motivo da comparação: dano se lê a partir do zero.
          y: { domainMin: 0, nice: true },
        }}
        // A curva de fábrica é a referência, não o assunto: fica tracejada e fina.
        style={{
          lineWidth: (d: Point[]) => (d?.[0]?.series === FACTORY ? 2 : 2.6),
          lineDash: (d: Point[]) => (d?.[0]?.series === FACTORY ? [5, 4] : [0, 0]),
          strokeOpacity: (d: Point[]) => (d?.[0]?.series === FACTORY ? 0.75 : 1),
        }}
        annotations={annotations}
        legend={showBase ? baseConfig.legend : false}
        tooltip={{
          title: (d: Point) => `${Math.round(d.distance)} m`,
          /*
           * Um item por série, e só o dano.
           *
           * Tentar pendurar aqui os tiros para abater custava o nome das séries:
           * com a tooltip compartilhada, qualquer item extra passa a valer para
           * todas as curvas e o rótulo vira o nome do campo. Quantos tiros cada
           * patamar exige está escrito sobre os próprios degraus, que é onde a
           * conta não muda.
           */
          items: [{ channel: 'y' as const, valueFormatter: (v: number) => formatNumber(v) }],
        }}
      />
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
  const baseConfig = useBaseConfig('cm');
  const c = useThemeColors();

  // Em centímetros: a queda de um fuzil a 100 m é de poucos centímetros e em
  // metros o gráfico ficaria colado no eixo.
  const toCentimeters = (curve: CurvePoint[]) =>
    curve.map((p) => ({ distance: p.distance, value: p.value * 100 }));

  const data = useMemo(() => {
    const built = toPoints(toCentimeters(dropCurve(stats, maxDistance)), BUILT);
    if (!showBase) return built;
    return [...toPoints(toCentimeters(dropCurve(base, maxDistance)), FACTORY), ...built];
  }, [stats, base, maxDistance, showBase]);

  return (
    <ChartFrame
      title="Queda da bala"
      description={`Queda do projétil ao longo de ${maxDistance} metros, em centímetros`}
    >
      <Line
        {...baseConfig}
        data={data}
        xField="distance"
        yField="value"
        colorField="series"
        shapeField="smooth"
        scale={{ color: { domain: [FACTORY, BUILT], range: [c.textDim, '#5fe3f0'] } }}
        style={{
          lineWidth: (d: Point[]) => (d?.[0]?.series === FACTORY ? 2 : 2.6),
          lineDash: (d: Point[]) => (d?.[0]?.series === FACTORY ? [5, 4] : [0, 0]),
          strokeOpacity: (d: Point[]) => (d?.[0]?.series === FACTORY ? 0.75 : 1),
        }}
        legend={showBase ? baseConfig.legend : false}
        tooltip={{
          title: (d: Point) => `${Math.round(d.distance)} m`,
          items: [
            {
              channel: 'y' as const,
              // O número sozinho não diz o que fazer com ele.
              valueFormatter: (v: number) => `mire ${formatNumber(v)} cm acima`,
            },
          ],
        }}
      />
    </ChartFrame>
  );
}
