'use client';

import { useState } from 'react';
import { acessoriosDaArma } from '@/dados/acessorios';
import { ORCAMENTO_PONTOS, SLOTS_POR_ID } from '@/dados/classes';
import type { Acessorio, Arma, ChaveStat, IdSlot } from '@/dados/tipos';
import { MENOR_EH_MELHOR, type Orcamento } from '@/lib/stats';
import { MiniaturaAcessorio } from './miniatura-acessorio';

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

const ROTULO_STAT: Record<ChaveStat, string> = {
  dano: 'dano',
  alcance: 'alcance',
  rpm: 'cadência',
  velocidade: 'velocidade',
  carregador: 'carregador',
  recarga: 'recarga',
  adsMs: 'mira',
  trocaMs: 'troca',
  precisao: 'precisão',
  controle: 'controle',
  mobilidade: 'mobilidade',
  hipfire: 'tiro de quadril',
  recuoV: 'recuo vertical',
  recuoH: 'recuo horizontal',
};

/** Transforma os modificadores em frases curtas e legíveis. */
function efeitos(acessorio: Acessorio): { texto: string; bom: boolean }[] {
  const saida: { texto: string; bom: boolean }[] = [];

  for (const [chave, mod] of Object.entries(acessorio.mods) as [
    ChaveStat,
    { add?: number; mult?: number },
  ][]) {
    const menorMelhor = MENOR_EH_MELHOR.has(chave as never);
    if (mod.add !== undefined && mod.add !== 0) {
      saida.push({
        texto: `${mod.add > 0 ? '+' : ''}${mod.add} ${ROTULO_STAT[chave]}`,
        bom: menorMelhor ? mod.add < 0 : mod.add > 0,
      });
    }
    if (mod.mult !== undefined && mod.mult !== 1) {
      const pct = Math.round((mod.mult - 1) * 100);
      if (pct === 0) continue;
      saida.push({
        texto: `${pct > 0 ? '+' : ''}${pct}% ${ROTULO_STAT[chave]}`,
        bom: menorMelhor ? pct < 0 : pct > 0,
      });
    }
  }

  return saida;
}

