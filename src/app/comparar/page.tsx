'use client';

import { useMemo, useState } from 'react';
import { Cabecalho } from '@/componentes/cabecalho';
import { CORES_SERIE, GraficoComparacao, type Serie } from '@/componentes/graficos';
import { PreviewArma } from '@/componentes/preview-arma';
import { SeletorArma } from '@/componentes/seletor-arma';
import { ARMAS_POR_ID, CATEGORIAS_PRIMARIAS } from '@/dados/armas';
import { NOMES_CATEGORIA_CURTO } from '@/dados/classes';
import type { Arma } from '@/dados/tipos';
import {
  alcanceEfetivo,
  danoPorDisparo,
  danoPorSegundo,
  distanciaDeAnalise,
  tempoParaEliminar,
  tirosParaEliminar,
} from '@/lib/balistica';
import { statsBase, type StatsEfetivos } from '@/lib/stats';

/**
 * Comparação entre armas.
 *
 * Compara as armas de fábrica, sem acessórios: é assim que a decisão "qual arma
 * eu levo?" acontece, antes de gastar pontos. Cada linha da tabela destaca o
 * melhor valor, e as curvas ficam sobrepostas no mesmo par de eixos, que é o que
 * torna a diferença entre duas armas realmente visível.
 */

const MAX_ARMAS = 4;

interface Linha {
  rotulo: string;
  valor: (s: StatsEfetivos, a: Arma) => number;
  formatar: (v: number) => string;
  /** `true` quando um número menor é melhor. */
  menorMelhor?: boolean;
  /** Linhas sem melhor/pior, apenas informativas. */
  neutra?: boolean;
}

const LINHAS: Linha[] = [
  {
    rotulo: 'Dano de perto',
    valor: (s) => danoPorDisparo(s, 0),
    formatar: (v) => v.toFixed(1),
  },
  {
    rotulo: 'Tiros para matar',
    valor: (s) => tirosParaEliminar(s, 0),
    formatar: (v) => String(v),
    menorMelhor: true,
  },
  {
    rotulo: 'Tempo para matar',
    valor: (s) => tempoParaEliminar(s, 0),
    formatar: (v) => (Number.isFinite(v) ? `${Math.round(v)} ms` : '—'),
    menorMelhor: true,
  },
  {
    rotulo: 'Tiros para matar a 50 m',
    valor: (s) => tirosParaEliminar(s, 50),
    formatar: (v) => (Number.isFinite(v) ? String(v) : '—'),
    menorMelhor: true,
  },
  {
    rotulo: 'Alcance efetivo',
    valor: (s) => alcanceEfetivo(s),
    formatar: (v) => (v > 0 ? `${Math.round(v)} m` : 'constante'),
  },
  { rotulo: 'Cadência', valor: (s) => s.rpm, formatar: (v) => `${Math.round(v)} RPM` },
  {
    rotulo: 'Dano por segundo',
    valor: (s) => danoPorSegundo(s),
    formatar: (v) => String(Math.round(v)),
  },
  {
    rotulo: 'Velocidade da bala',
    valor: (s) => s.velocidade,
    formatar: (v) => `${Math.round(v)} m/s`,
  },
  { rotulo: 'Carregador', valor: (s) => s.carregador, formatar: (v) => `${v} tiros` },
  {
    rotulo: 'Recarga',
    valor: (s) => s.recarga,
    formatar: (v) => `${v.toFixed(2)} s`,
    menorMelhor: true,
  },
  {
    rotulo: 'Tempo de mira',
    valor: (s) => s.adsMs,
    formatar: (v) => `${Math.round(v)} ms`,
    menorMelhor: true,
  },
  { rotulo: 'Precisão', valor: (s) => s.precisao, formatar: (v) => String(Math.round(v)) },
  { rotulo: 'Controle', valor: (s) => s.controle, formatar: (v) => String(Math.round(v)) },
  { rotulo: 'Mobilidade', valor: (s) => s.mobilidade, formatar: (v) => String(Math.round(v)) },
  {
    rotulo: 'Recuo vertical',
    valor: (s) => s.recuoV,
    formatar: (v) => v.toFixed(2),
    menorMelhor: true,
  },
  {
    rotulo: 'Multiplicador na cabeça',
    valor: (s) => s.headshot,
    formatar: (v) => `×${v}`,
    neutra: true,
  },
];

