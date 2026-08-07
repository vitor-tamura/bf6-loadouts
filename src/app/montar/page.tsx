'use client';

import { Alert, Button, Card, Checkbox, Empty, Modal, Segmented, Tooltip } from 'antd';
import { Suspense, useMemo, useState } from 'react';
import { AppHeader } from '@/components/header';
import { ShareButton } from '@/components/share-button';
import { DamageChart, DropChart } from '@/components/charts';
import { EquipmentPanel, ClassSelector } from '@/components/class-panel';
import { SlotsPanel, BudgetBar } from '@/components/slots-panel';
import { StatsPanel } from '@/components/stats-panel';
import { WeaponPreview } from '@/components/weapon-preview';
import { DockablePanel, type PanelMode } from '@/components/dockable-panel';
import { SiteFooter } from '@/components/site-footer';
import { WeaponFilters, WeaponList, WeaponSelector, useWeaponFilter } from '@/components/weapon-selector';
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

const TABS: { value: Tab; label: string }[] = [
  { value: 'arma', label: 'Arma' },
  { value: 'montar', label: 'Montar' },
  { value: 'classe', label: 'Classe' },
  { value: 'numeros', label: 'Números' },
];

/**
 * A leitura do loadout na URL passa por `useSearchParams`, e o Next exige
 * fronteira de Suspense para isso em página exportada estaticamente.
 *
 * A fronteira embrulha só a sincronia, não a tela: envolvendo a página inteira,
 * o pré-render inteiro caía fora e o HTML publicado do montador virava um
 * esqueleto vazio de doze mil bytes.
 */
function UrlSync() {
  useUrlSync();
  return null;
}

export default function BuilderRoute() {
  return (
    <>
      <Suspense fallback={null}>
        <UrlSync />
      </Suspense>
      <BuilderPage />
    </>
  );
}

