#!/usr/bin/env node
/**
 * Importa custo em pontos das páginas salvas do BF6 Loadouts.
 *
 *   npm run catalog:import-loadouts
 *
 * O site monta a lista de acessórios no navegador — o HTML servido traz apenas
 * "LOADING ATTACHMENTS...". Quem abre a página e a salva obtém o conteúdo já
 * renderizado, e é desses arquivos que este script lê. É um caminho manual, e é
 * o único que existe sem pôr um navegador dentro do pipeline.
 *
 * Cada peça aparece assim no HTML salvo:
 *
 *     <h3>Hollow Point</h3><span>Ammo</span> … <div>20 PTS</div>
 *
 * Nome, slot e custo. Compatibilidade não: as páginas não a publicam, e é por
 * isso que ela continua vindo de outra fonte.
 *
 * ## O que este script não faz
 *
 * Não cria peça. A página descreve o arsenal com peças **nomeadas** — 163 canos
 * como `12.5" Mid`, 41 miras como `1P86 LPVO` —, e o catálogo descreve com
 * peças genéricas por categoria, herdadas do v5. São duas leituras do mesmo
 * jogo, e trocar uma pela outra deixaria as 2.381 relações de compatibilidade
 * apontando para ids que deixaram de existir.
 *
 * Então aqui só se aplica custo ao que já existe. O que não casa é contado e
 * listado no evento — é a medida do quanto os dois modelos divergem, e a
 * decisão de unificá-los é de quem revisa, não deste script.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceRef } from '../../src/catalog/catalog.types.ts';
import { DATA, IMPORTS, NOW, TODAY, log, readJson, versionDir, writeJson } from './lib/io.ts';
import { attachments, currentVersion } from './lib/store.ts';

const SOURCE: SourceRef = {
  provider: 'bf6loadouts',
  type: 'current_state',
  url: 'https://bf6loadouts.com/attachments',
  dataset: 'página salva do navegador',
  commit: null,
  version: null,
  retrievedAt: NOW,
  snapshot: `bf6loadouts-${TODAY}`,
};

/** `<h3>Nome</h3><span>Slot</span> … <div>NN PTS</div>` */
const CARD =
  /<h3[^>]*>([^<>]{2,45})<\/h3><span[^>]*>([A-Za-z ]{2,20})<\/span><\/div><div[^>]*>(\d+)\s*PTS<\/div>/g;

/**
 * Os slots da página, traduzidos para os do catálogo.
 *
 * Três não têm equivalente: `Optic Accessory`, `Top Accessory` e `Right
 * Accessory`. O v5 organiza esses acessórios como `laser` e `light`, e não há
 * correspondência de um para um — as peças desses slots ficam de fora, contadas
 * no evento.
 */
const SLOTS: Record<string, string> = {
  Ammo: 'ammo',
  Barrel: 'barrel',
  Ergonomics: 'ergonomics',
  Magazine: 'magazine',
  Muzzle: 'muzzle',
  Optic: 'sight',
  Underbarrel: 'underbarrel',
};

/**
 * Os nomes que a página e o catálogo escrevem de formas diferentes.
 *
 * A página usa o nome do jogo; o v5 usa o nome interno do dataset da
 * comunidade. Cada linha aqui é uma afirmação de que as duas se referem à mesma
 * peça — escrita à mão porque casar `FMJ` com `Standard` por semelhança de
 * texto é impossível, e por proximidade seria chute.
 */
