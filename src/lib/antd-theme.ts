import { theme, type ThemeConfig } from 'antd';
import type { SeasonPalette } from '@/data/season';

/**
 * O Ant Design vestido de Battlefield.
 *
 * Os componentes vêm prontos; a aparência continua sendo a do site. O que
 * define isso são os *seed tokens* — o antd deriva dezenas de cores a partir de
 * meia dúzia delas, e é por isso que os valores aqui precisam ser literais: o
 * cálculo roda em JavaScript, sobre a cor de verdade, e `var(--accent)` chegaria
 * lá como texto que não dá para clarear nem escurecer.
 *
 * A paleta sazonal vem de `src/data/season.ts`, a mesma fonte que alimenta os
 * tokens CSS. Assim o Ant Design, os gráficos e a página usam cores idênticas.
 *
 * `borderRadius: 0` é o que mais importa para o resultado não parecer um painel
 * administrativo genérico. O canto do site não é arredondado, é chanfrado, e o
 * chanfro vem das classes `.bevel` e `.bevel-sm`, aplicadas por cima.
 */

/** Paleta permanente usada fora das temporadas cadastradas. */
const ESCURO = {
  bg: '#080a08', surface: '#0d100c', surfaceRaised: '#12160f',
  border: '#232a1e', borderSoft: '#181d15', text: '#e4e8dc',
  textSoft: '#97a288', textDim: '#6d7a5e', accent: '#ff8a00',
  info: '#22c3d6',
};

/** Paleta permanente clara, usada fora das temporadas cadastradas. */
const CLARO = {
  bg: '#f4f5ef', surface: '#ffffff', surfaceRaised: '#eceee4',
  border: '#d2d6c6', borderSoft: '#e2e5d8', text: '#14180f',
  textSoft: '#4b563f', textDim: '#6d7a5e', accent: '#c96a00',
  info: '#168ba2',
};

/** Cores semânticas permanentes. */
const POSITIVO = '#7ddc4c';
const NEGATIVO = '#ff5c47';
const INFO = ESCURO.info;

/**
 * A paleta do tema em cores literais.
 *
 * Os gráficos são desenhados em canvas pelo Ant Design Plots, e canvas não lê
 * `var(--accent)`: lá dentro só entra cor resolvida. Como estes valores já
 * existiam aqui para alimentar os *seed tokens* do antd, os gráficos bebem da
 * mesma fonte em vez de abrir uma terceira cópia da paleta.
 */
export function coresDoTema(light: boolean, palette?: SeasonPalette) {
  if (!palette) return light ? CLARO : ESCURO;
  const selected = palette[light ? 'light' : 'dark'];
  return {
    bg: selected.bg, surface: selected.surface, surfaceRaised: selected.surfaceRaised,
    border: selected.border, borderSoft: selected.borderSoft, text: selected.text,
    textSoft: selected.textSoft, textDim: selected.textDim, accent: selected.accent,
    accentLight: selected.accentLight, info: selected.info,
  };
}

/** Iguais nos dois temas, para quem precisa delas fora dos tokens do antd. */
export const CORES_FIXAS = { positivo: POSITIVO, negativo: NEGATIVO, info: INFO };

export function antdTheme(light: boolean, palette?: SeasonPalette): ThemeConfig {
  const c = coresDoTema(light, palette);

  return {
    algorithm: light ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: {
      colorPrimary: c.accent,
      colorInfo: c.info,
      colorSuccess: POSITIVO,
      colorError: NEGATIVO,
      colorWarning: c.accent,

      colorBgBase: c.bg,
      colorTextBase: c.text,

      // O antd derivaria estas do `colorBgBase`, e o resultado não bate com as
      // superfícies do site — que são translúcidas e vêm com trama por baixo.
      colorBgContainer: c.surface,
      colorBgElevated: c.surfaceRaised,
      colorBorder: c.border,
      colorBorderSecondary: c.borderSoft,
      colorText: c.text,
      colorTextSecondary: c.textSoft,
      colorTextTertiary: c.textDim,
      colorTextDescription: c.textDim,

      fontFamily: 'var(--font-sans), system-ui, sans-serif',
      fontSize: 14,

      // Canto reto: o chanfro entra por `clip-path`, nas classes `.bevel`.
      borderRadius: 0,
      borderRadiusLG: 0,
      borderRadiusSM: 0,
      borderRadiusXS: 0,

      controlHeight: 36,
      wireframe: false,
    },
    components: {
      Layout: {
        headerBg: 'transparent',
        bodyBg: 'transparent',
        footerBg: 'transparent',
        headerPadding: 0,
        headerHeight: 'auto' as unknown as number,
      },
      Menu: {
        // O menu do cabeçalho corre sobre o fundo desfocado da página, não
        // sobre uma faixa própria.
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        horizontalItemSelectedColor: c.accent,
        itemSelectedColor: c.accent,
        itemSelectedBg: `color-mix(in oklab, ${c.accent} 18%, transparent)`,
        itemColor: c.textDim,
        itemHoverColor: c.text,
        horizontalItemBorderRadius: 0,
        activeBarHeight: 2,
        lineType: 'solid',
      },
      Card: {
        colorBgContainer: 'transparent',
        paddingLG: 12,
      },
      Segmented: {
        itemSelectedBg: c.accent,
        itemSelectedColor: light ? '#ffffff' : '#14170f',
        itemColor: c.textSoft,
        trackBg: c.surfaceRaised,
      },
      Input: {
        colorBgContainer: c.surfaceRaised,
        activeShadow: 'none',
      },
      Select: {
        colorBgContainer: c.surfaceRaised,
        optionSelectedBg: `color-mix(in oklab, ${c.accent} 20%, transparent)`,
      },
      Tag: {
        defaultBg: c.surfaceRaised,
      },
      Empty: {
        colorTextDescription: c.textDim,
      },
    },
  };
}