function BuilderPage() {

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

  // A busca da arma principal mora aqui porque os controles e a lista ficam em
  // blocos diferentes da página.
  const weaponFilter = useWeaponFilter(PRIMARY_CATEGORIES);

  const [statsCompactas, setStatsCompactas] = useState(false);
  const [painelLista, setPainelLista] = useState<PanelMode>('fixo');
  const listaOcupaColuna = painelLista === 'fixo';
  // Quem ocupa a largura toda precisa saber quantas colunas existem agora.
  const larguraTotal = listaOcupaColuna ? 'lg:col-span-3' : 'lg:col-span-2';

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
          /*
            `sticky!` com o important: o `.ant-card` traz `position: relative` na
            mesma especificidade da classe do Tailwind e ganhava por ordem no
            arquivo. O `top-[64px]` continuava valendo, e um elemento `relative`
            deslocado ocupa o lugar antigo no fluxo e é pintado 64px abaixo — o
            preview passou a cobrir a faixa de busca inteira.
          */
          <Painel className="sticky! top-[64px] z-20 mb-3 lg:static!" padding={8}>
            {/* Largura limitada: com a proporção 8:3 do quadro, deixar o preview
                ocupar 1600 px transformaria a arma em um painel de 600 px de
                altura e empurraria todo o resto para fora da tela. */}
            <WeaponPreview
              weapon={weapon}
              withLabel
              className="mx-auto w-full max-w-[560px] lg:max-w-[760px]"
            />
          </Painel>
        )}

        {/*
          Busca e filtros ocupam a faixa inteira, acima das colunas.
          Espremidos na coluna da lista, os chips de categoria viravam uma
          barrinha rolável de dois itens visíveis; aqui cabem todos de uma vez.
          No celular a faixa só aparece na aba da arma, que é onde ela serve.
        */}
        <Painel className={`mb-3 overflow-x-hidden ${tab === 'arma' ? 'block' : 'hidden lg:block'}`}>
          <WeaponFilters filter={weaponFilter} />
        </Painel>

        {/* `min-w-0` nos filhos: sem isso, itens de grid usam a largura mínima do
            conteúdo e uma lista larga estica a página inteira, criando rolagem
            horizontal no celular. */}
        <div
          className={`grid gap-3 [&>*]:min-w-0 ${
            // Lista solta ou encolhida devolve a coluna para o resto da tela.
            listaOcupaColuna
              ? 'lg:grid-cols-[minmax(230px,270px)_minmax(0,1fr)_minmax(340px,420px)]'
              : 'lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]'
          }`}
        >
          {/* Coluna 1 — escolha da arma */}
          <div
            className={`${tab === 'arma' ? 'block' : 'hidden lg:block'} ${
              // Solta, a lista vira painel flutuante e sai da grade; encolhida,
              // vira uma faixa no topo em vez de segurar uma coluna inteira.
              painelLista === 'solto' ? 'lg:contents' : ''
            } ${painelLista === 'encolhido' ? 'lg:col-span-2' : ''}`}
          >
            {/* No computador a lista rola dentro do próprio bloco: com 63 armas,
                deixá-la esticar faria a página inteira crescer sem necessidade. */}
            <DockablePanel
              title="Arma principal"
              mode={painelLista}
              onModeChange={setPainelLista}
              className={painelLista === 'solto' ? '' : 'lg:max-h-[calc(100dvh-140px)]'}
            >
              <WeaponList
                filter={weaponFilter}
                selected={loadout.weapon}
                onSelect={chooseWeapon}
              />
            </DockablePanel>
          </div>

          {/* Coluna 2 — montagem */}
          <div className={tab === 'montar' ? 'block' : 'hidden lg:block'}>
            {weapon ? (
              <div className="space-y-3">
                <Painel>
                  <BudgetBar budget={budget} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[12px] leading-snug" style={{ color: 'var(--text-soft)' }}>
                      {weapon.summary}
                    </p>
                    <Button
                      type="link"
                      size="small"
                      onClick={clearAttachments}
                      className="touch shrink-0 px-2 text-xs underline"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      Limpar
                    </Button>
                  </div>
                </Painel>

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
                <Painel>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="label">Estatísticas</h2>
                    <div className="flex items-center gap-2">
                      <ComparaComFabrica checked={compareWithBase} onChange={toggleBaseComparison} />
                      {/*
                        Aberto, o painel prioriza a leitura: número grande, uma
                        linha por medida. Compacto, ele encolhe para caber junto
                        dos gráficos e da secundária sem rolagem.
                      */}
                      <Tooltip title={statsCompactas ? 'Abrir as estatísticas' : 'Compactar as estatísticas'}>
                        <Button
                          type="text"
                          size="small"
                          onClick={() => setStatsCompactas((v) => !v)}
                          aria-label={statsCompactas ? 'Abrir as estatísticas' : 'Compactar as estatísticas'}
                          aria-pressed={statsCompactas}
                          className="touch shrink-0 px-1.5 text-xs leading-none"
                          style={{ color: statsCompactas ? 'var(--accent)' : 'var(--text-dim)' }}
                        >
                          {statsCompactas ? '▢' : '—'}
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                  <StatsPanel
                    weapon={weapon}
                    stats={stats}
                    base={base}
                    showBase={compareWithBase}
                    compact={statsCompactas}
                  />
                </Painel>

                {/*
                  A secundária entra logo abaixo, na mesma coluna: números moram
                  aqui, e comparar as duas armas exige que estejam à mesma
                  distância do olho.
                */}
                {sidearm && sidearmStats && sidearmBase && (
                  <Painel padding={10}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="label">
                        Secundária ·{' '}
                        <span style={{ color: 'var(--text-soft)' }}>{sidearm.name}</span>
                      </h2>
                      {/* O mesmo interruptor do bloco de cima: as duas armas
                          respondem juntas, porque a comparação com a de fábrica
                          é um modo de leitura, não uma opção por arma. */}
                      <ComparaComFabrica checked={compareWithBase} onChange={toggleBaseComparison} />
                    </div>
                    <StatsPanel
                      weapon={sidearm}
                      stats={sidearmStats}
                      base={sidearmBase}
                      showBase={compareWithBase}
                      compact
                    />
                  </Painel>
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
              className={`${tab === 'numeros' ? 'grid' : 'hidden lg:grid'} gap-3 ${larguraTotal} lg:grid-cols-2`}
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
          <div className={`${tab === 'classe' ? 'block' : 'hidden lg:block'} ${larguraTotal}`}>
            <Painel>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
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
            </Painel>
          </div>
        </div>

        {/* `pb-safe-nav`: no celular a barra de abas cobre o pé da página. */}
        <SiteFooter className="pb-safe-nav lg:pb-6" />
      </main>

      {/*
        Navegação por abas, só no celular.
        `Segmented` em vez dos `Tabs` do antd: as abas do antd trazem a faixa de
        conteúdo junto, e aqui o conteúdo está espalhado pela grade da página —
        o que a barra faz é trocar quais colunas aparecem.
      */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t px-2 pt-1.5 backdrop-blur lg:hidden"
        style={{ background: 'color-mix(in oklab, var(--bg) 92%, transparent)', borderColor: 'var(--border)' }}
        aria-label="Seções do montador"
      >
        <Segmented
          block
          options={TABS}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          className="bevel-sm w-full"
        />
      </nav>

      <Modal
        open={choosingSidearm}
        onCancel={() => setChoosingSidearm(false)}
        footer={null}
        title={<span className="font-display text-lg font-semibold">Arma secundária</span>}
        aria-label="Escolher arma secundária"
        className="bevel"
        width={480}
        styles={{ body: { maxHeight: '70dvh', overflowY: 'auto' } }}
        destroyOnHidden
      >
        <WeaponSelector
          title="Pistolas e corpo a corpo"
          selected={loadout.sidearm}
          categories={['pistol', 'melee']}
          onSelect={(id) => {
            setSidearm(id);
            setChoosingSidearm(false);
          }}
        />
      </Modal>
    </div>
  );
}

/**
 * O bloco padrão da tela.
 *
 * Existia como `<div className="card bevel p-3">` repetido uma dúzia de vezes.
 * Virou `Card` do antd, e o molde ficou num lugar só — a borda e o recuo param
 * de divergir de bloco para bloco a cada mexida.
 */
function Painel({
  children,
  className = '',
  padding = 12,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: number;
}) {
  return (
    <Card
      variant="outlined"
      className={`card bevel ${className}`}
      styles={{ body: { padding } }}
      style={{ borderColor: 'var(--border-soft)' }}
    >
      {children}
    </Card>
  );
}

/** O interruptor da leitura comparada, igual nos dois blocos de estatística. */
function ComparaComFabrica({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <Checkbox
      checked={checked}
      onChange={onChange}
      className="text-[11px]"
      style={{ color: 'var(--text-dim)' }}
    >
      <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
        comparar com a de fábrica
      </span>
    </Checkbox>
  );
}

function EmptyState() {
  return (
    <Painel className="flex min-h-[180px] items-center justify-center" padding={24}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Escolha uma arma para começar a montar.
          </span>
        }
      />
    </Painel>
  );
}

function ApproximateNotice() {
  return (
    <Alert
      type="info"
      className="bevel-sm"
      message={
        <span className="text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--accent)' }}>≈ valores aproximados.</strong> O jogo não expõe
          os multiplicadores exatos de alguns acessórios e armas. Esses números foram calibrados a
          partir das descrições de efeito no jogo e de medições da comunidade — servem para comparar
          builds, não como medida oficial.
        </span>
      }
    />
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
  /*
   * Tudo aqui é uma versão reduzida do que a arma principal tem: a foto menor,
   * o resumo em uma linha, o medidor dividindo a linha com o "Limpar". A
   * secundária decide menos partidas que a principal, e a tela precisa dizer
   * isso antes de o jogador ler qualquer número.
   */
  return (
    <section className="space-y-2">
      <Painel padding={10}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="label">Arma secundária</h2>
          <Button
            type="link"
            size="small"
            onClick={onOpenPicker}
            className="px-1 text-xs underline"
            style={{ color: 'var(--text-dim)' }}
          >
            {sidearm ? 'Trocar' : 'Escolher'}
          </Button>
        </div>

        {sidearm ? (
          <>
            <button
              type="button"
              onClick={onOpenPicker}
              className="tile bevel-sm flex w-full items-center gap-2 p-1.5 text-left"
              style={{ border: '1px solid var(--border-soft)' }}
            >
              <WeaponPreview weapon={sidearm} className="w-20 shrink-0" />
              <span className="min-w-0">
                <span className="font-display block text-sm leading-tight font-semibold tracking-wide">
                  {sidearm.name}
                </span>
                <span
                  className="line-clamp-1 block text-[11px]"
                  style={{ color: 'var(--text-dim)' }}
                >
                  {sidearm.summary}
                </span>
              </span>
            </button>

            {sidearm.slots.length > 0 && (
              <div className="mt-2 flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <BudgetBar budget={budget} />
                </div>
                <Button
                  type="link"
                  size="small"
                  onClick={onClear}
                  className="shrink-0 px-1 text-xs underline"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Limpar
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
            Nenhuma secundária escolhida. Pistolas também aceitam acessórios, com seis blocos de
            pontos em vez dos dez da arma principal.
          </p>
        )}
      </Painel>

      {sidearm && (
        <SlotsPanel
          weapon={sidearm}
          chosen={chosen}
          onSelect={onSelectAttachment}
          currentSpend={budget.spent}
          compact
        />
      )}
    </section>
  );
}
