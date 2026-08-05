'use client';

import {
  alcanceEfetivo,
  danoPorDisparo,
  danoPorSegundo,
  intervaloDisparo,
  tempoParaEliminar,
  tirosParaEliminar,
} from '@/lib/balistica';
import { compararStat, type StatsEfetivos } from '@/lib/stats';
import type { Arma } from '@/dados/tipos';

/**
 * Painel de estatísticas.
 *
 * Cada valor aparece junto do quanto mudou em relação à arma de fábrica, com a
 * cor indicando se a mudança favorece ou não o jogador — é a leitura que
 * responde à pergunta "esse acessório valeu a pena?".
 */

function Seta({ melhora }: { melhora: boolean }) {
  return (
    <span aria-hidden style={{ color: melhora ? 'var(--color-positivo)' : 'var(--color-negativo)' }}>
      {melhora ? '▲' : '▼'}
    </span>
  );
}

function Barra({
  rotulo,
  chave,
  valor,
  base,
  mostrarBase,
}: {
  rotulo: string;
  chave: keyof StatsEfetivos;
  valor: number;
  base: number;
  mostrarBase: boolean;
}) {
  const delta = compararStat(chave, base, valor);
  const mostra = mostrarBase && delta.mudou;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="rotulo">{rotulo}</span>
        <span className="flex items-baseline gap-1.5 font-mono text-sm">
          {mostra && (
            <span
              className="text-[11px]"
              style={{ color: delta.melhora ? 'var(--color-positivo)' : 'var(--color-negativo)' }}
            >
              <Seta melhora={delta.melhora} /> {delta.diferenca > 0 ? '+' : ''}
              {Math.round(delta.diferenca)}
            </span>
          )}
          <span>{Math.round(valor)}</span>
        </span>
      </div>
      {/*
        A barra conta a história em três partes: o trecho que a arma já tinha
        fica em âmbar, o que o acessório acrescentou entra em verde à frente
        dele, e o que ele tirou aparece em vermelho no lugar que a barra perdeu.
        O risco branco marca onde estava o valor de fábrica.
      */}
      <div className="relative h-2.5 overflow-hidden" style={{ background: 'var(--borda-suave)' }}>
        <span
          className="absolute top-0 left-0 h-full transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.min(base, valor))}%`, background: 'var(--destaque)' }}
        />

        {mostra && delta.melhora && (
          <span
            className="absolute top-0 h-full transition-all duration-300"
            style={{
              left: `${Math.min(100, base)}%`,
              width: `${Math.max(0, Math.min(100, valor) - Math.min(100, base))}%`,
              background: 'var(--color-positivo)',
            }}
          />
        )}

        {mostra && !delta.melhora && (
          <span
            className="absolute top-0 h-full transition-all duration-300"
            style={{
              left: `${Math.min(100, valor)}%`,
              width: `${Math.max(0, Math.min(100, base) - Math.min(100, valor))}%`,
              background: 'var(--color-negativo)',
              opacity: 0.45,
            }}
          />
        )}

        {mostra && (
          <span
            className="absolute top-0 h-full w-[2px] transition-[left] duration-300"
            title={`Valor de fábrica: ${Math.round(base)}`}
            style={{ left: `${Math.min(100, base)}%`, background: '#ffffff', boxShadow: '0 0 0 1px rgb(0 0 0 / 0.35)' }}
          />
        )}
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  chave,
  valor,
  base,
  unidade,
  casas = 0,
  mostrarBase,
}: {
  rotulo: string;
  chave: keyof StatsEfetivos;
  valor: number;
  base: number;
  unidade?: string;
  casas?: number;
  mostrarBase: boolean;
}) {
  const delta = compararStat(chave, base, valor);
  const mostra = mostrarBase && delta.mudou;

  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--borda-suave)' }}>
      <span className="text-sm" style={{ color: 'var(--texto-suave)' }}>
        {rotulo}
      </span>
      <span className="flex items-baseline gap-1.5">
        {mostra && (
          <span
            className="font-mono text-[11px] whitespace-nowrap"
            style={{ color: delta.melhora ? 'var(--color-positivo)' : 'var(--color-negativo)' }}
            title={`De fábrica: ${base.toFixed(casas)}${unidade ? ` ${unidade}` : ''}`}
          >
            <Seta melhora={delta.melhora} />
            {delta.diferenca > 0 ? '+' : ''}
            {delta.diferenca.toFixed(casas)} ({delta.percentual > 0 ? '+' : ''}
            {delta.percentual.toFixed(0)}%)
          </span>
        )}
        <span className="font-mono text-sm">
          {valor.toFixed(casas)}
          {unidade && <span style={{ color: 'var(--texto-fraco)' }}> {unidade}</span>}
        </span>
      </span>
    </div>
  );
}

