'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  curvaDano,
  curvaQueda,
  danoPorDisparo,
  quedaDaBala,
  tempoParaEliminar,
  tirosParaEliminar,
  type PontoCurva,
} from '@/lib/balistica';
import type { StatsEfetivos } from '@/lib/stats';

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
const MARGEM = { topo: 18, direita: 14, base: 34, esquerda: 44 };
const AREA = {
  x: MARGEM.esquerda,
  y: MARGEM.topo,
  largura: L - MARGEM.esquerda - MARGEM.direita,
  altura: A - MARGEM.topo - MARGEM.base,
};

function escalaX(valor: number, max: number): number {
  return AREA.x + (valor / max) * AREA.largura;
}

function escalaY(valor: number, max: number): number {
  return AREA.y + AREA.altura - (valor / Math.max(max, 1e-6)) * AREA.altura;
}

function caminho(pontos: PontoCurva[], maxX: number, maxY: number): string {
  return pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${escalaX(p.distancia, maxX)} ${escalaY(p.valor, maxY)}`)
    .join(' ');
}

/** Escolhe marcas de eixo redondas dentro do intervalo. */
function marcas(max: number, quantidade = 5): number[] {
  const bruto = max / quantidade;
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((p) => p >= bruto) ?? magnitude * 10;
  const saida: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += passo) saida.push(Number(v.toFixed(6)));
  return saida;
}

interface ChassiProps {
  titulo: string;
  legenda: ReactNode;
  maxX: number;
  maxY: number;
  rotuloY: (v: number) => string;
  children: ReactNode;
  /** Chamado com a distância sob o cursor, ou nulo ao sair. */
  aoApontar?: (distancia: number | null) => void;
  distanciaAtiva?: number | null;
  descricao: string;
}

function Chassi({
  titulo,
  legenda,
  maxX,
  maxY,
  rotuloY,
  children,
  aoApontar,
  distanciaAtiva,
  descricao,
}: ChassiProps) {
  const ref = useRef<SVGSVGElement>(null);

  function posicao(evento: React.PointerEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg || !aoApontar) return;
    const caixa = svg.getBoundingClientRect();
    const x = ((evento.clientX - caixa.left) / caixa.width) * L;
    const bruto = ((x - AREA.x) / AREA.largura) * maxX;
    aoApontar(Math.max(0, Math.min(maxX, bruto)));
  }

  return (
    <figure className="cartao chanfro p-3">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="rotulo">
          {titulo} <span style={{ opacity: 0.6 }}>· metros</span>
        </h3>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
          {legenda}
        </div>
      </figcaption>

      <svg
        ref={ref}
        viewBox={`0 0 ${L} ${A}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={descricao}
        onPointerMove={posicao}
        onPointerDown={posicao}
        onPointerLeave={() => aoApontar?.(null)}
      >
        {/* Grade e eixo vertical. */}
        {marcas(maxY).map((v) => (
          <g key={`y${v}`}>
            <line
              x1={AREA.x}
              x2={AREA.x + AREA.largura}
              y1={escalaY(v, maxY)}
              y2={escalaY(v, maxY)}
              stroke="var(--grade)"
              strokeWidth={1}
            />
            <text
              x={AREA.x - 7}
              y={escalaY(v, maxY) + 4}
              textAnchor="end"
              fill="var(--texto-fraco)"
              style={{ font: '500 11px var(--font-sans)' }}
            >
              {rotuloY(v)}
            </text>
          </g>
        ))}

        {/* Eixo horizontal, em metros. */}
        {marcas(maxX).map((v) => (
          <g key={`x${v}`}>
            <line
              y1={AREA.y}
              y2={AREA.y + AREA.altura}
              x1={escalaX(v, maxX)}
              x2={escalaX(v, maxX)}
              stroke="var(--grade)"
              strokeWidth={1}
              opacity={0.5}
            />
            <text
              x={escalaX(v, maxX)}
              y={A - 12}
              textAnchor="middle"
              fill="var(--texto-fraco)"
              style={{ font: '500 11px var(--font-sans)' }}
            >
              {Math.round(v)}
            </text>
          </g>
        ))}
        {children}

        {/* Guia vertical sob o dedo ou o cursor. */}
        {distanciaAtiva != null && (
          <line
            x1={escalaX(distanciaAtiva, maxX)}
            x2={escalaX(distanciaAtiva, maxX)}
            y1={AREA.y}
            y2={AREA.y + AREA.altura}
            stroke="var(--destaque)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
      </svg>
    </figure>
  );
}

function Amostra({ cor, tracejada, texto }: { cor: string; tracejada?: boolean; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="8" aria-hidden>
        <line
          x1="0"
          y1="4"
          x2="16"
          y2="4"
          stroke={cor}
          strokeWidth="2.5"
          strokeDasharray={tracejada ? '4 3' : undefined}
        />
      </svg>
      {texto}
    </span>
  );
}

/* --------------------------- Comparação entre armas --------------------------- */

/** Cores das séries na comparação, escolhidas para se distinguirem nos dois temas. */
export const CORES_SERIE = ['#ff8a00', '#5fe3f0', '#7ddc4c', '#c08bff'];

export interface Serie {
  nome: string;
  cor: string;
  stats: StatsEfetivos;
}

export function GraficoComparacao({
  titulo,
  series,
  distanciaMax,
  tipo,
}: {
  titulo: string;
  series: Serie[];
  distanciaMax: number;
  tipo: 'dano' | 'queda';
}) {
  const [distancia, setDistancia] = useState<number | null>(null);

  const curvas = useMemo(
    () =>
      series.map((serie) => ({
        ...serie,
        pontos:
          tipo === 'dano'
            ? curvaDano(serie.stats, distanciaMax)
            : curvaQueda(serie.stats, distanciaMax).map((p) => ({
                distancia: p.distancia,
                valor: p.valor * 100,
              })),
      })),
    [series, distanciaMax, tipo],
  );

  const maxY = useMemo(() => {
    const valores = curvas.flatMap((c) => c.pontos.map((p) => p.valor));
    return (valores.length ? Math.max(...valores) : 1) * 1.15 || 1;
  }, [curvas]);

  return (
    <Chassi
      titulo={titulo}
      legenda={
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {series.map((s) => (
            <Amostra key={s.nome} cor={s.cor} texto={s.nome} />
          ))}
        </div>
      }
      maxX={distanciaMax}
      maxY={maxY}
      rotuloY={(v) => String(Math.round(v))}
      aoApontar={setDistancia}
      distanciaAtiva={distancia}
      descricao={`Comparação de ${tipo === 'dano' ? 'dano' : 'queda da bala'} entre ${series
        .map((s) => s.nome)
        .join(', ')}`}
    >
      {tipo === 'queda' && (
        <text
          x={AREA.x - 34}
          y={AREA.y - 6}
          fill="var(--texto-fraco)"
          style={{ font: '600 10px var(--font-display)', letterSpacing: '0.12em' }}
        >
          CM
        </text>
      )}

      {curvas.map((curva) => (
        <path
          key={curva.nome}
          d={caminho(curva.pontos, distanciaMax, maxY)}
          fill="none"
          stroke={curva.cor}
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Leitura de todas as séries na distância apontada. */}
      {distancia != null && (
        <g>
          {curvas.map((curva, i) => {
            const valor =
              tipo === 'dano'
                ? danoPorDisparo(curva.stats, distancia)
                : quedaDaBala(curva.stats, distancia) * 100;
            return (
              <g key={curva.nome}>
                <circle
                  cx={escalaX(distancia, distanciaMax)}
                  cy={escalaY(valor, maxY)}
                  r={4}
                  fill={curva.cor}
                />
                <text
                  x={Math.min(escalaX(distancia, distanciaMax) + 10, L - 130)}
                  y={AREA.y + 14 + i * 15}
                  fill={curva.cor}
                  style={{ font: '600 11px var(--font-sans)' }}
                >
                  {curva.nome}: {valor.toFixed(1)}
                  {tipo === 'dano' ? '' : ' cm'}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </Chassi>
  );
}

/* ------------------------------ Dano por distância ------------------------------ */

export function GraficoDano({
  stats,
  base,
  distanciaMax,
  mostrarBase,
}: {
  stats: StatsEfetivos;
  base: StatsEfetivos;
  distanciaMax: number;
  mostrarBase: boolean;
}) {
  const [distancia, setDistancia] = useState<number | null>(null);

  const curva = useMemo(() => curvaDano(stats, distanciaMax), [stats, distanciaMax]);
  const curvaBase = useMemo(() => curvaDano(base, distanciaMax), [base, distanciaMax]);
  const maxY = useMemo(
    () => Math.max(...curva.map((p) => p.valor), ...curvaBase.map((p) => p.valor)) * 1.15,
    [curva, curvaBase],
  );

  const leitura =
    distancia == null
      ? null
      : {
          dano: danoPorDisparo(stats, distancia),
          tiros: tirosParaEliminar(stats, distancia),
          ttk: tempoParaEliminar(stats, distancia),
        };

  return (
    <Chassi
      titulo="Dano por distância"
      legenda={
        <>
          {mostrarBase && <Amostra cor="var(--texto-fraco)" tracejada texto="de fábrica" />}
          <Amostra cor="var(--destaque)" texto="montada" />
        </>
      }
      maxX={distanciaMax}
      maxY={maxY}
      rotuloY={(v) => String(Math.round(v))}
      aoApontar={setDistancia}
      distanciaAtiva={distancia}
      descricao={`Dano por disparo de ${Math.round(danoPorDisparo(stats, 0))} até ${Math.round(
        danoPorDisparo(stats, distanciaMax),
      )} ao longo de ${distanciaMax} metros`}
    >
      {mostrarBase && (
        <path
          d={caminho(curvaBase, distanciaMax, maxY)}
          fill="none"
          stroke="var(--texto-fraco)"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.75}
        />
      )}
      <path
        d={caminho(curva, distanciaMax, maxY)}
        fill="none"
        stroke="var(--destaque)"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />

      {/* Quantos tiros são necessários em cada patamar. */}
      {stats.dano.map((degrau, i) => {
        const dano = degrau.dano * stats.projeteis;
        if (dano <= 0 || degrau.distancia > distanciaMax) return null;
        const proxima = stats.dano[i + 1]?.distancia ?? distanciaMax;
        const meio = (degrau.distancia + Math.min(proxima, distanciaMax)) / 2;
        return (
          <text
            key={i}
            x={escalaX(meio, distanciaMax)}
            y={escalaY(dano, maxY) - 8}
            textAnchor="middle"
            fill="var(--texto-suave)"
            style={{ font: '600 11px var(--font-display)', letterSpacing: '0.06em' }}
          >
            {Math.ceil(100 / dano)} TIROS
          </text>
        );
      })}

      {leitura && distancia != null && (
        <g>
          <circle
            cx={escalaX(distancia, distanciaMax)}
            cy={escalaY(leitura.dano, maxY)}
            r={4.5}
            fill="var(--destaque)"
          />
          <text
            x={Math.min(escalaX(distancia, distanciaMax) + 10, L - 140)}
            y={AREA.y + 14}
            fill="var(--texto)"
            style={{ font: '600 12px var(--font-sans)' }}
          >
            {Math.round(distancia)} m · {leitura.dano.toFixed(1)} de dano
          </text>
          <text
            x={Math.min(escalaX(distancia, distanciaMax) + 10, L - 140)}
            y={AREA.y + 30}
            fill="var(--texto-suave)"
            style={{ font: '500 12px var(--font-sans)' }}
          >
            {leitura.tiros} tiros · {Math.round(leitura.ttk)} ms
          </text>
        </g>
      )}
    </Chassi>
  );
}

/* ------------------------------- Queda do projétil ------------------------------- */

export function GraficoQueda({
  stats,
  base,
  distanciaMax,
  mostrarBase,
}: {
  stats: StatsEfetivos;
  base: StatsEfetivos;
  distanciaMax: number;
  mostrarBase: boolean;
}) {
  const [distancia, setDistancia] = useState<number | null>(null);

  // Em centímetros: a queda de um fuzil a 100 m é de poucos centímetros e em
  // metros o gráfico ficaria colado no eixo.
  const emCm = (p: PontoCurva) => ({ distancia: p.distancia, valor: p.valor * 100 });
  const curva = useMemo(() => curvaQueda(stats, distanciaMax).map(emCm), [stats, distanciaMax]);
  const curvaBase = useMemo(() => curvaQueda(base, distanciaMax).map(emCm), [base, distanciaMax]);
  const maxY = useMemo(
    () => Math.max(...curva.map((p) => p.valor), ...curvaBase.map((p) => p.valor)) * 1.12 || 1,
    [curva, curvaBase],
  );

  const quedaAtual = distancia == null ? null : quedaDaBala(stats, distancia) * 100;

  return (
    <Chassi
      titulo="Queda da bala"
      legenda={
        <>
          {mostrarBase && <Amostra cor="var(--texto-fraco)" tracejada texto="de fábrica" />}
          <Amostra cor="var(--color-ciano-400)" texto="montada" />
        </>
      }
      maxX={distanciaMax}
      maxY={maxY}
      rotuloY={(v) => `${Math.round(v)}`}
      aoApontar={setDistancia}
      distanciaAtiva={distancia}
      descricao={`Queda do projétil de até ${Math.round(maxY)} centímetros em ${distanciaMax} metros`}
    >
      <text
        x={AREA.x - 34}
        y={AREA.y - 6}
        fill="var(--texto-fraco)"
        style={{ font: '600 10px var(--font-display)', letterSpacing: '0.12em' }}
      >
        CM
      </text>

      {mostrarBase && (
        <path
          d={caminho(curvaBase, distanciaMax, maxY)}
          fill="none"
          stroke="var(--texto-fraco)"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.75}
        />
      )}
      <path
        d={caminho(curva, distanciaMax, maxY)}
        fill="none"
        stroke="var(--color-ciano-400)"
        strokeWidth={2.6}
        strokeLinecap="round"
      />

      {quedaAtual != null && distancia != null && (
        <g>
          <circle
            cx={escalaX(distancia, distanciaMax)}
            cy={escalaY(quedaAtual, maxY)}
            r={4.5}
            fill="var(--color-ciano-400)"
          />
          <text
            x={Math.min(escalaX(distancia, distanciaMax) + 10, L - 150)}
            y={AREA.y + 14}
            fill="var(--texto)"
            style={{ font: '600 12px var(--font-sans)' }}
          >
            {Math.round(distancia)} m · mire {quedaAtual.toFixed(1)} cm acima
          </text>
        </g>
      )}
    </Chassi>
  );
}
