'use client';

import Link from 'next/link';
import { Alert, Card, Col, Row, Tag, Tooltip, Typography } from 'antd';
import { AppHeader } from '@/components/header';
import { SeasonTag } from '@/components/season-tag';
import { SiteFooter } from '@/components/site-footer';
import { WeaponPreview } from '@/components/weapon-preview';
import { CATEGORY_NAMES, CLASSES } from '@/data/classes';
import {
  ATUALIZADO_EM,
  DESTAQUES,
  FONTES,
  NAO_E_MULTIPLAYER,
  POR_CATEGORIA,
  TEMPORADA_DO_META,
  type IndicacaoMeta,
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

const dataCurta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function MetaPage() {
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
              Meta da Temporada {TEMPORADA_DO_META}
              <Tooltip title="O battle royale REDSEC tem meta próprio e não entra nesta lista">
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
              </Tooltip>
            </h1>
            <Typography.Text className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
              revisado em {dataCurta(ATUALIZADO_EM)}
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
                jogador, e quem tem os números agregados não os publica. O que está aqui é a leitura
                de guias da temporada, com a fonte e a data de cada indicação à vista.
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
            {DESTAQUES.map((indicacao, posicao) => (
              <Col key={indicacao.weapon} xs={24} sm={12} lg={8} xl={6}>
                <CartaoMeta indicacao={indicacao} posicao={posicao + 1} />
              </Col>
            ))}
          </Row>
        </section>

        <section className="mb-3">
          <h2 className="label mb-2">Por categoria</h2>
          <Row gutter={[8, 8]}>
            {POR_CATEGORIA.map((bloco) => (
              <Col key={bloco.category} xs={24} lg={12} xl={8}>
                <Card
                  variant="outlined"
                  className="card bevel h-full"
                  title={<span className="label">{CATEGORY_NAMES[bloco.category]}</span>}
                  styles={{ header: { minHeight: 0, padding: '8px 12px' }, body: { padding: 12 } }}
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <CartaoMeta indicacao={bloco.melhor} destaque />
                  {bloco.mencoes.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {bloco.mencoes.map((m) => (
                        <li key={m.weapon}>
                          <LinhaMencao indicacao={m} />
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
              {NAO_E_MULTIPLAYER.map((item) => {
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
                        {item.nota}
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
            {FONTES.map((f, i) => (
              <li key={f.url}>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    [{i + 1}]
                  </span>
                  {f.pais === 'BR' && (
                    <Tooltip title="Publicação brasileira">
                      <Tag
                        className="bevel-sm m-0 px-1 text-[9px] font-semibold"
                        style={{
                          color: 'var(--accent)',
                          border: '1px solid color-mix(in oklab, var(--accent) 45%, transparent)',
                        }}
                      >
                        BR
                      </Tag>
                    </Tooltip>
                  )}
                  <Typography.Link
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] underline underline-offset-2"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {f.nome}
                  </Typography.Link>
                  <span style={{ color: 'var(--text-dim)' }}>· {dataCurta(f.data)}</span>
                  {f.janela === 'lancamento' && (
                    <span style={{ color: 'var(--text-dim)' }}>· leitura do lançamento</span>
                  )}
                </p>
                <p className="mt-0.5 ml-6 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                  {f.escopo}
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
function CartaoMeta({
  indicacao,
  posicao,
  destaque = false,
}: {
  indicacao: IndicacaoMeta;
  posicao?: number;
  destaque?: boolean;
}) {
  const weapon = WEAPONS_BY_ID.get(indicacao.weapon);
  if (!weapon) return null;

  const stats = baseStats(weapon);
  const ttk = timeToKill(stats, 0);
  const tiros = shotsToKill(stats, 0);
  const classe = CLASSES.find((c) => c.id === weapon.signatureClass);
  const href = `${BUILDER_PATH}?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link href={href} className={destaque ? 'block' : 'block h-full'}>
      <Card
        variant="outlined"
        hoverable
        className={`card bevel ${destaque ? '' : 'h-full'}`}
        styles={{ body: { padding: 10 } }}
        style={{
          borderColor: destaque ? 'var(--accent)' : 'var(--border-soft)',
          background: destaque ? 'color-mix(in oklab, var(--accent) 8%, transparent)' : undefined,
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display truncate text-base font-semibold tracking-wide">
            {posicao && (
              <span className="mr-1.5 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
                {posicao}º
              </span>
            )}
            {weapon.name}
          </span>
          <SeasonTag season={weapon.season} size="sm" />
        </div>

        {!posicao && <WeaponPreview weapon={weapon} className="my-1 w-full" />}

        <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-soft)' }}>
          {indicacao.porque}
        </p>

        <p
          className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px]"
          style={{ color: 'var(--text-dim)' }}
        >
          {classe && <span style={{ color: classe.color }}>{classe.name}</span>}
          <span>{weapon.rpm} RPM</span>
          {tiros === 1 ? (
            <span>1 tiro</span>
          ) : (
            Number.isFinite(ttk) && <span>{Math.round(ttk)} ms</span>
          )}
          <span>{indicacao.fontes.map((f) => `[${f + 1}]`).join(' ')}</span>
        </p>
      </Card>
    </Link>
  );
}

function LinhaMencao({ indicacao }: { indicacao: IndicacaoMeta }) {
  const weapon = WEAPONS_BY_ID.get(indicacao.weapon);
  if (!weapon) return null;

  const href = `${BUILDER_PATH}?l=${encodeLoadout({ ...EMPTY_LOADOUT, weapon: weapon.id })}`;

  return (
    <Link href={href} className="tile bevel-sm block px-2 py-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display truncate text-sm font-semibold">{weapon.name}</span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
          {indicacao.fontes.map((f) => `[${f + 1}]`).join(' ')}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
        {indicacao.porque}
      </span>
    </Link>
  );
}