export default function Comparar() {
  const [ids, setIds] = useState<string[]>(['ak4d', 'm4a1']);
  const [escolhendo, setEscolhendo] = useState(false);

  const selecionadas = useMemo(
    () =>
      ids
        .map((id) => ARMAS_POR_ID.get(id))
        .filter((a): a is Arma => Boolean(a))
        .map((arma, i) => ({ arma, stats: statsBase(arma), cor: CORES_SERIE[i % CORES_SERIE.length] })),
    [ids],
  );

  const distancia = useMemo(
    () => Math.max(100, ...selecionadas.map((s) => distanciaDeAnalise(s.stats))),
    [selecionadas],
  );

  const series: Serie[] = selecionadas.map((s) => ({
    nome: s.arma.nome,
    cor: s.cor,
    stats: s.stats,
  }));

  const temTiro = selecionadas.some((s) => s.arma.categoria !== 'corpo-a-corpo');

  function adicionar(id: string) {
    setIds((atual) => (atual.includes(id) || atual.length >= MAX_ARMAS ? atual : [...atual, id]));
    setEscolhendo(false);
  }

  function remover(id: string) {
    setIds((atual) => atual.filter((x) => x !== id));
  }

  return (
    <div className="min-h-dvh">
      <Cabecalho subtitulo="Comparar armas" />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        <p className="mb-3 text-sm" style={{ color: 'var(--texto-suave)' }}>
          Compare até {MAX_ARMAS} armas de fábrica, sem acessórios — a decisão de qual arma levar vem
          antes de gastar pontos.
        </p>

        {/* Armas escolhidas */}
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {selecionadas.map(({ arma, cor }) => (
            <div key={arma.id} className="cartao chanfro p-2" style={{ borderColor: cor }}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display truncate text-base font-semibold" style={{ color: cor }}>
                    {arma.nome}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
                    {NOMES_CATEGORIA_CURTO[arma.categoria]}
                    {arma.temporada > 0 && ` · Temporada ${arma.temporada}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remover(arma.id)}
                  className="toque shrink-0 px-1 text-sm"
                  aria-label={`Remover ${arma.nome} da comparação`}
                  style={{ color: 'var(--texto-fraco)' }}
                >
                  ✕
                </button>
              </div>
              <PreviewArma arma={arma} acessorios={[]} className="w-full" />
            </div>
          ))}

          {ids.length < MAX_ARMAS && (
            <button
              type="button"
              onClick={() => setEscolhendo(true)}
              className="cartao chanfro toque flex min-h-[120px] items-center justify-center p-4 text-sm"
              style={{ borderStyle: 'dashed', color: 'var(--texto-fraco)' }}
            >
              + Adicionar arma
            </button>
          )}
        </div>

        {selecionadas.length === 0 ? (
          <p className="cartao chanfro p-6 text-center text-sm" style={{ color: 'var(--texto-fraco)' }}>
            Adicione ao menos uma arma para comparar.
          </p>
        ) : (
          <>
            {/* Tabela comparativa */}
            <div className="cartao chanfro mb-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <caption className="sr-only">Comparação de estatísticas entre as armas escolhidas</caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="rotulo sticky left-0 px-3 py-2 text-left"
                      style={{ background: 'var(--superficie)' }}
                    >
                      Estatística
                    </th>
                    {selecionadas.map(({ arma, cor }) => (
                      <th
                        key={arma.id}
                        scope="col"
                        className="font-display px-3 py-2 text-right text-sm font-semibold"
                        style={{ color: cor }}
                      >
                        {arma.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LINHAS.map((linha) => {
                    const valores = selecionadas.map(({ arma, stats }) => linha.valor(stats, arma));
                    const finitos = valores.filter((v) => Number.isFinite(v));
                    const melhor = linha.neutra
                      ? null
                      : linha.menorMelhor
                        ? Math.min(...finitos)
                        : Math.max(...finitos);

                    return (
                      <tr key={linha.rotulo} className="border-t" style={{ borderColor: 'var(--borda-suave)' }}>
                        <th
                          scope="row"
                          className="sticky left-0 px-3 py-1.5 text-left font-normal"
                          style={{ background: 'var(--superficie)', color: 'var(--texto-suave)' }}
                        >
                          {linha.rotulo}
                        </th>
                        {valores.map((valor, i) => {
                          const destaque = melhor !== null && valor === melhor && finitos.length > 1;
                          return (
                            <td
                              key={selecionadas[i].arma.id}
                              className="px-3 py-1.5 text-right font-mono"
                              style={{
                                color: destaque ? 'var(--color-positivo)' : 'var(--texto)',
                                fontWeight: destaque ? 600 : 400,
                              }}
                            >
                              {linha.formatar(valor)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {temTiro && (
              <div className="grid gap-3 lg:grid-cols-2">
                <GraficoComparacao
                  titulo="Dano por distância"
                  series={series}
                  distanciaMax={distancia}
                  tipo="dano"
                />
                <GraficoComparacao
                  titulo="Queda da bala"
                  series={series}
                  distanciaMax={distancia}
                  tipo="queda"
                />
              </div>
            )}
          </>
        )}

        <p className="pb-seguro mt-6 text-center text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
          Valores das armas sem acessórios. Projeto de fã, sem vínculo com a EA ou a DICE.
        </p>
      </main>

      {escolhendo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: 'rgb(0 0 0 / 0.6)' }}
          onClick={() => setEscolhendo(false)}
          role="presentation"
        >
          <div
            className="cartao chanfro pb-seguro max-h-[85dvh] w-full max-w-md overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Adicionar arma à comparação"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Adicionar arma</h2>
              <button
                type="button"
                onClick={() => setEscolhendo(false)}
                className="toque px-2 text-lg"
                aria-label="Fechar"
                style={{ color: 'var(--texto-fraco)' }}
              >
                ✕
              </button>
            </div>
            <SeletorArma
              titulo="Escolha a arma"
              selecionada={null}
              categorias={CATEGORIAS_PRIMARIAS}
              aoEscolher={adicionar}
            />
          </div>
        </div>
      )}
    </div>
  );
}
