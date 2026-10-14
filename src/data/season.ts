/**
 * Temporadas do Battlefield 6 e o tema que cada uma veste.
 *
 * O site é tematizado pela temporada que está no ar, e o tema **caduca junto com
 * ela**: passada a data de encerramento, a interface volta sozinha ao tema
 * padrão — sem deploy, sem ninguém lembrar de desligar nada. Se a temporada
 * seguinte já estiver cadastrada aqui, ela assume no dia em que começa.
 *
 * Cada temporada tematizada declara `theme` em [SEASONS]. A paleta fica em
 * `season-palettes.json`; o workflow gera a entrada ausente a partir de fontes
 * oficiais da EA. O layout injeta os valores no documento, e CSS, Ant Design,
 * gráficos e cartões compartilhados usam a mesma configuração.
 */

import seasonPalettes from './season-palettes.json' with { type: 'json' };

export interface SeasonPhase {
  name: string;
  /** Data de início, ISO. A fase corrente é a última que já começou. */
  startsOn: string;
}

export interface SeasonPaletteColors {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderSoft: string;
  text: string;
  textSoft: string;
  textDim: string;
  accent: string;
  accentLight: string;
  info: string;
  base: Record<'950' | '900' | '850' | '800' | '700' | '600' | '500' | '400' | '300' | '200' | '100', string>;
}

export interface SeasonPalette {
  dark: SeasonPaletteColors;
  light: SeasonPaletteColors;
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
  /** Paleta única lida pelo site inteiro, por CSS, Ant Design e gráficos. */
  palette?: SeasonPalette;
  phases: SeasonPhase[];
}

/**
 * Em ordem cronológica. Mantemos também a temporada anterior para validar
 * leituras históricas do meta, mesmo depois que a temporada atual muda.
 *
 * A EA anuncia o início de cada temporada, mas não o fim; `endsOn` é o dia
 * anterior ao começo da seguinte. Para a última cadastrada, a duração é
 * estimada em três meses.
 */
export const SEASONS: Season[] = [
  {
    number: 4,
    name: 'Naval Warfare',
    summary: 'Naval Warfare: temporada 4.',
    startsOn: '2026-07-21',
    endsOn: '2026-10-12',
    phases: [{ name: 'Naval Warfare', startsOn: '2026-07-21' }],
  },
  {
    number: 5,
    name: 'Siege of Vegas',
    theme: 'vegas',
    palette: seasonPalettes.vegas,
    summary: 'Cerco a Vegas: Vegas Strip, Area 51, Rapid Royale e novos armamentos.',
    startsOn: '2026-10-13',
    endsOn: '2027-01-12',
    phases: [
      { name: 'Siege of Vegas', startsOn: '2026-10-13' },
      { name: 'Casino Heist', startsOn: '2026-11-10' },
      { name: 'Frozen Aces', startsOn: '2026-12-08' },
    ],
  },
];

/**
 * Cor de cada temporada, para etiquetar o que entrou no jogo com ela.
 *
 * Vale para toda arma e todo item marcado com `season`, inclusive os das
 * temporadas que já saíram do ar — por isso a tabela é separada de [SEASONS],
 * que só guarda a temporada atual e sua validade.
 */
export const SEASON_TAGS: Record<number, { name?: string; color: string }> = {
  1: { color: '#d98d3a' },
  2: { color: '#86b7e0' },
  3: { color: '#7fbf5f' },
  4: { name: 'Naval Warfare', color: '#4fc3d9' },
  5: { name: 'Siege of Vegas', color: 'var(--accent)' },
};

/** Como etiquetar um número de temporada; `null` para conteúdo de lançamento. */
export function seasonTag(season: number): { label: string; title: string; color: string } | null {
  if (!season) return null;
  const tag = SEASON_TAGS[season];
  return {
    label: `T${season}`,
    title: tag?.name ? `Temporada ${season}: ${tag.name}` : `Temporada ${season}`,
    // Temporada nova que ainda não ganhou cor entra no destaque do tema.
    color: tag?.color ?? 'var(--accent)',
  };
}

/** A temporada no ar em uma data, ou `null` fora de qualquer janela. */
export function seasonOn(date: Date): Season | null {
  const day = date.toISOString().slice(0, 10);
  return SEASONS.find((s) => s.startsOn <= day && day <= s.endsOn) ?? null;
}

/** A fase no ar dentro da temporada. */
export function phaseOn(date: Date, season: Season): SeasonPhase {
  const day = date.toISOString().slice(0, 10);
  return season.phases.filter((f) => f.startsOn <= day).at(-1) ?? season.phases[0];
}

/** Etiqueta curta da temporada no ar: `T5 · Siege of Vegas`. */
export function seasonLabel(date: Date): string | null {
  const season = seasonOn(date);
  return season ? `T${season.number} · ${phaseOn(date, season).name}` : null;
}

/**
 * Valor do atributo `data-season` no `<html>`.
 *
 * Fora de temporada — ou em temporada sem tema próprio — devolve `undefined`, e
 * o CSS aplica o tema padrão.
 */
export function seasonTheme(date: Date): string | undefined {
  return seasonOn(date)?.theme;
}


/** Variáveis CSS compartilhadas pelos componentes de toda a interface. */
export function seasonPaletteStyle(palette: SeasonPalette): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const mode of ['dark', 'light'] as const) {
    const colors = palette[mode];
    for (const [name, value] of Object.entries(colors)) {
      if (name === 'base') {
        for (const [shade, color] of Object.entries(colors.base)) {
          variables[`--season-${mode}-base-${shade}`] = color;
        }
      } else {
        variables[`--season-${mode}-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
      }
    }
  }
  return variables;
}
