'use client';

import { Button, Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Hint } from '@/components/hint';
import { GotoIcon } from '@/components/icons/goto-icon';
import { RecommendPanel } from '@/components/recommend-panel';
import type { SlotId, Weapon } from '@/data/types';
import { DEFAULT_RANGE, idealLoadout, type LoadoutAdvice } from '@/lib/recommend';

/**
 * O botão da sugestão da comunidade.
 *
 * Um botão só: quem chega aqui quer a arma montada, não um formulário de
 * alcance. A montagem sai de um modelo que pesquisa patch notes, guias e
 * discussões do Reddit (ver `src/app/api/recommend/route.ts`), e a busca
 * falhando não deixa ninguém a pé — entra a montagem local de `idealLoadout`,
 * calculada pelas mesmas estatísticas que a tela mostra.
 *
 * A arma monta no clique, não no fim da busca. Antes o botão girava calado
 * enquanto o modelo lia a internet — quarenta, sessenta segundos de tela
 * parada, que quem estava do outro lado leu como travamento. Agora a montagem
 * local entra na hora, com os slots preenchidos e o orçamento fechado, e a
 * busca continua por baixo: quando a sugestão da comunidade chega, ela toma o
 * lugar e abre o painel. Quem não quiser esperar já saiu daqui com a arma
 * montada — e pode cancelar a espera sem perder nada.
 *
 * O painel traz o porquê de cada peça, o alcance, o consenso, o que o patch
 * mudou e uma montagem alternativa. Fechar não desfaz nada: a arma continua
 * montada, e o painel volta pelo mesmo botão, sem custar outra busca.
 *
 * O que fazer com a montagem é decisão de quem usa o componente: o montador
 * aplica nos slots, a comparação abre o montador com tudo pronto — e é por isso
 * que `opensBuilder` existe, para o botão avisar o destino com o ícone.
 *
 * Quem usa deve passar `key={weapon.id}`: trocar de arma remonta o componente,
 * apagando a leitura da arma anterior — e o pedido em voo é cancelado na saída,
 * senão uma resposta atrasada aplicaria a montagem de uma arma na outra.
 */

/**
 * O que a espera diz de si mesma.
 *
 * Spinner mudo não informa: aos vinte segundos ele é indistinguível de uma tela
 * quebrada. Cada faixa nomeia a etapa que o modelo está cumprindo naquele
 * momento, e a última assume o estouro em vez de fingir que está tudo dentro do
 * previsto. Os tempos seguem o orçamento da rota, que é de vinte e dois
 * segundos: depois disso ela desiste e o que fica é a montagem local, aplicada
 * desde o clique.
 */
const STAGES = [
  { after: 0, text: 'Montando o que a comunidade recomenda…' },
  { after: 5, text: 'Fechando a montagem…' },
  { after: 20, text: 'Passou do tempo — em instantes fica a montagem local.' },
];

const stageText = (seconds: number) => STAGES.filter((stage) => seconds >= stage.after).at(-1)!.text;

