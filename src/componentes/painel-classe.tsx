'use client';

import { ARMAS_POR_ID } from '@/dados/armas';
import { CLASSES } from '@/dados/classes';
import { arremessaveis, gadgetsDaClasse } from '@/dados/gadgets';
import type { Gadget, IdClasse } from '@/dados/tipos';

/**
 * Classe, gadgets e arremessável.
 *
 * A classe define o equipamento disponível e qual categoria de arma recebe o
 * bônus de manejo — por isso ela aparece junto do resto do loadout, e não
 * escondida em outra tela.
 */

export function SeletorClasse({
  atual,
  aoEscolher,
}: {
  atual: IdClasse;
  aoEscolher: (classe: IdClasse) => void;
}) {
  const classe = CLASSES.find((c) => c.id === atual)!;

  return (
    <section>
      <h2 className="rotulo mb-2">Classe</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {CLASSES.map((c) => {
          const ativa = c.id === atual;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => aoEscolher(c.id)}
              aria-pressed={ativa}
              className="chanfro-sm toque px-2 py-2 text-center transition-colors"
              style={{
                background: ativa ? `color-mix(in oklab, ${c.cor} 20%, var(--superficie))` : 'var(--superficie)',
                border: `1px solid ${ativa ? c.cor : 'var(--borda-suave)'}`,
              }}
            >
              <span
                className="font-display block text-sm font-semibold tracking-wide"
                style={{ color: ativa ? c.cor : 'var(--texto-suave)' }}
              >
                {c.nome}
              </span>
              <span className="block text-[10px]" style={{ color: 'var(--texto-fraco)' }}>
                {c.papel}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[12px] leading-snug" style={{ color: 'var(--texto-suave)' }}>
        {classe.resumo}
      </p>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--texto-fraco)' }}>
        <strong style={{ color: classe.cor }}>Traço:</strong> {classe.traco}
      </p>
    </section>
  );
}

function ListaEquipamento({
  titulo,
  itens,
  selecionado,
  aoEscolher,
  vazioPermitido = true,
}: {
  titulo: string;
  itens: Gadget[];
  selecionado: string | null;
  aoEscolher: (id: string | null) => void;
  vazioPermitido?: boolean;
}) {
  return (
    <div>
      <h3 className="rotulo mb-1.5">{titulo}</h3>
      <ul className="grid gap-1">
        {vazioPermitido && (
          <li>
            <button
              type="button"
              onClick={() => aoEscolher(null)}
              aria-pressed={selecionado === null}
              className="toque w-full px-2.5 py-1.5 text-left text-sm"
              style={{ color: selecionado === null ? 'var(--texto)' : 'var(--texto-fraco)' }}
            >
              Nenhum
            </button>
          </li>
        )}
        {itens.map((item) => {
          const ativo = item.id === selecionado;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => aoEscolher(item.id)}
                aria-pressed={ativo}
                className="chanfro-sm toque w-full px-2.5 py-1.5 text-left transition-colors"
                style={{
                  background: ativo ? 'color-mix(in oklab, var(--destaque) 18%, transparent)' : 'transparent',
                }}
              >
                <span className="block text-sm font-medium">{item.nome}</span>
                <span className="block text-[11px] leading-snug" style={{ color: 'var(--texto-fraco)' }}>
                  {item.descricao}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PainelEquipamento({
  classe,
  gadget1,
  gadget2,
  granada,
  secundaria,
  aoDefinirGadget,
  aoDefinirGranada,
  aoAbrirSecundaria,
}: {
  classe: IdClasse;
  gadget1: string | null;
  gadget2: string | null;
  granada: string | null;
  secundaria: string | null;
  aoDefinirGadget: (posicao: 1 | 2, id: string | null) => void;
  aoDefinirGranada: (id: string | null) => void;
  aoAbrirSecundaria: () => void;
}) {
  const gadgets = gadgetsDaClasse(classe);
  const arma = secundaria ? ARMAS_POR_ID.get(secundaria) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <h3 className="rotulo mb-1.5">Arma secundária</h3>
        <button
          type="button"
          onClick={aoAbrirSecundaria}
          className="cartao chanfro-sm toque flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-sm" style={{ color: arma ? 'var(--texto)' : 'var(--texto-fraco)' }}>
            {arma ? arma.nome : 'Escolher secundária'}
          </span>
          <span aria-hidden style={{ color: 'var(--texto-fraco)' }}>
            ›
          </span>
        </button>
      </div>

      <ListaEquipamento
        titulo="Gadget 1"
        itens={gadgets}
        selecionado={gadget1}
        aoEscolher={(id) => aoDefinirGadget(1, id)}
      />
      <ListaEquipamento
        titulo="Gadget 2"
        itens={gadgets.filter((g) => g.id !== gadget1)}
        selecionado={gadget2}
        aoEscolher={(id) => aoDefinirGadget(2, id)}
      />
      <ListaEquipamento
        titulo="Arremessável"
        itens={arremessaveis()}
        selecionado={granada}
        aoEscolher={aoDefinirGranada}
      />
    </div>
  );
}
