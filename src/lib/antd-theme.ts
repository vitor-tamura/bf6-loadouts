import { theme, type ThemeConfig } from 'antd';

/**
 * O Ant Design vestido de Battlefield.
 *
 * Os componentes vêm prontos; a aparência continua sendo a do site. O que
 * define isso são os *seed tokens* — o antd deriva dezenas de cores a partir de
 * meia dúzia delas, e é por isso que os valores aqui precisam ser literais: o
 * cálculo roda em JavaScript, sobre a cor de verdade, e `var(--accent)` chegaria
 * lá como texto que não dá para clarear nem escurecer.
 *
 * O preço é ter as cores escritas em dois lugares. Elas espelham os blocos
 * `:root` de `src/app/globals.css` — mexeu lá, mexa aqui. É um par pequeno e
 * que muda pouco: as bases seguem a temporada, trocada a cada três meses, e o
 * âmbar do destaque não muda desde o começo.
 *
 * `borderRadius: 0` é o que mais importa para o resultado não parecer um painel
 * administrativo genérico. O canto do site não é arredondado, é chanfrado, e o
 * chanfro vem das classes `.bevel` e `.bevel-sm`, aplicadas por cima.
 */

/** Espelha `:root[data-season='naval']` em `globals.css`. */
const ESCURO = {
  bg: '#05080b',
  surface: '#090e13',
  surfaceRaised: '#0d141a',
  border: '#1b2833',
  borderSoft: '#111a22',
  text: '#dfeaf0',
  textSoft: '#8aa5b8',
  textDim: '#5c7a8f',
  accent: '#ff8a00',
};

/** Espelha `:root[data-season='naval'][data-theme='light']`. */
const CLARO = {
  bg: '#eef3f6',
  surface: '#ffffff',
  surfaceRaised: '#e2eaef',
  border: '#c4d2da',
  borderSoft: '#d8e2e8',
  text: '#0b1319',
  textSoft: '#3d5567',
  textDim: '#5c7a8f',
  accent: '#c96a00',
};

/** Iguais nos dois temas — vêm do bloco `@theme` permanente. */
const POSITIVO = '#7ddc4c';
const NEGATIVO = '#ff5c47';
const INFO = '#22c3d6';

export function antdTheme(light: boolean): ThemeConfig {
  const c = light ? CLARO : ESCURO;

  return {
    algorithm: light ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: {
      colorPrimary: c.accent,
      colorInfo: INFO,
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
