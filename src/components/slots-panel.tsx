'use client';

import { useEffect, useState } from 'react';
import { attachmentsForWeapon } from '@/data/attachments';
import { POINT_BUDGET, SLOTS_BY_ID } from '@/data/classes';
import type { Attachment, Weapon, StatKey, SlotId, WeaponCategory } from '@/data/types';
import { LOWER_IS_BETTER, type Budget } from '@/lib/stats';
import { AttachmentThumb } from './attachment-thumb';

/**
 * Montagem da arma.
 *
 * Os dez slots aparecem como blocos, cada um mostrando a peça encaixada — o
 * jogador reconhece a montagem inteira de relance, sem abrir nada. Ao abrir um
 * bloco, as opções também vêm com miniatura, custo em pontos e efeito.
 *
 * Peça que não cabe no orçamento continua visível, porém desabilitada: esconder
 * a opção deixaria o jogador sem entender por que ela sumiu.
 */

const STAT_LABEL: Record<StatKey, string> = {
  damage: 'dano',
  range: 'alcance',
  rpm: 'cadência',
  velocity: 'velocidade',
  magazine: 'carregador',
  reload: 'recarga',
  adsMs: 'mira',
  swapMs: 'troca',
  accuracy: 'precisão',
  control: 'controle',
  mobility: 'mobilidade',
  hipfire: 'tiro de quadril',
  verticalRecoil: 'recuo vertical',
  horizontalRecoil: 'recuo horizontal',
  headshot: 'dano na cabeça',
};

/** Transforma os modificadores em frases curtas e legíveis. */
function summarizeEffects(attachment: Attachment): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];

  for (const [statKey, mod] of Object.entries(attachment.mods) as [
    StatKey,
    { add?: number; mult?: number },
  ][]) {
    const lowerIsBetter = LOWER_IS_BETTER.has(statKey as never);
    if (mod.add !== undefined && mod.add !== 0) {
      out.push({
        text: `${mod.add > 0 ? '+' : ''}${mod.add} ${STAT_LABEL[statKey]}`,
        good: lowerIsBetter ? mod.add < 0 : mod.add > 0,
      });
    }
    if (mod.mult !== undefined && mod.mult !== 1) {
      const pct = Math.round((mod.mult - 1) * 100);
      if (pct === 0) continue;
      out.push({
        text: `${pct > 0 ? '+' : ''}${pct}% ${STAT_LABEL[statKey]}`,
        good: lowerIsBetter ? pct < 0 : pct > 0,
      });
    }
  }

  return out;
}

