'use client';

import { CLASSES } from '@/data/classes';
import { GadgetArt } from '@/components/gadget-art';
import { throwables, gadgetsForClass } from '@/data/gadgets';
import type { Gadget, ClassId } from '@/data/types';

/**
 * Classe, gadgets e arremessável.
 *
 * A classe define o equipamento disponível e qual categoria de arma recebe o
 * bônus de manejo — por isso ela aparece junto do resto do loadout, e não
 * escondida em outra tela.
 */

export function ClassSelector({
  current,
  onSelect,
}: {
  current: ClassId;
  onSelect: (playerClass: ClassId) => void;
}) {
  const playerClass = CLASSES.find((c) => c.id === current)!;

  return (
    <section>
      <h2 className="label mb-2">Classe</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {CLASSES.map((c) => {
          const active = c.id === current;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={active}
              className="bevel-sm touch px-2 py-2 text-center"
              style={{
                background: active ? `color-mix(in oklab, ${c.color} 20%, var(--surface))` : 'var(--surface)',
                border: `1px solid ${active ? c.color : 'var(--border-soft)'}`,
              }}
            >
              <span
                className="font-display block text-sm font-semibold tracking-wide"
                style={{ color: active ? c.color : 'var(--text-soft)' }}
              >
                {c.name}
              </span>
              <span className="block text-[10px]" style={{ color: 'var(--text-dim)' }}>
                {c.role}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[12px] leading-snug" style={{ color: 'var(--text-soft)' }}>
        {playerClass.summary}
      </p>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
        <strong style={{ color: playerClass.color }}>Traço:</strong> {playerClass.trait}
      </p>
    </section>
  );
}

function EquipmentList({
  title,
  items,
  selected,
  onSelect,
  allowEmpty = true,
}: {
  title: string;
  items: Gadget[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <h3 className="label mb-1.5">{title}</h3>
      <ul className="grid gap-1">
        {allowEmpty && (
          <li>
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-pressed={selected === null}
              className="touch w-full px-2.5 py-1.5 text-left text-sm"
              style={{ color: selected === null ? 'var(--text)' : 'var(--text-dim)' }}
            >
              Nenhum
            </button>
          </li>
        )}
        {items.map((item) => {
          const active = item.id === selected;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-pressed={active}
                className="bevel-sm touch flex w-full items-start gap-2.5 px-2.5 py-1.5 text-left"
                style={{
                  background: active ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
                }}
              >
                <span
                  className="mt-0.5"
                  style={{ color: active ? 'var(--accent)' : 'var(--text-dim)', lineHeight: 0 }}
                >
                  <GadgetArt gadget={item} size={30} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="block text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                    {item.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EquipmentPanel({
  playerClass,
  gadget1,
  gadget2,
  throwable,
  onSetGadget,
  onSetThrowable,
}: {
  playerClass: ClassId;
  gadget1: string | null;
  gadget2: string | null;
  throwable: string | null;
  onSetGadget: (trackPointer: 1 | 2, id: string | null) => void;
  onSetThrowable: (id: string | null) => void;
}) {
  const gadgets = gadgetsForClass(playerClass);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <EquipmentList
        title="Gadget 1"
        items={gadgets}
        selected={gadget1}
        onSelect={(id) => onSetGadget(1, id)}
      />
      <EquipmentList
        title="Gadget 2"
        items={gadgets.filter((g) => g.id !== gadget1)}
        selected={gadget2}
        onSelect={(id) => onSetGadget(2, id)}
      />
      <EquipmentList
        title="Arremessável"
        items={throwables(playerClass)}
        selected={throwable}
        onSelect={onSetThrowable}
      />
    </div>
  );
}
