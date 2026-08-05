/**
 * Temporadas do Battlefield 6 e o tema que cada uma veste.
 *
 * O site é tematizado pela temporada que está no ar, e o tema **caduca junto com
 * ela**: passada a data de encerramento, a interface volta sozinha ao tema
 * padrão — sem deploy, sem ninguém lembrar de desligar nada. Se a temporada
 * seguinte já estiver cadastrada aqui, ela assume no dia em que começa.
 *
 * Para vestir uma temporada nova bastam duas coisas:
 *
 * 1. uma entrada em [SEASONS], com `theme` batendo com
 * 2. um bloco `:root[data-temporada='<theme>']` em `globals.css`.
 *
 * Uma entrada sem `theme` correspondente no CSS não quebra nada: a interface
 * fica no padrão e a etiqueta continua aparecendo.
 */

export interface SeasonPhase {
  name: string;
  /** Data de início, ISO. A fase corrente é a última que já começou. */
  startsOn: string;
}

export interface Season {
  number: number;
  /** Nome da temporada, como a EA publica. */
  name: string;
  /** Uma linha sobre o que ela traz — vira o texto da etiqueta. */
  summary: string;
  startsOn: string;
  /** Fim da temporada. Depois disso o tema sazonal sai do ar. */
  endsOn: string;
  /** Sufixo do bloco de tema em `globals.css`; sem ele, usa o padrão. */
  theme?: string;
  phases: SeasonPhase[];
}

/**
 * Em ordem cronológica. Só as temporadas com tema próprio precisam estar aqui —
 * as antigas podem sair quando deixarem de importar.
 *
 * A EA anuncia o início de cada temporada, mas não o fim; `endsOn` é o dia
 * anterior ao começo da seguinte, e para a última cadastrada usa a duração
 * observada de três meses.
 */
export const SEASONS: Season[] = [
  {
    number: 4,
    name: 'Naval Warfare',
    summary: 'Combate naval no Pacífico: Tsuru Reef, Wake Island e a frota que chega junto.',
    startsOn: '2026-07-21',
    endsOn: '2026-10-19',
    theme: 'naval',
    phases: [
      { name: 'Pacific Front', startsOn: '2026-07-21' },
      { name: 'Top Gun', startsOn: '2026-08-18' },
      { name: 'Tidal Strike', startsOn: '2026-09-15' },
    ],
  },
];

/** A temporada no ar em uma data, ou `null` fora de qualquer janela. */
export function seasonOn(date: Date): Season | null {
  const dia = date.toISOString().slice(0, 10);
  return SEASONS.find((s) => s.startsOn <= dia && dia <= s.endsOn) ?? null;
}

/** A fase no ar dentro da temporada. */
export function phaseOn(date: Date, season: Season): SeasonPhase {
  const dia = date.toISOString().slice(0, 10);
  return season.phases.filter((f) => f.startsOn <= dia).at(-1) ?? season.phases[0];
}

/** Etiqueta curta da temporada no ar: `T4 · Pacific Front`. */
export function seasonLabel(date: Date): string | null {
  const season = seasonOn(date);
  return season ? `T${season.number} · ${phaseOn(date, season).name}` : null;
}

/**
 * Valor do atributo `data-temporada` no `<html>`.
 *
 * Fora de temporada — ou em temporada sem tema próprio — devolve `undefined`, e
 * o CSS aplica o tema padrão.
 */
export function seasonTheme(date: Date): string | undefined {
  return seasonOn(date)?.theme;
}
