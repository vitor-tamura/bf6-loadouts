'use client';

import { useMemo, type ReactNode } from 'react';
import type { Acessorio, Arma, IdSlot, PecaAcessorio } from '@/dados/tipos';
import { Bloco, COR } from './paleta';
import { CANO_PADRAO, COMPRIMENTO_CANO, desenharPeca } from './pecas';
import { silhuetaDe } from './silhuetas';

/**
 * Preview da arma montada.
 *
 * A silhueta vem do arquétipo e cada acessório com peça desenhável é encaixado
 * na âncora do seu slot. Trocar o cano realmente estica a arma e empurra a boca
 * de fogo para frente — é o retorno visual que o jogador espera ao montar.
 */

interface Props {
  arma: Arma;
  acessorios: Acessorio[];
  /** Mostra o nome da arma no canto do desenho. */
  comRotulo?: boolean;
  className?: string;
}

/**
 * Posiciona uma peça na âncora. O translate fica no grupo externo, como
 * atributo, e a animação no interno — no SVG a propriedade CSS `transform`
 * sobrescreveria o atributo e a peça iria parar no canto da tela.
 */
function Encaixe({
  x,
  y,
  chave,
  children,
}: {
  x: number;
  y: number;
  chave: string;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g key={chave} className="peca-encaixe">
        {children}
      </g>
    </g>
  );
}

function pecaDoSlot(acessorios: Acessorio[], slot: IdSlot): PecaAcessorio | undefined {
  return acessorios.find((a) => a.slot === slot)?.peca;
}

