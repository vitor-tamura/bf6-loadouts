import { MetaScreen } from './meta-screen';
import live from '@/data/meta-live.json';
import {
  MIN_TRENDING,
  type MetaPatch,
  type MetaPick,
  type MetaSource,
  type TrendingPick,
} from '@/data/meta';
import { WEAPONS_BY_ID } from '@/data/weapons';

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
   * A leitura automática entra inteira, ou não entra.
   *
   * Inteira é ranking com arma e tendência com bloco cheio — o mesmo piso de
   * quatro que `scripts/meta/leitura.mjs` cobra do modelo antes de gravar. Lá
   * ele vale contra a resposta; aqui, contra o arquivo, e é isso que a trava de
   * lá não alcança: a leitura de 19/08 foi publicada com duas armas em
   * tendência horas antes de a trava existir e, como toda leitura seguinte que
   * não passa no piso é descartada, aquele arquivo curto seguiria na tela sem
   * prazo para sair.
   *
   * Arma que não está mais no arsenal não conta: o cartão dela não chega a ser
   * desenhado, e um bloco de quatro nomes viraria uma fileira de dois.
   *
   * Quando o piso não é alcançado, quem responde é a curadoria escrita à mão,
   * inteira. Aproveitar metade da leitura de hoje seria pior: os colchetes de
   * cada cartão são índices em `sources`, e cruzar as duas origens faria cada
   * um citar a fonte errada.
   */
  const trendingCheio =
    trending.filter((pick) => WEAPONS_BY_ID.has(pick.weapon)).length >= MIN_TRENDING;

  if (!live.readAt || !picks.length || !trendingCheio) return <MetaScreen />;

  return (
    <MetaScreen
      picks={picks}
      trending={trending}
      sources={live.sources as MetaSource[]}
      readAt={live.readAt}
      patch={patch}
      fromSearch
    />
  );
}
