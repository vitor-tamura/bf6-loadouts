import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ImageResponse } from 'next/og';
import { AttachmentIcon } from '@/components/icons/attachment-icon';
import { SLOTS_BY_ID, budgetFor } from '@/data/classes';
import { seasonLabel } from '@/data/season';
import { WEAPONS_BY_ID } from '@/data/weapons';
import type { Attachment } from '@/data/types';
import { loadoutAttachments } from '@/lib/loadout';
import { LOADOUT_PARAM, decodeLoadout } from '@/lib/share';

/**
 * O loadout como cartão de imagem.
 *
 * O link já carrega a build inteira, mas link não se lê de relance: quem recebe
 * precisa abrir para saber o que tem dentro. O cartão mostra a lista de peças
 * direto na conversa — e, como sai da mesma string do link, os dois nunca
 * divergem.
 *
 * O desenho é montado pelo Satori, que entende flexbox e pouco mais: nada de
 * grid, nada de variável CSS. Por isso as cores estão escritas à mão aqui,
 * copiadas de `globals.css`, em vez de virem do tema.
 */

/*
 * As fontes não dependem do pedido, então são lidas uma vez na carga do módulo.
 * `next/font` não serve aqui: ele entrega classe CSS, e o Satori precisa dos
 * bytes do arquivo.
 */
const [corpo, titulo] = await Promise.all([
  readFile(join(process.cwd(), 'assets', 'Barlow-Regular.ttf')),
  readFile(join(process.cwd(), 'assets', 'BarlowCondensed-SemiBold.ttf')),
]);

const COR = {
  fundo: '#0d100c',
  linha: '#232a1e',
  texto: '#e4e8dc',
  fraco: '#6d7a5e',
  destaque: '#ff8a00',
  tinta: '#14170f',
};

const LINHA = 92;
const CABECALHO = 86;
const RODAPE = 20;
const LARGURA = 760;
/** Faixa da foto da arma, entre o cabeçalho e a lista. */
const FOTO = 210;

/**
 * A foto da arma, embutida no cartão.
 *
 * Vem de `public/weapons/card`, e não da foto que o site serve: o cartão é
 * montado pelo Satori, que não lê WebP — apontar para o arquivo original
 * derruba a renderização inteira, sem erro que ajude a descobrir por quê. As
 * cópias em PNG saem de `scripts/download_images.py`.
 *
 * Precisa ir como `data:` porque, fora do navegador, caminho relativo não tem
 * de onde ser resolvido. Arma sem arquivo devolve nulo, e o cartão nem abre
 * espaço para a faixa.
 */