export function ArmaSvg({ arma, acessorios, comRotulo = false, className }: Props) {
  const silhueta = useMemo(() => silhuetaDe(arma.arquetipo), [arma.arquetipo]);
  const { ancoras, aceita } = silhueta;

  const pecaCano = aceita.cano ? pecaDoSlot(acessorios, 'cano') : undefined;
  const pecaBoca = aceita.cano ? pecaDoSlot(acessorios, 'boca') : undefined;
  const pecaMira = aceita.mira ? pecaDoSlot(acessorios, 'mira') : undefined;
  const pecaOptico = aceita.mira ? pecaDoSlot(acessorios, 'opticoExtra') : undefined;
  const pecaAcopl = aceita.acoplamento ? pecaDoSlot(acessorios, 'acoplamento') : undefined;
  const pecaCarreg = aceita.carregador ? pecaDoSlot(acessorios, 'carregador') : undefined;
  const pecaErgo = aceita.coronha ? pecaDoSlot(acessorios, 'ergonomia') : undefined;
  const pecaEsq = pecaDoSlot(acessorios, 'lateralEsquerda');
  const pecaDir = pecaDoSlot(acessorios, 'lateralDireita');

  const comprimentoCano = pecaCano ? (COMPRIMENTO_CANO[pecaCano] ?? CANO_PADRAO) : CANO_PADRAO;
  const boca = { x: ancoras.canoBase.x + comprimentoCano, y: ancoras.canoBase.y };

  /**
   * Enquadramento próprio de cada arma, para que nem a pistola fique perdida no
   * meio do quadro nem a metralhadora encoste nas bordas. A caixa considera o
   * cano e a mira MAIS longos possíveis, e não o que está montado agora — assim
   * o desenho não dá um pulo de escala a cada acessório trocado.
   */
  const caixa = useMemo(() => {
    const folgaCano = aceita.cano ? 150 : 30;
    const x0 = Math.min(ancoras.coronha.x, ancoras.trilho.x - 60) - 40;
    const x1 = Math.max(ancoras.canoBase.x + folgaCano, ancoras.lateral.x + 70);
    const y0 = (aceita.mira ? ancoras.trilho.y - 46 : ancoras.trilho.y - 20) - 8;
    const y1 = Math.max(ancoras.carregador.y + 58, ancoras.inferior.y + 40) + 8;
    return { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 };
  }, [ancoras, aceita]);

  return (
    <svg
      viewBox={`${caixa.x} ${caixa.y} ${caixa.largura} ${caixa.altura}`}
      className={className}
      role="img"
      aria-label={`Desenho da ${arma.nome} com os acessórios escolhidos`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Coronha, atrás de tudo. */}
      {aceita.coronha && (
        <Encaixe x={ancoras.coronha.x} y={ancoras.coronha.y} chave={`ergo-${pecaErgo ?? 'padrao'}`}>
          {pecaErgo ? (
            desenharPeca(pecaErgo)
          ) : (
            <g>
              <polygon points="0,-15 -18,-15 -42,-10 -42,8 -20,8 0,15" fill={COR.polimero} />
              <polygon points="0,-15 -18,-15 -42,-10 -42,-5 -18,-10 0,-10" fill={COR.polimeroLuz} />
              <polygon points="-42,4 -20,4 0,11 0,15 -20,8 -42,8" fill={COR.polimeroSombra} />
            </g>
          )}
        </Encaixe>
      )}

      {/* Cano: peça escolhida ou o tubo de fábrica. */}
      {aceita.cano && (
        <Encaixe x={ancoras.canoBase.x} y={ancoras.canoBase.y} chave={`cano-${pecaCano ?? 'padrao'}`}>
          {pecaCano ? (
            desenharPeca(pecaCano)
          ) : (
            <Bloco
              x={0}
              y={-6}
              largura={CANO_PADRAO}
              altura={12}
              cor={COR.metal}
              luz={COR.metalLuz}
              sombra={COR.metalSombra}
            />
          )}
        </Encaixe>
      )}

      {/* Boca de fogo, sempre na ponta do cano atual. */}
      {aceita.cano && pecaBoca && (
        <Encaixe x={boca.x} y={boca.y} chave={`boca-${pecaBoca}`}>
          {desenharPeca(pecaBoca)}
        </Encaixe>
      )}

      {/* Corpo da arma. */}
      {silhueta.corpo}

      {/* Carregador. */}
      {aceita.carregador && (
        <Encaixe
          x={ancoras.carregador.x}
          y={ancoras.carregador.y}
          chave={`carreg-${pecaCarreg ?? 'padrao'}`}
        >
          {pecaCarreg ? (
            desenharPeca(pecaCarreg)
          ) : (
            <g>
              <polygon points="-9,0 9,0 7,30 -7,30" fill={COR.polimero} />
              <polygon points="-9,0 9,0 9,5 -9,5" fill={COR.polimeroLuz} />
              <polygon points="-7.3,25 7.3,25 7,30 -7,30" fill={COR.polimeroSombra} />
            </g>
          )}
        </Encaixe>
      )}

      {/* Acoplamento inferior. */}
      {pecaAcopl && (
        <Encaixe x={ancoras.inferior.x} y={ancoras.inferior.y} chave={`acopl-${pecaAcopl}`}>
          {desenharPeca(pecaAcopl)}
        </Encaixe>
      )}

      {/* Acessórios laterais. */}
      {pecaEsq && (
        <Encaixe x={ancoras.lateral.x} y={ancoras.lateral.y} chave={`esq-${pecaEsq}`}>
          {desenharPeca(pecaEsq)}
        </Encaixe>
      )}
      {pecaDir && (
        <Encaixe x={ancoras.lateral.x - 36} y={ancoras.lateral.y + 8} chave={`dir-${pecaDir}`}>
          {desenharPeca(pecaDir)}
        </Encaixe>
      )}

      {/* Miras, por cima de tudo. */}
      {pecaOptico && (
        <Encaixe x={ancoras.opticoExtra.x} y={ancoras.opticoExtra.y} chave={`opt-${pecaOptico}`}>
          {desenharPeca(pecaOptico)}
        </Encaixe>
      )}
      {pecaMira && (
        <Encaixe x={ancoras.trilho.x} y={ancoras.trilho.y} chave={`mira-${pecaMira}`}>
          {desenharPeca(pecaMira)}
        </Encaixe>
      )}

      {comRotulo && (
        <text
          x={caixa.x + caixa.largura - 8}
          y={caixa.y + caixa.altura - 8}
          textAnchor="end"
          fill={COR.destaque}
          opacity={0.55}
          style={{ font: '600 15px var(--font-display)', letterSpacing: '0.12em' }}
        >
          {arma.nome.toUpperCase()}
        </text>
      )}
    </svg>
  );
}
