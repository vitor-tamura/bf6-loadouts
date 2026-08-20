import type { TrendingPick } from '@/data/meta';
import { seasonOn } from '@/data/season';
import type { Weapon, WeaponCategory } from '@/data/types';
import { WEAPONS, WEAPONS_BY_ID } from '@/data/weapons';
import { effectiveRange, shotsToKill, timeToKill } from './ballistics';
import { baseStats } from './stats';

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
      reason: `Chegou com a Temporada ${temporada.number} em ${dia(temporada.startsOn)}.`,
      sources: [] as number[],
    }));

  return [...sustentadas, ...chegadas];
}

/**
 * O que o cartão diz sobre a arma, além de por que ela está no bloco.
 *
 * O motivo responde "por que ela está aqui" — a thread, a build, a chegada no
 * patch. Ele não responde a pergunta seguinte, que é a de quem nunca pegou a
 * arma: o que ela tem de diferente. Isso o catálogo sabe, e sabe sem depender de
 * fonte nenhuma: é o mesmo dataset que o resto do site usa para calcular TTK.
 */
export interface FichaDaArma {
  /** A linha do catálogo sobre o papel dela em combate. */
  papel: string;
  rpm: number;
  /** Tiros para matar no vão curto, sem acessório. */
  tiros: number;
  /** Tempo até a morte no vão curto, em ms. `null` quando um tiro basta. */
  ttk: number | null;
  /** Distância em que ela deixa de matar com os tiros do vão curto. */
  alcance: number;
  /** O que ela tem de melhor entre as da mesma categoria, quando tem algo. */
  destaque: string | null;
}

/**
 * O melhor de cada categoria, calculado uma vez.
 *
 * A conta roda sobre o arsenal inteiro e não muda entre um cartão e outro, então
 * fica em cache: sem isso, cada cartão recalcularia as 62 armas.
 */
const MELHORES = new Map<WeaponCategory, Map<string, string>>();

/**
 * Superlativo só quando é superlativo mesmo.
 *
 * A comparação exige folga: "maior cadência da categoria" com 5 RPM de vantagem
 * é verdade e não é informação. Empate técnico não vira destaque — a arma fica
 * sem etiqueta, que é melhor do que uma etiqueta que não separa nada.
 */
const CRITERIOS: {
  rotulo: string;
  valor: (arma: Weapon) => number;
  maiorEhMelhor: boolean;
  folga: number;
}[] = [
  { rotulo: 'TTK mais curto da categoria', valor: (a) => ttkDe(a) ?? Infinity, maiorEhMelhor: false, folga: 15 },
  { rotulo: 'maior alcance útil da categoria', valor: (a) => effectiveRange(baseStats(a)), maiorEhMelhor: true, folga: 5 },
  { rotulo: 'bala mais rápida da categoria', valor: (a) => a.velocity, maiorEhMelhor: true, folga: 40 },
  { rotulo: 'maior cadência da categoria', valor: (a) => a.rpm, maiorEhMelhor: true, folga: 40 },
  { rotulo: 'mira mais rápida da categoria', valor: (a) => a.adsMs, maiorEhMelhor: false, folga: 20 },
  { rotulo: 'carregador maior da categoria', valor: (a) => a.magazine, maiorEhMelhor: true, folga: 5 },
];

const ttkDe = (arma: Weapon): number | null => {
  const stats = baseStats(arma);
  if (shotsToKill(stats, 0) === 1) return null;
  const ttk = timeToKill(stats, 0);
  return Number.isFinite(ttk) ? Math.round(ttk) : null;
};

function destaquesDaCategoria(categoria: WeaponCategory): Map<string, string> {
  const emCache = MELHORES.get(categoria);
  if (emCache) return emCache;

  const daCategoria = WEAPONS.filter((arma) => arma.category === categoria);
  const destaques = new Map<string, string>();

  for (const criterio of CRITERIOS) {
    const ordenadas = daCategoria
      .map((arma) => ({ arma, valor: criterio.valor(arma) }))
      .filter(({ valor }) => Number.isFinite(valor))
      .sort((a, b) => (criterio.maiorEhMelhor ? b.valor - a.valor : a.valor - b.valor));

    const [primeira, segunda] = ordenadas;
    if (!primeira || !segunda) continue;
    if (Math.abs(primeira.valor - segunda.valor) < criterio.folga) continue;
    // Uma arma leva um rótulo só: o primeiro critério em que ela vence é o mais
    // decisivo, e três etiquetas numa arma não dizem em qual reparar.
    if (destaques.has(primeira.arma.id)) continue;
    destaques.set(primeira.arma.id, criterio.rotulo);
  }

  MELHORES.set(categoria, destaques);
  return destaques;
}

/** A ficha de uma arma, para o cartão de tendência. */
export function fichaDaArma(arma: Weapon): FichaDaArma {
  const stats = baseStats(arma);
  return {
    papel: arma.summary,
    rpm: arma.rpm,
    tiros: shotsToKill(stats, 0),
    ttk: ttkDe(arma),
    alcance: Math.round(effectiveRange(stats)),
    destaque: destaquesDaCategoria(arma.category).get(arma.id) ?? null,
  };
}
