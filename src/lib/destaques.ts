import { HIGHLIGHTS, SOURCES, type MetaPick, type MetaSource } from '@/data/meta';
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
  const noArsenal = picks.filter((pick) => WEAPONS_BY_ID.has(pick.weapon));
  const faltam = MIN_DESTAQUES - noArsenal.length;
  if (faltam <= 0) return { destaques: noArsenal, fontes };

  const jaCitada = new Set(noArsenal.map((pick) => pick.weapon));
  const candidatos = curadoria
    .filter((pick) => WEAPONS_BY_ID.has(pick.weapon) && !jaCitada.has(pick.weapon))
    .slice(0, faltam);
  if (!candidatos.length) return { destaques: noArsenal, fontes };

  /*
    A mesma página em duas listas é uma fonte só. `pageKey` já resolve o caso que
    mais aparece — o mesmo guia publicado em `/`, `/pt` e `/es` —, e é o que
    impede o rodapé de listar duas vezes o mesmo link com números diferentes.
  */
  const juntas = [...fontes];
  const porPagina = new Map(juntas.map((fonte, i) => [pageKey(fonte.url), i]));

  const realocar = (indice: number): number | null => {
    const fonte = fontesDaCuradoria[indice];
    if (!fonte) return null;

    const chave = pageKey(fonte.url);
    const conhecida = porPagina.get(chave);
    if (conhecida !== undefined) return conhecida;

    porPagina.set(chave, juntas.push(fonte) - 1);
    return juntas.length - 1;
  };

  const completados = candidatos.map((pick) => ({
    weapon: pick.weapon,
    reason: `Da curadoria escrita à mão do site, porque a leitura do dia não citou a arma. ${pick.reason}`,
    sources: pick.sources.map(realocar).filter((i): i is number => i !== null),
  }));

  return { destaques: [...noArsenal, ...completados], fontes: juntas };
}