const ALIASES: Record<string, string> = {
  FMJ: 'Standard',
  'Tungsten Core': 'Penetration',
  'Polymer Case': 'Lightweight',
  'Match Grade': 'Long-Range',
  'Synthetic Tip': 'Synthetic',
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

interface Card {
  name: string;
  slot: string;
  cost: number;
}

/** Lê todas as páginas salvas, sem repetir peça que apareça em duas. */
export function readSavedPages(directory: string): Card[] {
  const found = new Map<string, Card>();

  for (const file of readdirSync(directory).filter((name) => name.endsWith('.html'))) {
    const html = readFileSync(join(directory, file), 'utf8');

    for (const match of html.matchAll(CARD)) {
      const name = match[1].trim();
      const slot = match[2].trim();
      // "None" é a opção de slot vazio da interface, não uma peça.
      if (!name || name === 'None') continue;

      found.set(`${name}|${slot}`, { name, slot, cost: Number(match[3]) });
    }
  }

  return [...found.values()];
}

function main(): void {
  const version = currentVersion();
  const dir = versionDir(version);

  const cards = readSavedPages(IMPORTS);
  if (!cards.length) {
    throw new Error(
      `nenhuma página salva com acessórios em ${IMPORTS} — salve https://bf6loadouts.com/attachments pelo navegador`,
    );
  }

  const catalog = attachments();
  const byNameAndSlot = new Map<string, string>();
  for (const attachment of catalog) {
    byNameAndSlot.set(`${normalize(attachment.name)}|${attachment.slot}`, attachment.id);
  }

  const effectsPath = join(dir, 'effects.json');
  const effects = readJson<{ gameVersion: string; effects: { attachmentId: string; cost: number | null; source: SourceRef }[] }>(
    effectsPath,
  );
  const effectById = new Map(effects.effects.map((entry) => [entry.attachmentId, entry]));

  const applied: { id: string; from: number | null; to: number }[] = [];
  /** O que a print do jogo fixou e a página tentou mudar. */
  const protectedByGame: { id: string; game: number | null; page: number }[] = [];
  const unchanged: string[] = [];
  const unmatched: Card[] = [];

  for (const card of cards) {
    const slot = SLOTS[card.slot];
    if (!slot) {
      unmatched.push(card);
      continue;
    }

    const name = ALIASES[card.name] ?? card.name;
    const id = byNameAndSlot.get(`${normalize(name)}|${slot}`);
    if (!id) {
      unmatched.push(card);
      continue;
    }

    const entry = effectById.get(id);
    if (!entry) {
      unmatched.push(card);
      continue;
    }

    if (entry.cost === card.cost) {
      unchanged.push(id);
      continue;
    }

    /*
     * O que a tela do jogo confirmou não é sobrescrito.
     *
     * O site está desatualizado em pelo menos dois custos de ergonomia da
     * M16A4: ele diz 10 para o Auto e 10 para a Cobertura de Trilho, e a tela
     * do jogo mostra 25 e 5. Foi essa defasagem que colocou os valores errados
     * no dataset antigo, que também saiu daqui.
     *
     * Sem esta trava, cada importação desfazia a correção feita com print — o
     * dado mais confiável perdendo para o mais fácil de buscar.
     */
    if (entry.source?.provider === 'jogo') {
      protectedByGame.push({ id, game: entry.cost, page: card.cost });
      continue;
    }

    applied.push({ id, from: entry.cost, to: card.cost });
    entry.cost = card.cost;
    entry.source = SOURCE;
  }

  writeJson(effectsPath, effects);

  /* ------------------------------- o registro ------------------------------- */

  const bySlot: Record<string, number> = {};
  for (const card of unmatched) bySlot[card.slot] = (bySlot[card.slot] ?? 0) + 1;

  writeJson(join(DATA, 'validation', `bf6loadouts-costs-${version}.json`), {
    gameVersion: version,
    checkedAt: TODAY,
    domain: 'attachment_cost',
    source: SOURCE,
    cards: cards.length,
    applied: applied.length,
    protectedByGame,
    unchanged: unchanged.length,
    unmatched: unmatched.length,
    unmatchedBySlot: bySlot,
    note:
      'A página descreve o arsenal com peças nomeadas e o catálogo com peças genéricas por categoria, herdadas do v5. O que não casa é a medida dessa divergência, não erro de leitura.',
    changes: applied,
    missing: unmatched,
  });

  const changesPath = join(dir, 'changes.json');
  const changes = readJson<{ gameVersion: string; events: ({ id: string } & Record<string, unknown>)[] }>(
    changesPath,
  );
  const id = `evt-${TODAY}-bf6loadouts-costs`;

  changes.events = [
    ...changes.events.filter((event) => event.id !== id),
    {
      id,
      gameVersion: version,
      timestamp: TODAY,
      type: 'cost_changed',
      entityType: 'attachment',
      entityId: null,
      changes: {
        aplicados: applied.length,
        jáIguais: unchanged.length,
        protegidosPelaPrintDoJogo: protectedByGame.length,
        semCorrespondência: unmatched.length,
        porSlotSemCorrespondência: bySlot,
      },
      sources: [SOURCE],
      automation: 'auto',
      resolution: {
        status: 'resolved',
        selectedSource: 'bf6loadouts',
        reason:
          'O custo em Attachment Points é estado atual do jogo, e quem observa o estado atual é o BF6 Loadouts. As peças que não casam são as que o catálogo modela de outra forma — decisão de unificação fica para revisão humana.',
      },
    },
  ];

  writeJson(changesPath, changes);

  log('custos do BF6 Loadouts', {
    lidos: cards.length,
    aplicados: applied.length,
    'já iguais': unchanged.length,
    'protegidos pela print do jogo': protectedByGame.length,
    'sem correspondência': unmatched.length,
    porSlot: bySlot,
  });
}

main();
