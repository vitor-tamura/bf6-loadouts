#!/usr/bin/env node
/**
 * A matriz de compatibilidade, arma por arma, do BF6 Loadouts.
 *
 *   npm run catalog:fetch-weapons
 *
 * A página de cada arma — `/weapons/m433` — traz a lista completa de peças que
 * ela aceita, separada por slot, com nome e custo. É a única fonte encontrada
 * que publica **compatibilidade e custo juntos**, e por arma.
 *
 * A lista geral de acessórios (`/attachments`) só dá custo; os patch notes só
 * dizem o que mudou; o dataset da comunidade tem a matriz mas com peças
 * genéricas por categoria. Aqui está o que faltava para o catálogo descrever o
 * jogo como o jogo se descreve: peças nomeadas, ligadas às armas que as aceitam.
 *
 * ## Por que uma requisição por arma
 *
 * Porque é assim que o site publica. São 62 páginas, com uma pausa entre elas —
 * um site da comunidade não é uma API, e varrer sem intervalo é abusar de quem
 * paga a banda. Leva perto de dois minutos e roda quando alguém pede, nunca no
 * workflow de seis em seis horas.
 *
 * ## O que fica guardado
 *
 * O extraído, não o HTML. Cada página tem quase 400 KB; as 62 dariam 24 MB por
 * execução no repositório, e o que o pipeline lê são quatro campos por peça. A
 * extração é reproduzível — rodar de novo refaz o mesmo arquivo.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { ENDPOINTS, fetchText } from './lib/http.ts';
import { IMPORTS, NOW, TODAY, SOURCES, log, readJsonIf, writeJson } from './lib/io.ts';
import { weapons } from './lib/store.ts';

/** Pausa entre páginas. Não há pressa: isto roda quando alguém pede. */
const DELAY_MS = Number(process.env.CATALOG_LOADOUTS_DELAY_MS ?? 1200);

/**
 * Um bloco por slot: `<h3 class="...">muzzle</h3>` seguido da grade de peças.
 *
 * A classe entra no padrão de propósito. Sem ela, qualquer `<h3>` da página —
 * título, nome da arma, cabeçalho de comentário — abriria um bloco falso e
 * levaria junto as peças do bloco seguinte.
 */
const SLOT_BLOCK = /<h3 class="font-bold capitalize text-base">([a-z ]+)<\/h3>/;

/** Cada peça: endereço, nome e custo em pontos. */
const CARD =
  /href="\/attachments\/([a-z0-9-]+)"[\s\S]*?data-slot="card-title">([^<]{1,45})<\/div>[\s\S]*?<\/svg>(\d+)<\/div>/g;

const decode = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .trim();

export interface WeaponAttachment {
  slot: string;
  slug: string;
  name: string;
  cost: number;
}

/** As peças que a página de uma arma lista, por slot. */
export function extractWeaponPage(html: string): WeaponAttachment[] {
  const parts = html.split(new RegExp(SLOT_BLOCK.source));
  const found: WeaponAttachment[] = [];

  // `split` com grupo devolve [antes, slot, corpo, slot, corpo, …].
  for (let index = 1; index < parts.length; index += 2) {
    const slot = parts[index].trim();
    const body = parts[index + 1] ?? '';

    for (const match of body.matchAll(CARD)) {
      const name = decode(match[2]);
      // "None" é a opção de deixar o slot vazio, não uma peça.
      if (name === 'None') continue;

      found.push({ slot, slug: match[1], name, cost: Number(match[3]) });
    }
  }

  return found;
}

async function main(): Promise<void> {
  const list = weapons().filter((weapon) => weapon.status === 'active');
  const collected: Record<string, WeaponAttachment[]> = {};
  const failed: string[] = [];

  log(`lendo ${list.length} armas`, `${ENDPOINTS.loadouts}/weapons/<arma>`);

  for (const [index, weapon] of list.entries()) {
    try {
      const html = await fetchText(`${ENDPOINTS.loadouts}/weapons/${weapon.id}`);
      const attachments = extractWeaponPage(html);

      if (!attachments.length) {
        /*
         * Página que responde e não lista nada é suspeita: ou a arma não existe
         * no site, ou o formato mudou. Registrar como falha é melhor do que
         * gravar uma arma sem peça nenhuma, que o catálogo leria como "esta
         * arma não aceita nada".
         */
        failed.push(weapon.id);
      } else {
        collected[weapon.id] = attachments;
      }
    } catch (error) {
      failed.push(weapon.id);
      console.warn(`  ${weapon.id}: ${error instanceof Error ? error.message : error}`);
    }

    if (index % 10 === 9) log(`  ${index + 1}/${list.length}`);
    if (index < list.length - 1) await sleep(DELAY_MS);
  }

  const path = join(IMPORTS, `bf6loadouts-weapons-${TODAY}.json`);
  writeJson(path, {
    provider: 'bf6loadouts',
    type: 'current_state',
    url: `${ENDPOINTS.loadouts}/weapons/<arma>`,
    retrievedAt: NOW,
    weapons: collected,
    failed,
  });

  const registryPath = join(SOURCES, 'bf6loadouts.json');
  const registry = readJsonIf<{ snapshots: unknown[] }>(registryPath, {
    provider: 'bf6loadouts',
    url: ENDPOINTS.loadouts,
    type: 'current_state',
    snapshots: [],
  } as never);

  registry.snapshots = [
    ...registry.snapshots,
    {
      snapshot: `bf6loadouts-weapons-${TODAY}`,
      retrievedAt: NOW,
      weapons: Object.keys(collected).length,
      relations: Object.values(collected).reduce((total, list) => total + list.length, 0),
      failed: failed.length,
      file: path.replace(`${process.cwd()}/`, ''),
    },
  ];
  writeJson(registryPath, registry);

  const relations = Object.values(collected).reduce((total, list) => total + list.length, 0);
  log('matriz do BF6 Loadouts', {
    armas: Object.keys(collected).length,
    'relações': relations,
    falhas: failed.length ? failed : 'nenhuma',
  });
}

if (process.argv[1] && process.argv[1].endsWith('fetch-loadouts-weapons.ts')) await main();
