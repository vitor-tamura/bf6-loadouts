'use client';

import { Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Hint } from '@/components/hint';
import type { SlotId, Weapon } from '@/data/types';
import { DISTANCIAS, loadoutIdeal, type Distancia } from '@/lib/recommend';

/**
 * Os três botões do loadout recomendado por IA — curta, média e longa.
 *
 * O componente pede a recomendação e entrega a montagem já validada a quem o
 * usa; o que fazer com ela é decisão da tela — o montador aplica nos slots, a
 * comparação abre o montador com tudo montado. A dica de cada botão diz a que
 * mapas e modos aquela distância corresponde, que é o vocabulário de quem
 * escolhe.
 *
 * Quem usa deve passar `key={weapon.id}`: trocar de arma remonta o componente,
 * apagando a nota da arma anterior — e o pedido em voo é cancelado na saída,
 * senão uma resposta atrasada aplicaria a montagem de uma arma na outra.
 */
export function RecommendButtons({
  weapon,
  onLoadout,
  destaque = false,
}: {
  weapon: Weapon;
  onLoadout: (attachments: Partial<Record<SlotId, string>>) => void;
  destaque?: boolean;
}) {
  const [buscando, setBuscando] = useState<Distancia | null>(null);
  const [nota, setNota] = useState<{ erro: boolean; texto: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function recomendar(distancia: Distancia) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBuscando(distancia);
    setNota(null);

    try {
      const resposta = await fetch(`/api/recomendar/?arma=${weapon.id}&distancia=${distancia}`, {
        signal: controller.signal,
      });
      if (!resposta.ok) {
        throw new Error(
          resposta.status === 429
            ? 'Limite diário de recomendações atingido — amanhã tem mais.'
            : 'A recomendação não veio. Tente de novo em instantes.',
        );
      }
      const dados = (await resposta.json()) as {
        attachments: Partial<Record<SlotId, string>>;
        reason: string;
      };
      onLoadout(dados.attachments);
      setNota({ erro: false, texto: dados.reason });
    } catch (erro) {
      if ((erro as { name?: string })?.name === 'AbortError') return;
      setNota({
        erro: true,
        texto: erro instanceof Error ? erro.message : 'A recomendação não veio.',
      });
    } finally {
      if (controllerRef.current === controller) setBuscando(null);
    }
  }

  function aplicarIdeal() {
    onLoadout(loadoutIdeal(weapon));
    setNota({
      erro: false,
      texto: 'Loadout ideal aplicado: montagem local equilibrada para média distância.',
    });
  }

  return (
    <div>
      <div className={destaque ? 'grid gap-2' : 'flex flex-wrap items-center gap-1.5'}>
        <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {destaque ? 'Loadout ideal ou sugestão:' : 'Loadout:'}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Hint label="Aplica uma montagem local equilibrada, sem usar IA.">
            <Button
              size="small"
              type={destaque ? 'primary' : 'default'}
              disabled={buscando !== null}
              onClick={aplicarIdeal}
              className="bevel-sm text-xs"
            >
              Ideal
            </Button>
          </Hint>
        {DISTANCIAS.map((d) => (
          <Hint key={d.value} label={d.hint}>
            <Button
              size="small"
              loading={buscando === d.value}
              disabled={buscando !== null && buscando !== d.value}
              onClick={() => recomendar(d.value)}
              className="bevel-sm text-xs"
            >
              {d.label}
            </Button>
          </Hint>
        ))}
        </div>
      </div>
      {nota && (
        <p
          className="mt-1.5 text-[11px] leading-snug"
          style={{ color: nota.erro ? 'var(--color-negative)' : 'var(--text-soft)' }}
        >
          {nota.texto}
        </p>
      )}
    </div>
  );
}
