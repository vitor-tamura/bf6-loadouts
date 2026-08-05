'use client';

import { useEffect, useMemo, useState } from 'react';
import { BotaoCompartilhar } from '@/componentes/compartilhar';
import { GraficoDano, GraficoQueda } from '@/componentes/graficos';
import { PainelEquipamento, SeletorClasse } from '@/componentes/painel-classe';
import { PainelSlots, BarraPontos } from '@/componentes/painel-slots';
import { PainelStats } from '@/componentes/painel-stats';
import { PreviewArma } from '@/componentes/preview-arma';
import { SeletorArma } from '@/componentes/seletor-arma';
import { ARMAS_POR_ID, CATEGORIAS_PRIMARIAS } from '@/dados/armas';
import { distanciaDeAnalise } from '@/lib/balistica';
import { acessoriosDoLoadout } from '@/lib/loadout';
import { calcularOrcamento, calcularStats, statsBase, temValorAproximado } from '@/lib/stats';
import { useLoadout, useSincronizarUrl } from '@/estado/loadout';

/**
 * Montador de loadout.
 *
 * No computador as três colunas ficam visíveis ao mesmo tempo — escolher a arma,
 * montar e ler o resultado sem nenhum menu escondido. No celular o preview fica
 * fixo no topo e o resto se divide em abas, para que cada tela peça uma decisão
 * de cada vez.
 */

type Aba = 'arma' | 'montar' | 'classe' | 'numeros';

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'arma', nome: 'Arma' },
  { id: 'montar', nome: 'Montar' },
  { id: 'classe', nome: 'Classe' },
  { id: 'numeros', nome: 'Números' },
];