export function RecommendButton({
  weapon,
  onLoadout,
  opensBuilder = false,
}: {
  weapon: Weapon;
  onLoadout: (attachments: Partial<Record<SlotId, string>>) => void;
  opensBuilder?: boolean;
}) {
  const [fetching, setFetching] = useState(false);
  // Quanto tempo a busca já levou. É o número que prova que a tela está viva.
  const [seconds, setSeconds] = useState(0);
  // Só depois do clique o botão fica destacado — antes ele é mais um na tela.
  const [used, setUsed] = useState(false);
  const [advice, setAdvice] = useState<LoadoutAdvice | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // O relógio da espera anda de segundo em segundo, e só enquanto há espera.
  useEffect(() => {
    if (!fetching) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [fetching]);

  /** Desistir da busca. A montagem local já está aplicada e continua valendo. */
  function cancel() {
    controllerRef.current?.abort();
    setFetching(false);
    setFailure('Busca cancelada. Ficou a montagem calculada pelas estatísticas desta arma.');
  }

  async function suggest() {
    // Segunda visita à mesma arma: o painel reabre sem pagar outra busca.
    if (advice) {
      setOpen(true);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFailure(null);
    setSeconds(0);
    setFetching(true);

    /*
     * A arma monta agora, antes de qualquer resposta.
     *
     * `idealLoadout` é cálculo local sobre as estatísticas que a tela já tem:
     * custa milissegundos e devolve uma build inteira, dentro do orçamento. Ela
     * entra como montagem de partida para o clique ter efeito visível na hora;
     * a da comunidade substitui quando chegar. O caso em que a busca falha
     * deixou de ser especial — a rede de segurança já está na tela.
     */
    setUsed(true);
    onLoadout(idealLoadout(weapon));

    try {
      const response = await fetch(`/api/recommend/?weapon=${weapon.id}&range=${DEFAULT_RANGE}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        /*
         * O motivo da recusa sobe junto.
         *
         * A rota devolve `reason` no corpo — chave ausente, ambiente errado,
         * modelo fora do ar, resposta cortada. Sem isso a tela dizia sempre a
         * mesma frase, e "não veio agora" cobria desde falta de crédito até um
         * modelo que não existe: quem fosse consertar não tinha por onde
         * começar.
         */
        const body = (await response.json().catch(() => null)) as { reason?: string } | null;
        throw new Error(body?.reason ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as LoadoutAdvice;
      onLoadout(data.attachments);
      setAdvice(data);
      setOpen(true);
    } catch (error) {
      // Cancelar não é falhar: quem cancelou já escreveu o próprio aviso.
      if ((error as { name?: string })?.name === 'AbortError') return;

      /*
       * A busca falhou, e mesmo assim a arma está montada — a montagem local
       * entrou no clique. O aviso diz que ela não passou pela comunidade, para
       * ninguém confundir as duas, e o botão vira convite a tentar de novo.
       * Aqui não há painel: não existe leitura para mostrar.
       */
      const detail = error instanceof Error ? error.message : String(error);
      setFailure(
        `A busca na comunidade não veio agora. Ficou a montagem calculada pelas estatísticas desta arma. (${detail})`,
      );
    } finally {
      if (controllerRef.current === controller) setFetching(false);
    }
  }

  return (
    <div>
      <Hint
        label={
          opensBuilder
            ? `Sugestão da comunidade para a ${weapon.name} — abre o montador com ela pronta.`
            : `Sugestão da comunidade para a ${weapon.name}, a partir de patch notes, guias e do Reddit.`
        }
      >
        <Button
          size="small"
          type={used ? 'primary' : 'default'}
          loading={fetching}
          onClick={suggest}
          className="bevel-sm inline-flex items-center gap-1.5 text-xs"
        >
          {failure && !fetching ? 'Buscar de novo na comunidade' : 'Sugestão da comunidade'}
          {opensBuilder && !fetching && <GotoIcon />}
        </Button>
      </Hint>

      {/*
        A espera contada em voz alta: a etapa, o relógio e a saída. As três
        juntas respondem as perguntas de quem olha uma tela que não terminou —
        o que está acontecendo, há quanto tempo, e o que eu perco se desistir.
      */}
      {fetching && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
          <span aria-live="polite">{stageText(seconds)}</span>{' '}
          <span className="font-mono" style={{ color: 'var(--text-dim)' }}>
            {seconds}s
          </span>
          {' · '}
          <button
            type="button"
            onClick={cancel}
            className="underline underline-offset-2"
            style={{ color: 'var(--accent)' }}
          >
            cancelar
          </button>
          <span className="mt-0.5 block" style={{ color: 'var(--text-dim)' }}>
            A arma já está montada pelas estatísticas — a da comunidade entra por cima quando
            chegar.
          </span>
        </p>
      )}

      {failure && !fetching && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
          {failure}
        </p>
      )}

      {advice && (
        <>
          {/*
            Uma linha só embaixo do botão.
            A resposta do modelo passou a ser só as peças — é o que o botão
            promete e o que cabe em vinte segundos de espera. O painel continua
            existindo para mostrar a build montada e as páginas que a busca
            abriu, e abre sem custar outra busca.
          */}
          <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
            {Object.keys(advice.attachments).length} peças aplicadas{' '}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="underline underline-offset-2"
              style={{ color: 'var(--accent)' }}
            >
              ver a build
            </button>
          </p>

          <Modal
            open={open}
            onCancel={() => setOpen(false)}
            footer={null}
            title={
              <span className="font-display text-lg font-semibold">
                {weapon.name} — sugestão da comunidade
              </span>
            }
            className="bevel"
            width={520}
            styles={{ body: { maxHeight: '75dvh', overflowY: 'auto' } }}
          >
            <RecommendPanel
              weapon={weapon}
              advice={advice}
              onApply={(attachments) => {
                onLoadout(attachments);
                setOpen(false);
              }}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
