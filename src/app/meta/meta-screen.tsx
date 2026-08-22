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
import { completarDestaques, realocarCategorias } from '@/lib/destaques';
import { completarTendencia, fichaDaArma, MIN_TENDENCIA } from '@/lib/trending';
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
  /*
    O bloco de tendência é inteiro ou não é.

    A lista que chega pode vir curta — o modelo nem sempre acha quatro coisas
    datáveis para contar —, e aí quem completa é o catálogo, com as armas que
    entraram na temporada. O que sobra abaixo de `MIN_TENDENCIA` não vira
    fileira quebrada: o bloco inteiro sai da tela.
  */
  const tendencia = completarTendencia(trending, { on: readAt ?? UPDATED_AT });

  /*
    O topo tem o mesmo problema e outra saída.

    Quando a leitura do dia volta com duas armas, o ranking também sai como
    fileira quebrada — só que aqui o catálogo não tem o que dizer: ele sabe
    quando a arma chegou, não o quanto ela está sendo escolhida. Quem completa é
    a curadoria escrita à mão, e as fontes dela vêm junto, senão o colchete do
    cartão apontaria para a fonte errada do rodapé.
  */
  const doTopo = completarDestaques(picks, sources);

  /*
    Os blocos por categoria são escritos à mão e continuam sendo, mesmo quando o
    topo vem da leitura do dia — e é aí que o colchete deles passa a apontar para
    a fonte errada, porque o rodapé virou o da leitura. A costura corre depois da
    do topo, sobre a lista que ela devolveu, para as duas não brigarem pelo mesmo
    número.
  */
  const porCategoria = realocarCategorias(BY_CATEGORY, doTopo.fontes);
  const { destaques } = doTopo;
  const fontes = porCategoria.fontes;

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
                Esta tela é <strong>leitura de fonte, não medição nossa</strong>. Força vem de teste
                e análise que fóruns e comunidades especializadas publicam, e elas discordam entre
                si; uso e conversa não têm número público — as APIs abertas servem estatística por
                jogador, e quem tem os agregados não os publica —, então o bloco de tendência é
                percepção declarada, não pick rate.{' '}
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
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="label">O topo do multiplayer</h2>
            <Typography.Text className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
              as mais fortes depois da atualização mais recente
            </Typography.Text>
          </div>
          <BlockNote>
            Entra aqui a arma que as fontes apontam como <strong>mais forte depois do patch</strong>: teste, análise de balanceamento e estatística analisada pelos jogadores e opiniões nas comunidades, entre eles TTK, dano, controle, alcance e etc. Posição em ranking da meta é baseada em análises e opiniões da comunidade, e não como pick rate, que o jogo não publica. Os colchetes dizem de que fonte saiu cada indicação (ex: [1], [2], [3]).
          </BlockNote>
          <Row gutter={[8, 8]}>
            {destaques.map((pick, rank) => (
              <Col key={pick.weapon} xs={24} sm={12} lg={8} xl={6}>
                <MetaCard pick={pick} rank={rank + 1} />
              </Col>
            ))}
          </Row>
        </section>

        {tendencia.length >= MIN_TENDENCIA && (
          <section className="mb-3">
            <BlockDivider />
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="label">Trending agora</h2>
              <Typography.Text className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                armas em alta na conversa ou no uso percebido
              </Typography.Text>
            </div>
            <BlockNote>
              Aqui é <strong>o que a comunidade mais comenta e mais leva para a partida</strong>: fóruns, Reddit, Discord e afins. A arma pode ter sido buffada, ter acessório novo ou build.
            </BlockNote>
            <Row gutter={[8, 8]}>
              {tendencia.map((pick, rank) => (
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
            {porCategoria.categorias.map((group) => (
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
            {fontes.map((f, i) => (
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
        </Card>
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
  /*
    O motivo diz por que a arma está no bloco; a ficha diz o que ela é.

    São perguntas diferentes e quem lê tem as duas: chegou aqui pela conversa,
    mas ninguém decide pegar uma arma por ela estar sendo falada. A ficha sai do
    mesmo dataset que calcula o TTK do resto do site, e por isso não depende de a
    leitura do dia ter achado fonte.
  */
  const ficha = fichaDaArma(weapon);
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

        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
          {ficha.papel}
        </p>

        <p
          className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[10px]"
          style={{ color: 'var(--text-dim)' }}
        >
          <span>{ficha.rpm} RPM</span>
          {ficha.tiros === 1 ? (
            <span>1 tiro</span>
          ) : (
            ficha.ttk !== null && <span>{ficha.ttk} ms</span>
          )}
          <span>
            {ficha.alcance > 0 ? `${ficha.alcance} m até mais um tiro` : 'mesmo dano em toda distância'}
          </span>
          {ficha.destaque && (
            <span style={{ color: 'var(--text-soft)' }}>· {ficha.destaque}</span>
          )}
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
