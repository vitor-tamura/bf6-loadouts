import { effectiveRange, shotsToKill, timeToKill } from './ballistics';
import type { EffectiveStats } from './stats';

/**
 * Leitura automática do confronto entre duas armas.
 *
 * A tela já mostra tudo lado a lado, e ainda assim ler quatorze linhas de
 * números para decidir qual arma levar é trabalho. Isto aqui faz esse trabalho:
 * compara os mesmos números por eixos, pesa cada eixo pelo modo de jogo e
 * escreve o que sobra em duas ou três frases.
 *
 * Não há modelo de linguagem no meio. O site é estático — nada sai do
 * aparelho, não há servidor nem chave de API —, então a análise é escrita aqui,
 * por regras, a partir das estatísticas. A vantagem prática é que ela responde
 * na hora, funciona sem rede e diz sempre a mesma coisa para os mesmos números,
 * que é o que se espera de uma ferramenta de comparação.
 *
 * O que o modo muda são os pesos, não os números da arma. Multiplayer é
 * objetivo, respawn e distância curta: quem mata primeiro e vira mais rápido
 * para o próximo leva. REDSEC é battle royale — sem respawn, mapa grande e
 * munição contada —, então alcance e o que o pente aguenta pesam mais, e errar
 * custa a partida.
 */

export type GameMode = 'multiplayer' | 'redsec';

export const GAME_MODES: { value: GameMode; label: string }[] = [
  { value: 'multiplayer', label: 'Multiplayer' },
  { value: 'redsec', label: 'REDSEC' },
];

/** Distância de referência para o tiro a média distância. */
const MID_RANGE = 50;

/** Diferença abaixo da qual o eixo não decide nada. */
const NOISE = 0.04;

interface Axis {
  key: 'ttk' | 'mid' | 'range' | 'handling' | 'sustain' | 'control';
  /** De -1 (B domina) a 1 (A domina). */
  edge: number;
  /** A frase que explica o eixo, com os números dos dois lados. */
  line: string;
}

/** Quanto cada eixo vale em cada modo. */
const WEIGHTS: Record<GameMode, Record<Axis['key'], number>> = {
  multiplayer: { ttk: 3, mid: 1.5, range: 1.5, handling: 2.5, sustain: 1, control: 1.5 },
  redsec: { ttk: 2, mid: 2.5, range: 2.5, handling: 1, sustain: 2.5, control: 2 },
};

/** Vantagem relativa de A sobre B, entre -1 e 1. Maior é melhor. */
function edgeOf(a: number, b: number): number {
  const total = Math.abs(a) + Math.abs(b);
  if (total === 0) return 0;
  return (a - b) / total;
}

/** O mesmo, para números em que menor é melhor — tempo, sobretudo. */
const inverseEdge = (a: number, b: number) => edgeOf(b, a);

const ms = (v: number) => (Number.isFinite(v) ? `${Math.round(v)} ms` : '—');
const seconds = (v: number) => `${v.toFixed(2).replace('.', ',')} s`;

