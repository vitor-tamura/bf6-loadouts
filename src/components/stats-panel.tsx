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
    <span aria-hidden style={{ color: improves ? 'var(--color-positivo)' : 'var(--color-negativo)' }}>
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
  const mostra = showBase && delta.changed;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="rotulo">{label}</span>
        <span className="flex items-baseline gap-1.5 font-mono text-sm">
          {mostra && (
            <span
              className="text-[11px]"
              style={{ color: delta.improves ? 'var(--color-positivo)' : 'var(--color-negativo)' }}
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
      <div className="relative h-2.5 overflow-hidden" style={{ background: 'var(--borda-suave)' }}>
        <span
          className="absolute top-0 left-0 h-full transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.min(base, value))}%`, background: 'var(--destaque)' }}
        />

        {mostra && delta.improves && (
          <span
            className="absolute top-0 h-full transition-all duration-300"
            style={{
              left: `${Math.min(100, base)}%`,
              width: `${Math.max(0, Math.min(100, value) - Math.min(100, base))}%`,
              background: 'var(--color-positivo)',
            }}
          />
        )}

        {mostra && !delta.improves && (
          <span
            className="absolute top-0 h-full transition-all duration-300"
            style={{
              left: `${Math.min(100, value)}%`,
              width: `${Math.max(0, Math.min(100, base) - Math.min(100, value))}%`,
              background: 'var(--color-negativo)',
              opacity: 0.45,
            }}
          />
        )}

        {mostra && (
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
}: {
  label: string;
  statKey: keyof EffectiveStats;
  value: number;
  base: number;
  unit?: string;
  decimals?: number;
  showBase: boolean;
}) {
  const delta = compareStat(statKey, base, value);
  const mostra = showBase && delta.changed;

  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--borda-suave)' }}>
      <span className="text-sm" style={{ color: 'var(--texto-suave)' }}>
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        {mostra && (
          <span
            className="font-mono text-[11px] whitespace-nowrap"
            style={{ color: delta.improves ? 'var(--color-positivo)' : 'var(--color-negativo)' }}
            title={`De fábrica: ${base.toFixed(decimals)}${unit ? ` ${unit}` : ''}`}
          >
            <DeltaArrow improves={delta.improves} />
            {delta.difference > 0 ? '+' : ''}
            {delta.difference.toFixed(decimals)} ({delta.percent > 0 ? '+' : ''}
            {delta.percent.toFixed(0)}%)
          </span>
        )}
        <span className="font-mono text-sm">
          {value.toFixed(decimals)}
          {unit && <span style={{ color: 'var(--texto-fraco)' }}> {unit}</span>}
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
    <div className="cartao chanfro-sm px-3 py-2">
      <p className="rotulo">{label}</p>
      <p className="font-mono text-lg leading-tight">{value}</p>
      {comparable && (
        <p
          className="font-mono text-[11px] whitespace-nowrap"
          style={{ color: improves ? 'var(--color-positivo)' : 'var(--color-negativo)' }}
          title={`De fábrica: ${rawBase.toFixed(decimals)}${suffix}`}
        >
          <DeltaArrow improves={improves} />
          {difference > 0 ? '+' : ''}
          {difference.toFixed(decimals)}
          {suffix}
          {rawBase !== 0 && ` (${percent > 0 ? '+' : ''}${percent.toFixed(0)}%)`}
        </p>
      )}
      {detail && (
        <p className="text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
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
}: {
  weapon: Weapon;
  stats: EffectiveStats;
  base: EffectiveStats;
  showBase: boolean;
}) {
  const isMelee = weapon.category === 'corpo-a-corpo';

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
    <div className="space-y-4">
      {!isMelee && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DerivedStat
            label="Tempo para matar"
            value={Number.isFinite(ttk) ? `${Math.round(ttk)} ms` : '—'}
            detail={`${shots} tiros de perto`}
            raw={ttk}
            rawBase={baseTtk}
            lowerIsBetter
            suffix=" ms"
            showBase={showBase}
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
          />
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
            detail={`${(shotInterval(stats) || 0).toFixed(0)} ms entre tiros`}
            raw={dps}
            rawBase={baseDps}
            showBase={showBase}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-3">
          <StatBar label="Precisão" statKey="accuracy" value={stats.accuracy} base={base.accuracy} showBase={showBase} />
          <StatBar label="Controle" statKey="control" value={stats.control} base={base.control} showBase={showBase} />
          <StatBar label="Mobilidade" statKey="mobility" value={stats.mobility} base={base.mobility} showBase={showBase} />
          <StatBar label="Tiro de quadril" statKey="hipfire" value={stats.hipfire} base={base.hipfire} showBase={showBase} />
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
              />
              <StatNumber label="Cadência" statKey="rpm" value={stats.rpm} base={base.rpm} unit="RPM" showBase={showBase} />
              <StatNumber
                label="Velocidade da bala"
                statKey="velocity"
                value={stats.velocity}
                base={base.velocity}
                unit="m/s"
                showBase={showBase}
              />
              <StatNumber
                label="Carregador"
                statKey="magazine"
                value={stats.magazine}
                base={base.magazine}
                unit="tiros"
                showBase={showBase}
              />
              <StatNumber
                label="Recarga"
                statKey="reload"
                value={stats.reload}
                base={base.reload}
                unit="s"
                decimals={2}
                showBase={showBase}
              />
              <StatNumber
                label="Recarga com a arma vazia"
                statKey="emptyReload"
                value={stats.emptyReload}
                base={base.emptyReload}
                unit="s"
                decimals={2}
                showBase={showBase}
              />
              <StatNumber
                label="Tempo de mira"
                statKey="adsMs"
                value={stats.adsMs}
                base={base.adsMs}
                unit="ms"
                showBase={showBase}
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
              />
              <StatNumber
                label="Recuo horizontal"
                statKey="horizontalRecoil"
                value={stats.horizontalRecoil}
                base={base.horizontalRecoil}
                decimals={2}
                showBase={showBase}
              />
            </>
          )}
        </div>
      </div>

      {!isMelee && (
        <div className="cartao chanfro-sm p-3">
          <p className="rotulo mb-1.5">Dano por faixa de distância</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
            {stats.damage.map((step, i) => {
              const nextStep = stats.damage[i + 1];
              const damage = step.damage * stats.pellets;
              return (
                <span key={i}>
                  <span style={{ color: 'var(--texto-fraco)' }}>
                    {Math.round(step.distance)}
                    {nextStep ? `–${Math.round(nextStep.distance)}` : '+'} m
                  </span>{' '}
                  {damage.toFixed(1)}
                  <span style={{ color: 'var(--texto-fraco)' }}> ({Math.ceil(100 / damage)}×)</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
