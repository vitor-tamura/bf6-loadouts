#!/usr/bin/env node
/**
 * Gera a paleta que falta para a temporada cadastrada mais recente.
 *
 *   npm run season:theme
 *   npm run season:theme -- --material   # só baixa e mostra o que o modelo leria
 *
 * O workflow só consulta o modelo quando uma temporada temática ainda não tem
 * entrada em src/data/season-palettes.json. A proposta precisa citar uma página
 * oficial da EA e passar por validação de formato e contraste antes de gravar.
 *
 * ## Primeiro sem busca, como o trending
 *
 * A identidade de uma temporada está no texto oficial: o anúncio da EA e o
 * patch note que a abre ("from the neon-lit Las Vegas Strip to the classified
 * depths of Area 51"). O script junta os dois — a página da temporada, achada
 * na listagem de novidades da EA, e o patch note que o pipeline do catálogo já
 * gravou em `data/patches` — e um modelo gratuito do OpenRouter, sem busca,
 * propõe a paleta lendo só isso. É o mesmo desenho da leitura do trending em
 * `meta-search.mjs`: a busca do OpenRouter é cobrada por consulta até em
 * modelo gratuito, e a ferramenta de busca de modelo nem passa pelo portão de
 * idade da EA — volta com o formulário de data de nascimento.
 *
 * Sem material, ou sem paleta que passe nas travas, vale a pergunta com busca
 * de antes, com o Gemini gratuito.
 *
 * A paleta é metade do tema. A outra metade — o motivo de fundo que diz "naval"
 * ou "Vegas" — é um bloco `[data-season='<tema>']` em `globals.css`, escrito à
 * mão como nas temporadas anteriores; sem ele, a temporada veste a paleta sobre
 * o fundo padrão, que já fica coerente.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  candidatos,
  modelosDe,
  perguntarComBusca,
  perguntarSemBusca,
  temAlgumaChave,
} from '../meta/provedores.mjs';
import { extrairJson } from '../meta/leitura.mjs';
import { EA_NEWS, fetchText, htmlToText } from './lib/http.ts';
import { PATCHES, ROOT, compareVersions, log } from './lib/io.ts';
import { SEASONS, type SeasonPalette, type SeasonPaletteColors } from '../../src/data/season.ts';

const PALETTE_FILE = join(ROOT, 'src', 'data', 'season-palettes.json');
const MODELOS = modelosDe(process.env.SEASON_THEME_MODELS, 'openrouter/free');
const TONS = ['950', '900', '850', '800', '700', '600', '500', '400', '300', '200', '100'] as const;
const HEX = /^#[0-9a-f]{6}$/i;

function luminancia(hex: string): number {
  const rgb = hex.slice(1).match(/../g)!.map((parte) => parseInt(parte, 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

export function validarPaleta(palette: unknown): palette is SeasonPalette {
  if (!palette || typeof palette !== 'object') return false;
  const value = palette as Partial<SeasonPalette>;
  for (const mode of ['dark', 'light'] as const) {
    const colors = value[mode] as SeasonPaletteColors | undefined;
    if (!colors || typeof colors !== 'object') return false;
    const required = ['bg', 'surface', 'surfaceRaised', 'border', 'borderSoft', 'text', 'textSoft', 'textDim', 'accent', 'accentLight', 'info'] as const;
    if (required.some((key) => typeof colors[key] !== 'string' || !HEX.test(colors[key]))) return false;
    if (!colors.base || TONS.some((shade) => !HEX.test(colors.base[shade] ?? ''))) return false;
    if (contraste(colors.text, colors.bg) < 4.5 || contraste(colors.text, colors.surface) < 4.5) return false;
    if (contraste(colors.accent, colors.bg) < 3 || contraste(colors.info, colors.bg) < 3) return false;
  }
  return true;
}

export function fonteOficial(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'ea.com' || host.endsWith('.ea.com') || host === 'battlefield.com' || host.endsWith('.battlefield.com');
  } catch {
    return false;
  }
}

/* ========================================================================== *
 * O material: a página oficial da temporada e o patch note que a abre
 * ========================================================================== */