/**
 * Valor derivado — tempo para matar, alcance efetivo e afins. Não vem de um
 * campo das estatísticas, então a comparação com a arma de fábrica é calculada
 * aqui a partir dos dois valores já prontos.
 */
function Derivado({
  rotulo,
  valor,
  detalhe,
  bruto,
  brutoBase,
  menorMelhor = false,
  sufixo = '',
  casas = 0,
  mostrarBase,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  /** Número por trás do texto, usado para calcular o ganho ou a perda. */
  bruto?: number;
  brutoBase?: number;
  menorMelhor?: boolean;
  sufixo?: string;
  casas?: number;
  mostrarBase: boolean;
}) {
  const comparavel =
    mostrarBase &&
    bruto !== undefined &&
    brutoBase !== undefined &&
    Number.isFinite(bruto) &&
    Number.isFinite(brutoBase) &&
    Math.abs(bruto - brutoBase) > 1e-6;

  const diferenca = comparavel ? bruto - brutoBase : 0;
  const melhora = menorMelhor ? diferenca < 0 : diferenca > 0;
  const percentual = comparavel && brutoBase !== 0 ? (diferenca / brutoBase) * 100 : 0;

  return (
    <div className="cartao chanfro-sm px-3 py-2">
      <p className="rotulo">{rotulo}</p>
      <p className="font-mono text-lg leading-tight">{valor}</p>
      {comparavel && (
        <p
          className="font-mono text-[11px] whitespace-nowrap"
          style={{ color: melhora ? 'var(--color-positivo)' : 'var(--color-negativo)' }}
          title={`De fábrica: ${brutoBase.toFixed(casas)}${sufixo}`}
        >
          <Seta melhora={melhora} />
          {diferenca > 0 ? '+' : ''}
          {diferenca.toFixed(casas)}
          {sufixo}
          {brutoBase !== 0 && ` (${percentual > 0 ? '+' : ''}${percentual.toFixed(0)}%)`}
        </p>
      )}
      {detalhe && (
        <p className="text-[11px]" style={{ color: 'var(--texto-fraco)' }}>
          {detalhe}
        </p>
      )}
    </div>
  );
}

