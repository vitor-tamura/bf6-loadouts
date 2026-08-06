'use client';

import { useMemo, useState } from 'react';
import { AppHeader } from '@/components/header';
import { ShareButton } from '@/components/share-button';
import { DamageChart, DropChart } from '@/components/charts';
import { EquipmentPanel, ClassSelector } from '@/components/class-panel';
import { SlotsPanel, BudgetBar } from '@/components/slots-panel';
import { StatsPanel } from '@/components/stats-panel';
import { WeaponPreview } from '@/components/weapon-preview';
import { WeaponSelector } from '@/components/weapon-selector';
import { WEAPONS_BY_ID, PRIMARY_CATEGORIES } from '@/data/weapons';
import { budgetFor, POINT_BUDGET } from '@/data/classes';
import type { SlotId, Weapon } from '@/data/types';
import { analysisDistance } from '@/lib/ballistics';
import { loadoutAttachments } from '@/lib/loadout';
import { calculateBudget, calculateStats, baseStats, hasApproximateValue, type Budget } from '@/lib/stats';
import { useLoadout, useUrlSync } from '@/state/loadout';

/**
 * Montador de loadout.
 *
 * No computador as três colunas ficam visíveis ao mesmo tempo — escolher a arma,
 * montar e ler o resultado sem nenhum menu escondido. No celular o preview fica
 * fixo no topo e o resto se divide em abas, para que cada tela peça uma decisão
 * de cada vez.
 */

type Tab = 'arma' | 'montar' | 'classe' | 'numeros';

const TABS: { id: Tab; name: string }[] = [
  { id: 'arma', name: 'Arma' },
  { id: 'montar', name: 'Montar' },
  { id: 'classe', name: 'Classe' },
  { id: 'numeros', name: 'Números' },
];

