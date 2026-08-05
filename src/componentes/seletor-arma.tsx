'use client';

import { useMemo, useState } from 'react';
import { ARMAS, CATEGORIAS_ORDEM } from '@/dados/armas';
import { CLASSES, NOMES_CATEGORIA, NOMES_CATEGORIA_CURTO } from '@/dados/classes';
import type { Arma, CategoriaArma } from '@/dados/tipos';

/**
 * Escolha da arma.
 *
 * O menu do site que serviu de referência esconde as armas atrás de vários
 * cliques. Aqui tudo fica em uma tela: busca, filtro por categoria e a lista
 * inteira, com o essencial de cada arma visível antes de escolher.
 */

/** Remove acentos para que "precisao" encontre "precisão". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function SeletorArma({
  selecionada,
  aoEscolher,
  categorias = CATEGORIAS_ORDEM,
  titulo = 'Arma principal',
}: {
  selecionada: string | null;
  aoEscolher: (id: string) => void;
  categorias?: CategoriaArma[];
  titulo?: string;
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<CategoriaArma | 'todas'>('todas');

  const disponiveis = useMemo(
    () => ARMAS.filter((a) => categorias.includes(a.categoria)),
    [categorias],
  );

  const resultado = useMemo(() => {
    const termo = normalizar(busca.trim());
    return disponiveis.filter((arma) => {
      if (filtro !== 'todas' && arma.categoria !== filtro) return false;
      if (!termo) return true;
      return (
        normalizar(arma.nome).includes(termo) ||
        normalizar(NOMES_CATEGORIA[arma.categoria]).includes(termo) ||
        normalizar(arma.resumo).includes(termo)
      );
    });
  }, [disponiveis, busca, filtro]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<CategoriaArma, Arma[]>();
    for (const arma of resultado) {
      const lista = mapa.get(arma.categoria) ?? [];
      lista.push(arma);
      mapa.set(arma.categoria, lista);
    }
    return mapa;
  }, [resultado]);

  const categoriasComArmas = categorias.filter((c) => disponiveis.some((a) => a.categoria === c));

  return (
    <section>
      <h2 className="rotulo mb-2">{titulo}</h2>

      <label className="block">
        <span className="sr-only">Buscar arma</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar arma…"
          className="chanfro-sm toque w-full px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--superficie-alta)', border: '1px solid var(--borda)' }}
        />
      </label>

      <div className="rolagem-oculta -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Chip ativo={filtro === 'todas'} aoClicar={() => setFiltro('todas')}>
          Todas
        </Chip>
        {categoriasComArmas.map((c) => (
          <Chip key={c} ativo={filtro === c} aoClicar={() => setFiltro(c)}>
            {NOMES_CATEGORIA_CURTO[c]}
          </Chip>
        ))}
      </div>

      <div className="mt-3 space-y-4">
        {[...porCategoria.entries()].map(([categoria, armas]) => (
          <div key={categoria}>
            <h3 className="rotulo mb-1.5">{NOMES_CATEGORIA[categoria]}</h3>
            <ul className="grid gap-1.5">
              {armas.map((arma) => (
                <li key={arma.id}>
                  <CartaoArma
                    arma={arma}
                    selecionada={arma.id === selecionada}
                    aoEscolher={() => aoEscolher(arma.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {resultado.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--texto-fraco)' }}>
            Nenhuma arma encontrada para “{busca}”.
          </p>
        )}
      </div>
    </section>
  );
}

function Chip({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className="chanfro-sm shrink-0 px-3 py-2 text-xs whitespace-nowrap transition-colors"
      style={{
        background: ativo ? 'var(--destaque)' : 'var(--superficie-alta)',
        color: ativo ? '#14170f' : 'var(--texto-suave)',
        border: `1px solid ${ativo ? 'var(--destaque)' : 'var(--borda)'}`,
        fontWeight: ativo ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

function CartaoArma({
  arma,
  selecionada,
  aoEscolher,
}: {
  arma: Arma;
  selecionada: boolean;
  aoEscolher: () => void;
}) {
  const classe = CLASSES.find((c) => c.id === arma.classeAssinatura);

  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={selecionada}
      className="chanfro-sm toque w-full px-3 py-2 text-left transition-colors"
      style={{
        background: selecionada ? 'color-mix(in oklab, var(--destaque) 16%, var(--superficie))' : 'var(--superficie)',
        border: `1px solid ${selecionada ? 'var(--destaque)' : 'var(--borda-suave)'}`,
      }}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display text-base font-semibold tracking-wide">{arma.nome}</span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
          {arma.categoria === 'corpo-a-corpo' ? '—' : `${arma.rpm} RPM`}
        </span>
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
        {classe && <span style={{ color: classe.cor }}>{classe.nome}</span>}
        {arma.temporada > 0 && <span>Temporada {arma.temporada}</span>}
        {arma.procedencia === 'curado' && <span title="Valores aproximados">≈</span>}
      </span>
    </button>
  );
}