export function BudgetBar({ budget }: { budget: Budget }) {
  const ratio = Math.min(100, (budget.spent / budget.total) * 100);
  const tight = budget.remaining <= 10;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">Pontos de personalização</span>
        <span className="font-mono text-sm">
          <span style={{ color: tight ? 'var(--accent)' : 'var(--text)' }}>{budget.spent}</span>
          <span style={{ color: 'var(--text-dim)' }}> / {budget.total}</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden" style={{ background: 'var(--border-soft)' }}>
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${ratio}%`,
            background: budget.overBudget ? 'var(--color-negative)' : 'var(--accent)',
          }}
        />
      </div>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
        {budget.overBudget
          ? 'Orçamento estourado — remova alguma peça.'
          : `Restam ${budget.remaining} pontos para gastar.`}
      </p>
    </div>
  );
}

export function SlotsPanel({
  weapon,
  chosen,
  onSelect,
  currentSpend,
}: {
  weapon: Weapon;
  chosen: Partial<Record<SlotId, string>>;
  onSelect: (slot: SlotId, id: string | null) => void;
  currentSpend: number;
}) {
  const [open, setOpen] = useState<SlotId | null>(null);
  const mounted = useCollapse(open);
  const bySlot = attachmentsForWeapon(weapon);

  if (bySlot.size === 0) {
    return (
      <p className="card bevel p-4 text-sm" style={{ color: 'var(--text-dim)' }}>
        Armas de corpo a corpo não recebem acessórios.
      </p>
    );
  }

  const orderedSlots = ([...bySlot.keys()] as SlotId[]).sort(
    (a, b) => (SLOTS_BY_ID.get(a)?.order ?? 99) - (SLOTS_BY_ID.get(b)?.order ?? 99),
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {orderedSlots.map((slot) => {
        const definition = SLOTS_BY_ID.get(slot)!;
        const options = bySlot.get(slot)!;
        const currentId = chosen[slot];
        const current = options.find((o) => o.id === currentId) ?? null;
        const expanded = open === slot;

        return (
          <div key={slot} className="contents">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : slot)}
              aria-expanded={expanded}
              className="card bevel-sm flex flex-col items-center gap-1 p-2 text-center transition-colors"
              style={{
                borderColor: expanded
                  ? 'var(--accent)'
                  : current
                    ? 'color-mix(in oklab, var(--accent) 45%, var(--border-soft))'
                    : 'var(--border-soft)',
              }}
            >
              <span className="label w-full truncate">{definition.name}</span>

              <span
                className="flex h-14 w-full items-center justify-center"
                style={{ background: 'var(--surface-raised)' }}
              >
                <AttachmentThumb attachment={current} slot={slot} size={52} />
              </span>

              <span
                className="line-clamp-2 w-full text-[12px] leading-tight"
                style={{ color: current ? 'var(--text)' : 'var(--text-dim)' }}
              >
                {current ? current.name : 'Vazio'}
              </span>

              <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {current ? `${current.cost} pts` : '—'}
              </span>
            </button>

            {/*
              A lista abre na largura toda, logo abaixo da linha do bloco.

              Ela fica montada durante a saída — daí `mounted` em vez de
              `expanded` — para que fechar seja tão animado quanto abrir. Só o
              slot aberto e o que está saindo existem no DOM, então nunca há
              mais de duas listas montadas ao mesmo tempo.
            */}
            {mounted === slot && (
              <div className="collapse col-span-full" data-open={expanded}>
                <div>
                <div className="card bevel-sm mt-1 p-2" style={{ borderColor: 'var(--accent)' }}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold tracking-wide">
                      {definition.name}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setOpen(null)}
                      className="px-1 text-xs"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      fechar
                    </button>
                  </div>
                  <p className="mb-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    {definition.description}
                  </p>

                  <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    <li>
                      <EmptyOption
                        slot={slot}
                        active={!currentId}
                        onSelect={() => onSelect(slot, null)}
                      />
                    </li>
                    {options.map((option) => {
                      const fits = currentSpend - (current?.cost ?? 0) + option.cost <= POINT_BUDGET;
                      return (
                        <li key={option.id}>
                          <AttachmentOption
                            attachment={option}
                            slot={slot}
                            category={weapon.category}
                            active={option.id === currentId}
                            fits={fits}
                            onSelect={() => onSelect(slot, option.id)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Segura o bloco no DOM enquanto ele fecha.
 *
 * Sem isso o React desmontaria a lista no clique e não haveria o que animar — a
 * abertura seria suave e o fechamento, um corte seco. O valor devolvido é o
 * slot que deve estar montado: o aberto, ou o que acabou de fechar até a
 * animação terminar.
 */
function useCollapse(open: SlotId | null, ms = 280): SlotId | null {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(open);
      return;
    }
    const timer = setTimeout(() => setMounted(null), ms);
    return () => clearTimeout(timer);
  }, [open, ms]);

  return mounted;
}

function EmptyOption({
  slot,
  active,
  onSelect,
}: {
  slot: SlotId;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="bevel-sm flex w-full items-center gap-2 px-2 py-2 text-left"
      style={{
        background: active ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
        border: '1px solid var(--border-soft)',
      }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <AttachmentThumb attachment={null} slot={slot} size={32} />
      </span>
      <span className="flex-1 text-sm" style={{ color: active ? 'var(--text)' : 'var(--text-dim)' }}>
        Vazio
      </span>
      <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
        0 pts
      </span>
    </button>
  );
}

function AttachmentOption({
  attachment,
  slot,
  category,
  active,
  fits,
  onSelect,
}: {
  attachment: Attachment;
  slot: SlotId;
  category: WeaponCategory;
  active: boolean;
  fits: boolean;
  onSelect: () => void;
}) {
  const list = summarizeEffects(attachment);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!fits && !active}
      aria-pressed={active}
      className="bevel-sm flex w-full gap-2 px-2 py-2 text-left transition-colors disabled:cursor-not-allowed"
      style={{
        background: active ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-soft)'}`,
        opacity: !fits && !active ? 0.4 : 1,
      }}
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center"
        style={{ background: 'var(--surface-raised)' }}
      >
        <AttachmentThumb attachment={attachment} slot={slot} size={40} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">
            {attachment.name}
            {attachment.magnification && attachment.magnification > 1 && (
              <span style={{ color: 'var(--text-dim)' }}> · {attachment.magnification}×</span>
            )}
          </span>
          <span
            className="shrink-0 font-mono text-xs"
            style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }}
          >
            {attachment.cost} pts
          </span>
        </span>

        <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
          {attachment.description}
        </span>

        {list.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px]">
            {list.map((effect) => (
              <span
                key={effect.text}
                style={{ color: effect.good ? 'var(--color-positive)' : 'var(--color-negative)' }}
              >
                {effect.text}
              </span>
            ))}
          </span>
        )}

        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
          <span>{attachment.originalName}</span>
          {attachment.provenance === 'curated' && <span title="Efeito aproximado">≈ aproximado</span>}
          {!fits && !active && <span style={{ color: 'var(--color-negative)' }}>não cabe no orçamento</span>}
        </span>
      </span>
    </button>
  );
}