export interface PaginaOficial {
  url: string;
  titulo: string;
  texto: string;
}

type Temporada = { number: number; name: string; summary: string };

/** Quanto de cada texto oficial vai para o prompt. A identidade está no começo. */
const MAX_POR_PAGINA = 6000;

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Os artigos da EA que falam da temporada, pelo endereço.
 *
 * Como em `discover-updates.ts`, o endereço é a afirmação: a EA publica o
 * anúncio em `/news/battlefield-season-5-roadmap`, ora sob `battlefield-6`,
 * ora sob `redsec`. O que importa é o `season-<n>` no slug.
 */
export function artigosDaTemporada(html: string, numero: number): string[] {
  const padrao = new RegExp(
    `href="((?:https://www\\.ea\\.com)?/(?:[a-z]{2}(?:-[a-z]{2})?/)?games/battlefield/[a-z0-9-]+/news/[a-z0-9-]*season-${numero}(?![0-9])[a-z0-9-]*)"`,
    'gi',
  );
  const urls = [...String(html ?? '').matchAll(padrao)].map(([, href]) =>
    href.startsWith('http') ? href : `https://www.ea.com${href}`,
  );
  // Anúncio e roadmap primeiro: são os que descrevem a temporada inteira.
  const peso = (url: string) => (/roadmap|reveal|overview|launch/.test(url) ? 0 : 1);
  return [...new Set(urls)].sort((a, b) => peso(a) - peso(b));
}

/**
 * O texto do artigo, sem o portão de idade e sem o menu.
 *
 * O HTML servido já traz o artigo inteiro — o portão é do navegador —, mas o
 * texto começa com o formulário de data de nascimento e a navegação do site.
 * O corte começa na primeira menção à temporada.
 */
export function textoDaTemporada(texto: string, numero: number, nome: string, max = MAX_POR_PAGINA): string {
  const limpo = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const marcas = [new RegExp(`season ${numero}(?![0-9])`, 'i'), new RegExp(escapar(nome), 'i')];
  const inicios = marcas.map((marca) => limpo.search(marca)).filter((i) => i >= 0);
  if (!inicios.length) return '';
  const inicio = Math.max(0, Math.min(...inicios) - 200);
  return limpo.slice(inicio, inicio + max).trim();
}

/** O patch note mais recente gravado pelo catálogo que fala da temporada. */
function patchNoteDaTemporada(numero: number, nome: string): PaginaOficial | null {
  if (!existsSync(PATCHES)) return null;
  const versoes = readdirSync(PATCHES)
    .filter((arquivo) => arquivo.endsWith('.json'))
    .map((arquivo) => arquivo.replace(/\.json$/, ''))
    .sort(compareVersions)
    .reverse();

  for (const versao of versoes) {
    const nota = JSON.parse(readFileSync(join(PATCHES, `${versao}.json`), 'utf8')) as {
      rawContent?: string;
      title?: string;
      source?: { url?: string };
    };
    const texto = textoDaTemporada(nota.rawContent ?? '', numero, nome);
    if (texto && nota.source?.url) return { url: nota.source.url, titulo: nota.title ?? `Game Update ${versao}`, texto };
  }
  return null;
}

/** As páginas oficiais da temporada que o script consegue juntar hoje. */
export async function lerPaginasOficiais(season: { number: number; name: string }): Promise<PaginaOficial[]> {
  const paginas: PaginaOficial[] = [];

  const artigos = new Set<string>();
  for (const listagem of [EA_NEWS, EA_NEWS.replace('/battlefield-6/', '/redsec/')]) {
    try {
      for (const url of artigosDaTemporada(await fetchText(listagem), season.number)) artigos.add(url);
    } catch (erro) {
      console.warn(`[tema] listagem fora — ${listagem}: ${(erro as Error).message}`);
    }
  }
  // O padrão que a EA usou na temporada 5, para quando a listagem não trouxer o artigo.
  artigos.add(`${EA_NEWS}/battlefield-season-${season.number}-roadmap`);

  for (const url of [...artigos].slice(0, 3)) {
    try {
      const html = await fetchText(url);
      const texto = textoDaTemporada(htmlToText(html), season.number, season.name);
      if (!texto) throw new Error('o artigo não fala da temporada');
      const titulo = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? url;
      paginas.push({ url, titulo, texto });
      break;
    } catch (erro) {
      console.warn(`[tema] artigo fora — ${url}: ${(erro as Error).message}`);
    }
  }

  const nota = patchNoteDaTemporada(season.number, season.name);
  if (nota && !paginas.some((pagina) => pagina.url === nota.url)) paginas.push(nota);

  return paginas;
}

