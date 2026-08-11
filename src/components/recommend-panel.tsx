'use client';

import { Button, Tag, Typography } from 'antd';
import { ATTACHMENTS_BY_ID } from '@/data/attachments';
import { SLOTS_BY_ID } from '@/data/classes';
import type { SlotId, Weapon } from '@/data/types';
import { attachmentName } from '@/lib/loadout';
import type { LoadoutAdvice, RecommendationConfidence, RecommendationStatus } from '@/lib/recommend';

/**
 * O que a busca achou sobre a arma, além da montagem.
 *
 * O botão sempre aplicou a build e resumiu tudo numa frase, o que jogava fora a
 * parte que responde "por quê": o que cada peça resolve, em que distância a
 * arma vive, onde a comunidade discorda, o que o último patch mexeu. Aqui isso
 * aparece inteiro, e a montagem alternativa vem com botão — ler que existe uma
 * build de longo alcance sem poder experimentá-la seria só texto.
 *
 * Todo campo fora de `attachments` e `reason` pode faltar: a resposta é de um
 * modelo, e campo sem evidência chega nulo de propósito. Cada bloco some
 * sozinho quando não tem o que dizer.
 */

/** Cor de fundo do status: o que é força, o que é só hábito, o que caiu. */
const STATUS_TONE: Record<RecommendationStatus, string> = {
  META: 'var(--accent)',
  STRONG: 'var(--accent)',
  TRENDING: 'var(--accent)',
  POPULAR: 'var(--text-soft)',
  NICHE: 'var(--text-soft)',
  'OFF-META': 'var(--text-dim)',
};

const CONFIDENCE_LABEL: Record<RecommendationConfidence, string> = {
  HIGH: 'muitas fontes concordam',
  MEDIUM: 'boa evidência, comunidade dividida',
  LOW: 'pouca fonte ou opinião conflitante',
};

function Etiqueta({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <Tag
      className="bevel-sm m-0 px-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase"
      style={{
        color: tone,
        border: `1px solid color-mix(in oklab, ${tone} 45%, transparent)`,
        background: `color-mix(in oklab, ${tone} 10%, transparent)`,
      }}
    >
      {children}
    </Tag>
  );
}

function Bloco({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="label mb-1 text-[10px]">{title}</h3>
      {children}
    </section>
  );
}

function Paragrafo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
      {children}
    </p>
  );
}

/** A montagem, peça a peça, com o que cada uma resolve nesta arma. */
function Pecas({
  weapon,
  attachments,
  why = {},
}: {
  weapon: Weapon;
  attachments: Partial<Record<SlotId, string>>;
  why?: Partial<Record<SlotId, string>>;
}) {
  // A ordem é a dos slots da arma, e não a que o modelo devolveu: a mesma arma
  // lida duas vezes tem de listar as peças na mesma sequência.
  const linhas = weapon.slots
    .map((slot) => {
      const id = attachments[slot];
      const part = id ? ATTACHMENTS_BY_ID.get(id) : undefined;
      return part ? { slot, name: attachmentName(part, weapon), note: why[slot] } : null;
    })
    .filter((linha) => linha !== null);

  return (
    <ul className="space-y-1">
      {linhas.map((linha) => (
        <li key={linha.slot} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span
            className="w-20 shrink-0 font-mono text-[10px] tracking-wide uppercase"
            style={{ color: 'var(--text-dim)' }}
          >
            {SLOTS_BY_ID.get(linha.slot)?.name ?? linha.slot}
          </span>
          <span className="font-semibold">{linha.name}</span>
          {linha.note && (
            <span className="basis-full pl-20 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              {linha.note}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RecommendPanel({
  weapon,
  advice,
  onApply,
}: {
  weapon: Weapon;
  advice: LoadoutAdvice;
  /** Aplicar a build alternativa nos slots — o painel não mexe em estado nenhum. */
  onApply: (attachments: Partial<Record<SlotId, string>>) => void;
}) {
  const { range } = advice;

  return (
    <div>
      {(advice.status || advice.confidence) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {advice.status && <Etiqueta tone={STATUS_TONE[advice.status]}>{advice.status}</Etiqueta>}
          {advice.confidence && (
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
              confiança {advice.confidence.toLowerCase()} — {CONFIDENCE_LABEL[advice.confidence]}
            </span>
          )}
        </div>
      )}

      <Bloco title="Build aplicada">
        <Pecas weapon={weapon} attachments={advice.attachments} why={advice.why} />
      </Bloco>

      <Bloco title="Por que esta build">
        <Paragrafo>{advice.reason}</Paragrafo>
      </Bloco>

      {advice.playstyle && (
        <Bloco title="Como jogar">
          <Paragrafo>{advice.playstyle}</Paragrafo>
        </Bloco>
      )}

      {(range.main || range.secondary) && (
        <Bloco title="Alcance efetivo">
          <p className="font-mono text-[12px]">
            {range.main && <span>{range.main}</span>}
            {range.secondary && (
              <span style={{ color: 'var(--text-dim)' }}>
                {range.main ? ' · ' : ''}2º: {range.secondary}
              </span>
            )}
          </p>
        </Bloco>
      )}

      {advice.alternative && (
        <Bloco title={`Alternativa — ${advice.alternative.label}`}>
          {advice.alternative.when && <Paragrafo>{advice.alternative.when}</Paragrafo>}
          <div className="mt-1.5">
            <Pecas weapon={weapon} attachments={advice.alternative.attachments} />
          </div>
          <Button
            size="small"
            onClick={() => onApply(advice.alternative!.attachments)}
            className="bevel-sm touch mt-2"
          >
            Aplicar esta
          </Button>
        </Bloco>
      )}

      {advice.consensus && (
        <Bloco title="O que a comunidade diz">
          <Paragrafo>{advice.consensus}</Paragrafo>
        </Bloco>
      )}

      {advice.changes && (
        <Bloco title="Mudanças recentes">
          <Paragrafo>{advice.changes}</Paragrafo>
        </Bloco>
      )}

      {advice.sources.length > 0 && (
        <Bloco title="De onde saiu">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[10px]">
            {advice.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                title={source.title}
                className="underline underline-offset-2"
                style={{ color: 'var(--accent)' }}
              >
                {source.name}
              </a>
            ))}
          </p>
        </Bloco>
      )}

      {/*
        O aviso fecha o painel porque é o que o leitor precisa ter em mente
        depois de ler, não antes: isto é leitura de opinião pública, montada por
        um modelo, sem ninguém revisando.
      */}
      <Typography.Paragraph
        className="mt-4 mb-0 text-[11px]"
        style={{ color: 'var(--text-dim)' }}
      >
        Leitura automática de guias e discussões recentes — ninguém revisou antes de aparecer aqui.
        As peças e o orçamento, esses o site confere contra o arsenal da {weapon.name}.
      </Typography.Paragraph>
    </div>
  );
}