export function BarraPontos({ orcamento }: { orcamento: Orcamento }) {
  const proporcao = Math.min(100, (orcamento.gasto / orcamento.total) * 100);
  const apertado = orcamento.restante <= 10;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="rotulo">Pontos de personalização</span>
        <span className="font-mono text-sm">
          <span style={{ color: apertado ? 'var(--destaque)' : 'var(--texto)' }}>{orcamento.gasto}</span>
          <span style={{ color: 'var(--texto-fraco)' }}> / {orcamento.total}</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden" style={{ background: 'var(--borda-suave)' }}>
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${proporcao}%`,
            background: orcamento.estourado ? 'var(--color-negativo)' : 'var(--destaque)',
          }}
        />
      </div>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
        {orcamento.estourado
          ? 'Orçamento estourado — remova alguma peça.'
          : `Restam ${orcamento.restante} pontos para gastar.`}
      </p>
    </div>
  );
}

export function PainelSlots({
  arma,
  escolhidos,
  aoEscolher,
  gastoAtual,
}: {
  arma: Arma;
  escolhidos: Partial<Record<IdSlot, string>>;
  aoEscolher: (slot: IdSlot, id: string | null) => void;
  gastoAtual: number;
}) {
  const [aberto, setAberto] = useState<IdSlot | null>(null);
  const porSlot = acessoriosDaArma(arma);

  if (porSlot.size === 0) {
    return (
      <p className="cartao chanfro p-4 text-sm" style={{ color: 'var(--texto-fraco)' }}>
        Armas de corpo a corpo não recebem acessórios.
      </p>
    );
  }

  const slotsOrdenados = ([...porSlot.keys()] as IdSlot[]).sort(
    (a, b) => (SLOTS_POR_ID.get(a)?.ordem ?? 99) - (SLOTS_POR_ID.get(b)?.ordem ?? 99),
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {slotsOrdenados.map((slot) => {
        const definicao = SLOTS_POR_ID.get(slot)!;
        const opcoes = porSlot.get(slot)!;
        const atualId = escolhidos[slot];
        const atual = opcoes.find((o) => o.id === atualId) ?? null;
        const expandido = aberto === slot;

        return (
          <div key={slot} className="contents">
            <button
              type="button"
              onClick={() => setAberto(expandido ? null : slot)}
              aria-expanded={expandido}
              className="cartao chanfro-sm flex flex-col items-center gap-1 p-2 text-center transition-colors"
              style={{
                borderColor: expandido
                  ? 'var(--destaque)'
                  : atual
                    ? 'color-mix(in oklab, var(--destaque) 45%, var(--borda-suave))'
                    : 'var(--borda-suave)',
              }}
            >
              <span className="rotulo w-full truncate">{definicao.nome}</span>

              <span
                className="flex h-14 w-full items-center justify-center"
                style={{ background: 'var(--superficie-alta)' }}
              >
                <MiniaturaAcessorio acessorio={atual} slot={slot} tamanho={52} />
              </span>

              <span
                className="line-clamp-2 w-full text-[12px] leading-tight"
                style={{ color: atual ? 'var(--texto)' : 'var(--texto-fraco)' }}
              >
                {atual ? atual.nome : 'Vazio'}
              </span>

              <span className="font-mono text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
                {atual ? `${atual.custo} pts` : '—'}
              </span>
            </button>

            {/* A lista abre na largura toda, logo abaixo da linha do bloco. */}
            {expandido && (
              <div className="col-span-full">
                <div className="cartao chanfro-sm p-2" style={{ borderColor: 'var(--destaque)' }}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold tracking-wide">
                      {definicao.nome}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setAberto(null)}
                      className="px-1 text-xs"
                      style={{ color: 'var(--texto-fraco)' }}
                    >
                      fechar
                    </button>
                  </div>
                  <p className="mb-2 text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
                    {definicao.descricao}
                  </p>

                  <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    <li>
                      <OpcaoVazia
                        slot={slot}
                        ativa={!atualId}
                        aoEscolher={() => aoEscolher(slot, null)}
                      />
                    </li>
                    {opcoes.map((opcao) => {
                      const cabe = gastoAtual - (atual?.custo ?? 0) + opcao.custo <= ORCAMENTO_PONTOS;
                      return (
                        <li key={opcao.id}>
                          <OpcaoAcessorio
                            acessorio={opcao}
                            slot={slot}
                            ativa={opcao.id === atualId}
                            cabe={cabe}
                            aoEscolher={() => aoEscolher(slot, opcao.id)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OpcaoVazia({
  slot,
  ativa,
  aoEscolher,
}: {
  slot: IdSlot;
  ativa: boolean;
  aoEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={ativa}
      className="chanfro-sm flex w-full items-center gap-2 px-2 py-2 text-left"
      style={{
        background: ativa ? 'color-mix(in oklab, var(--destaque) 18%, transparent)' : 'transparent',
        border: '1px solid var(--borda-suave)',
      }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <MiniaturaAcessorio acessorio={null} slot={slot} tamanho={32} />
      </span>
      <span className="flex-1 text-sm" style={{ color: ativa ? 'var(--texto)' : 'var(--texto-fraco)' }}>
        Vazio
      </span>
      <span className="font-mono text-xs" style={{ color: 'var(--texto-fraco)' }}>
        0 pts
      </span>
    </button>
  );
}

function OpcaoAcessorio({
  acessorio,
  slot,
  ativa,
  cabe,
  aoEscolher,
}: {
  acessorio: Acessorio;
  slot: IdSlot;
  ativa: boolean;
  cabe: boolean;
  aoEscolher: () => void;
}) {
  const lista = efeitos(acessorio);

  return (
    <button
      type="button"
      onClick={aoEscolher}
      disabled={!cabe && !ativa}
      aria-pressed={ativa}
      className="chanfro-sm flex w-full gap-2 px-2 py-2 text-left transition-colors disabled:cursor-not-allowed"
      style={{
        background: ativa ? 'color-mix(in oklab, var(--destaque) 18%, transparent)' : 'transparent',
        border: `1px solid ${ativa ? 'var(--destaque)' : 'var(--borda-suave)'}`,
        opacity: !cabe && !ativa ? 0.4 : 1,
      }}
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center"
        style={{ background: 'var(--superficie-alta)' }}
      >
        <MiniaturaAcessorio acessorio={acessorio} slot={slot} tamanho={40} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">
            {acessorio.nome}
            {acessorio.ampliacao && acessorio.ampliacao > 1 && (
              <span style={{ color: 'var(--texto-fraco)' }}> · {acessorio.ampliacao}×</span>
            )}
          </span>
          <span
            className="shrink-0 font-mono text-xs"
            style={{ color: ativa ? 'var(--destaque)' : 'var(--texto-fraco)' }}
          >
            {acessorio.custo} pts
          </span>
        </span>

        <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--texto-fraco)' }}>
          {acessorio.descricao}
        </span>

        {lista.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px]">
            {lista.map((efeito) => (
              <span
                key={efeito.texto}
                style={{ color: efeito.bom ? 'var(--color-positivo)' : 'var(--color-negativo)' }}
              >
                {efeito.texto}
              </span>
            ))}
          </span>
        )}

        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--texto-fraco)' }}>
          <span>{acessorio.nomeOriginal}</span>
          {acessorio.procedencia === 'curado' && <span title="Efeito aproximado">≈ aproximado</span>}
          {!cabe && !ativa && <span style={{ color: 'var(--color-negativo)' }}>não cabe no orçamento</span>}
        </span>
      </span>
    </button>
  );
}
