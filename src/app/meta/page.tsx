import { MetaScreen } from './meta-screen';
import live from '@/data/meta-live.json';
import type { MetaPick, MetaSource, TrendingPick } from '@/data/meta';

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

  if (!live.readAt || !picks.length) return <MetaScreen />;

  return (
    <MetaScreen
      picks={picks}
      trending={trending.length ? trending : undefined}
      sources={live.sources as MetaSource[]}
      readAt={live.readAt}
      fromSearch
    />
  );
}