/* ========================================================================== *
 * As duas perguntas
 * ========================================================================== */

const REGRAS_DA_PALETA = `- Cada COLORS contém bg, surface, surfaceRaised, border, borderSoft, text, textSoft, textDim, accent, accentLight, info e base.
- base deve conter exatamente os tons 950, 900, 850, 800, 700, 600, 500, 400, 300, 200 e 100. No escuro, 950 é o fundo e 100 o texto; no claro, a escala se inverte (100 é o texto, 950 o fundo).
- Todas as cores são hexadecimais #RRGGBB. Texto deve contrastar pelo menos 4.5:1 com bg e surface; accent e info, pelo menos 3:1 com bg.
- O tema escuro usa fundo realmente escuro; o claro usa fundo claro. As duas variantes devem parecer a mesma identidade sazonal.
- accent é a cor de ação do site (botões, barras que melhoraram); info é a cor de informação secundária.`;

export function promptSemBusca(season: Temporada, paginas: PaginaOficial[]): string {
  const blocos = paginas
    .map((pagina, i) => `[F${i + 1}] ${pagina.titulo}\nURL: ${pagina.url}\nTexto:\n"""\n${pagina.texto}\n"""`)
    .join('\n\n');

  return `Crie a paleta do site para a temporada oficial de Battlefield 6 descrita abaixo.

- Temporada: ${season.number} — ${season.name}
- Resumo: ${season.summary}

Você **não tem busca**. Este é o texto oficial da EA, baixado hoje pelo script:

${blocos}

Leia o que o texto diz do cenário e do clima da temporada — lugares, hora do dia, luz, materiais — e traduza isso numa paleta acessível. A identidade pode inspirar as cores de destaque, mas leitura e contraste vêm antes. Não invente elemento que o texto não sustente, e não altere datas nem nomes da temporada.

${REGRAS_DA_PALETA}
- Em "source", copie a URL do bloco que mais sustenta a paleta. Em "concept", uma frase em português do Brasil dizendo de onde vem cada cor.

Retorne somente JSON válido, sem cercas de código: { "source": "URL", "concept": "frase", "palette": { "dark": COLORS, "light": COLORS } }`;
}

function promptComBusca(season: Temporada): string {
  return `
Pesquise a temporada oficial mais recente de Battlefield 6 em fontes da EA.
Use o nome, resumo e temporada abaixo como contexto confirmado pelo projeto:
- Temporada: ${season.number} — ${season.name}
- Resumo: ${season.summary}

Crie uma paleta acessível para o tema visual oficial dessa temporada. A identidade visual pode inspirar cores de destaque, mas mantenha leitura e contraste:
- Retorne somente JSON válido no formato { "source": "URL oficial da EA", "palette": { "dark": COLORS, "light": COLORS } }.
${REGRAS_DA_PALETA}
- Não invente detalhes temáticos: use apenas o que a página oficial citada sustenta. Não altere datas nem nomes da temporada.
`.trim();
}

interface Proposta {
  palette: SeasonPalette;
  source: string;
  concept: string;
  modelo: string;
}

/**
 * Confere a resposta de um modelo: fonte oficial e paleta que passa nas travas.
 *
 * Sem busca, a fonte também tem de ser uma das páginas entregues: endereço que
 * o script não baixou foi memória do modelo.
 */