export default function Montador() {
  useSincronizarUrl();

  const loadout = useLoadout((s) => s.loadout);
  const compararComBase = useLoadout((s) => s.compararComBase);
  const definirArma = useLoadout((s) => s.definirArma);
  const definirAcessorio = useLoadout((s) => s.definirAcessorio);
  const definirClasse = useLoadout((s) => s.definirClasse);
  const definirSecundaria = useLoadout((s) => s.definirSecundaria);
  const definirGadget = useLoadout((s) => s.definirGadget);
  const definirGranada = useLoadout((s) => s.definirGranada);
  const alternarComparacao = useLoadout((s) => s.alternarComparacao);
  const limparAcessorios = useLoadout((s) => s.limparAcessorios);

  const [aba, setAba] = useState<Aba>('arma');
  const [escolhendoSecundaria, setEscolhendoSecundaria] = useState(false);
  const [temaClaro, setTemaClaro] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.tema = temaClaro ? 'claro' : 'escuro';
  }, [temaClaro]);

  const arma = loadout.arma ? (ARMAS_POR_ID.get(loadout.arma) ?? null) : null;
  const acessorios = useMemo(() => acessoriosDoLoadout(loadout, arma), [loadout, arma]);
  const stats = useMemo(() => (arma ? calcularStats(arma, acessorios) : null), [arma, acessorios]);
  const base = useMemo(() => (arma ? statsBase(arma) : null), [arma]);
  const orcamento = useMemo(() => calcularOrcamento(acessorios), [acessorios]);
  const distancia = useMemo(() => (stats ? distanciaDeAnalise(stats) : 100), [stats]);
  const aproximado = arma ? temValorAproximado(arma, acessorios) : false;

  // Ao escolher a arma no celular, a próxima decisão é montar.
  function escolherArma(id: string) {
    definirArma(id);
    setAba('montar');
  }

  return (
    <div className="min-h-dvh">
      <Cabecalho
        subtitulo={arma ? arma.nome : 'Montador de loadouts'}
        acoes={<BotaoCompartilhar loadout={loadout} desabilitado={!arma} />}
      />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        {/* Preview: sempre visível, é a resposta imediata a cada acessório. */}
        {arma && (
          <div className="cartao chanfro sticky top-[64px] z-20 mb-3 p-2 lg:static">
            {/* Largura limitada: com a proporção 8:3 do quadro, deixar o preview
                ocupar 1600 px transformaria a arma em um painel de 600 px de
                altura e empurraria todo o resto para fora da tela. */}
            <PreviewArma
              arma={arma}
              acessorios={acessorios}
              comRotulo
              className="mx-auto w-full max-w-[560px] lg:max-w-[760px]"
            />
          </div>
        )}

        {/* `min-w-0` nos filhos: sem isso, itens de grid usam a largura mínima do
            conteúdo e a barra de filtros rolável estica a página inteira,
            criando rolagem horizontal no celular. */}
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(300px,380px)]">
          {/* Coluna 1 — escolha da arma */}
          <div className={aba === 'arma' ? 'block' : 'hidden lg:block'}>
            {/* No computador a lista rola dentro da própria coluna: com 63 armas,
                deixá-la esticar faria a página inteira crescer sem necessidade. */}
            <div className="cartao chanfro p-3 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto">
              <SeletorArma
                selecionada={loadout.arma}
                aoEscolher={escolherArma}
                categorias={CATEGORIAS_PRIMARIAS}
              />
            </div>
          </div>

          {/* Coluna 2 — montagem */}
          <div className={aba === 'montar' ? 'block' : 'hidden lg:block'}>
            {arma ? (
              <div className="space-y-3">
                <div className="cartao chanfro p-3">
                  <BarraPontos orcamento={orcamento} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[12px] leading-snug" style={{ color: 'var(--texto-suave)' }}>
                      {arma.resumo}
                    </p>
                    <button
                      type="button"
                      onClick={limparAcessorios}
                      className="toque shrink-0 px-2 text-xs underline"
                      style={{ color: 'var(--texto-fraco)' }}
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <PainelSlots
                  arma={arma}
                  escolhidos={loadout.acessorios}
                  aoEscolher={definirAcessorio}
                  gastoAtual={orcamento.gasto}
                />
              </div>
            ) : (
              <VazioInicial />
            )}
          </div>

          {/* Coluna 3 — números e gráficos */}
          <div className={aba === 'numeros' ? 'block' : 'hidden lg:block'}>
            {arma && stats && base ? (
              <div className="space-y-3">
                <div className="cartao chanfro p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="rotulo">Estatísticas</h2>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
                      <input
                        type="checkbox"
                        checked={compararComBase}
                        onChange={alternarComparacao}
                        className="accent-[var(--destaque)]"
                      />
                      comparar com a de fábrica
                    </label>
                  </div>
                  <PainelStats arma={arma} stats={stats} base={base} mostrarBase={compararComBase} />
                </div>

                {aproximado && <AvisoAproximado />}
              </div>
            ) : (
              <VazioInicial />
            )}
          </div>

          {/* Gráficos: faixa larga no computador, para o texto dos eixos continuar
              legível; no celular seguem dentro da aba Números. */}
          {arma && stats && base && arma.categoria !== 'corpo-a-corpo' && (
            <div
              className={`${aba === 'numeros' ? 'grid' : 'hidden lg:grid'} gap-3 lg:col-span-3 lg:grid-cols-2`}
            >
              <GraficoDano
                stats={stats}
                base={base}
                distanciaMax={distancia}
                mostrarBase={compararComBase}
              />
              <GraficoQueda
                stats={stats}
                base={base}
                distanciaMax={distancia}
                mostrarBase={compararComBase}
              />
            </div>
          )}

          {/* Classe e equipamento: coluna própria no celular, rodapé no desktop */}
          <div className={`${aba === 'classe' ? 'block' : 'hidden lg:block'} lg:col-span-3`}>
            <div className="cartao chanfro grid gap-4 p-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <SeletorClasse atual={loadout.classe} aoEscolher={definirClasse} />
              <PainelEquipamento
                classe={loadout.classe}
                gadget1={loadout.gadget1}
                gadget2={loadout.gadget2}
                granada={loadout.granada}
                secundaria={loadout.secundaria}
                aoDefinirGadget={definirGadget}
                aoDefinirGranada={definirGranada}
                aoAbrirSecundaria={() => setEscolhendoSecundaria(true)}
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
        {ABAS.map((item) => {
          const ativa = aba === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              aria-current={ativa ? 'page' : undefined}
              className="toque py-2 text-xs font-semibold"
              style={{
                color: ativa ? 'var(--destaque)' : 'var(--texto-fraco)',
                borderTop: `2px solid ${ativa ? 'var(--destaque)' : 'transparent'}`,
              }}
            >
              {item.nome}
            </button>
          );
        })}
      </nav>

      {escolhendoSecundaria && (
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
            <SeletorArma
              titulo="Pistolas e corpo a corpo"
              selecionada={loadout.secundaria}
              categorias={['pistola', 'corpo-a-corpo']}
              aoEscolher={(id) => {
                definirSecundaria(id);
                setEscolhendoSecundaria(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function VazioInicial() {
  return (
    <div className="cartao chanfro flex min-h-[180px] items-center justify-center p-6 text-center">
      <p className="text-sm" style={{ color: 'var(--texto-fraco)' }}>
        Escolha uma arma para começar a montar.
      </p>
    </div>
  );
}

function AvisoAproximado() {
  return (
    <p className="cartao chanfro-sm p-3 text-[11px] leading-snug" style={{ color: 'var(--texto-fraco)' }}>
      <strong style={{ color: 'var(--destaque)' }}>≈ valores aproximados.</strong> O jogo não expõe os
      multiplicadores exatos de alguns acessórios e armas. Esses números foram calibrados a partir das
      descrições de efeito no jogo e de medições da comunidade — servem para comparar builds, não como
      medida oficial.
    </p>
  );
}
