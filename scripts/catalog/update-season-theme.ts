#!/usr/bin/env node
/**
 * Gera a paleta que falta para a temporada cadastrada mais recente.
 *
 * O workflow só consulta o modelo quando uma temporada temática ainda não tem
 * entrada em src/data/season-palettes.json. A proposta precisa citar uma página
 * oficial da EA e passar por validação de formato e contraste antes de gravar.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidatos, modelosDe, perguntarComBusca, temAlgumaChave } from '../meta/provedores.mjs';
import { extrairJson } from '../meta/leitura.mjs';
import { ROOT, log } from './lib/io.ts';
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

function fonteOficial(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\\./, '');
    return host === 'ea.com' || host.endsWith('.ea.com') || host === 'battlefield.com' || host.endsWith('.battlefield.com');
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const season = [...SEASONS].filter((item) => item.theme).sort((a, b) => b.number - a.number)[0];
  if (!season?.theme) throw new Error('Nenhuma temporada temática está cadastrada em src/data/season.ts.');

  const palettes = JSON.parse(readFileSync(PALETTE_FILE, 'utf8')) as Record<string, SeasonPalette>;
  if (palettes[season.theme]) {
    log('paleta sazonal', `${season.name} já está configurada`);
    return;
  }
  if (!temAlgumaChave()) throw new Error('A nova temporada precisa de uma paleta, mas GEMINI_API_KEY não está configurada.');

  const prompt = `
Pesquise a temporada oficial mais recente de Battlefield 6 em fontes da EA.
Use o nome, resumo e temporada abaixo como contexto confirmado pelo projeto:
- Temporada: ${season.number} — ${season.name}
- Resumo: ${season.summary}

Crie uma paleta acessível para o tema visual oficial dessa temporada. A identidade visual pode inspirar cores de destaque, mas mantenha leitura e contraste:
- Retorne somente JSON válido no formato { "source": "URL oficial da EA", "palette": { "dark": COLORS, "light": COLORS } }.
- Cada COLORS contém bg, surface, surfaceRaised, border, borderSoft, text, textSoft, textDim, accent, accentLight, info e base.
- base deve conter exatamente os tons 950, 900, 850, 800, 700, 600, 500, 400, 300, 200 e 100.
- Todas as cores são hexadecimais #RRGGBB. Texto deve contrastar pelo menos 4.5:1 com bg e surface; accent e info, pelo menos 3:1 com bg.
- O tema escuro usa fundo realmente escuro; o claro usa fundo claro. As duas variantes devem parecer a mesma identidade sazonal.
- Não invente detalhes temáticos: use apenas o que a página oficial citada sustenta. Não altere datas nem nomes da temporada.
`.trim();

  let ultimoErro: unknown;
  for await (const candidato of candidatos(MODELOS, { busca: true })) {
    try {
      const resposta = await perguntarComBusca(candidato, prompt, { maxOutputTokens: 1800, tentativas: 2 });
      const resultado = extrairJson(resposta.texto) as { source?: unknown; palette?: unknown } | null;
      const fonte = typeof resultado?.source === 'string' ? resultado.source : '';
      const fonteCitada = resposta.anotacoes.some((item) => fonteOficial(item.url));
      if (!resposta.buscou || !fonteOficial(fonte) || !fonteCitada) {
        throw new Error('A resposta não citou uma fonte oficial da EA na busca.');
      }
      if (!validarPaleta(resultado?.palette)) {
        throw new Error('A paleta proposta não passou na validação de formato ou contraste.');
      }

      palettes[season.theme] = resultado.palette;
      writeFileSync(PALETTE_FILE, `${JSON.stringify(palettes, null, 2)}\\n`);
      log('paleta criada', { temporada: season.name, fonte });
      return;
    } catch (error) {
      ultimoErro = error;
      console.warn(`[${candidato.provedor}/${candidato.modelo}] ${error instanceof Error ? error.message : error}`);
    }
  }

  throw new Error(`Não foi possível criar uma paleta segura para ${season.name}: ${ultimoErro instanceof Error ? ultimoErro.message : 'nenhum modelo respondeu'}`);
}

if (process.argv[1]?.endsWith('update-season-theme.ts')) await main();