async function fotoDaArma(id: string): Promise<string | null> {
  try {
    const bytes = await readFile(join(process.cwd(), 'public', 'weapons', 'card', `${id}.png`));
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * O ícone da peça, redesenhado no que o Satori aceita.
 *
 * `AttachmentIcon` monta o desenho como o navegador gosta: agrupa traços em
 * fragmentos e deixa `stroke` e `fill` no `<svg>` de fora, para os filhos
 * herdarem. O Satori não faz nenhuma das duas coisas — fragmento derruba a
 * renderização e atributo de apresentação não desce para o filho.
 *
 * Como o componente é função pura, dá para chamá-lo e reaproveitar o desenho:
 * o que sai daqui é a mesma silhueta, com os fragmentos desfeitos e cada traço
 * carregando os próprios atributos.
 */
function iconeParaSatori(peca: Attachment, tamanho: number): ReactElement {
  const svg = AttachmentIcon({ attachment: peca, slot: peca.slot, size: tamanho }) as ReactElement<
    Record<string, unknown> & { children?: ReactNode }
  >;

  const { children, viewBox, ...presentation } = svg.props;
  // O traço acompanha a cor do texto no site; no cartão ela precisa ser literal.
  const herdado = Object.fromEntries(
    Object.entries(presentation).filter(
      ([chave]) => !['width', 'height', 'style', 'aria-hidden'].includes(chave),
    ),
  );
  if (herdado.stroke === 'currentColor') herdado.stroke = COR.texto;
  if (herdado.fill === 'currentColor') herdado.fill = COR.texto;

  const tracos: ReactElement[] = [];
  const achatar = (no: ReactNode) => {
    if (no == null || typeof no === 'boolean') return;
    if (Array.isArray(no)) return no.forEach(achatar);
    if (!isValidElement(no)) return;
    const elemento = no as ReactElement<{ children?: ReactNode }>;
    if (elemento.type === Fragment) return achatar(elemento.props.children);
    // Atributo próprio do traço vence o herdado — é o que dá o detalhe fino.
    tracos.push(cloneElement(elemento, { ...herdado, ...elemento.props, key: tracos.length }));
  };
  achatar(children);

  return (
    <svg viewBox={viewBox as string} width={tamanho} height={tamanho}>
      {tracos}
    </svg>
  );
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get(LOADOUT_PARAM);
  const loadout = code ? decodeLoadout(code) : null;
  const weapon = loadout?.weapon ? WEAPONS_BY_ID.get(loadout.weapon) : null;

  if (!loadout || !weapon) return new Response('Loadout inválido', { status: 400 });

  const pecas = loadoutAttachments(loadout.attachments, weapon);
  const gasto = pecas.reduce((soma, peca) => soma + peca.cost, 0);
  const teto = budgetFor(weapon.category);
  const temporada = seasonLabel(new Date());
  const foto = await fotoDaArma(weapon.id);
  const altura = CABECALHO + (foto ? FOTO : 0) + pecas.length * LINHA + RODAPE;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: COR.fundo,
          fontFamily: 'Barlow',
          color: COR.texto,
        }}
      >
        {/* Cabeçalho: a arma à esquerda, o quanto da verba foi gasto à direita. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 28px',
            borderBottom: `2px solid ${COR.linha}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Barlow Condensed',
              fontSize: 34,
              letterSpacing: 0.5,
            }}
          >
            {weapon.name.toUpperCase()}
            {temporada ? (
              <span style={{ color: COR.fraco, marginLeft: 12 }}>— {temporada.toUpperCase()}</span>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Barlow Condensed',
              fontSize: 30,
              color: COR.destaque,
            }}
          >
            {gasto}/{teto}
          </div>
        </div>

        {/* A arma inteira, montada de fábrica — é o que identifica a build de relance. */}
        {foto ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: FOTO,
              borderBottom: `2px solid ${COR.linha}`,
            }}
          >
            <img src={foto} alt="" width={LARGURA - 80} height={FOTO - 30} style={{ objectFit: 'contain' }} />
          </div>
        ) : null}

        {/* Uma linha por peça, na ordem dos slots da arma. */}
        <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 10 }}>
          {pecas.map((peca, indice) => (
            <div
              key={peca.id}
              style={{ display: 'flex', alignItems: 'center', height: LINHA, padding: '0 28px' }}
            >
              {/* O número no quadrado de destaque é o que dá a leitura de lista. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 38,
                  height: 38,
                  backgroundColor: COR.destaque,
                  color: COR.tinta,
                  fontFamily: 'Barlow Condensed',
                  fontSize: 26,
                }}
              >
                {indice + 1}
              </div>

              {/* No lugar da foto da peça, o ícone que o site já desenha. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 78,
                  height: 60,
                }}
              >
                {iconeParaSatori(peca, 52)}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Barlow Condensed',
                    fontSize: 32,
                    letterSpacing: 0.4,
                  }}
                >
                  {peca.name.toUpperCase()}
                </div>
                <div style={{ display: 'flex', fontSize: 20, color: COR.fraco, marginTop: 2 }}>
                  {(SLOTS_BY_ID.get(peca.slot)?.name ?? peca.slot).toUpperCase()} · {peca.cost} pts
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: LARGURA,
      height: altura,
      fonts: [
        { name: 'Barlow', data: corpo, weight: 400, style: 'normal' },
        { name: 'Barlow Condensed', data: titulo, weight: 600, style: 'normal' },
      ],
    },
  );
}