export function PainelStats({
  arma,
  stats,
  base,
  mostrarBase,
}: {
  arma: Arma;
  stats: StatsEfetivos;
  base: StatsEfetivos;
  mostrarBase: boolean;
}) {
  const corpoACorpo = arma.categoria === 'corpo-a-corpo';
  const ttk = tempoParaEliminar(stats, 0);
  const tiros = tirosParaEliminar(stats, 0);
  const tirosCabeca = tirosParaEliminar(stats, 0, true);
  const alcance = alcanceEfetivo(stats);

  return (
    <div className="space-y-4">
      {!corpoACorpo && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Derivado
            rotulo="Tempo para matar"
            valor={Number.isFinite(ttk) ? `${Math.round(ttk)} ms` : '—'}
            detalhe={`${tiros} tiros de perto`}
          />
          <Derivado rotulo="Na cabeça" valor={`${tirosCabeca} ${tirosCabeca === 1 ? 'tiro' : 'tiros'}`} detalhe={`×${stats.headshot} de dano`} />
          <Derivado
            rotulo="Alcance efetivo"
            valor={alcance > 0 ? `${Math.round(alcance)} m` : 'constante'}
            detalhe={alcance > 0 ? 'até precisar de mais um tiro' : 'mesmo dano em toda distância'}
          />
          <Derivado
            rotulo="Dano por segundo"
            valor={Math.round(danoPorSegundo(stats)).toString()}
            detalhe={`${(intervaloDisparo(stats) || 0).toFixed(0)} ms entre tiros`}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-3">
          <Barra rotulo="Precisão" chave="precisao" valor={stats.precisao} base={base.precisao} mostrarBase={mostrarBase} />
          <Barra rotulo="Controle" chave="controle" valor={stats.controle} base={base.controle} mostrarBase={mostrarBase} />
          <Barra rotulo="Mobilidade" chave="mobilidade" valor={stats.mobilidade} base={base.mobilidade} mostrarBase={mostrarBase} />
          <Barra rotulo="Tiro de quadril" chave="hipfire" valor={stats.hipfire} base={base.hipfire} mostrarBase={mostrarBase} />
        </div>

        <div>
          {!corpoACorpo && (
            <>
              <Numero
                rotulo="Dano de perto"
                chave="dano"
                valor={danoPorDisparo(stats, 0)}
                base={danoPorDisparo(base, 0)}
                casas={1}
                mostrarBase={mostrarBase}
              />
              <Numero rotulo="Cadência" chave="rpm" valor={stats.rpm} base={base.rpm} unidade="RPM" mostrarBase={mostrarBase} />
              <Numero
                rotulo="Velocidade da bala"
                chave="velocidade"
                valor={stats.velocidade}
                base={base.velocidade}
                unidade="m/s"
                mostrarBase={mostrarBase}
              />
              <Numero
                rotulo="Carregador"
                chave="carregador"
                valor={stats.carregador}
                base={base.carregador}
                unidade="tiros"
                mostrarBase={mostrarBase}
              />
              <Numero
                rotulo="Recarga"
                chave="recarga"
                valor={stats.recarga}
                base={base.recarga}
                unidade="s"
                casas={2}
                mostrarBase={mostrarBase}
              />
              <Numero
                rotulo="Recarga com a arma vazia"
                chave="recargaVazia"
                valor={stats.recargaVazia}
                base={base.recargaVazia}
                unidade="s"
                casas={2}
                mostrarBase={mostrarBase}
              />
              <Numero
                rotulo="Tempo de mira"
                chave="adsMs"
                valor={stats.adsMs}
                base={base.adsMs}
                unidade="ms"
                mostrarBase={mostrarBase}
              />
            </>
          )}
          <Numero
            rotulo="Troca de arma"
            chave="trocaMs"
            valor={stats.trocaMs}
            base={base.trocaMs}
            unidade="ms"
            mostrarBase={mostrarBase}
          />
          {!corpoACorpo && (
            <>
              <Numero
                rotulo="Recuo vertical"
                chave="recuoV"
                valor={stats.recuoV}
                base={base.recuoV}
                casas={2}
                mostrarBase={mostrarBase}
              />
              <Numero
                rotulo="Recuo horizontal"
                chave="recuoH"
                valor={stats.recuoH}
                base={base.recuoH}
                casas={2}
                mostrarBase={mostrarBase}
              />
            </>
          )}
        </div>
      </div>

      {!corpoACorpo && (
        <div className="cartao chanfro-sm p-3">
          <p className="rotulo mb-1.5">Dano por faixa de distância</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
            {stats.dano.map((degrau, i) => {
              const proxima = stats.dano[i + 1];
              const dano = degrau.dano * stats.projeteis;
              return (
                <span key={i}>
                  <span style={{ color: 'var(--texto-fraco)' }}>
                    {Math.round(degrau.distancia)}
                    {proxima ? `–${Math.round(proxima.distancia)}` : '+'} m
                  </span>{' '}
                  {dano.toFixed(1)}
                  <span style={{ color: 'var(--texto-fraco)' }}> ({Math.ceil(100 / dano)}×)</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
