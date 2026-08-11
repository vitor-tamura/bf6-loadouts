'use client';

import { Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Hint } from '@/components/hint';
import { GotoIcon } from '@/components/icons/goto-icon';
import type { SlotId, Weapon } from '@/data/types';
import { DEFAULT_RANGE, idealLoadout } from '@/lib/recommend';

/**
 * O botão da sugestão da comunidade.
 *
 * Um botão só: quem chega aqui quer a arma montada, não um formulário de
 * alcance. A montagem sai de um modelo que pesquisa guias e discussões do
 * Reddit (ver `src/app/api/recommend/route.ts`), e a busca falhando não deixa
 * ninguém a pé — entra a montagem local de `idealLoadout`, calculada pelas
 * mesmas estatísticas que a tela mostra.
 *
 * O que fazer com a montagem é decisão de quem usa o componente: o montador
 * aplica nos slots, a comparação abre o montador com tudo pronto — e é por isso
 * que `opensBuilder` existe, para o botão avisar o destino com o ícone.
 *
 * Quem usa deve passar `key={weapon.id}`: trocar de arma remonta o componente,
 * apagando a nota da arma anterior — e o pedido em voo é cancelado na saída,
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
  const [note, setNote] = useState<{ failed: boolean; text: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function suggest() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFetching(true);
    setNote(null);

    try {
      const response = await fetch(
        `/api/recommend/?weapon=${weapon.id}&range=${DEFAULT_RANGE}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(String(response.status));

      const data = (await response.json()) as {
        attachments: Partial<Record<SlotId, string>>;
        reason: string;
      };
      setUsed(true);
      onLoadout(data.attachments);
      setNote({ failed: false, text: data.reason });
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;

      /*
       * A busca falhou, e mesmo assim sai montagem.
       *
       * Sem crédito, sem rede ou fora de produção, o botão entregaria um erro e
       * nada mais — e o visitante veio aqui para montar a arma. A montagem
       * local resolve isso com os números que a tela já tem; o aviso diz que
       * ela não passou pela comunidade, para ninguém confundir as duas.
       */
      setUsed(true);
      onLoadout(idealLoadout(weapon));
      setNote({
        failed: true,
        text: 'A busca na comunidade não veio agora — esta montagem saiu das estatísticas da arma.',
      });
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
            : `Sugestão da comunidade para a ${weapon.name}, a partir de guias e do Reddit.`
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

      {note && (
        <p
          className="mt-1.5 text-[11px] leading-snug"
          style={{ color: note.failed ? 'var(--text-dim)' : 'var(--text-soft)' }}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
