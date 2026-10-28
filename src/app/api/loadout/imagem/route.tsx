import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ImageResponse } from 'next/og';
import { AttachmentIcon } from '@/components/icons/attachment-icon';
import { SHORT_CATEGORY_NAMES, SLOTS_BY_ID, budgetFor } from '@/data/classes';
import { seasonLabel, seasonOn } from '@/data/season';
import { WEAPONS_BY_ID } from '@/data/weapons';
import type { Attachment, Weapon } from '@/data/types';
import { effectiveRange, timeToKill } from '@/lib/ballistics';
import { attachmentCost, attachmentName, loadoutAttachments } from '@/lib/loadout';
import {
  IMAGE_FORMATS,
  IMAGE_FORMAT_PARAM,
  LOADOUT_PARAM,
  decodeLoadout,
  parseImageFormat,
} from '@/lib/share';
import { calculateStats } from '@/lib/stats';

/**
 * O loadout como cartão de imagem, no padrão do Instagram.
 *
 * O link já carrega a build inteira, mas link não se lê de relance: quem recebe
 * precisa abrir para saber o que tem dentro. O cartão mostra a lista de peças
 * direto na conversa — e, como sai da mesma string do link, os dois nunca
 * divergem.
 *
 * Ele tinha largura fixa e a altura que a lista pedisse, o que servia para a
 * conversa e para mais nada: no Instagram, que é onde build de Battlefield
 * circula, uma proporção qualquer chega cortada no feed ou com tarja no story.
 * Agora o cartão sai nas medidas do aplicativo — 1080x1350 no feed, 1080x1920
 * no story (ver `IMAGE_FORMATS`) — e a altura fixa é preenchida pela foto da
 * arma, que cresce quando a lista é curta.
 *
 * E como a imagem passa a circular sozinha, longe do link, ela carrega a marca
 * do site: sem isso, quem vê o post não tem como chegar até aqui.
 *
 * O desenho é montado pelo Satori, que entende flexbox e pouco mais: nada de
 * grid, nada de variável CSS. Por isso as cores estão escritas à mão aqui,
 * copiadas de `globals.css`, em vez de virem do tema.
 */

/*
 * As fontes e o ícone não dependem do pedido, então são lidos uma vez na carga
 * do módulo. `next/font` não serve aqui: ele entrega classe CSS, e o Satori
 * precisa dos bytes do arquivo.
 *
 * O ícone é o mesmo do aplicativo instalado, na versão de 192 px — a de 32 px
 * de `src/app/icon.png` sai borrada no tamanho em que a marca aparece, e a de
 * 512 px só engordaria o cartão. Vai como `data:` pelo mesmo motivo da foto da
 * arma: fora do navegador, caminho relativo não tem de onde ser resolvido.
 */
const [corpo, titulo, icone] = await Promise.all([
  readFile(join(process.cwd(), 'assets', 'Barlow-Regular.ttf')),
  readFile(join(process.cwd(), 'assets', 'BarlowCondensed-SemiBold.ttf')),
  readFile(join(process.cwd(), 'public', 'icon-192.png')),
]);
const ICONE = `data:image/png;base64,${icone.toString('base64')}`;

/** O endereço que vai na marca d'água — o que o jogador digita para chegar aqui. */
const ENDERECO = 'bf6-loadouts.vercel.app';

const COR = {
  fundo: '#0d100c',
  elevado: '#12160f',
  linha: '#232a1e',
  texto: '#e4e8dc',
  suave: '#97a288',
  fraco: '#6d7a5e',
  destaque: '#ff8a00',
  tinta: '#080a08',
};

/*
 * Medidas do miolo do cartão.
 *
 * O feed e o story têm praticamente a mesma área útil: o story tem 1920 de
 * altura, mas o aplicativo cobre 250 no topo e 340 no pé, e sobram 1330 —
 * vinte a menos que os 1350 do feed. Por isso os dois usam o mesmo miolo, e o
 * story só ganha as duas faixas de fora, decorativas, onde nada importante pode
 * ficar.
 *
 * As alturas fixas existem porque a foto precisa de tamanho em número: o
 * Satori não estica imagem com flex, e a foto é o que absorve a sobra.
 */
const MARGEM = 60;
const LARGURA_UTIL = 1080 - MARGEM * 2;
const TOPO_MIOLO = 44;
const CABECALHO = 158;
const VAO = 26;
const NUMEROS = 104;
const LINHA = 80;
const VAO_LINHA = 10;
const COLUNAS_VAO = 20;
const RODAPE = 112;
/** Foto mais alta que isso vira uma arma gigante num mar de fundo de estúdio. */
const FOTO_MAXIMA = 600;

