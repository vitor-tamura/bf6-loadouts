#!/usr/bin/env node
/**
 * O estado atual do jogo, lido do BF6 Loadouts.
 *
 *   npm run catalog:fetch-loadouts
 *
 * Esta é a fonte que responde "o que existe hoje": que armas estão no jogo, que
 * peças cada uma aceita, em que slot. Não é fonte de histórico — ela não sabe
 * dizer o que mudou no último patch, só mostra o presente —, e é por isso que
 * ela decide compatibilidade e não decide balanceamento.
 *
 * ## O que uma investigação de 12/08/2026 encontrou
 *
 * O site responde bem a cliente automatizado (200, com user-agent honesto), mas
 * **não serve os dados que faltam ao catálogo**. Foram lidas a home, `/create`,
 * `/weapons` e uma página de loadout: nenhuma traz custo em pontos nem lista de
 * acessórios por arma no HTML. O aplicativo é Next.js e monta essas telas no
 * navegador, buscando os dados depois; no HTML há apenas rotas de imagem
 * (`/api/storage/...`), nenhuma de dados.
 *
 * Extrair dali exigiria uma das duas coisas: rodar um navegador de verdade no
 * pipeline, ou reconstruir a API interna a partir dos pacotes JavaScript. A
 * primeira traz um navegador inteiro como dependência de um script de dados; a
 * segunda produz um extrator que quebra a cada publicação do site, calado.
 *
 * Por isso este script continua guardando o instantâneo e nada mais. Enquanto
 * não houver caminho melhor, custo de munição e compatibilidade de munição e
 * ergonomia seguem como pendência declarada — ver `docs/data-sources.md`.
 *
 * ## Por que este script guarda em vez de interpretar
 *
 * O site é uma aplicação, não uma API publicada. A forma dos dados dentro dele
 * pode mudar sem aviso nenhum, e um extrator que assume a forma de hoje começa
 * a devolver silêncio — ou pior, meia lista — no dia em que ela mudar. Meia
 * lista é o cenário ruim: o `reconcile` leria as peças ausentes como peças
 * removidas pelo patch e proporia apagar compatibilidade de verdade.
 *
 * Então este script faz duas coisas e só: guarda o que veio, com data e
 * endereço, e verifica se reconheceu alguma estrutura. Quando não reconhece,
 * falha alto — o workflow marca `blocked`, abre issue e não mexe no catálogo.
 */

import { join } from 'node:path';
import { fetchText } from './lib/http.ts';
import { fonteAtiva } from './lib/sources.ts';
import { IMPORTS, NOW, SOURCES, TODAY, log, readJsonIf, writeJson } from './lib/io.ts';

/**
 * O bolo de dados que aplicações web deixam no HTML.
 *
 * A maioria dos sites feitos com framework moderno embute o estado inicial numa
 * tag de script. Quando ele está lá, é a leitura mais estável que existe: são
 * os mesmos dados que a página usa para se desenhar, sem depender de classe de
 * CSS nem de ordem de elemento.
 */
const EMBEDDED = [
  /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/i,
  /<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/i,
  /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/,
];

export function extractEmbedded(html: string): unknown | null {
  for (const pattern of EMBEDDED) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      // Um bloco que não é JSON válido não serve; tenta o próximo padrão.
    }
  }
  return null;
}

export async function fetchLoadouts(): Promise<{
  url: string;
  embedded: unknown | null;
  html: string;
}> {
  const url = fonteAtiva('estado_atual').url;
  const html = await fetchText(url);
  return { url, embedded: extractEmbedded(html), html };
}

async function main(): Promise<void> {
  try {
    const { url, embedded, html } = await fetchLoadouts();
    const path = join(IMPORTS, `bf6loadouts-${TODAY}.json`);

    writeJson(path, {
      provider: 'bf6loadouts',
      type: 'current_state',
      url,
      retrievedAt: NOW,
      embedded,
      /*
       * O HTML fica junto, mesmo quando o bloco embutido foi lido.
       *
       * É o que permite escrever um extrator melhor depois sem ter de esperar o
       * site voltar a estar no ar exatamente como estava no dia da leitura.
       */
      html,
    });

    const registryPath = join(SOURCES, 'bf6loadouts.json');
    const registry = readJsonIf<{ snapshots: unknown[] }>(registryPath, {
      provider: 'bf6loadouts',
      url,
      type: 'current_state',
      snapshots: [],
    } as never);

    registry.snapshots = [
      ...registry.snapshots,
      {
        snapshot: `bf6loadouts-${TODAY}`,
        retrievedAt: NOW,
        recognized: embedded !== null,
        file: path.replace(`${process.cwd()}/`, ''),
      },
    ];
    writeJson(registryPath, registry);

    log('estado atual', {
      url,
      'estrutura reconhecida': embedded !== null,
      'html (caracteres)': html.length,
    });

    if (!embedded) {
      console.error(
        'nenhuma estrutura de dados reconhecida na página — o instantâneo foi guardado, mas nada pode ser conciliado a partir dele.',
      );
      process.exit(3);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[catalog] estado atual falhou: ${message}`);

    /*
     * 403 não é falha de rede, é recusa.
     *
     * O site responde 403 a cliente automatizado — o que é direito de quem o
     * mantém, e não se contorna trocando o user-agent para fingir navegador.
     * O caminho que sobra é o manual: alguém abre a página, salva o HTML e o
     * põe em `data/sources/imports/`, de onde `import-loadouts` o lê. Fica mais
     * lento e continua rastreável, que é o que importa para o catálogo.
     */
    if (message.includes('403')) {
      console.error(
        '\nO site recusou o acesso automatizado. Para importar assim mesmo:\n' +
          '  1. abra https://bf6loadouts.com no navegador;\n' +
          '  2. salve a página como HTML;\n' +
          `  3. copie para data/sources/imports/bf6loadouts-<data>.html;\n` +
          '  4. rode npm run catalog:import-loadouts.\n',
      );
    }

    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('fetch-loadouts.ts')) await main();
