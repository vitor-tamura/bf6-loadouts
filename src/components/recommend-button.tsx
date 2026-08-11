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
 * A build é aplicada na hora do clique; o painel abre junto, com o porquê de
 * cada peça, o alcance, o consenso, o que o patch mudou e uma montagem
 * alternativa. Fechar o painel não desfaz nada: a arma continua montada, e o
 * painel volta pelo mesmo botão, sem custar outra busca.
 *
 * O que fazer com a montagem é decisão de quem usa o componente: o montador
 * aplica nos slots, a comparação abre o montador com tudo pronto — e é por isso
 * que `opensBuilder` existe, para o botão avisar o destino com o ícone.
 *
 * Quem usa deve passar `key={weapon.id}`: trocar de arma remonta o componente,
 * apagando a leitura da arma anterior — e o pedido em voo é cancelado na saída,
 * senão uma resposta atrasada aplicaria a montagem de uma arma na outra.
 */
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
  // Só depois do clique o botão fica destacado — antes ele é mais um na tela.
  const [used, setUsed] = useState(false);
  const [advice, setAdvice] = useState<LoadoutAdvice | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function suggest() {
    // Segunda visita à mesma arma: o painel reabre sem pagar outra busca.
    if (advice || failure) {
      setOpen(true);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFetching(true);

    try {
      const response = await fetch(`/api/recommend/?weapon=${weapon.id}&range=${DEFAULT_RANGE}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(String(response.status));

      const data = (await response.json()) as LoadoutAdvice;
      setUsed(true);
      onLoadout(data.attachments);
      setAdvice(data);
      setOpen(true);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;

      /*
       * A busca falhou, e mesmo assim sai montagem.
       *
       * Sem crédito, sem rede ou fora de produção, o botão entregaria um erro e
       * nada mais — e o visitante veio aqui para montar a arma. A montagem
       * local resolve isso com os números que a tela já tem; o aviso diz que
       * ela não passou pela comunidade, para ninguém confundir as duas. Aqui
       * não há painel: não existe leitura para mostrar.
       */
      setUsed(true);
      onLoadout(idealLoadout(weapon));
      setFailure('A busca na comunidade não veio agora — esta montagem saiu das estatísticas da arma.');
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
          Sugestão da comunidade
          {opensBuilder && !fetching && <GotoIcon />}
        </Button>
      </Hint>

      {failure && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
          {failure}
        </p>
      )}

      {advice && (
        <>
          {/*
            Embaixo do botão fica a primeira frase, não o texto inteiro: o
            porquê da build agora tem parágrafo, e derramá-lo no montador
            empurraria os slots para fora da tela. O resto está a um clique, e o
            clique não custa outra busca.
          */}
          <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
            {advice.reason.split(/(?<=\.)\s/)[0]}{' '}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="underline underline-offset-2"
              style={{ color: 'var(--accent)' }}
            >
              ver a leitura
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
