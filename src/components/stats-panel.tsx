'use client';

import {
  effectiveRange,
  damagePerShot,
  damagePerSecond,
  shotInterval,
  timeToKill,
  shotsToKill,
} from '@/lib/ballistics';
import { compareStat, type EffectiveStats } from '@/lib/stats';
import type { Weapon } from '@/data/types';

/**
 * Painel de estatísticas.
 *
 * Cada valor aparece junto do quanto mudou em relação à arma de fábrica, com a
 * cor indicando se a mudança favorece ou não o jogador — é a leitura que
 * responde à pergunta "esse acessório valeu a pena?".
 */

function DeltaArrow({ improves }: { improves: boolean }) {
  return (
    <span aria-hidden style={{ color: improves ? 'var(--color-positive)' : 'var(--color-negative)' }}>
      {improves ? '▲' : '▼'}
    </span>
  );
}

function StatBar({
  label,
  statKey,
  value,
  base,
  showBase,
}: {
  label: string;
  statKey: keyof EffectiveStats;
  value: number;
  base: number;
  showBase: boolean;
}) {
  const delta = compareStat(statKey, base, value);
  const shows = showBase && delta.changed;

  return (
    // `group` liga o hover da linha inteira à barra: passar o ponteiro em
    // qualquer ponto da estatística acende a barra dela e engrossa o traço.
    <div className="stat-row group" title={`${label}: ${Math.round(value)} de 100`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="label transition-colors group-hover:[color:var(--text-soft)]">{label}</span>
        <span className="flex items-baseline gap-1.5 font-mono text-sm">
          {shows && (
            <span
              className="text-[11px]"
              style={{ color: delta.improves ? 'var(--color-positive)' : 'var(--color-negative)' }}
            >
              <DeltaArrow improves={delta.improves} /> {delta.difference > 0 ? '+' : ''}
              {Math.round(delta.difference)}
            </span>
          )}
          <span>{Math.round(value)}</span>
        </span>
      </div>
      {/*
        A barra conta a história em três partes: o trecho que a arma já tinha
        fica em âmbar, o que o acessório acrescentou entra em verde à frente
        dele, e o que ele tirou aparece em vermelho no lugar que a barra perdeu.
        O risco branco marca onde estava o valor de fábrica.
      */}
      <div
        className="stat-track relative h-2.5 overflow-hidden"
        style={{ background: 'var(--border-soft)' }}
      >
        <span
          className="absolute top-0 left-0 h-full transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.min(base, value))}%`, background: 'var(--accent)' }}
        />

        {shows && delta.improves && (
          <span
            className="absolute top-0 h-full transition-all duration-300"
            style={{
              left: `${Math.min(100, base)}%`,
              width: `${Math.max(0, Math.min(100, value) - Math.min(100, base))}%`,
              background: 'var(--color-positive)',
            }}
          />
        )}

        {shows && !delta.improves && (
          <span
            className="absolute top-0 h-full transition-all duration-300"
            style={{
              left: `${Math.min(100, value)}%`,
              width: `${Math.max(0, Math.min(100, base) - Math.min(100, value))}%`,
              background: 'var(--color-negative)',
              opacity: 0.45,
            }}
          />
        )}

        {shows && (
          <span
            className="absolute top-0 h-full w-[2px] transition-[left] duration-300"
            title={`Valor de fábrica: ${Math.round(base)}`}
            style={{ left: `${Math.min(100, base)}%`, background: '#ffffff', boxShadow: '0 0 0 1px rgb(0 0 0 / 0.35)' }}
          />
        )}
      </div>
    </div>
  );
}

function StatNumber({
  label,
  statKey,
  value,
  base,
  unit,
  decimals = 0,
  showBase,
  compact = false,
}: {
  label: string;
  statKey: keyof EffectiveStats;
  value: number;
  base: number;
  unit?: string;
  decimals?: number;
  showBase: boolean;
  compact?: boolean;
}) {
  const delta = compareStat(statKey, base, value);
  const shows = showBase && delta.changed;

  return (
    <div
      className={`flex items-baseline justify-between gap-2 border-b ${compact ? 'py-1' : 'py-1.5'}`}
      style={{ borderColor: 'var(--border-soft)' }}
    >
      <span className={compact ? 'text-[12px]' : 'text-sm'} style={{ color: 'var(--text-soft)' }}>
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        {shows && (
          <span
            className="font-mono text-[11px] whitespace-nowrap"
            style={{ color: delta.improves ? 'var(--color-positive)' : 'var(--color-negative)' }}
            title={`De fábrica: ${base.toFixed(decimals)}${unit ? ` ${unit}` : ''}`}
          >
            <DeltaArrow improves={delta.improves} />
            {delta.difference > 0 ? '+' : ''}
            {delta.difference.toFixed(decimals)} ({delta.percent > 0 ? '+' : ''}
            {delta.percent.toFixed(0)}%)
          </span>
        )}
        <span className={`font-mono ${compact ? 'text-[12px]' : 'text-sm'}`}>
          {value.toFixed(decimals)}
          {unit && <span style={{ color: 'var(--text-dim)' }}> {unit}</span>}
        </span>
      </span>
    </div>
  );
}

/**
 * Valor derivado — tempo para matar, alcance efetivo e afins. Não vem de um
 * campo das estatísticas, então a comparação com a arma de fábrica é calculada
 * aqui a partir dos dois valores já prontos.
 */
function DerivedStat({
  label,
  value,
  detail,
  raw,
  rawBase,
  lowerIsBetter = false,
  suffix = '',
  decimals = 0,
  showBase,
  compact = false,
}: {
  label: string;
  value: string;
  detail?: string;
  /** Número por trás do texto, usado para calcular o ganho ou a perda. */
  raw?: number;
  rawBase?: number;
  lowerIsBetter?: boolean;
  suffix?: string;
  decimals?: number;
  showBase: boolean;
  compact?: boolean;
}) {
  const comparable =
    showBase &&
    raw !== undefined &&
    rawBase !== undefined &&
    Number.isFinite(raw) &&
    Number.isFinite(rawBase) &&
    Math.abs(raw - rawBase) > 1e-6;

  const difference = comparable ? raw - rawBase : 0;
  const improves = lowerIsBetter ? difference < 0 : difference > 0;
  const percent = comparable && rawBase !== 0 ? (difference / rawBase) * 100 : 0;

  return (
    <div className={`card bevel-sm ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="label">{label}</p>
      <p
        className={`font-mono leading-tight ${compact ? 'text-base' : 'text-2xl font-semibold'}`}
        style={compact ? undefined : { color: 'var(--text)' }}
      >
        {value}
      </p>
      {comparable && (
        <p
          className="font-mono text-[11px] whitespace-nowrap"
          style={{ color: improves ? 'var(--color-positive)' : 'var(--color-negative)' }}
          title={`De fábrica: ${rawBase.toFixed(decimals)}${suffix}`}
        >
          <DeltaArrow improves={improves} />
          {difference > 0 ? '+' : ''}
          {difference.toFixed(decimals)}
          {suffix}
          {rawBase !== 0 && ` (${percent > 0 ? '+' : ''}${percent.toFixed(0)}%)`}
        </p>
      )}
      {detail && !compact && (
        <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {detail}
        </p>
      )}
    </div>
  );
}

export function StatsPanel({
  weapon,
  stats,
  base,
  showBase,
  compact = false,
}: {
  weapon: Weapon;
  stats: EffectiveStats;
  base: EffectiveStats;
  showBase: boolean;
  /**
   * Versão curta, para a arma secundária.
   *
   * A pistola é o plano B: interessa saber quantos tiros ela precisa e quão
   * rápido chega à mira, não a curva inteira. Cortar aqui é o que mantém a
   * coluna de números legível com duas armas nela.
   */
  compact?: boolean;
}) {
  const isMelee = weapon.category === 'melee';

  const ttk = timeToKill(stats, 0);
  const shots = shotsToKill(stats, 0);
  const headshots = shotsToKill(stats, 0, true);
  const range = effectiveRange(stats);
  const dps = damagePerSecond(stats);

  // Os mesmos números para a arma de fábrica, para mostrar o ganho ou a perda.
  const baseTtk = timeToKill(base, 0);
  const baseHeadshots = shotsToKill(base, 0, true);
  const baseRange = effectiveRange(base);
  const baseDps = damagePerSecond(base);

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
      {!isMelee && (
        <div className={`grid grid-cols-2 gap-2 ${compact ? '' : 'sm:grid-cols-4'}`}>
          <DerivedStat
            label="Tempo para matar"
            value={Number.isFinite(ttk) ? `${Math.round(ttk)} ms` : '—'}
            detail={`${shots} tiros de perto`}
            raw={ttk}
            rawBase={baseTtk}
            lowerIsBetter
            suffix=" ms"
            showBase={showBase}
            compact={compact}
          />
          <DerivedStat
            label="Na cabeça"
            value={`${headshots} ${headshots === 1 ? 'tiro' : 'tiros'}`}
            detail={`×${stats.headshot} de dano`}
            raw={headshots}
            rawBase={baseHeadshots}
            lowerIsBetter
            suffix=" tiros"
            showBase={showBase}
            compact={compact}
          />
          {!compact && (
            <>
          <DerivedStat
            label="Alcance efetivo"
            value={range > 0 ? `${Math.round(range)} m` : 'constante'}
            detail={range > 0 ? 'até precisar de mais um tiro' : 'mesmo dano em toda distância'}
            raw={range}
            rawBase={baseRange}
            suffix=" m"
            showBase={showBase}
          />
          <DerivedStat
            label="Dano por segundo"
            value={Math.round(dps).toString()}
            detail={`${(shotInterval(stats) || 0).toFixed(0)} ms entre disparos`}
            raw={dps}
            rawBase={baseDps}
            showBase={showBase}
          />
            </>
          )}
        </div>
      )}

      <div className={compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}>
        <div className="space-y-3">
          <StatBar label="Precisão" statKey="accuracy" value={stats.accuracy} base={base.accuracy} showBase={showBase} />
          <StatBar label="Controle" statKey="control" value={stats.control} base={base.control} showBase={showBase} />
          {!compact && (
            <>
              <StatBar label="Mobilidade" statKey="mobility" value={stats.mobility} base={base.mobility} showBase={showBase} />
              <StatBar label="Tiro sem visada" statKey="hipfire" value={stats.hipfire} base={base.hipfire} showBase={showBase} />
            </>
          )}
        </div>

        <div>
          {!isMelee && (
            <>
              <StatNumber
                label="Dano de perto"
                statKey="damage"
                value={damagePerShot(stats, 0)}
                base={damagePerShot(base, 0)}
                decimals={1}
                showBase={showBase}
                compact={compact}
              />
              <StatNumber
                label="Cadência"
                statKey="rpm"
                value={stats.rpm}
                base={base.rpm}
                unit="RPM"
                showBase={showBase}
                compact={compact}
              />
              {!compact && (
                <StatNumber
                label="Velocidade da bala"
                statKey="velocity"
                value={stats.velocity}
                base={base.velocity}
                unit="m/s"
                showBase={showBase}
                compact={compact}
              />
              )}
              <StatNumber
                label="Carregador"
                statKey="magazine"
                value={stats.magazine}
                base={base.magazine}
                unit="tiros"
                showBase={showBase}
                compact={compact}
              />
              <StatNumber
                label="Recarga"
                statKey="reload"
                value={stats.reload}
                base={base.reload}
                unit="s"
                decimals={2}
                showBase={showBase}
                compact={compact}
              />
              {!compact && (
                <StatNumber
                label="Recarga com a arma vazia"
                statKey="emptyReload"
                value={stats.emptyReload}
                base={base.emptyReload}
                unit="s"
                decimals={2}
                showBase={showBase}
                compact={compact}
              />
              )}
              <StatNumber
                label="Tempo de mira"
                statKey="adsMs"
                value={stats.adsMs}
                base={base.adsMs}
                unit="ms"
                showBase={showBase}
                compact={compact}
              />
            </>
          )}
          <StatNumber
            label="Troca de arma"
            statKey="swapMs"
            value={stats.swapMs}
            base={base.swapMs}
            unit="ms"
            showBase={showBase}
          />
          {!isMelee && (
            <>
              <StatNumber
                label="Recuo vertical"
                statKey="verticalRecoil"
                value={stats.verticalRecoil}
                base={base.verticalRecoil}
                decimals={2}
                showBase={showBase}
                compact={compact}
              />
              <StatNumber
                label="Recuo horizontal"
                statKey="horizontalRecoil"
                value={stats.horizontalRecoil}
                base={base.horizontalRecoil}
                decimals={2}
                showBase={showBase}
                compact={compact}
              />
            </>
          )}
        </div>
      </div>

      {/* A escada inteira é leitura de arma principal; na secundária ela só
          empurraria o resto da coluna para baixo. */}
      {!isMelee && !compact && (
        <div className="card bevel-sm p-3">
          <p className="label mb-1.5">Dano por faixa de distância</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
            {stats.damage.map((step, i) => {
              const nextStep = stats.damage[i + 1];
              const damage = step.damage * stats.pellets;
              return (
                <span key={i}>
                  <span style={{ color: 'var(--text-dim)' }}>
                    {Math.round(step.distance)}
                    {nextStep ? `–${Math.round(nextStep.distance)}` : '+'} m
                  </span>{' '}
                  {damage.toFixed(1)}
                  <span style={{ color: 'var(--text-dim)' }}> ({Math.ceil(100 / damage)}×)</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
