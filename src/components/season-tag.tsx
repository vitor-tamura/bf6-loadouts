import { seasonTag } from '@/data/season';

/**
 * Etiqueta da temporada em que a arma entrou no jogo.
 *
 * Vestida com a cor da própria temporada: numa lista de sessenta e oito armas,
 * a cor separa as levas de conteúdo antes de qualquer leitura — dá para varrer
 * a página e ver o que chegou junto. Conteúdo de lançamento não recebe
 * etiqueta; a ausência já diz que a arma está lá desde o primeiro dia.
 */
export function SeasonTag({ season, size = 'md' }: { season: number; size?: 'sm' | 'md' }) {
  const tag = seasonTag(season);
  if (!tag) return null;

  return (
    <span
      className={`bevel-sm shrink-0 font-semibold ${
        size === 'sm' ? 'px-1 py-px text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      }`}
      title={tag.title}
      style={{
        color: tag.color,
        // Fundo e borda saem da mesma cor: a etiqueta se veste da temporada sem
        // virar um bloco chapado que rouba a atenção do nome da arma.
        background: `color-mix(in oklab, ${tag.color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${tag.color} 45%, transparent)`,
      }}
    >
      {tag.label}
    </span>
  );
}
