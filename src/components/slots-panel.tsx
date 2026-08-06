'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { attachmentsForWeapon } from '@/data/attachments';
import { budgetFor, SLOTS_BY_ID } from '@/data/classes';
import type { Attachment, Weapon, StatKey, SlotId, WeaponCategory } from '@/data/types';
import { LOWER_IS_BETTER, type Budget } from '@/lib/stats';
import { AttachmentIcon } from '@/components/icons/attachment-icon';
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
  drag: 'arrasto',
  magazine: 'carregador',
  reload: 'recarga',
  adsMs: 'mira',
  swapMs: 'troca',
  accuracy: 'precisão',
  control: 'controle',
  mobility: 'mobilidade',
  hipfire: 'tiro sem visada',
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

/** Quantos pontos cada marca do medidor vale — dez marcas para os 100 pontos. */
const POINTS_PER_TICK = 10;

export function BudgetBar({ budget }: { budget: Budget }) {
  const tight = budget.remaining <= 10;
  const ticks = Math.ceil(budget.total / POINTS_PER_TICK);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">
          {budget.overBudget ? (
            <span style={{ color: 'var(--color-negative)' }}>Capacidade excedida</span>
          ) : (
            'Pontos de personalização'
          )}
        </span>
        <span className="font-mono text-sm">
          <span
            style={{
              color: budget.overBudget
                ? 'var(--color-negative)'
                : tight
                  ? 'var(--accent)'
                  : 'var(--text)',
            }}
          >
            {budget.spent}
          </span>
          <span style={{ color: 'var(--text-dim)' }}> / {budget.total}</span>
        </span>
      </div>

      {/*
        Medidor em marcas, como o do jogo: dez losangos de dez pontos cada.
        Contar peças em unidades inteiras é mais fácil que ler uma barra
        contínua — dá para ver que restam "duas marcas e meia" sem fazer conta.
        A marca em curso preenche pela fração gasta, e o que estoura o
        orçamento acende em vermelho no fim da fila.
      */}
      {/*
        A grade tem sempre dez colunas, mesmo quando a arma só usa seis: o bloco
        guarda a mesma largura em qualquer arma, e a barra da pistola fica
        visivelmente mais curta que a da principal — que é a informação.
      */}
      <div
        className="grid grid-cols-10 gap-1"
        role="img"
        aria-label={`${budget.spent} de ${budget.total} pontos`}
      >
        {Array.from({ length: ticks }, (_, i) => {
          const start = i * POINTS_PER_TICK;
          const fill = Math.max(0, Math.min(1, (budget.spent - start) / POINTS_PER_TICK));
          const over = budget.overBudget && start >= budget.total - POINTS_PER_TICK;

          return (
            <span
              key={i}
              className="tick relative h-3.5 overflow-hidden"
              style={{ border: `1px solid ${fill > 0 ? 'var(--accent)' : 'var(--border)'}` }}
            >
              <span
                className="absolute inset-y-0 left-0 transition-[width] duration-300"
                style={{
                  width: `${fill * 100}%`,
                  background: over ? 'var(--color-negative)' : 'var(--accent)',
                }}
              />
            </span>
          );
        })}

        {/* Marcas extras, uma por dezena estourada — o excesso precisa caber. */}
        {budget.overBudget &&
          Array.from(
            { length: Math.ceil((budget.spent - budget.total) / POINTS_PER_TICK) },
            (_, i) => (
              <span
                key={`over-${i}`}
                className="tick h-3.5"
                style={{
                  border: '1px solid var(--color-negative)',
                  background: 'color-mix(in oklab, var(--color-negative) 55%, transparent)',
                }}
              />
            ),
          )}
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
  compact = false,
}: {
  weapon: Weapon;
  chosen: Partial<Record<SlotId, string>>;
  onSelect: (slot: SlotId, id: string | null) => void;
  currentSpend: number;
  /** Blocos menores, para a arma secundária. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState<SlotId | null>(null);
  const mounted = useCollapse(open);
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(gridRef);
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

  /*
   * A lista abre depois da **linha inteira**, não logo depois do bloco clicado.
   *
   * Um elemento de largura total no meio de uma linha empurra os blocos
   * seguintes para baixo dele e deixa buracos onde eles estavam — a grade toda
   * se remonta a cada clique. Emendando a lista no fim da linha, os blocos
   * ficam onde estavam e só o espaço abaixo se abre.
   *
   * Qual é o último bloco da linha depende de quantas colunas a grade tem
   * naquele momento, e isso muda com o breakpoint; daí a medição em vez de um
   * número fixo.
   */
  const mountedIndex = mounted ? orderedSlots.indexOf(mounted) : -1;
  const panelAfter =
    mountedIndex < 0
      ? -1
      : Math.min(orderedSlots.length - 1, (Math.floor(mountedIndex / columns) + 1) * columns - 1);

  return (
    <div
      ref={gridRef}
      className={
        compact
          ? 'grid auto-rows-min grid-cols-3 content-start gap-1.5 sm:grid-cols-4 lg:grid-cols-6'
          : 'grid auto-rows-min grid-cols-2 content-start gap-2 sm:grid-cols-3 lg:grid-cols-4'
      }
    >
      {orderedSlots.map((slot, index) => {
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
      className="card bevel-sm flex flex-col items-center gap-1 p-2 text-center"
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
                className={`flex w-full items-center justify-center ${compact ? 'h-10' : 'h-14'}`}
                style={{ background: 'var(--surface-raised)' }}
              >
                <AttachmentThumb attachment={current} slot={slot} size={compact ? 36 : 52} />
              </span>

              <span
                className={`w-full leading-tight ${compact ? 'line-clamp-1 text-[10px]' : 'line-clamp-2 text-[12px]'}`}
                style={{ color: current ? 'var(--text)' : 'var(--text-dim)' }}
              >
                {current ? current.name : 'Vazio'}
              </span>

              {!compact && (
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  {current ? `${current.cost} pts` : '—'}
                </span>
              )}
            </button>

            {/*
              A lista fica montada durante a saída — daí `mounted` em vez de
              `open` — para que fechar seja tão animado quanto abrir. Só o slot
              aberto ou o que está saindo existe no DOM, nunca os dois.
            */}
            {index === panelAfter && mounted && (
              <div className="disclosure col-span-full" data-open={open === mounted}>
                <div>
                  <SlotOptions
                    slot={mounted}
                    options={bySlot.get(mounted)!}
                    chosenId={chosen[mounted] ?? null}
                    currentSpend={currentSpend}
                    budgetTotal={budgetFor(weapon.category)}
                    onSelect={(id) => onSelect(mounted, id)}
                    onClose={() => setOpen(null)}
                  />
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
 * Escolha da peça de um slot, no arranjo do Gunsmith.
 *
 * A leitura acontece em dois tempos: em cima, a peça em foco por extenso —
 * nome, o que ela faz e o que muda nos números; embaixo, a grade de peças em
 * cartões pequenos, com custo e ícone. Com 152 canos, a descrição ao lado de
 * cada um viraria um paredão de texto; assim o jogador varre os ícones e lê
 * apenas o que está mirando.
 *
 * A peça em foco é a que estiver sob o ponteiro ou com o teclado; sem nenhuma,
 * é a equipada.
 */
function SlotOptions({
  slot,
  options,
  chosenId,
  currentSpend,
  budgetTotal,
  onSelect,
  onClose,
}: {
  slot: SlotId;
  options: Attachment[];
  chosenId: string | null;
  currentSpend: number;
  budgetTotal: number;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const definition = SLOTS_BY_ID.get(slot)!;
  const [hovered, setHovered] = useState<string | null>(null);

  const chosen = options.find((o) => o.id === chosenId) ?? null;
  const preview = options.find((o) => o.id === hovered) ?? chosen;
  const spendWithout = currentSpend - (chosen?.cost ?? 0);

  return (
    <div className="card bevel-sm mt-1 p-3" style={{ borderColor: 'var(--accent)' }}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="label">{definition.name}</span>
        <button
          type="button"
          onClick={onClose}
          className="px-1 text-xs"
          style={{ color: 'var(--text-dim)' }}
        >
          fechar
        </button>
      </div>

      {/* Detalhe da peça em foco. A altura é reservada para que passar o
          ponteiro pela grade não empurre a grade para cima e para baixo. */}
      <div className="mb-3 min-h-[4.5rem]">
        <h4 className="font-display text-lg leading-tight font-semibold tracking-wide">
          {preview ? preview.name : 'Sem acessório'}
        </h4>
        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: 'var(--text-soft)' }}>
          {preview ? preview.description : definition.description}
        </p>
        {preview && (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
            {summarizeEffects(preview).map((effect) => (
              <span
                key={effect.text}
                style={{ color: effect.good ? 'var(--color-positive)' : 'var(--color-negative)' }}
              >
                {effect.text}
              </span>
            ))}
            <span style={{ color: 'var(--text-dim)' }}>{preview.originalName}</span>
            {preview.provenance === 'curated' && (
              <span style={{ color: 'var(--accent)' }} title="Efeito aproximado">
                ≈ aproximado
              </span>
            )}
          </p>
        )}
      </div>

      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5"
        onMouseLeave={() => setHovered(null)}
      >
        {/* Munição não tem estado vazio: a arma sempre sai com a de série. */}
        {slot !== 'ammo' && (
          <li>
            <OptionTile
              slot={slot}
              active={!chosenId}
              onSelect={() => onSelect(null)}
              onFocus={() => setHovered(null)}
            />
          </li>
        )}
        {options.map((option) => (
          <li key={option.id}>
            <OptionTile
              slot={slot}
              attachment={option}
              active={option.id === chosenId}
              fits={spendWithout + option.cost <= budgetTotal}
              onSelect={() => onSelect(option.id)}
              onFocus={() => setHovered(option.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Um cartão da grade de peças.
 *
 * Custo no alto, ícone no meio, nome embaixo — a mesma leitura do jogo. Peça
 * que estoura o orçamento continua clicável? Não: ela fica visível e
 * desabilitada, com o custo em vermelho, para o jogador entender que a opção
 * existe e o que falta para usá-la.
 */
function OptionTile({
  slot,
  attachment,
  active,
  fits = true,
  onSelect,
  onFocus,
}: {
  slot: SlotId;
  /** Sem peça, é o cartão de "nenhum acessório". */
  attachment?: Attachment;
  active: boolean;
  fits?: boolean;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const disabled = !fits && !active;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      disabled={disabled}
      aria-pressed={active}
      title={attachment ? `${attachment.name} · ${attachment.cost} pts` : 'Sem acessório'}
      className="tile bevel-sm flex aspect-square w-full flex-col items-center justify-between p-1.5 text-center"
      style={
        {
          '--tile-bg': active
            ? 'color-mix(in oklab, var(--accent) 16%, var(--surface))'
            : 'var(--surface-raised)',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border-soft)'}`,
          opacity: disabled ? 0.4 : 1,
        } as CSSProperties
      }
    >
      <span
        className="w-full text-left font-mono text-[10px] leading-none"
        style={{ color: disabled ? 'var(--color-negative)' : active ? 'var(--accent)' : 'var(--text-dim)' }}
      >
        {attachment ? attachment.cost : 0}
      </span>

      <span style={{ color: active ? 'var(--accent)' : 'var(--text-soft)', lineHeight: 0 }}>
        {attachment ? (
          <AttachmentIcon attachment={attachment} slot={slot} size={30} />
        ) : (
          <span className="block text-lg" style={{ color: 'var(--text-dim)' }}>
            ✕
          </span>
        )}
      </span>

      <span
        className="line-clamp-2 w-full text-[10px] leading-tight"
        style={{ color: active ? 'var(--text)' : 'var(--text-dim)' }}
      >
        {attachment ? attachment.name : 'Vazio'}
      </span>
    </button>
  );
}

/**
 * Quantas colunas a grade tem agora.
 *
 * O número vem das classes responsivas (2, 3 ou 4 conforme a largura), então
 * não dá para fixá-lo no código sem repetir os breakpoints em dois lugares e
 * deixá-los divergir na primeira mudança de layout. Ler do estilo computado
 * mantém uma fonte só — o CSS.
 */
function useGridColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;

    const read = () => {
      const track = getComputedStyle(grid).gridTemplateColumns;
      setColumns(Math.max(1, track.split(' ').filter(Boolean).length));
    };

    read();
    const observer = new ResizeObserver(read);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
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
