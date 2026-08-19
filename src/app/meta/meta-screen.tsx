'use client';

import type { ReactNode } from 'react';
import { Hint } from '@/components/hint';
import Link from 'next/link';
import { Alert, Card, Col, Divider, Row, Tag, Typography } from 'antd';
import { AppHeader } from '@/components/header';
import { SeasonTag } from '@/components/season-tag';
import { SiteFooter } from '@/components/site-footer';
import { WeaponPreview } from '@/components/weapon-preview';
import { CATEGORY_NAMES, CLASSES } from '@/data/classes';
import {
  UPDATED_AT,
  HIGHLIGHTS,
  TRENDING,
  SOURCES,
  NOT_MULTIPLAYER,
  BY_CATEGORY,
  META_SEASON,
  type MetaPatch,
  type MetaPick,
  type MetaSource,
  type TrendingPick,
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
  trending = TRENDING,
  sources = SOURCES,
  readAt,
  patch,
  fromSearch = false,
}: {
  picks?: MetaPick[];
  trending?: TrendingPick[];
  sources?: MetaSource[];
  readAt?: string;
  patch?: MetaPatch | null;
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
              {/*
                A data da leitura sozinha engana: ela diz quando alguém olhou,
                não a que jogo o que se olhou se refere. Com o patch à vista, dá
                para ver de imediato quando a lista foi relida sobre um jogo que
                já mudou depois.
              */}
              {patch?.date && (
                <Hint label={patch.name ? `Atualização ${patch.name}` : 'Última atualização do jogo'}>
                  <span> · patch de {shortDate(patch.date)}</span>
                </Hint>
              )}
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
          <BlockNote>
            O que põe uma arma aqui é <strong>o quanto ela está sendo escolhida agora</strong>: a
            posição no ranking de multiplayer e a quantidade de fontes independentes que repetem o
            nome dela. Como o jogo não publica pick rate, popularidade aqui é convergência de fonte,
            não número medido — é também por isso que a ordem é a do ranking, e não a das contas de
            TTK que o resto do site faz.{' '}
            {fromSearch ? (
              <>
                O que o último patch fez com a arma aparece no texto do cartão como contexto, para
                que se saiba se a leitura é posterior a ele. Não é o que a põe na lista: mudança recente
                é assunto do bloco de tendência, logo abaixo.
              </>
            ) : (
              <>
                O que o patch em vigor fez com a arma entra no motivo como contexto — inclusive o
                fato de o changelog inteiro não a citar, que é afirmação conferível porque a lista é
                exaustiva. Não é o que a põe na lista: mudança recente é assunto do bloco de
                tendência, logo abaixo.
              </>
            )}{' '}
            Os colchetes dizem de que fonte saiu cada indicação.
          </BlockNote>
          <Row gutter={[8, 8]}>
            {picks.map((pick, rank) => (
              <Col key={pick.weapon} xs={24} sm={12} lg={8} xl={6}>
                <MetaCard pick={pick} rank={rank + 1} />
              </Col>
            ))}
          </Row>
        </section>

        {trending.length > 0 && (
          <section className="mb-3">
            <BlockDivider />
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="label">Trending agora</h2>
              <Typography.Text className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                armas em alta na conversa ou no uso percebido
              </Typography.Text>
            </div>
            <BlockNote>
              O que põe uma arma aqui não é ela ser mais usada que as de cima — é{' '}
              <strong>algo ter mudado nela</strong>, e dar para datar: um acerto do último patch, um
              acessório que o estúdio desligou, uma build nova, uma arma recém-chegada já sendo
              adotada. A etiqueta âmbar diz o que mudou; o texto abaixo dela, que evidência sustenta
              isso. Por isso esta lista não é a de cima em outra ordem: o topo mede o nível de hoje
              e aqui é a variação da semana — uma arma pode estar mudando de patamar sem nunca ter
              chegado perto das mais escolhidas.
            </BlockNote>
            <Row gutter={[8, 8]}>
              {trending.map((pick, rank) => (
                <Col key={`${pick.weapon}-${pick.trend}`} xs={24} sm={12} lg={8} xl={6}>
                  <TrendingCard pick={pick} rank={rank + 1} />
                </Col>
              ))}
            </Row>
          </section>
        )}

        <section className="mb-3">
          <BlockDivider />
          <h2 className="label mb-2">Meta por categoria</h2>
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
          <BlockDivider />
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

        <BlockDivider />

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

/**
 * A linha que separa um bloco do seguinte.
 *
 * A tela é uma pilha de listas de arma — topo, trending, categorias, REDSEC —
 * e sem uma régua entre elas o título de cada bloco lia-se como subtítulo do
 * anterior, especialmente no celular, onde os cartões vêm um sob o outro.
 */
function BlockDivider() {
  return <Divider style={{ margin: '20px 0', borderColor: 'var(--border-soft)' }} />;
}

/**
 * O critério do bloco, dito antes dos cartões.
 *
 * Cada cartão já trazia o motivo daquela arma, mas motivo não é critério: lido
 * sozinho, "primeira da classe" e "o estúdio desligou o acessório" parecem duas
 * frases sobre armas fortes, e nada diz por que uma está no topo e a outra em
 * tendência. A regra que separa os dois blocos vivia só nos comentários de
 * `meta.ts` — quem lê a tela nunca a via. Agora ela vem antes da lista, que é
 * onde ela decide alguma coisa.
 */
function BlockNote({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 max-w-[80ch] text-[12px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
      {children}
    </p>
  );
}

/** Cartão de tendência: o que mudou na arma — buff, acessório, build nova —, sem misturar com o nível que decide o topo. */
function TrendingCard({ pick, rank }: { pick: TrendingPick; rank: number }) {
  const weapon = WEAPONS_BY_ID.get(pick.weapon);
  if (!weapon) return null;

  const playerClass = CLASSES.find((c) => c.id === weapon.signatureClass);
  const href = `${BUILDER_PATH}?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link href={href} className="block h-full">
      {/* Sem `hoverable`: o realce do antd apagaria justamente a borda âmbar. */}
      <Card
        variant="outlined"
        className="card bevel h-full"
        styles={{ body: { padding: 10 } }}
        style={{ borderColor: 'color-mix(in oklab, var(--accent) 35%, var(--border-soft))' }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="font-display block truncate text-base font-semibold tracking-wide">
              <span className="mr-1.5 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
                {rank}º
              </span>
              {weapon.name}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px]">
              {playerClass && <span style={{ color: playerClass.color }}>{playerClass.name}</span>}
              <span style={{ color: 'var(--text-dim)' }}>{CATEGORY_NAMES[weapon.category]}</span>
            </span>
          </span>
          <Tag
            className="bevel-sm m-0 max-w-[45%] whitespace-normal px-1.5 py-0 text-right text-[9px] leading-snug font-semibold uppercase"
            style={{
              color: 'var(--accent)',
              border: '1px solid color-mix(in oklab, var(--accent) 45%, transparent)',
              background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
            }}
          >
            {pick.trend}
          </Tag>
        </div>

        {/*
          A foto entra abaixo do nome, e não ao lado dele: no cartão estreito da
          grade, uma imagem de proporção 8:3 espremida numa coluna lateral fica
          menor que o próprio texto e deixa de cumprir o papel — que é fazer a
          arma ser reconhecida antes de qualquer palavra ser lida.
        */}
        <WeaponPreview weapon={weapon} className="mt-2 w-full" />

        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
          {pick.reason}
        </p>

        {/*
          Arma sem citação não ganha linha em branco: a leitura automática pode
          não achar a fonte que sustenta um nome, e é melhor o card não citar
          nada do que abrir espaço para um colchete que não veio.
        */}
        {pick.sources.length > 0 && (
          <p className="mt-1.5 font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {pick.sources.map((f) => `[${f + 1}]`).join(' ')}
          </p>
        )}
      </Card>
    </Link>
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
      {/*
        O tom âmbar do destaque vem da classe, não do estilo inline: fundo
        declarado aqui dentro venceria o hover do cartão, e o card em destaque
        seria o único da tela a não reagir ao ponteiro.
      */}
      <Card
        variant="outlined"
        className={`card bevel ${featured ? 'card-accent' : 'h-full'}`}
        styles={{ body: { padding: 10 } }}
        style={{ borderColor: featured ? 'var(--accent)' : 'var(--border-soft)' }}
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
