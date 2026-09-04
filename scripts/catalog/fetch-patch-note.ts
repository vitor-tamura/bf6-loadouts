#!/usr/bin/env node
/**
 * Baixa o patch note de uma versão e o guarda inteiro.
 *
 *   npm run catalog:fetch-patch -- 1.4.2.0
 *   npm run catalog:fetch-patch -- 1.4.2.0 https://www.ea.com/...
 *
 * O arquivo que sai em `data/patches/<versão>.json` tem o texto original junto
 * com o endereço e a hora da leitura. Guardar o texto é o ponto: o parser vai
 * evoluir, e quando ele mudar será preciso reprocessar patches antigos sem
 * depender de a EA manter a página no ar — páginas de patch antigas somem, e o
 * que some sem cópia não volta.
 *
 * O que este script não faz é interpretar. Ele não decide o que mudou, não toca
 * em entidade e não escreve versão nenhuma: separar o download da leitura é o
 * que permite rebaixar um parser errado sem perder a fonte.
 */

import { join } from 'node:path';
import { EA_NEWS, fetchText, htmlToText } from './lib/http.ts';
import { NOW, PATCHES, isGameVersion, log, writeJson } from './lib/io.ts';

export interface PatchNote {
  version: string;
  source: {
    provider: 'EA';
    official: true;
    type: 'official';
    url: string;
    retrievedAt: string;
  };
  publishedAt: string | null;
  title: string | null;
  rawContent: string;
  /** Preenchido por `parse-patch-note`; nasce vazio de propósito. */
  changes: unknown[];
}

/**
 * Onde mora o patch note de uma versão.
 *
 * A EA publica cada um numa página própria e o endereço segue um padrão que já
 * mudou mais de uma vez. Quando o padrão não bate, quem chama passa a URL na
 * mão — é o que o segundo argumento do script existe para fazer.
 */
export function patchNoteUrl(version: string): string {
  const slug = version.replace(/\./g, '-');
  return `${EA_NEWS}/battlefield-6-game-update-${slug}`;
}

/** A data de publicação, quando a página a declara em formato de máquina. */
function publishedAt(html: string): string | null {
  const meta = html.match(
    /<meta[^>]+(?:property|name)="(?:article:published_time|date|pubdate)"[^>]+content="([^"]+)"/i,
  );
  if (meta) return meta[1];

  const time = html.match(/<time[^>]+datetime="([^"]+)"/i);
  return time ? time[1] : null;
}

function title(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * O portão de idade da EA, e por que ele não impede este download.
 *
 * As páginas de Battlefield no site da EA abrem com um formulário de data de
 * nascimento — "Please enter your date of birth", "Sorry, you are not eligible
 * to view this content" —, e é por isso que o `rawContent` guardado começa com
 * esse trecho. O portão é do navegador: o HTML servido já traz o artigo
 * inteiro, e quem lê o HTML direto, como aqui, passa por ele sem perceber.
 *
 * Quem não passa é ferramenta de busca de modelo, que renderiza a página e
 * volta com o formulário. Foi assim que a leitura do meta de 04/09 se perdeu:
 * o prompt mandava abrir `ea.com`, o modelo voltava de mãos vazias e caía em
 * Reddit, que não sustenta força. Por isso o prompt de `meta-search.mjs` proíbe
 * abrir a EA e entrega o changelog já transcrito — e por isso o
 * `registro_de_patch` vale o que vale.
 */
export async function fetchPatchNote(version: string, url?: string): Promise<PatchNote> {
  const address = url ?? patchNoteUrl(version);
  const html = await fetchText(address);
  const text = htmlToText(html);

  /*
   * Página curta é página errada.
   *
   * Um 200 com "conteúdo indisponível" tem duzentos caracteres e passaria por
   * patch note vazio — o parser não acharia mudança nenhuma e o pipeline
   * concluiria que o patch não mexeu em nada. Um patch note de verdade tem
   * milhares de caracteres.
   */
  if (text.length < 800) {
    throw new Error(
      `conteúdo curto demais em ${address} (${text.length} caracteres) — provavelmente não é o patch note`,
    );
  }

  return {
    version,
    source: {
      provider: 'EA',
      official: true,
      type: 'official',
      url: address,
      retrievedAt: NOW,
    },
    publishedAt: publishedAt(html),
    title: title(html),
    rawContent: text,
    changes: [],
  };
}

async function main(): Promise<void> {
  const [version, url] = process.argv.slice(2);

  if (!version || !isGameVersion(version)) {
    console.error('uso: npm run catalog:fetch-patch -- <versão> [url]');
    process.exit(1);
  }

  try {
    const note = await fetchPatchNote(version, url);
    const path = join(PATCHES, `${version}.json`);
    writeJson(path, note);

    log('patch note', {
      'versão': version,
      url: note.source.url,
      publicado: note.publishedAt ?? 'não declarado',
      caracteres: note.rawContent.length,
    });
  } catch (error) {
    console.error(`[catalog] patch note falhou: ${error instanceof Error ? error.message : error}`);
    console.error('passe a URL na mão se o endereço padrão tiver mudado.');
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('fetch-patch-note.ts')) await main();
