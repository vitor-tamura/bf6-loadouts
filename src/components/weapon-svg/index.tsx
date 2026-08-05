'use client';

import { useMemo, type ReactNode } from 'react';
import type { Attachment, Weapon, SlotId, AttachmentPart } from '@/data/types';
import { Block, COLOR } from './palette';
import { DEFAULT_BARREL_LENGTH, BARREL_LENGTH, drawPart } from './parts';
import { silhouetteFor } from './silhouettes';

/**
 * Preview da arma montada.
 *
 * A silhueta vem do arquétipo e cada acessório com peça desenhável é encaixado
 * na âncora do seu slot. Trocar o cano realmente estica a arma e empurra a boca
 * de fogo para frente — é o retorno visual que o jogador espera ao montar.
 */

interface Props {
  weapon: Weapon;
  attachments: Attachment[];
  /** Mostra o nome da arma no canto do desenho. */
  withLabel?: boolean;
  className?: string;
}

/**
 * Posiciona uma peça na âncora. O translate fica no grupo externo, como
 * atributo, e a animação no interno — no SVG a propriedade CSS `transform`
 * sobrescreveria o atributo e a peça iria parar no canto da tela.
 */
function Mount({
  x,
  y,
  statKey,
  children,
}: {
  x: number;
  y: number;
  statKey: string;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g key={statKey} className="peca-encaixe">
        {children}
      </g>
    </g>
  );
}

function partInSlot(attachments: Attachment[], slot: SlotId): AttachmentPart | undefined {
  return attachments.find((a) => a.slot === slot)?.part;
}

