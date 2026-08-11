import { MetaScreen } from './meta-screen';
import live from '@/data/meta-live.json';
import type { MetaPatch, MetaPick, MetaSource, TrendingPick } from '@/data/meta';

/**
 * A tela do meta.
 *
 * Não há chamada a modelo nenhum aqui: a leitura do dia é feita fora do site,
 * pelo workflow `meta-daily`, que grava `meta-live.json` no repositório. A
 * página lê esse arquivo no build, como qualquer outro dado — volta a ser
 * estática, e o custo de servi-la é zero.
 *
 * Enquanto o arquivo não tiver leitura nenhuma — repositório recém-clonado, ou
 * o workflow ainda não rodou —, quem responde é a curadoria escrita à mão em
 * `src/data/meta.ts`, que é o padrão do componente.
 */
export default function MetaPage() {
  const picks = live.picks as MetaPick[];
  const trending = ('trending' in live ? live.trending : []) as TrendingPick[];

  /*
   * A atualização do jogo que a leitura diz ter olhado. Ela vale mais que a
   * data da leitura para quem lê a tela: uma lista relida hoje sobre um patch
   * de duas semanas atrás é uma lista de duas semanas atrás.
   */
  const patch = ('patch' in live ? live.patch : null) as MetaPatch | null;

  /*
   * `readAt` é a data que a tela mostra no "revisado em", e ela vale sempre que
   * a rotina tiver rodado — inclusive quando o dia rendeu só trending, sem
   * mexer no ranking. Exigir `picks` para aceitar a leitura jogava fora, junto,
   * a data e o próprio trending, e o topo da tela seguia anunciando a data da
   * curadoria escrita à mão.
   */
  if (!live.readAt || (!picks.length && !trending.length)) return <MetaScreen />;

  return (
    <MetaScreen
      picks={picks.length ? picks : undefined}
      trending={trending.length ? trending : undefined}
      sources={live.sources as MetaSource[]}
      readAt={live.readAt}
      patch={patch}
      fromSearch
    />
  );
}
