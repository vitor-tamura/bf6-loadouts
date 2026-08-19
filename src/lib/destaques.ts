import {
  HIGHLIGHTS,
  SOURCES,
  type CategoryHighlight,
  type MetaPick,
  type MetaSource,
} from '@/data/meta';
import { WEAPONS_BY_ID } from '@/data/weapons';
import { pageKey } from './sources';

/**
 * O ranking do topo, cheio o bastante para ser lido.
 *
 * É o mesmo problema do bloco de tendência, no bloco de cima: a leitura de
 * 19/08 voltou com dois nomes — VSSM e Interdictor —, e "O topo do multiplayer"
 * virou uma fileira de dois cartões numa grade de quatro colunas. O piso do
 * `meta-search` é relativo de propósito (quatro, ou o que o modelo mandou, o que
 * for menor), então resposta curta e honesta passa, como deve passar.
 *
 * Aqui o bloco se completa em vez de a leitura ser descartada. Quem completa é a
 * curadoria escrita à mão de `meta.ts` — no ranking, ao contrário da tendência,
 * o catálogo não tem o que provar: ele sabe quando uma arma chegou, não o quanto
 * ela está sendo escolhida.
 *
 * Duas coisas mantêm isso honesto:
 *
 * - o cartão diz que veio da curadoria, e não da leitura do dia;
 * - a fonte que a curadoria cita entra junto na lista do rodapé, com o colchete
 *   apontando para a posição nova. Sem isso, o "[2]" de um cartão da curadoria
 *   apontaria para a segunda fonte da leitura do dia, que fala de outra coisa —
 *   é o erro que faz uma tela citar direitinho a página errada.
 */

/** Abaixo disto o bloco é completado. A grade do topo vai a quatro colunas. */
export const MIN_DESTAQUES = 4;

/**
 * Uma lista de fontes que aceita as da curadoria sem perder os números.
 *
 * Quem cita é sempre um índice: o cartão guarda `[2]` e a tela desenha a segunda
 * fonte da lista que ela recebeu. Enquanto a lista e o cartão vêm da mesma
 * leitura isso se sustenta sozinho; no instante em que um cartão escrito à mão
 * entra numa tela que mostra a leitura do dia, o número passa a apontar para
 * outra página — e não há como notar, porque continua sendo um colchete com um
 * número dentro.
 *
 * `pageKey` decide o que é a mesma página: o mesmo guia em `/`, `/pt` e `/es` é
 * uma fonte só, e listá-lo três vezes faria a tela parecer mais sustentada do
 * que é.
 */
function costurar(fontes: MetaSource[], deOnde: MetaSource[]) {
  const juntas = [...fontes];
  const porPagina = new Map(juntas.map((fonte, i) => [pageKey(fonte.url), i]));

  const realocar = (indice: number): number | null => {
    const fonte = deOnde[indice];
    if (!fonte) return null;

    const chave = pageKey(fonte.url);
    const conhecida = porPagina.get(chave);
    if (conhecida !== undefined) return conhecida;

    porPagina.set(chave, juntas.push(fonte) - 1);
    return juntas.length - 1;
  };

  /** O mesmo cartão, com os colchetes valendo na lista costurada. */
  const recitar = <T extends MetaPick>(pick: T): T => ({
    ...pick,
    sources: pick.sources.map(realocar).filter((i): i is number => i !== null),
  });

  return { recitar, fontes: () => juntas };
}

/**
 * Os cartões do topo e a lista de fontes que eles citam.
 *
 * As fontes voltam junto porque completar o bloco pode acrescentar página nova
 * ao rodapé: os colchetes são índices nessa lista, e devolver uma sem a outra
 * deixaria os dois desencontrados.
 */
export function completarDestaques(
  picks: MetaPick[],
  fontes: MetaSource[],
  { curadoria = HIGHLIGHTS, fontesDaCuradoria = SOURCES } = {},
): { destaques: MetaPick[]; fontes: MetaSource[] } {
  /*
    Cartão sem citação que resolva não conta como leitura.

    Em 19/08 o topo saiu com três armas e nenhum colchete: as páginas que o
    modelo apontou tinham sido recusadas por modo ou por data, e a tela ficou
    afirmando "desempenho superior em dano e controle" sem nada atrás, logo
    abaixo da frase que promete dizer de que fonte saiu cada indicação. Aqui eles
    saem, e a curadoria — que cita — ocupa o lugar.
  */
  const sustentadas = picks.filter(
    (pick) => WEAPONS_BY_ID.has(pick.weapon) && pick.sources.length > 0,
  );
  const faltam = MIN_DESTAQUES - sustentadas.length;
  if (faltam <= 0) return { destaques: sustentadas, fontes };

  const jaCitada = new Set(sustentadas.map((pick) => pick.weapon));
  const candidatos = curadoria
    .filter((pick) => WEAPONS_BY_ID.has(pick.weapon) && !jaCitada.has(pick.weapon))
    .slice(0, faltam);
  if (!candidatos.length) return { destaques: sustentadas, fontes };

  const costura = costurar(fontes, fontesDaCuradoria);
  const completados = candidatos.map((pick) =>
    costura.recitar({
      ...pick,
      reason: `Da curadoria escrita à mão do site, porque a leitura do dia não citou a arma. ${pick.reason}`,
    }),
  );

  return { destaques: [...sustentadas, ...completados], fontes: costura.fontes() };
}

/**
 * Os blocos por categoria, citando a lista que a tela realmente mostra.
 *
 * Estes cartões são escritos à mão e nunca foram substituídos pela leitura do
 * dia — só o topo e a tendência são. Enquanto a tela mostrava a curadoria
 * inteira ninguém notava; com a leitura automática no ar, o `[1] [4]` do M16A4
 * passou a apontar para as notas da EA e uma thread do Reddit, no lugar das duas
 * páginas do rastreador que sustentam a posição dele.
 *
 * Vale para o `best` e para as menções: as duas linhas citam do mesmo jeito.
 */
export function realocarCategorias(
  categorias: CategoryHighlight[],
  fontes: MetaSource[],
  { fontesDaCuradoria = SOURCES } = {},
): { categorias: CategoryHighlight[]; fontes: MetaSource[] } {
  const costura = costurar(fontes, fontesDaCuradoria);

  const realocadas = categorias.map((grupo) => ({
    ...grupo,
    best: costura.recitar(grupo.best),
    mentions: grupo.mentions.map(costura.recitar),
  }));

  return { categorias: realocadas, fontes: costura.fontes() };
}