export function WeaponSvg({ weapon, attachments, withLabel = false, className }: Props) {
  const silhouette = useMemo(() => silhouetteFor(weapon.archetype), [weapon.archetype]);
  const { anchors, accepts } = silhouette;

  const pecaCano = accepts.cano ? partInSlot(attachments, 'cano') : undefined;
  const pecaBoca = accepts.cano ? partInSlot(attachments, 'boca') : undefined;
  const pecaMira = accepts.mira ? partInSlot(attachments, 'mira') : undefined;
  const pecaOptico = accepts.mira ? partInSlot(attachments, 'opticoExtra') : undefined;
  const pecaAcopl = accepts.acoplamento ? partInSlot(attachments, 'acoplamento') : undefined;
  const pecaCarreg = accepts.magazine ? partInSlot(attachments, 'carregador') : undefined;
  const pecaErgo = accepts.stock ? partInSlot(attachments, 'ergonomia') : undefined;
  const pecaEsq = partInSlot(attachments, 'lateralEsquerda');
  const pecaDir = partInSlot(attachments, 'lateralDireita');

  const barrelLength = pecaCano ? (BARREL_LENGTH[pecaCano] ?? DEFAULT_BARREL_LENGTH) : DEFAULT_BARREL_LENGTH;
  const muzzleTip = { x: anchors.barrelBase.x + barrelLength, y: anchors.barrelBase.y };

  /**
   * Enquadramento próprio de cada arma, para que nem a pistola fique perdida no
   * meio do quadro nem a metralhadora encoste nas bordas. A caixa considera o
   * cano e a mira MAIS longos possíveis, e não o que está montado agora — assim
   * o desenho não dá um pulo de escala a cada acessório trocado.
   */
  const viewBox = useMemo(() => {
    const folgaCano = accepts.cano ? 150 : 30;
    const x0 = Math.min(anchors.stock.x, anchors.rail.x - 60) - 40;
    const x1 = Math.max(anchors.barrelBase.x + folgaCano, anchors.side.x + 70);
    const y0 = (accepts.mira ? anchors.rail.y - 46 : anchors.rail.y - 20) - 8;
    const y1 = Math.max(anchors.magazine.y + 58, anchors.underbarrel.y + 40) + 8;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }, [anchors, accepts]);

  return (
    <svg
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      className={className}
      role="img"
      aria-label={`Desenho da ${weapon.name} com os acessórios escolhidos`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Coronha, atrás de tudo. */}
      {accepts.stock && (
        <Mount x={anchors.stock.x} y={anchors.stock.y} statKey={`ergo-${pecaErgo ?? 'padrao'}`}>
          {pecaErgo ? (
            drawPart(pecaErgo)
          ) : (
            <g>
              <polygon points="0,-15 -18,-15 -42,-10 -42,8 -20,8 0,15" fill={COLOR.polimero} />
              <polygon points="0,-15 -18,-15 -42,-10 -42,-5 -18,-10 0,-10" fill={COLOR.polimeroLuz} />
              <polygon points="-42,4 -20,4 0,11 0,15 -20,8 -42,8" fill={COLOR.polimeroSombra} />
            </g>
          )}
        </Mount>
      )}

      {/* Cano: peça escolhida ou o tubo de fábrica. */}
      {accepts.cano && (
        <Mount x={anchors.barrelBase.x} y={anchors.barrelBase.y} statKey={`cano-${pecaCano ?? 'padrao'}`}>
          {pecaCano ? (
            drawPart(pecaCano)
          ) : (
            <Block
              x={0}
              y={-6}
              width={DEFAULT_BARREL_LENGTH}
              height={12}
              color={COLOR.metal}
              light={COLOR.metalLuz}
              shadow={COLOR.metalSombra}
            />
          )}
        </Mount>
      )}

      {/* Boca de fogo, sempre na ponta do cano atual. */}
      {accepts.cano && pecaBoca && (
        <Mount x={muzzleTip.x} y={muzzleTip.y} statKey={`boca-${pecaBoca}`}>
          {drawPart(pecaBoca)}
        </Mount>
      )}

      {/* Corpo da arma. */}
      {silhouette.body}

      {/* Carregador. */}
      {accepts.magazine && (
        <Mount
          x={anchors.magazine.x}
          y={anchors.magazine.y}
          statKey={`carreg-${pecaCarreg ?? 'padrao'}`}
        >
          {pecaCarreg ? (
            drawPart(pecaCarreg)
          ) : (
            <g>
              <polygon points="-9,0 9,0 7,30 -7,30" fill={COLOR.polimero} />
              <polygon points="-9,0 9,0 9,5 -9,5" fill={COLOR.polimeroLuz} />
              <polygon points="-7.3,25 7.3,25 7,30 -7,30" fill={COLOR.polimeroSombra} />
            </g>
          )}
        </Mount>
      )}

      {/* Acoplamento inferior. */}
      {pecaAcopl && (
        <Mount x={anchors.underbarrel.x} y={anchors.underbarrel.y} statKey={`acopl-${pecaAcopl}`}>
          {drawPart(pecaAcopl)}
        </Mount>
      )}

      {/* Acessórios laterais. */}
      {pecaEsq && (
        <Mount x={anchors.side.x} y={anchors.side.y} statKey={`esq-${pecaEsq}`}>
          {drawPart(pecaEsq)}
        </Mount>
      )}
      {pecaDir && (
        <Mount x={anchors.side.x - 36} y={anchors.side.y + 8} statKey={`dir-${pecaDir}`}>
          {drawPart(pecaDir)}
        </Mount>
      )}

      {/* Miras, por cima de tudo. */}
      {pecaOptico && (
        <Mount x={anchors.opticExtra.x} y={anchors.opticExtra.y} statKey={`opt-${pecaOptico}`}>
          {drawPart(pecaOptico)}
        </Mount>
      )}
      {pecaMira && (
        <Mount x={anchors.rail.x} y={anchors.rail.y} statKey={`mira-${pecaMira}`}>
          {drawPart(pecaMira)}
        </Mount>
      )}

      {withLabel && (
        <text
          x={viewBox.x + viewBox.width - 8}
          y={viewBox.y + viewBox.height - 8}
          textAnchor="end"
          fill={COLOR.highlighted}
          opacity={0.55}
          style={{ font: '600 15px var(--font-display)', letterSpacing: '0.12em' }}
        >
          {weapon.name.toUpperCase()}
        </text>
      )}
    </svg>
  );
}
