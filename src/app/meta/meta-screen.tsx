'use client';

import { Hint } from '@/components/hint';
import Link from 'next/link';
import { Alert, Card, Col, Row, Tag, Typography } from 'antd';
import { AppHeader } from '@/components/header';
import { SeasonTag } from '@/components/season-tag';
import { SiteFooter } from '@/components/site-footer';
import { WeaponPreview } from '@/components/weapon-preview';
import { CATEGORY_NAMES, CLASSES } from '@/data/classes';
import {
  UPDATED_AT,
  HIGHLIGHTS,
  SOURCES,
  NOT_MULTIPLAYER,
  BY_CATEGORY,
  META_SEASON,
  type MetaPick,
  type MetaSource,
} from '@/data/meta';
import { WEAPONS_BY_ID } from '@/data/weapons';
import { EMPTY_LOADOUT } from '@/lib/loadout';
import { BUILDER_PATH, encodeLoadout } from '@/lib/share';
import { baseStats } from '@/lib/stats';
import { shotsToKill, timeToKill } from '@/lib/ballistics';

/**
 * O meta da temporada, no multiplayer.
 *
 * A tela existe para responder "o que está forte agora", pergunta que os
 * números do site sozinhos não respondem — eles dizem o que a arma faz, não o
 * que a comunidade está usando. Como não há fonte pública de uso real, aqui é
 * leitura de guia, e a tela repete isso onde não dá para não ver: no alto, em
 * cada indicação e no rodapé.
 *
 * O modo importa tanto quanto a data: metade das listas que circulam por aí
 * descreve o REDSEC, e o battle royale premia outra coisa. Por isso o escopo
 * está no título, e as armas que só o REDSEC valoriza têm seção própria — não
 * para escondê-las, mas para o leitor não as confundir com o meta daqui.
 */

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * A tela do meta.
 *
 * Os destaques e as fontes chegam de fora: podem ser a leitura automática do
 * dia, feita pela busca, ou a curadoria escrita à mão que vive em `meta.ts` e
 * responde quando a leitura não vem. A tela não sabe de qual das duas se trata
 * — só recebe a lista e a data, e diz na cara qual é a origem.
 */
