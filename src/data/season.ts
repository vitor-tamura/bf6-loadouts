/**
 * Temporadas do Battlefield 6 e o tema que cada uma veste.
 *
 * O site é tematizado pela temporada que está no ar, e o tema **caduca junto com
 * ela**: passada a data de encerramento, a interface volta sozinha ao tema
 * padrão — sem deploy, sem ninguém lembrar de desligar nada. Se a temporada
 * seguinte já estiver cadastrada aqui, ela assume no dia em que começa.
 *
 * Cada temporada tematizada declara `theme` e uma paleta clara/escura em
 * [SEASONS]. O layout injeta esses valores no documento, e os tokens globais,
 * o Ant Design e os gráficos usam a mesma configuração — sem cores duplicadas
 * em componentes.
 */

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
    palette: {
      dark: {
        bg: '#08070d', surface: '#100d18', surfaceRaised: '#171220',
        border: '#35223f', borderSoft: '#21172c', text: '#f7eefa',
        textSoft: '#c5a9c5', textDim: '#a07e9d', accent: '#f43f72',
        accentLight: '#ff78aa', info: '#42d9ef',
        base: {
          '950': '#08070d', '900': '#100d18', '850': '#171220',
          '800': '#21172c', '700': '#35223f', '600': '#543150',
          '500': '#7a5275', '400': '#a07e9d', '300': '#c5a9c5',
          '200': '#e4d3e4', '100': '#f7eefa',
        },
      },
      light: {
        bg: '#f9f2f7', surface: '#ffffff', surfaceRaised: '#f1e6ef',
        border: '#dfc9dc', borderSoft: '#eadbe8', text: '#281a2b',
        textSoft: '#624566', textDim: '#806780', accent: '#cf2f62',
        accentLight: '#a92250', info: '#168ba2',
        base: {
          '950': '#f9f2f7', '900': '#ffffff', '850': '#f1e6ef',
          '800': '#eadbe8', '700': '#dfc9dc', '600': '#c3a4bf',
          '500': '#a686a2', '400': '#806780', '300': '#624566',
          '200': '#412b46', '100': '#281a2b',
        },
      },
    },
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
