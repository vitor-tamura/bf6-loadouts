'use client';

import { useMemo, useState } from 'react';
import { AppHeader } from '@/components/header';
import { ComparisonChart, SERIES_COLORS, type Series } from '@/components/charts';
import { WeaponPreview } from '@/components/weapon-preview';
import { WeaponSelector } from '@/components/weapon-selector';
import { PRIMARY_CATEGORIES, WEAPONS_BY_ID } from '@/data/weapons';
import { SHORT_CATEGORY_NAMES } from '@/data/classes';
import type { Weapon } from '@/data/types';
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
 * Comparação entre armas.
 *
 * Compara as armas de fábrica, sem acessórios: é assim que a decisão "qual arma
 * eu levo?" acontece, antes de gastar pontos. Cada linha da tabela destaca o
 * melhor valor e as curvas ficam sobrepostas no mesmo par de eixos, que é o que
 * torna a diferença entre duas armas realmente visível.
 */

const MAX_WEAPONS = 4;

interface ComparisonRow {
  label: string;
  value: (stats: EffectiveStats, weapon: Weapon) => number;
  format: (value: number) => string;
  /** `true` quando um número menor é melhor. */
  lowerIsBetter?: boolean;
  /** Linhas sem melhor nem pior, apenas informativas. */
  neutral?: boolean;
}

const ROWS: ComparisonRow[] = [
  { label: 'Dano de perto', value: (s) => damagePerShot(s, 0), format: (v) => v.toFixed(1) },
  {
    label: 'Tiros para matar',
    value: (s) => shotsToKill(s, 0),
    format: (v) => String(v),
    lowerIsBetter: true,
  },
  {
    label: 'Tempo para matar',
    value: (s) => timeToKill(s, 0),
    format: (v) => (Number.isFinite(v) ? `${Math.round(v)} ms` : '—'),
    lowerIsBetter: true,
  },
  {
    label: 'Tiros para matar a 50 m',
    value: (s) => shotsToKill(s, 50),
    format: (v) => (Number.isFinite(v) ? String(v) : '—'),
    lowerIsBetter: true,
  },
  {
    label: 'Alcance efetivo',
    value: (s) => effectiveRange(s),
    format: (v) => (v > 0 ? `${Math.round(v)} m` : 'constante'),
  },
  { label: 'Cadência', value: (s) => s.rpm, format: (v) => `${Math.round(v)} RPM` },
  { label: 'Dano por segundo', value: (s) => damagePerSecond(s), format: (v) => String(Math.round(v)) },
  { label: 'Velocidade da bala', value: (s) => s.velocity, format: (v) => `${Math.round(v)} m/s` },
  { label: 'Carregador', value: (s) => s.magazine, format: (v) => `${v} tiros` },
  {
    label: 'Recarga',
    value: (s) => s.reload,
    format: (v) => `${v.toFixed(2)} s`,
    lowerIsBetter: true,
  },
  {
    label: 'Tempo de mira',
    value: (s) => s.adsMs,
    format: (v) => `${Math.round(v)} ms`,
    lowerIsBetter: true,
  },
  { label: 'Precisão', value: (s) => s.accuracy, format: (v) => String(Math.round(v)) },
  { label: 'Controle', value: (s) => s.control, format: (v) => String(Math.round(v)) },
  { label: 'Mobilidade', value: (s) => s.mobility, format: (v) => String(Math.round(v)) },
  {
    label: 'Recuo vertical',
    value: (s) => s.verticalRecoil,
    format: (v) => v.toFixed(2),
    lowerIsBetter: true,
  },
  {
    label: 'Multiplicador na cabeça',
    value: (s) => s.headshot,
    format: (v) => `×${v}`,
    neutral: true,
  },
];