function axes(a: EffectiveStats, b: EffectiveStats, nameA: string, nameB: string): Axis[] {
  /*
   * O tempo de abate conta a mira junto.
   *
   * O tempo entre o primeiro e o último tiro é zero para quem derruba com um
   * disparo — e um ferrolho com esse zero ganhava o eixo de lavada, o que não
   * corresponde a briga nenhuma: antes do tiro vem levantar a arma, e é aí que
   * o ferrolho perde os 650 ms que a submetralhadora não gasta. Somando os
   * dois, o número passa a medir o que a pessoa sente — quanto tempo da decisão
   * de atirar até o alvo cair.
   */
  const engageA = a.adsMs + timeToKill(a, 0);
  const engageB = b.adsMs + timeToKill(b, 0);
  const oneShotA = shotsToKill(a, 0) === 1;
  const oneShotB = shotsToKill(b, 0) === 1;
  const shotsA = shotsToKill(a, MID_RANGE);
  const shotsB = shotsToKill(b, MID_RANGE);
  const rangeA = effectiveRange(a);
  const rangeB = effectiveRange(b);
  // Alcance zero quer dizer dano constante em toda distância — o melhor caso.
  const reachA = rangeA === 0 ? 999 : rangeA;
  const reachB = rangeB === 0 ? 999 : rangeB;
  const sustainA = a.magazine / a.reload;
  const sustainB = b.magazine / b.reload;
  const recoilA = a.verticalRecoil + a.horizontalRecoil;
  const recoilB = b.verticalRecoil + b.horizontalRecoil;

  const faster = engageA < engageB ? nameA : nameB;
  const oneShotNote = oneShotA || oneShotB ? ` A ${oneShotA ? nameA : nameB} derruba com um tiro.` : '';
  // Na segunda metade da frase o verbo já está dito, e repeti-lo trava a leitura.
  const reachText = (range: number, short = false) =>
    range === 0
      ? 'não perde dano em distância nenhuma'
      : `${short ? '' : 'mantém o dano '}até ${Math.round(range)} m`;

  return [
    {
      key: 'ttk',
      edge: inverseEdge(engageA, engageB),
      line:
        engageA === engageB
          ? `De perto, mira e abate levam o mesmo tempo nas duas: ${ms(engageA)}.${oneShotNote}`
          : `De perto, contando a mira, a ${faster} resolve em ${ms(
              Math.min(engageA, engageB),
            )} contra ${ms(Math.max(engageA, engageB))}.${oneShotNote}`,
    },
    {
      key: 'mid',
      edge: inverseEdge(shotsA, shotsB),
      line:
        shotsA === shotsB
          ? `A ${MID_RANGE} m as duas precisam dos mesmos ${shotsA} tiros.`
          : `A ${MID_RANGE} m são ${shotsA} tiros da ${nameA} contra ${shotsB} da ${nameB}.`,
    },
    {
      key: 'range',
      edge: edgeOf(reachA, reachB),
      line: `A ${nameA} ${reachText(rangeA)}; a ${nameB}, ${reachText(rangeB, true)}.`,
    },
    {
      // Mobilidade e troca de arma. A mira já pesou no eixo de cima, e contá-la
      // aqui de novo dobraria o voto do mesmo número.
      key: 'handling',
      edge: edgeOf(a.mobility - a.swapMs / 40, b.mobility - b.swapMs / 40),
      line: `Para se mover e trocar, mobilidade ${Math.round(a.mobility)} e ${ms(
        a.swapMs,
      )} de troca contra ${Math.round(b.mobility)} e ${ms(b.swapMs)}.`,
    },
    {
      key: 'sustain',
      edge: edgeOf(sustainA, sustainB),
      line: `Por pente, ${a.magazine} tiros e ${seconds(a.reload)} de recarga contra ${
        b.magazine
      } e ${seconds(b.reload)}.`,
    },
    {
      key: 'control',
      edge: inverseEdge(recoilA, recoilB),
      line: `O recuo somado é ${recoilA.toFixed(2).replace('.', ',')} contra ${recoilB
        .toFixed(2)
        .replace('.', ',')}.`,
    },
  ];
}

export interface Matchup {
  /** Quem leva vantagem no modo escolhido. */
  winner: 'a' | 'b' | 'tie';
  /** A frase de abertura, com o veredito. */
  headline: string;
  /** Os eixos que decidiram, do mais para o menos importante. */
  points: string[];
}

/** Como cada modo é descrito quando entra na frase de abertura. */
const MODE_FRAME: Record<GameMode, string> = {
  multiplayer: 'No multiplayer, onde a briga é por objetivo e o respawn é rápido',
  redsec: 'No REDSEC, sem respawn e com mapa grande',
};

export function analyzeMatchup(
  a: EffectiveStats,
  b: EffectiveStats,
  nameA: string,
  nameB: string,
  mode: GameMode,
): Matchup {
  const weights = WEIGHTS[mode];
  const list = axes(a, b, nameA, nameB);
  const score = list.reduce((total, axis) => total + axis.edge * weights[axis.key], 0);

  /*
   * As frases saem dos eixos que mais pesaram *neste* modo, e não dos que têm a
   * maior diferença bruta. É o que faz a leitura mudar de assunto quando o modo
   * muda: a mesma dupla de armas passa a ser descrita pelo alcance e pelo pente
   * no REDSEC, e pelo tempo de abate e pelo manejo no multiplayer.
   */
  const points = list
    .filter((axis) => Math.abs(axis.edge) > NOISE)
    .sort((x, y) => Math.abs(y.edge * weights[y.key]) - Math.abs(x.edge * weights[x.key]))
    .slice(0, 3)
    .map((axis) => axis.line);

  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const margin = score / total;
  const winner: Matchup['winner'] = Math.abs(margin) < 0.02 ? 'tie' : margin > 0 ? 'a' : 'b';

  if (winner === 'tie') {
    return {
      winner,
      headline: `${MODE_FRAME[mode]}, as duas se equivalem — a escolha é de gosto.`,
      points: points.length ? points : ['As estatísticas são as mesmas nos dois lados.'],
    };
  }

  const champion = winner === 'a' ? nameA : nameB;
  const other = winner === 'a' ? nameB : nameA;
  // Margem estreita merece ressalva: a diferença existe, mas não decide sozinha.
  const strength = Math.abs(margin) < 0.12 ? 'leva vantagem por pouco sobre' : 'leva a melhor sobre';

  return {
    winner,
    headline: `${MODE_FRAME[mode]}, a ${champion} ${strength} a ${other}.`,
    points,
  };
}