export default function BuilderPage() {
  useUrlSync();

  const loadout = useLoadout((s) => s.loadout);
  const compareWithBase = useLoadout((s) => s.compareWithBase);
  const setWeapon = useLoadout((s) => s.setWeapon);
  const setAttachment = useLoadout((s) => s.setAttachment);
  const setPlayerClass = useLoadout((s) => s.setPlayerClass);
  const setSidearm = useLoadout((s) => s.setSidearm);
  const setSidearmAttachment = useLoadout((s) => s.setSidearmAttachment);
  const setGadget = useLoadout((s) => s.setGadget);
  const setThrowable = useLoadout((s) => s.setThrowable);
  const toggleBaseComparison = useLoadout((s) => s.toggleBaseComparison);
  const clearAttachments = useLoadout((s) => s.clearAttachments);
  const clearSidearmAttachments = useLoadout((s) => s.clearSidearmAttachments);

  const [tab, setTab] = useState<Tab>('arma');

  const [choosingSidearm, setChoosingSidearm] = useState(false);

  const weapon = loadout.weapon ? (WEAPONS_BY_ID.get(loadout.weapon) ?? null) : null;
  const sidearm = loadout.sidearm ? (WEAPONS_BY_ID.get(loadout.sidearm) ?? null) : null;
  const attachments = useMemo(() => loadoutAttachments(loadout.attachments, weapon), [loadout, weapon]);

  // A secundária gasta do próprio orçamento, como no jogo.
  const sidearmAttachments = useMemo(
    () => loadoutAttachments(loadout.sidearmAttachments, sidearm),
    [loadout.sidearmAttachments, sidearm],
  );
  const sidearmStats = useMemo(
    () => (sidearm ? calculateStats(sidearm, sidearmAttachments) : null),
    [sidearm, sidearmAttachments],
  );
  const sidearmBase = useMemo(() => (sidearm ? baseStats(sidearm) : null), [sidearm]);
  const sidearmBudget = useMemo(
    () =>
      calculateBudget(sidearmAttachments, sidearm ? budgetFor(sidearm.category) : POINT_BUDGET),
    [sidearmAttachments, sidearm],
  );
  const stats = useMemo(() => (weapon ? calculateStats(weapon, attachments) : null), [weapon, attachments]);
  const base = useMemo(() => (weapon ? baseStats(weapon) : null), [weapon]);
  const budget = useMemo(
    () => calculateBudget(attachments, weapon ? budgetFor(weapon.category) : POINT_BUDGET),
    [attachments, weapon],
  );
  const distance = useMemo(() => (stats ? analysisDistance(stats) : 100), [stats]);
  const approximate = weapon ? hasApproximateValue(weapon, attachments) : false;

  // Ao escolher a arma no celular, a próxima decisão é montar.
  function chooseWeapon(id: string) {
    setWeapon(id);
    setTab('montar');
  }

  return (
    <div className="min-h-dvh">
      <AppHeader
        subtitle={weapon ? weapon.name : 'Montador de loadouts'}
        actions={<ShareButton loadout={loadout} disabled={!weapon} />}
      />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        {/* Preview: sempre visível, é a resposta imediata a cada acessório. */}
        {weapon && (
          <div className="card bevel sticky top-[64px] z-20 mb-3 p-2 lg:static">
            {/* Largura limitada: com a proporção 8:3 do quadro, deixar o preview
                ocupar 1600 px transformaria a arma em um painel de 600 px de
                altura e empurraria todo o resto para fora da tela. */}
            <WeaponPreview
              weapon={weapon}
             
              withLabel
              className="mx-auto w-full max-w-[560px] lg:max-w-[760px]"
            />

          </div>
        )}

        {/* `min-w-0` nos filhos: sem isso, itens de grid usam a largura mínima do
            conteúdo e a barra de filtros rolável estica a página inteira,
            criando rolagem horizontal no celular. */}
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[minmax(230px,270px)_minmax(0,1fr)_minmax(340px,420px)]">
          {/* Coluna 1 — escolha da arma */}
          <div className={tab === 'arma' ? 'block' : 'hidden lg:block'}>
            {/* No computador a lista rola dentro da própria coluna: com 63 armas,
                deixá-la esticar faria a página inteira crescer sem necessidade. */}
            <div className="card bevel overflow-x-hidden p-3 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto">
              <WeaponSelector
                selected={loadout.weapon}
                onSelect={chooseWeapon}
                categories={PRIMARY_CATEGORIES}
              />
            </div>
          </div>

          {/* Coluna 2 — montagem */}
          <div className={tab === 'montar' ? 'block' : 'hidden lg:block'}>
            {weapon ? (
              <div className="space-y-3">
                <div className="card bevel p-3">
                  <BudgetBar budget={budget} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[12px] leading-snug" style={{ color: 'var(--text-soft)' }}>
                      {weapon.summary}
                    </p>
                    <button
                      type="button"
                      onClick={clearAttachments}
                      className="touch shrink-0 px-2 text-xs underline"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <SlotsPanel
                  weapon={weapon}
                  chosen={loadout.attachments}
                  onSelect={setAttachment}
                  currentSpend={budget.spent}
                />

                {/*
                  A secundária tem seção própria porque ela é uma arma inteira:
                  aceita acessórios e tem os seus próprios cem pontos. Escondê-la
                  atrás de um botão dava a entender que só se escolhia o modelo.
                */}
                <SidearmSection
                  sidearm={sidearm}
                  chosen={loadout.sidearmAttachments}
                  budget={sidearmBudget}
                  onOpenPicker={() => setChoosingSidearm(true)}
                  onSelectAttachment={setSidearmAttachment}
                  onClear={clearSidearmAttachments}
                />
              </div>
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Coluna 3 — números e gráficos */}
          <div className={tab === 'numeros' ? 'block' : 'hidden lg:block'}>
            {weapon && stats && base ? (
              <div className="space-y-3">
                <div className="card bevel p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="label">Estatísticas</h2>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      <input
                        type="checkbox"
                        checked={compareWithBase}
                        onChange={toggleBaseComparison}
                        className="accent-[var(--accent)]"
                      />
                      comparar com a de fábrica
                    </label>
                  </div>
                  <StatsPanel weapon={weapon} stats={stats} base={base} showBase={compareWithBase} />
                </div>

                {/*
                  A secundária entra logo abaixo, na mesma coluna: números moram
                  aqui, e comparar as duas armas exige que estejam à mesma
                  distância do olho.
                */}
                {sidearm && sidearmStats && sidearmBase && (
                  <div className="card bevel p-2.5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="label">
                        Secundária ·{' '}
                        <span style={{ color: 'var(--text-soft)' }}>{sidearm.name}</span>
                      </h2>
                      {/* O mesmo interruptor do bloco de cima: as duas armas
                          respondem juntas, porque a comparação com a de fábrica
                          é um modo de leitura, não uma opção por arma. */}
                      <label
                        className="flex cursor-pointer items-center gap-1.5 text-[11px]"
                        style={{ color: 'var(--text-dim)' }}
                      >
                        <input
                          type="checkbox"
                          checked={compareWithBase}
                          onChange={toggleBaseComparison}
                          className="accent-[var(--accent)]"
                        />
                        comparar com a de fábrica
                      </label>
                    </div>
                    <StatsPanel
                      weapon={sidearm}
                      stats={sidearmStats}
                      base={sidearmBase}
                      showBase={compareWithBase}
                      compact
                    />
                  </div>
                )}

                {approximate && <ApproximateNotice />}
              </div>
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Gráficos: faixa larga no computador, para o texto dos eixos continuar
              legível; no celular seguem dentro da aba Números. */}
          {weapon && stats && base && weapon.category !== 'melee' && (
            <div
              className={`${tab === 'numeros' ? 'grid' : 'hidden lg:grid'} gap-3 lg:col-span-3 lg:grid-cols-2`}
            >
              <DamageChart
                stats={stats}
                base={base}
                maxDistance={distance}
                showBase={compareWithBase}
              />
              <DropChart
                stats={stats}
                base={base}
                maxDistance={distance}
                showBase={compareWithBase}
              />
            </div>
          )}

          {/* Classe e equipamento: coluna própria no celular, rodapé no desktop */}
          <div className={`${tab === 'classe' ? 'block' : 'hidden lg:block'} lg:col-span-3`}>
            <div className="card bevel grid gap-4 p-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <ClassSelector current={loadout.playerClass} onSelect={setPlayerClass} />
              <EquipmentPanel
                playerClass={loadout.playerClass}
                gadget1={loadout.gadget1}
                gadget2={loadout.gadget2}
                throwable={loadout.throwable}
                onSetGadget={setGadget}
                onSetThrowable={setThrowable}
              />
            </div>
          </div>
        </div>

        <footer className="pb-safe-nav mt-6 text-center text-[11px] lg:pb-6" style={{ color: 'var(--text-dim)' }}>
          <p>
            Projeto de fã, sem vínculo com a EA ou a DICE. Battlefield é marca registrada da Electronic Arts.
          </p>
        </footer>
      </main>

      {/* Navegação por abas, só no celular. */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t backdrop-blur lg:hidden"
        style={{ background: 'color-mix(in oklab, var(--bg) 92%, transparent)', borderColor: 'var(--border)' }}
        aria-label="Seções do montador"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className="touch py-2 text-xs font-semibold"
              style={{
                color: active ? 'var(--accent)' : 'var(--text-dim)',
                borderTop: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
              }}
            >
              {item.name}
            </button>
          );
        })}
      </nav>

      {choosingSidearm && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setChoosingSidearm(false)}
          role="presentation"
        >
          <div
            className="modal-panel card bevel pb-safe max-h-[80dvh] w-full max-w-md overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Escolher arma secundária"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Arma secundária</h2>
              <button
                type="button"
                onClick={() => setChoosingSidearm(false)}
                className="touch px-2 text-lg"
                aria-label="Fechar"
                style={{ color: 'var(--text-dim)' }}
              >
                ✕
              </button>
            </div>
            <WeaponSelector
              title="Pistolas e corpo a corpo"
              selected={loadout.sidearm}
              categories={['pistol', 'melee']}
              onSelect={(id) => {
                setSidearm(id);
                setChoosingSidearm(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card bevel flex min-h-[180px] items-center justify-center p-6 text-center">
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        Escolha uma arma para começar a montar.
      </p>
    </div>
  );
}

function ApproximateNotice() {
  return (
    <p className="card bevel-sm p-3 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
      <strong style={{ color: 'var(--accent)' }}>≈ valores aproximados.</strong> O jogo não expõe os
      multiplicadores exatos de alguns acessórios e armas. Esses números foram calibrados a partir das
      descrições de efeito no jogo e de medições da comunidade — servem para comparar builds, não como
      medida oficial.
    </p>
  );
}

/**
 * Seção da arma secundária.
 *
 * Mesma estrutura da principal — escolher a arma, ver o orçamento, montar —
 * porque é o mesmo trabalho. O que muda é que ela começa fechada quando não há
 * secundária escolhida: sem arma, os dez slots vazios seriam ruído.
 */
function SidearmSection({
  sidearm,
  chosen,
  budget,
  onOpenPicker,
  onSelectAttachment,
  onClear,
}: {
  sidearm: Weapon | null;
  chosen: Partial<Record<SlotId, string>>;
  budget: Budget;
  onOpenPicker: () => void;
  onSelectAttachment: (slot: SlotId, id: string | null) => void;
  onClear: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="card bevel p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="label">Arma secundária</h2>
          <button
            type="button"
            onClick={onOpenPicker}
            className="touch px-2 text-xs underline"
            style={{ color: 'var(--text-dim)' }}
          >
            {sidearm ? 'Trocar' : 'Escolher'}
          </button>
        </div>

        {sidearm ? (
          <>
            <button
              type="button"
              onClick={onOpenPicker}
              className="tile bevel-sm flex w-full items-center gap-3 p-2 text-left"
              style={{ border: '1px solid var(--border-soft)' }}
            >
              <WeaponPreview weapon={sidearm} className="w-28 shrink-0" />
              <span className="min-w-0">
                <span className="font-display block text-base font-semibold tracking-wide">
                  {sidearm.name}
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  {sidearm.summary}
                </span>
              </span>
            </button>

            {sidearm.slots.length > 0 && (
              <div className="mt-3">
                <BudgetBar budget={budget} />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onClear}
                    className="touch px-2 text-xs underline"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
            Nenhuma secundária escolhida. Pistolas também aceitam acessórios, com seis blocos de
            pontos em vez dos dez da arma principal.
          </p>
        )}
      </div>

      {sidearm && (
        <SlotsPanel
          weapon={sidearm}
          chosen={chosen}
          onSelect={onSelectAttachment}
          currentSpend={budget.spent}
        />
      )}
    </section>
  );
}
