import type { TrendingPick } from '@/data/meta';
import { seasonOn } from '@/data/season';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';

/**
 * O bloco de tendência, completo o bastante para ser lido.
 *
 * A grade vai a quatro colunas. Com duas armas o bloco sai como fileira
 * quebrada, e quem lê não tem como saber se aquilo é tudo o que existe ou o que
 * sobrou de uma leitura ruim — foi assim que a leitura de 19/08 ficou na tela,
 * com Interdictor e EF88 e mais nada.
 *
 * A saída antiga era recusar a leitura inteira quando o trending não enchia, e
 * ela custava caro: a leitura do dia é melhor que a curadoria escrita à mão que
 * responderia no lugar dela, e jogar fora oito armas de ranking porque faltaram
 * duas de tendência troca o bom pelo pior. Aqui o bloco se completa em vez de a
 * leitura ser descartada.
 *
 * O que completa não é opinião inventada: é o que o próprio catálogo do site
 * sabe provar — quais armas entraram no arsenal na temporada em vigor. O
 * catálogo não sabe do que a comunidade fala; o máximo que ele prova é quem
 * acabou de chegar, que é o candidato mais óbvio a estar na conversa. O cartão
 * diz de onde veio, e não leva colchete, porque fonte não houve.
 */

/**
 * Menos que isto, o bloco não vai para a tela.
 *
 * Não confundir com o `MIN_TRENDING` de `scripts/meta/leitura.mjs`: lá o número
 * mede se a resposta do modelo sobreviveu ao saneamento — é sobre a qualidade da
 * leitura. Aqui ele mede o que o leitor vê depois de o catálogo completar o que
 * faltava, que é uma pergunta diferente e acontece depois.
 */
export const MIN_TENDENCIA = 4;

const DIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const dia = (iso: string) => DIA.format(new Date(`${iso}T12:00:00Z`));

/**
 * A lista que o bloco de tendência desenha.
 *
 * `on` é a data da leitura, e não o dia de hoje: é ela que diz de que temporada
 * o bloco está falando, e ler o relógio aqui faria a página renderizada no
 * servidor e a hidratada no navegador discordarem na virada da temporada.
 *
 * Duas coisas caem antes da conta: arma fora do arsenal, cujo cartão não chega
 * a ser desenhado, e cartão da leitura sem citação que resolva. O segundo é o
 * que apareceu em 19/08 — cinco cartões, nenhum colchete, porque as páginas que
 * o modelo apontou tinham sido recusadas por modo ou por data. Um cartão desses
 * afirma sem nada atrás, bem no bloco que promete dizer de onde saiu cada nome.
 * O do catálogo, esse entra sem colchete de propósito: ele diz no texto que veio
 * do catálogo, e é a única coisa aqui que não precisa de fonte de fora.
 */
export function completarTendencia(
  trending: TrendingPick[],
  { on }: { on: string },
): TrendingPick[] {
  const sustentadas = trending.filter(
    (pick) => WEAPONS_BY_ID.has(pick.weapon) && pick.sources.length > 0,
  );
  const faltam = MIN_TENDENCIA - sustentadas.length;
  if (faltam <= 0) return sustentadas;

  const temporada = seasonOn(new Date(`${on}T12:00:00Z`));
  if (!temporada) return sustentadas;

  /*
    Só o que falta, e nunca na frente do que a leitura trouxe: o cartão com
    evidência de comunidade vale mais que o do catálogo, e a ordem do bloco é
    lida como ordem de importância.
  */
  const jaCitada = new Set(sustentadas.map((pick) => pick.weapon));
  const chegadas = WEAPONS.filter(
    (arma) => arma.season === temporada.number && !jaCitada.has(arma.id),
  )
    .slice(0, faltam)
    .map((arma) => ({
      weapon: arma.id,
      trend: `chegou na Temporada ${temporada.number}`,
      reason: `Arma nova da Temporada ${temporada.number}, ${temporada.name}, no ar desde ${dia(temporada.startsOn)}. Este cartão vem do catálogo do site: a leitura do dia não achou conversa nem uso relatado sobre ela.`,
      sources: [] as number[],
    }));

  return [...sustentadas, ...chegadas];
}