export function MetaScreen({
  picks = HIGHLIGHTS,
  sources = SOURCES,
  readAt,
  fromSearch = false,
}: {
  picks?: MetaPick[];
  sources?: MetaSource[];
  readAt?: string;
  fromSearch?: boolean;
} = {}) {
  return (
    <div className="min-h-dvh">
      <AppHeader subtitle="O que está forte agora no multiplayer" />

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        <Card
          variant="outlined"
          className="card bevel mb-3"
          styles={{ body: { padding: 12 } }}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-display flex flex-wrap items-baseline gap-2 text-xl font-bold tracking-wide">
              Meta da Temporada {META_SEASON}
              <Hint label="O battle royale REDSEC tem meta próprio e não entra nesta lista">
                <Tag
                  className="bevel-sm m-0 text-[10px] font-semibold tracking-[0.14em] uppercase"
                  style={{
                    color: 'var(--accent)',
                    border: '1px solid color-mix(in oklab, var(--accent) 45%, transparent)',
                    background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
                  }}
                >
                  Multiplayer
                </Tag>
              </Hint>
            </h1>
            <Typography.Text className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
              revisado em {shortDate(readAt ?? UPDATED_AT)}
            </Typography.Text>
          </div>

          {/*
            Os dois avisos viraram `Alert`. Eram parágrafos e liam-se como
            introdução — algo para pular. O que dizem, porém, decide como o
            leitor usa a tela: a lista é opinião, e é de multiplayer.
          */}
          <Alert
            type="warning"
            showIcon
            className="bevel-sm mt-2"
            title={
              <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                Esta lista é <strong>opinião da comunidade, não medição</strong>. Não existe fonte
                pública de uso real no Battlefield 6 — as APIs abertas servem estatística por
                jogador, e quem tem os números agregados não os publica.{' '}
                {fromSearch ? (
                  <>
                    Esta leitura foi montada <strong>automaticamente</strong>, uma vez por dia, a
                    partir de uma busca por discussões e guias recentes: ninguém revisou antes de
                    publicar. Os links usados estão no fim da página, e só entra arma que existe no
                    jogo.
                  </>
                ) : (
                  <>
                    O que está aqui é a leitura de guias da temporada, revisada à mão, com a fonte e
                    a data de cada indicação à vista.
                  </>
                )}
              </span>
            }
          />

          <Alert
            type="info"
            showIcon
            className="bevel-sm mt-2"
            title={
              <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                O escopo é o <strong>multiplayer</strong>: Conquista, Avanço e afins. O{' '}
                <strong>REDSEC</strong>, o battle royale, tem meta próprio e fica de fora — com vida
                maior, munição no chão e combate em esquadra, as armas que rendem lá não são as
                mesmas. Só entra fonte que diga de que modo está falando.
              </span>
            }
          />
        </Card>

        <section className="mb-3">
          <h2 className="label mb-2">O topo do multiplayer</h2>
          <Row gutter={[8, 8]}>
            {picks.map((pick, rank) => (
              <Col key={pick.weapon} xs={24} sm={12} lg={8} xl={6}>
                <MetaCard pick={pick} rank={rank + 1} />
              </Col>
            ))}
          </Row>
        </section>

        <section className="mb-3">
          <h2 className="label mb-2">Por categoria</h2>
          <Row gutter={[8, 8]}>
            {BY_CATEGORY.map((group) => (
              <Col key={group.category} xs={24} lg={12} xl={8}>
                <Card
                  variant="outlined"
                  className="card bevel h-full"
                  title={<span className="label">{CATEGORY_NAMES[group.category]}</span>}
                  styles={{ header: { minHeight: 0, padding: '8px 12px' }, body: { padding: 12 } }}
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <MetaCard pick={group.best} featured />
                  {group.mentions.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {group.mentions.map((m) => (
                        <li key={m.weapon}>
                          <MentionRow pick={m} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </section>

        <section className="mb-3">
          <h2 className="label mb-2">Fortes no REDSEC, não aqui</h2>
          <Card
            variant="outlined"
            className="card bevel"
            styles={{ body: { padding: 12 } }}
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <Typography.Paragraph
              className="mb-2 max-w-[80ch] text-[12px] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              Estas estão no primeiro escalão do battle royale e caem no multiplayer — pela mesma
              fonte, que ranqueia os dois modos em páginas separadas. É o que explica boa parte das
              listas de melhores armas que não batem com o que você sente jogando Conquista.
            </Typography.Paragraph>
            <Row gutter={[8, 8]}>
              {NOT_MULTIPLAYER.map((item) => {
                const weapon = WEAPONS_BY_ID.get(item.weapon);
                if (!weapon) return null;
                return (
                  <Col key={item.weapon} xs={24} sm={12} xl={6}>
                    <div className="tile bevel-sm h-full px-2.5 py-2">
                      <p className="font-display truncate text-sm font-semibold">{weapon.name}</p>
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 font-mono text-[11px]">
                        <span style={{ color: 'var(--text-dim)' }}>REDSEC</span>
                        <span style={{ color: 'var(--accent)' }}>{item.redsec}</span>
                        <span style={{ color: 'var(--text-dim)' }}>· multiplayer</span>
                        <span style={{ color: 'var(--text-soft)' }}>{item.multiplayer}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                        {item.note}
                      </p>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>
        </section>

        <Card
          variant="outlined"
          className="card bevel"
          styles={{ body: { padding: 12 } }}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <h2 className="label mb-2">De onde saiu</h2>
          {/*
            Lista em `<ul>`: o `List` do antd está depreciado na versão 6 e sai
            na próxima maior. Aqui cada fonte é um bloco com link, etiqueta e
            duas linhas de texto — nada que o componente resolvesse por nós.
          */}
          <ul className="space-y-1.5 text-[12px]">
            {sources.map((f, i) => (
              <li key={f.url}>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    [{i + 1}]
                  </span>
                  {f.country === 'BR' && (
                    <Hint label="Publicação brasileira">
                      <Tag
                        className="bevel-sm m-0 px-1 text-[9px] font-semibold"
                        style={{
                          color: 'var(--accent)',
                          border: '1px solid color-mix(in oklab, var(--accent) 45%, transparent)',
                        }}
                      >
                        BR
                      </Tag>
                    </Hint>
                  )}
                  <Typography.Link
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] underline underline-offset-2"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {f.name}
                  </Typography.Link>
                  <span style={{ color: 'var(--text-dim)' }}>· {shortDate(f.date)}</span>
                  {f.timeframe === 'launch' && (
                    <span style={{ color: 'var(--text-dim)' }}>· leitura do lançamento</span>
                  )}
                </p>
                <p className="mt-0.5 ml-6 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                  {f.scope}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-[80ch] text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            Duas coisas barram uma fonte. A <strong>data</strong>: guia de lançamento descreve um
            jogo que já mudou de balanceamento quatro vezes. E o <strong>modo</strong>: quem mede
            multiplayer e REDSEC no mesmo texto fica de fora, porque não dá para saber qual dos dois
            sustenta cada indicação — foi o que tirou daqui uma das fontes anteriores.
          </p>
        </Card>

        <SiteFooter note="Ranking de opinião do multiplayer, mantido à mão. Os números das armas continuam vindo do dataset." />
      </main>
    </div>
  );
}

/** Cartão de arma indicada, com o link que já abre o montador com ela. */
function MetaCard({
  pick,
  rank,
  featured = false,
}: {
  pick: MetaPick;
  rank?: number;
  featured?: boolean;
}) {
  const weapon = WEAPONS_BY_ID.get(pick.weapon);
  if (!weapon) return null;

  const stats = baseStats(weapon);
  const ttk = timeToKill(stats, 0);
  const shots = shotsToKill(stats, 0);
  const playerClass = CLASSES.find((c) => c.id === weapon.signatureClass);
  const href = `${BUILDER_PATH}?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link href={href} className={featured ? 'block' : 'block h-full'}>
      <Card
        variant="outlined"
        hoverable
        className={`card bevel ${featured ? '' : 'h-full'}`}
        styles={{ body: { padding: 10 } }}
        style={{
          borderColor: featured ? 'var(--accent)' : 'var(--border-soft)',
          background: featured ? 'color-mix(in oklab, var(--accent) 8%, transparent)' : undefined,
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display truncate text-base font-semibold tracking-wide">
            {rank && (
              <span className="mr-1.5 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
                {rank}º
              </span>
            )}
            {weapon.name}
          </span>
          <SeasonTag season={weapon.season} size="sm" />
        </div>

        {!rank && <WeaponPreview weapon={weapon} className="my-1 w-full" />}

        <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
          {pick.reason}
        </p>

        <p
          className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px]"
          style={{ color: 'var(--text-dim)' }}
        >
          {playerClass && <span style={{ color: playerClass.color }}>{playerClass.name}</span>}
          <span>{weapon.rpm} RPM</span>
          {shots === 1 ? (
            <span>1 tiro</span>
          ) : (
            Number.isFinite(ttk) && <span>{Math.round(ttk)} ms</span>
          )}
          <span>{pick.sources.map((f) => `[${f + 1}]`).join(' ')}</span>
        </p>
      </Card>
    </Link>
  );
}

function MentionRow({ pick }: { pick: MetaPick }) {
  const weapon = WEAPONS_BY_ID.get(pick.weapon);
  if (!weapon) return null;

  const href = `${BUILDER_PATH}?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link href={href} className="tile bevel-sm block px-2 py-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display truncate text-sm font-semibold">{weapon.name}</span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
          {pick.sources.map((f) => `[${f + 1}]`).join(' ')}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
        {pick.reason}
      </span>
    </Link>
  );
}
