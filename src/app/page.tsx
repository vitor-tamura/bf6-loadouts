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
import { analysisDistance } from '@/lib/ballistics';
import { loadoutAttachments } from '@/lib/loadout';
import { calculateBudget, calculateStats, baseStats, hasApproximateValue } from '@/lib/stats';
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
  const setGadget = useLoadout((s) => s.setGadget);
  const setThrowable = useLoadout((s) => s.setThrowable);
  const toggleBaseComparison = useLoadout((s) => s.toggleBaseComparison);
  const clearAttachments = useLoadout((s) => s.clearAttachments);

  const [tab, setTab] = useState<Tab>('arma');

  const [choosingSidearm, setEscolhendoSecundaria] = useState(false);

  const weapon = loadout.weapon ? (WEAPONS_BY_ID.get(loadout.weapon) ?? null) : null;
  const attachments = useMemo(() => loadoutAttachments(loadout, weapon), [loadout, weapon]);
  const stats = useMemo(() => (weapon ? calculateStats(weapon, attachments) : null), [weapon, attachments]);
  const base = useMemo(() => (weapon ? baseStats(weapon) : null), [weapon]);
  const budget = useMemo(() => calculateBudget(attachments), [attachments]);
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
          <div className="cartao chanfro sticky top-[64px] z-20 mb-3 p-2 lg:static">
            {/* Largura limitada: com a proporção 8:3 do quadro, deixar o preview
                ocupar 1600 px transformaria a arma em um painel de 600 px de
                altura e empurraria todo o resto para fora da tela. */}
            <WeaponPreview
              weapon={weapon}
              attachments={attachments}
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
            <div className="cartao chanfro p-3 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto">
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
                <div className="cartao chanfro p-3">
                  <BudgetBar budget={budget} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[12px] leading-snug" style={{ color: 'var(--texto-suave)' }}>
                      {weapon.summary}
                    </p>
                    <button
                      type="button"
                      onClick={clearAttachments}
                      className="toque shrink-0 px-2 text-xs underline"
                      style={{ color: 'var(--texto-fraco)' }}
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
              </div>
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Coluna 3 — números e gráficos */}
          <div className={tab === 'numeros' ? 'block' : 'hidden lg:block'}>
            {weapon && stats && base ? (
              <div className="space-y-3">
                <div className="cartao chanfro p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="rotulo">Estatísticas</h2>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
                      <input
                        type="checkbox"
                        checked={compareWithBase}
                        onChange={toggleBaseComparison}
                        className="accent-[var(--destaque)]"
                      />
                      comparar com a de fábrica
                    </label>
                  </div>
                  <StatsPanel weapon={weapon} stats={stats} base={base} showBase={compareWithBase} />
                </div>

                {approximate && <ApproximateNotice />}
              </div>
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Gráficos: faixa larga no computador, para o texto dos eixos continuar
              legível; no celular seguem dentro da aba Números. */}
          {weapon && stats && base && weapon.category !== 'corpo-a-corpo' && (
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
            <div className="cartao chanfro grid gap-4 p-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <ClassSelector current={loadout.playerClass} onSelect={setPlayerClass} />
              <EquipmentPanel
                playerClass={loadout.playerClass}
                gadget1={loadout.gadget1}
                gadget2={loadout.gadget2}
                throwable={loadout.throwable}
                sidearm={loadout.sidearm}
                onSetGadget={setGadget}
                onSetThrowable={setThrowable}
                onOpenSidearm={() => setEscolhendoSecundaria(true)}
              />
            </div>
          </div>
        </div>

        <footer className="pb-seguro-nav mt-6 text-center text-[11px] lg:pb-6" style={{ color: 'var(--texto-fraco)' }}>
          <p>
            Projeto de fã, sem vínculo com a EA ou a DICE. Battlefield é marca registrada da Electronic Arts.
          </p>
        </footer>
      </main>

      {/* Navegação por abas, só no celular. */}
      <nav
        className="pb-seguro fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t backdrop-blur lg:hidden"
        style={{ background: 'color-mix(in oklab, var(--fundo) 92%, transparent)', borderColor: 'var(--borda)' }}
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
              className="toque py-2 text-xs font-semibold"
              style={{
                color: active ? 'var(--destaque)' : 'var(--texto-fraco)',
                borderTop: `2px solid ${active ? 'var(--destaque)' : 'transparent'}`,
              }}
            >
              {item.name}
            </button>
          );
        })}
      </nav>

      {choosingSidearm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: 'rgb(0 0 0 / 0.6)' }}
          onClick={() => setEscolhendoSecundaria(false)}
          role="presentation"
        >
          <div
            className="cartao chanfro pb-seguro max-h-[80dvh] w-full max-w-md overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Escolher arma secundária"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Arma secundária</h2>
              <button
                type="button"
                onClick={() => setEscolhendoSecundaria(false)}
                className="toque px-2 text-lg"
                aria-label="Fechar"
                style={{ color: 'var(--texto-fraco)' }}
              >
                ✕
              </button>
            </div>
            <WeaponSelector
              title="Pistolas e corpo a corpo"
              selected={loadout.sidearm}
              categories={['pistola', 'corpo-a-corpo']}
              onSelect={(id) => {
                setSidearm(id);
                setEscolhendoSecundaria(false);
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
    <div className="cartao chanfro flex min-h-[180px] items-center justify-center p-6 text-center">
      <p className="text-sm" style={{ color: 'var(--texto-fraco)' }}>
        Escolha uma arma para começar a montar.
      </p>
    </div>
  );
}

function ApproximateNotice() {
  return (
    <p className="cartao chanfro-sm p-3 text-[11px] leading-snug" style={{ color: 'var(--texto-fraco)' }}>
      <strong style={{ color: 'var(--destaque)' }}>≈ valores aproximados.</strong> O jogo não expõe os
      multiplicadores exatos de alguns acessórios e armas. Esses números foram calibrados a partir das
      descrições de efeito no jogo e de medições da comunidade — servem para comparar builds, não como
      medida oficial.
    </p>
  );
}