/** Uma cor em hexadecimal com transparência — o degradê do Satori não aceita `transparent` limpo. */
function comAlfa(hex: string, alfa: number): string {
  const valor = hex.replace('#', '');
  const cheio = valor.length === 3 ? [...valor].map((c) => c + c).join('') : valor;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(cheio.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

interface Foto {
  src: string;
  largura: number;
  altura: number;
}

/**
 * A foto da arma, embutida no cartão.
 *
 * Vem de `public/weapons/card`, e não da foto que o site serve: o cartão é
 * montado pelo Satori, que não lê WebP — apontar para o arquivo original
 * derruba a renderização inteira, sem erro que ajude a descobrir por quê. As
 * cópias em PNG saem de `scripts/download_images.py`.
 *
 * As medidas saem do cabeçalho do próprio PNG (largura e altura moram nos
 * bytes 16 a 24). Elas são o que permite desenhar a foto já no tamanho final e
 * esfumar as bordas dela no fundo: com `objectFit` sozinho, a moldura seria a
 * caixa inteira e a borda da foto ficaria marcada no meio do cartão.
 *
 * Precisa ir como `data:` porque, fora do navegador, caminho relativo não tem
 * de onde ser resolvido. Arma sem arquivo devolve nulo, e o cartão mostra a
 * faixa vazia com o nome da arma no lugar.
 */
async function fotoDaArma(id: string): Promise<Foto | null> {
  try {
    const bytes = await readFile(join(process.cwd(), 'public', 'weapons', 'card', `${id}.png`));
    return {
      src: `data:image/png;base64,${bytes.toString('base64')}`,
      largura: bytes.readUInt32BE(16),
      altura: bytes.readUInt32BE(20),
    };
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
function iconeParaSatori(peca: Attachment, tamanho: number, corTexto: string): ReactElement {
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
  if (herdado.stroke === 'currentColor') herdado.stroke = corTexto;
  if (herdado.fill === 'currentColor') herdado.fill = corTexto;

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

type Cores = Record<keyof typeof COR, string>;

/**
 * Os quatro números que respondem "essa build é boa?" sem abrir o site.
 *
 * São os mesmos do topo do painel de números, calculados com as peças
 * escolhidas — quem vê o post compara a build com a própria pelo que importa
 * na troca de tiro: quanto demora para derrubar, quão rápido atira, até onde
 * segura o dano e quanto aguenta antes de recarregar.
 */
function numerosDaBuild(weapon: Weapon, pecas: Attachment[]): { rotulo: string; valor: string }[] {
  if (weapon.category === 'melee') return [];
  const stats = calculateStats(weapon, pecas);
  const ttk = timeToKill(stats, 0);
  const alcance = effectiveRange(stats);
  return [
    { rotulo: 'Tempo p/ matar', valor: Number.isFinite(ttk) ? `${Math.round(ttk)} ms` : '—' },
    { rotulo: 'Cadência', valor: stats.rpm > 0 ? `${stats.rpm} rpm` : '—' },
    { rotulo: 'Alcance efetivo', valor: alcance > 0 ? `${Math.round(alcance)} m` : 'constante' },
    { rotulo: 'Carregador', valor: `${stats.magazine}` },
  ];
}

/**
 * A marca do site, no desenho do cabeçalho: "ARSENAL" na cor do texto e "BF6"
 * no destaque. É a mesma grafia que o jogador vê no topo de toda página, então
 * quem já passou por aqui reconhece de longe.
 */
function Marca({ tamanho, cor, iconeTamanho }: { tamanho: number; cor: Cores; iconeTamanho: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <img src={ICONE} alt="" width={iconeTamanho} height={iconeTamanho} />
      <div
        style={{
          display: 'flex',
          marginLeft: Math.round(iconeTamanho * 0.28),
          fontFamily: 'Barlow Condensed',
          fontSize: tamanho,
          letterSpacing: tamanho * 0.04,
          lineHeight: 1,
          color: cor.texto,
        }}
      >
        ARSENAL
        <span style={{ color: cor.destaque, marginLeft: tamanho * 0.22 }}>BF6</span>
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get(LOADOUT_PARAM);
  const loadout = code ? decodeLoadout(code) : null;
  const weapon = loadout?.weapon ? WEAPONS_BY_ID.get(loadout.weapon) : null;

  if (!loadout || !weapon) return new Response('Loadout inválido', { status: 400 });

  const formato = IMAGE_FORMATS[parseImageFormat(params.get(IMAGE_FORMAT_PARAM))];
  const story = formato.topo > 0 || formato.base > 0;

  const pecas = loadoutAttachments(loadout.attachments, weapon);
  const gasto = pecas.reduce((soma, peca) => soma + attachmentCost(peca, weapon), 0);
  const teto = budgetFor(weapon.category);
  const temporada = seasonLabel(new Date());
  const palette = seasonOn(new Date())?.palette?.dark;
  const cor: Cores = {
    fundo: palette?.surface ?? COR.fundo,
    elevado: palette?.surfaceRaised ?? COR.elevado,
    linha: palette?.border ?? COR.linha,
    texto: palette?.text ?? COR.texto,
    suave: palette?.textSoft ?? COR.suave,
    fraco: palette?.textDim ?? COR.fraco,
    destaque: palette?.accent ?? COR.destaque,
    tinta: palette?.bg ?? COR.tinta,
  };
  const foto = await fotoDaArma(weapon.id);
  const numeros = numerosDaBuild(weapon, pecas);

  /*
   * A conta da altura da foto: o miolo tem altura fixa, e tudo que não é foto
   * tem altura conhecida. O que sobra vai para a foto, até o teto; o que passa
   * do teto vira respiro entre os blocos (o `space-between` do miolo).
   */
  const miolo = formato.altura - formato.topo - formato.base;
  const linhas = Math.ceil(pecas.length / 2);
  const lista = linhas > 0 ? linhas * LINHA + (linhas - 1) * VAO_LINHA : 0;
  const blocos = [CABECALHO, NUMEROS * Math.sign(numeros.length), lista].filter((altura) => altura > 0);
  const ocupado = TOPO_MIOLO + blocos.reduce((soma, altura) => soma + altura + VAO, 0) + VAO + RODAPE;
  const alturaFoto = Math.max(240, Math.min(FOTO_MAXIMA, miolo - ocupado));

  /*
   * A foto desenhada no tamanho final, dentro da faixa. Quase todas as fotos
   * são de estúdio, com fundo cinza, então o degradê das bordas é o que funde
   * o retângulo da foto no fundo do cartão, em vez de deixá-lo recortado no
   * meio da faixa. A faixa é lisa, na cor exata do degradê: assim a mesma
   * máscara serve para as poucas fotos recortadas, de fundo transparente —
   * pintar a cor do fundo sobre o próprio fundo não deixa marca.
   *
   * A conta desconta a borda da faixa (2 px de cada lado): o Satori mede a
   * caixa com a borda dentro, e a foto do tamanho da caixa inteira passava por
   * cima do fio.
   */
  const BORDA_FOTO = 2;
  const faixa = { largura: LARGURA_UTIL, altura: alturaFoto };
  const escala = foto
    ? Math.min(
        (faixa.largura - BORDA_FOTO * 2) / foto.largura,
        (faixa.altura - BORDA_FOTO * 2) / foto.altura,
      )
    : 0;
  const desenho = foto
    ? { largura: Math.round(foto.largura * escala), altura: Math.round(foto.altura * escala) }
    : null;

  const colunaLargura = (LARGURA_UTIL - COLUNAS_VAO) / 2;

  const cartao = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: formato.largura,
        height: miolo,
        position: 'relative',
        backgroundColor: cor.fundo,
      }}
    >
      {/*
        A marca grande, em diagonal e quase apagada, atrás de tudo. Ela não
        disputa leitura com nada — está ali para que um recorte do cartão (um
        print da lista, por exemplo) ainda carregue o nome do site.
      */}
      <div
        style={{
          position: 'absolute',
          left: -200,
          top: miolo / 2 - 160,
          width: formato.largura + 400,
          height: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(-24deg)',
          fontFamily: 'Barlow Condensed',
          fontSize: 260,
          letterSpacing: 14,
          color: cor.texto,
          opacity: 0.035,
        }}
      >
        ARSENAL BF6
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: `${TOPO_MIOLO}px ${MARGEM}px 0` }}>
        {/* Cabeçalho: categoria e temporada em cima, a arma em letra grande, a verba à direita. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: CABECALHO,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                fontFamily: 'Barlow Condensed',
                fontSize: 28,
                letterSpacing: 3,
                color: cor.fraco,
              }}
            >
              <div style={{ display: 'flex', width: 14, height: 14, backgroundColor: cor.destaque, marginRight: 14 }} />
              <span style={{ color: cor.destaque }}>
                {SHORT_CATEGORY_NAMES[weapon.category].toUpperCase()}
              </span>
              {temporada ? <span style={{ marginLeft: 10 }}>· {temporada.toUpperCase()}</span> : null}
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Barlow Condensed',
                fontSize: weapon.name.length > 10 ? 96 : 116,
                lineHeight: 1,
                letterSpacing: 1,
                marginTop: 10,
                color: cor.texto,
              }}
            >
              {weapon.name.toUpperCase()}
            </div>
          </div>

          {/* A verba gasta: diz de relance se a build cabe na classe. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              paddingBottom: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                fontFamily: 'Barlow Condensed',
                fontSize: 64,
                lineHeight: 1,
                color: cor.destaque,
              }}
            >
              {gasto}
              <span style={{ fontSize: 36, color: cor.fraco, marginLeft: 4 }}>/{teto}</span>
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Barlow Condensed',
                fontSize: 22,
                letterSpacing: 3,
                color: cor.fraco,
                marginTop: 4,
              }}
            >
              PONTOS
            </div>
          </div>
        </div>
      </div>

      {/* A arma inteira, montada de fábrica — é o que identifica a build de relance. */}
      <div style={{ display: 'flex', padding: `0 ${MARGEM}px` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: faixa.largura,
            height: faixa.altura,
            backgroundColor: cor.tinta,
            border: `${BORDA_FOTO}px solid ${cor.linha}`,
          }}
        >
          {foto && desenho ? (
            <div style={{ display: 'flex', position: 'relative', width: desenho.largura, height: desenho.altura }}>
              <img src={foto.src} alt="" width={desenho.largura} height={desenho.altura} />
              {/* As bordas da foto somem no fundo, nos quatro lados. */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: desenho.largura,
                  height: desenho.altura,
                  display: 'flex',
                  backgroundImage: `linear-gradient(to right, ${cor.tinta} 0%, ${comAlfa(cor.tinta, 0.55)} 9%, ${comAlfa(cor.tinta, 0)} 24%, ${comAlfa(cor.tinta, 0)} 76%, ${comAlfa(cor.tinta, 0.55)} 91%, ${cor.tinta} 100%)`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: desenho.largura,
                  height: desenho.altura,
                  display: 'flex',
                  backgroundImage: `linear-gradient(to bottom, ${comAlfa(cor.tinta, 0.9)} 0%, ${comAlfa(cor.tinta, 0)} 12%, ${comAlfa(cor.tinta, 0)} 85%, ${comAlfa(cor.tinta, 0.9)} 100%)`,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                fontFamily: 'Barlow Condensed',
                fontSize: 180,
                color: cor.linha,
              }}
            >
              {weapon.name.toUpperCase()}
            </div>
          )}

          {/*
            O selo sobre a foto. A faixa de rodapé já assina o cartão, mas é a
            foto que vai parar recortada em print e repost — o selo fica nela,
            com fundo escuro próprio para ser lido sobre qualquer arma.
          */}
          <div
            style={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              display: 'flex',
              alignItems: 'center',
              padding: '8px 14px 8px 10px',
              backgroundColor: comAlfa(cor.tinta, 0.78),
              border: `1px solid ${comAlfa(cor.texto, 0.14)}`,
            }}
          >
            <Marca tamanho={26} cor={cor} iconeTamanho={30} />
          </div>
        </div>
      </div>

      {/* Os números que mudam com as peças, no tamanho em que se leem no celular. */}
      {numeros.length > 0 ? (
        <div style={{ display: 'flex', padding: `0 ${MARGEM}px`, height: NUMEROS }}>
          {numeros.map((numero, indice) => (
            <div
              key={numero.rotulo}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flex: 1,
                marginLeft: indice === 0 ? 0 : 14,
                padding: '0 18px',
                backgroundColor: cor.elevado,
                borderLeft: `4px solid ${cor.destaque}`,
              }}
            >
              <div style={{ display: 'flex', fontSize: 19, letterSpacing: 1.5, color: cor.fraco }}>
                {numero.rotulo.toUpperCase()}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Barlow Condensed',
                  fontSize: 48,
                  lineHeight: 1.05,
                  color: cor.texto,
                }}
              >
                {numero.valor}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/*
        As peças em duas colunas, na ordem dos slots da arma. Uma coluna só não
        cabe: com os dez slots cheios, a lista sozinha comeria a altura do feed
        inteiro e a foto sumiria.
      */}
      {pecas.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            padding: `0 ${MARGEM}px`,
            height: lista,
          }}
        >
          {pecas.map((peca, indice) => (
            <div
              key={peca.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: colunaLargura,
                height: LINHA,
                marginTop: indice < 2 ? 0 : VAO_LINHA,
                borderBottom: `2px solid ${cor.linha}`,
              }}
            >
              {/* No lugar da foto da peça, o ícone que o site já desenha. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 64,
                  height: 64,
                  flexShrink: 0,
                  backgroundColor: cor.elevado,
                  border: `1px solid ${cor.linha}`,
                }}
              >
                {iconeParaSatori(peca, 46, cor.texto)}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  width: colunaLargura - 64 - 16 - 64,
                  marginLeft: 16,
                }}
              >
                <div style={{ display: 'flex', fontSize: 17, letterSpacing: 1.5, color: cor.fraco }}>
                  {(SLOTS_BY_ID.get(peca.slot)?.name ?? peca.slot).toUpperCase()}
                </div>
                <div
                  style={{
                    display: 'block',
                    fontFamily: 'Barlow Condensed',
                    fontSize: 27,
                    lineHeight: 1.02,
                    letterSpacing: 0.3,
                    marginTop: 2,
                    color: cor.texto,
                    lineClamp: 2,
                  }}
                >
                  {attachmentName(peca, weapon).toUpperCase()}
                </div>
              </div>

              {/* O custo à direita, alinhado, para a soma se conferir de olho. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  width: 64,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Barlow Condensed',
                    fontSize: 34,
                    lineHeight: 1,
                    color: cor.destaque,
                  }}
                >
                  {attachmentCost(peca, weapon)}
                </div>
                <div style={{ display: 'flex', fontSize: 14, letterSpacing: 1.5, color: cor.fraco }}>PTS</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/*
        A assinatura do cartão: a marca à esquerda e o endereço à direita, numa
        faixa de fundo escuro com o fio de destaque em cima. É o que transforma
        um post bonito em caminho de volta para o site — por isso o endereço
        vai por extenso, em tamanho de ler sem ampliar.
      */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: RODAPE,
          padding: `0 ${MARGEM}px`,
          backgroundColor: cor.tinta,
          borderTop: `3px solid ${cor.destaque}`,
        }}
      >
        <Marca tamanho={50} cor={cor} iconeTamanho={58} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Barlow Condensed',
              fontSize: 20,
              letterSpacing: 3,
              color: cor.fraco,
            }}
          >
            MONTE O SEU EM
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: cor.texto, marginTop: 2 }}>{ENDERECO}</div>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(
    story ? (
      /*
       * No story, o miolo fica entre as duas faixas que o Instagram cobre. Elas
       * não ficam vazias — um story com tarjas lisas parece imagem colada no
       * tamanho errado —, mas só levam enfeite: listras e a marca em letra
       * enorme, que podem sumir atrás da interface sem perder informação.
       */
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: cor.tinta,
          fontFamily: 'Barlow',
          color: cor.texto,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            height: formato.topo,
            paddingBottom: 26,
            backgroundImage: `repeating-linear-gradient(135deg, ${comAlfa(cor.destaque, 0.07)} 0px, ${comAlfa(cor.destaque, 0.07)} 18px, ${comAlfa(cor.destaque, 0)} 18px, ${comAlfa(cor.destaque, 0)} 44px)`,
            borderBottom: `3px solid ${cor.destaque}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Barlow Condensed',
              fontSize: 30,
              letterSpacing: 10,
              color: cor.fraco,
            }}
          >
            LOADOUT · BATTLEFIELD 6
          </div>
        </div>

        {cartao}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: formato.base,
            backgroundImage: `repeating-linear-gradient(135deg, ${comAlfa(cor.destaque, 0.07)} 0px, ${comAlfa(cor.destaque, 0.07)} 18px, ${comAlfa(cor.destaque, 0)} 18px, ${comAlfa(cor.destaque, 0)} 44px)`,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Barlow Condensed',
              fontSize: 150,
              lineHeight: 1,
              letterSpacing: 8,
              color: comAlfa(cor.texto, 0.08),
            }}
          >
            ARSENAL BF6
          </div>
        </div>
      </div>
    ) : (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          fontFamily: 'Barlow',
          color: cor.texto,
        }}
      >
        {cartao}
      </div>
    ),
    {
      width: formato.largura,
      height: formato.altura,
      fonts: [
        { name: 'Barlow', data: corpo, weight: 400, style: 'normal' },
        { name: 'Barlow Condensed', data: titulo, weight: 600, style: 'normal' },
      ],
      /*
       * O cartão é função pura do código que está no endereço: mesmo código,
       * mesmo desenho. Agora que o link é colado em conversa, cada pessoa que
       * vê a mensagem busca esta rota — sem cache, cada uma pagaria uma
       * renderização do zero. A semana na borda é o teto de quanto tempo um
       * redesenho do cartão demora a aparecer nos links já compartilhados.
       *
       * O formato entra no endereço como parâmetro de busca, então feed e story
       * são entradas separadas no mesmo cache, sem regra nova.
       */
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000',
      },
    },
  );
}