export default function ComparePage() {
  const [ids, setIds] = useState<string[]>(['ak4d', 'm4a1']);
  const [choosing, setChoosing] = useState(false);

  const selected = useMemo(
    () =>
      ids
        .map((id) => WEAPONS_BY_ID.get(id))
        .filter((w): w is Weapon => Boolean(w))
        .map((weapon, i) => ({
          weapon,
          stats: baseStats(weapon),
          color: SERIES_COLORS[i % SERIES_COLORS.length],
        })),
    [ids],
  );

  const maxDistance = useMemo(
    () => Math.max(100, ...selected.map((s) => analysisDistance(s.stats))),
    [selected],
  );

  const series: Series[] = selected.map((s) => ({
    name: s.weapon.name,
    color: s.color,
    stats: s.stats,
  }));

  const hasFirearm = selected.some((s) => s.weapon.category !== 'corpo-a-corpo');

  function addWeapon(id: string) {
    setIds((current) =>
      current.includes(id) || current.length >= MAX_WEAPONS ? current : [...current, id],
    );
    setChoosing(false);
  }

  function removeWeapon(id: string) {
    setIds((current) => current.filter((x) => x !== id));
  }

  return (
    <div className="min-h-dvh">
      <AppHeader subtitle="Comparar armas" />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        <p className="mb-3 text-sm" style={{ color: 'var(--texto-suave)' }}>
          Compare até {MAX_WEAPONS} armas de fábrica, sem acessórios — a decisão de qual arma levar
          vem antes de gastar pontos.
        </p>

        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {selected.map(({ weapon, color }) => (
            <div key={weapon.id} className="cartao chanfro p-2" style={{ borderColor: color }}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display truncate text-base font-semibold" style={{ color }}>
                    {weapon.name}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
                    {SHORT_CATEGORY_NAMES[weapon.category]}
                    {weapon.season > 0 && ` · Temporada ${weapon.season}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeWeapon(weapon.id)}
                  className="toque shrink-0 px-1 text-sm"
                  aria-label={`Remover ${weapon.name} da comparação`}
                  style={{ color: 'var(--texto-fraco)' }}
                >
                  ✕
                </button>
              </div>
              <WeaponPreview weapon={weapon} attachments={[]} className="w-full" />
            </div>
          ))}

          {ids.length < MAX_WEAPONS && (
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="cartao chanfro toque flex min-h-[120px] items-center justify-center p-4 text-sm"
              style={{ borderStyle: 'dashed', color: 'var(--texto-fraco)' }}
            >
              + Adicionar arma
            </button>
          )}
        </div>

        {selected.length === 0 ? (
          <p className="cartao chanfro p-6 text-center text-sm" style={{ color: 'var(--texto-fraco)' }}>
            Adicione ao menos uma arma para comparar.
          </p>
        ) : (
          <>
            <div className="cartao chanfro mb-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <caption className="sr-only">
                  Comparação de estatísticas entre as armas escolhidas
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="rotulo sticky left-0 px-3 py-2 text-left"
                      style={{ background: 'var(--superficie)' }}
                    >
                      Estatística
                    </th>
                    {selected.map(({ weapon, color }) => (
                      <th
                        key={weapon.id}
                        scope="col"
                        className="font-display px-3 py-2 text-right text-sm font-semibold"
                        style={{ color }}
                      >
                        {weapon.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const values = selected.map(({ weapon, stats }) => row.value(stats, weapon));
                    const finite = values.filter((v) => Number.isFinite(v));
                    const best = row.neutral
                      ? null
                      : row.lowerIsBetter
                        ? Math.min(...finite)
                        : Math.max(...finite);

                    return (
                      <tr
                        key={row.label}
                        className="border-t"
                        style={{ borderColor: 'var(--borda-suave)' }}
                      >
                        <th
                          scope="row"
                          className="sticky left-0 px-3 py-1.5 text-left font-normal"
                          style={{ background: 'var(--superficie)', color: 'var(--texto-suave)' }}
                        >
                          {row.label}
                        </th>
                        {values.map((value, i) => {
                          const highlighted = best !== null && value === best && finite.length > 1;
                          return (
                            <td
                              key={selected[i].weapon.id}
                              className="px-3 py-1.5 text-right font-mono"
                              style={{
                                color: highlighted ? 'var(--color-positivo)' : 'var(--texto)',
                                fontWeight: highlighted ? 600 : 400,
                              }}
                            >
                              {row.format(value)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasFirearm && (
              <div className="grid gap-3 lg:grid-cols-2">
                <ComparisonChart
                  title="Dano por distância"
                  series={series}
                  maxDistance={maxDistance}
                  kind="damage"
                />
                <ComparisonChart
                  title="Queda da bala"
                  series={series}
                  maxDistance={maxDistance}
                  kind="drop"
                />
              </div>
            )}
          </>
        )}

        <p className="pb-seguro mt-6 text-center text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
          Valores das armas sem acessórios. Projeto de fã, sem vínculo com a EA ou a DICE.
        </p>
      </main>

      {choosing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: 'rgb(0 0 0 / 0.6)' }}
          onClick={() => setChoosing(false)}
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
                onClick={() => setChoosing(false)}
                className="toque px-2 text-lg"
                aria-label="Fechar"
                style={{ color: 'var(--texto-fraco)' }}
              >
                ✕
              </button>
            </div>
            <WeaponSelector
              title="Escolha a arma"
              selected={null}
              categories={PRIMARY_CATEGORIES}
              onSelect={addWeapon}
            />
          </div>
        </div>
      )}
    </div>
  );
}
