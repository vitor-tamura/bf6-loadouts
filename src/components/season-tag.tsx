import { Tag, Tooltip } from 'antd';
import { seasonTag } from '@/data/season';

/**
 * Etiqueta da temporada em que a arma entrou no jogo.
 *
 * Vestida com a cor da própria temporada: numa lista de sessenta e oito armas,
 * a cor separa as levas de conteúdo antes de qualquer leitura — dá para varrer
 * a página e ver o que chegou junto. Conteúdo de lançamento não recebe
 * etiqueta; a ausência já diz que a arma está lá desde o primeiro dia.
 *
 * A cor vem por estilo, e não pela paleta do `Tag`: as cores nomeadas do antd
 * são as dele, e o que veste a etiqueta é o tema da temporada.
 */
export function SeasonTag({ season, size = 'md' }: { season: number; size?: 'sm' | 'md' }) {
  const tag = seasonTag(season);
  if (!tag) return null;

  return (
    <Tooltip title={tag.title}>
      <Tag
        className={`bevel-sm m-0 shrink-0 font-semibold ${
          size === 'sm' ? 'px-1 text-[9px]' : 'px-1.5 text-[10px]'
        }`}
        style={{
          color: tag.color,
          // Fundo e borda saem da mesma cor: a etiqueta se veste da temporada sem
          // virar um bloco chapado que rouba a atenção do nome da arma.
          background: `color-mix(in oklab, ${tag.color} 14%, transparent)`,
          border: `1px solid color-mix(in oklab, ${tag.color} 45%, transparent)`,
          lineHeight: size === 'sm' ? '14px' : '16px',
        }}
      >
        {tag.label}
      </Tag>
    </Tooltip>
  );
}