export function conferirProposta(texto: string, { fontesPermitidas }: { fontesPermitidas?: Set<string> } = {}) {
  const resultado = extrairJson(texto) as { source?: unknown; concept?: unknown; palette?: unknown } | null;
  const fonte = typeof resultado?.source === 'string' ? resultado.source : '';
  if (!fonteOficial(fonte) || (fontesPermitidas && !fontesPermitidas.has(fonte))) {
    throw new Error('a resposta não citou uma fonte oficial da EA entre as entregues.');
  }
  if (!validarPaleta(resultado?.palette)) {
    throw new Error('a paleta proposta não passou na validação de formato ou contraste.');
  }
  return {
    palette: resultado.palette,
    source: fonte,
    concept: typeof resultado.concept === 'string' ? resultado.concept : '',
  };
}

async function lerSemBusca(season: Temporada, paginas: PaginaOficial[]): Promise<Proposta | null> {
  const fontesPermitidas = new Set(paginas.map((pagina) => pagina.url));
  const prompt = promptSemBusca(season, paginas);

  for await (const candidato of candidatos(MODELOS, { busca: false })) {
    try {
      const resposta = await perguntarSemBusca(candidato, prompt, { maxOutputTokens: 3000, tentativas: 2 });
      return { ...conferirProposta(resposta.texto, { fontesPermitidas }), modelo: resposta.modelo };
    } catch (error) {
      console.warn(`[${candidato.provedor}/${candidato.modelo}, sem busca] ${error instanceof Error ? error.message : error}`);
    }
  }
  return null;
}

async function lerComBusca(season: Temporada): Promise<{ proposta: Proposta | null; ultimoErro: unknown }> {
  let ultimoErro: unknown;
  for await (const candidato of candidatos(MODELOS, { busca: true })) {
    try {
      const resposta = await perguntarComBusca(candidato, promptComBusca(season), { maxOutputTokens: 1800, tentativas: 2 });
      const fonteCitada = resposta.anotacoes.some((item: { url: string }) => fonteOficial(item.url));
      if (!resposta.buscou || !fonteCitada) throw new Error('A resposta não citou uma fonte oficial da EA na busca.');
      return { proposta: { ...conferirProposta(resposta.texto), modelo: resposta.modelo }, ultimoErro: null };
    } catch (error) {
      ultimoErro = error;
      console.warn(`[${candidato.provedor}/${candidato.modelo}] ${error instanceof Error ? error.message : error}`);
    }
  }
  return { proposta: null, ultimoErro };
}

async function main(): Promise<void> {
  const season = [...SEASONS].filter((item) => item.theme).sort((a, b) => b.number - a.number)[0];
  if (!season?.theme) throw new Error('Nenhuma temporada temática está cadastrada em src/data/season.ts.');

  if (process.argv.includes('--material')) {
    const paginas = await lerPaginasOficiais(season);
    console.log(paginas.length ? promptSemBusca(season, paginas) : 'Nenhuma página oficial da temporada foi juntada.');
    return;
  }

  const palettes = JSON.parse(readFileSync(PALETTE_FILE, 'utf8')) as Record<string, SeasonPalette>;
  if (palettes[season.theme]) {
    log('paleta sazonal', `${season.name} já está configurada`);
    return;
  }
  if (!temAlgumaChave()) {
    throw new Error('A nova temporada precisa de uma paleta, mas nem OPENROUTER_API_KEY nem GEMINI_API_KEY estão configuradas.');
  }

  const paginas = await lerPaginasOficiais(season);
  log('material oficial', paginas.length ? paginas.map((pagina) => pagina.url) : 'nenhum — vai para a busca');

  let proposta = paginas.length ? await lerSemBusca(season, paginas) : null;
  let ultimoErro: unknown = null;
  if (!proposta) ({ proposta, ultimoErro } = await lerComBusca(season));

  if (!proposta) {
    throw new Error(
      `Não foi possível criar uma paleta segura para ${season.name}: ${ultimoErro instanceof Error ? ultimoErro.message : 'nenhum modelo respondeu'}`,
    );
  }

  palettes[season.theme] = proposta.palette;
  writeFileSync(PALETTE_FILE, `${JSON.stringify(palettes, null, 2)}\n`);
  log('paleta criada', {
    temporada: season.name,
    fonte: proposta.source,
    modelo: proposta.modelo,
    ...(proposta.concept ? { conceito: proposta.concept } : {}),
  });
}

if (process.argv[1]?.endsWith('update-season-theme.ts')) await main();
