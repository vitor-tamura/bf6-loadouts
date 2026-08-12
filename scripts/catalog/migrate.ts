#!/usr/bin/env node
/**
 * A importação inicial: do catálogo v5 para a estrutura versionada.
 *
 *   node --experimental-strip-types scripts/catalog/migrate.ts
 *
 * O `BF6_Catalogo_ESCALAVEL_v5.json` é o estado inicial do catálogo, e este
 * script o desdobra nas camadas que o pipeline usa daqui para a frente:
 * identidade em `data/entities`, estado do jogo em `data/versions/1.3.3.0`,
 * registro das fontes em `data/sources`.
 *
 * Ele é reprodutível de propósito. O import bruto foi copiado para
 * `data/sources/imports/`, então rodar isto de novo — hoje ou daqui a um ano,
 * aqui ou no CI — devolve byte a byte os mesmos arquivos. Um migrador que lê da
 * pasta de downloads de alguém não é reprodutível, é uma lembrança.
 *
 * ## O que este script não faz
 *
 * Não completa lacuna. O v5 não traz nenhuma linha de compatibilidade para
 * `ammo` e `ergonomics`, e existe a tentação óbvia de preencher: são peças
 * globais, "toda arma deve aceitar munição". O catálogo não faz isso. A EA
 * confirma que cada arma tem o próprio conjunto de acessórios, então relação
 * sem fonte é relação que não existe — as 36 peças órfãs ficam registradas como
 * pendência no evento de importação, para uma fonte resolvê-las depois.
 *
 * Também não converte os efeitos. O dataset da comunidade descreve as peças em
 * degraus (`adsTimeTierMod: 1`), e traduzir isso para "12% mais lento" exigiria
 * uma escala que nenhuma fonte publica. Os efeitos entram como estão, com o
 * nome das chaves da origem.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AttachmentEffects,
  AttachmentEntity,
  CategoryEntity,
  ChangeEvent,
  CompatibilityRow,
  SlotEntity,
  SourceRef,
  VersionMetadata,
  VersionedEntityRef,
  WeaponEntity,
  WeaponStats,
} from '../../src/catalog/catalog.types.ts';
import {
  ENTITIES,
  IMPORTS,
  SOURCES,
  TODAY,
  log,
  versionDir,
  writeJson,
  readJson,
} from './lib/io.ts';

/* ------------------------------ o arquivo v5 ------------------------------ */

interface V5Source {
  provider: string;
  dataset?: string;
  type?: string;
  snapshot?: string;
  repository?: string;
}

interface V5Weapon {
  id: string;
  name: string;
  category: string;
  caliber: string | null;
  status: string;
  introducedIn: string;
  removedIn: string | null;
  aliases: string[];
  source: V5Source;
  current: Record<string, number | null>;
}

interface V5Attachment {
  id: string;
  sourceId: string;
  name: string;
  slot: string;
  cost: number | null;
  status: string;
  introducedIn: string;
  removedIn: string | null;
  aliases: string[];
  sourceType: 'global' | 'weaponSpecific';
  sourceGroup: string | null;
  weaponScope: string | null;
  properties: Record<string, unknown>;
  source: V5Source;
}

interface V5Compatibility {
  gameVersion: string;
  weaponId: string;
  slot: string;
  attachmentId: string;
  status: string;
  source: V5Source;
}

interface V5Catalog {
  schemaVersion: number;
  catalogId: string;
  generatedAt: string;
  current: { gameVersion: string; snapshotId: string };
  versions: { id: string; label: string; releasedAt: string | null; importedAt: string }[];
  weapons: V5Weapon[];
  attachments: V5Attachment[];
  compatibility: V5Compatibility[];
}

const IMPORT_FILE = join(IMPORTS, 'bf6-catalogo-escalavel-v5.json');

/* --------------------------------- fontes --------------------------------- */

/**
 * As duas procedências que o v5 carrega.
 *
 * O arquivo mistura duas leituras: a matriz do repositório da comunidade e a
 * confirmação do estado atual pelo BF6 Loadouts. Cada linha diz qual das duas a
 * sustenta, e é isso que permite, mais tarde, decidir um conflito sem apelar
 * para o palpite de quem estiver revisando.
 */
const GITHUB: SourceRef = {
  provider: 'raymdl/BF6-Weapon-Analyzer',
  type: 'community',
  url: 'https://github.com/raymdl/BF6-Weapon-Analyzer',
  dataset: 'main/data',
  commit: null,
  version: null,
  retrievedAt: null,
  snapshot: null,
};

const LOADOUTS: SourceRef = {
  provider: 'bf6loadouts',
  type: 'current_state',
  url: 'https://bf6loadouts.com',
  dataset: 'weapon compatibility',
  commit: null,
  version: null,
  retrievedAt: null,
  snapshot: null,
};

/** A fonte de uma linha do v5, traduzida para o vocabulário do catálogo. */
function sourceOf(raw: V5Source, version: string, snapshot: string): SourceRef {
  const base = raw.provider === 'bf6loadouts' ? LOADOUTS : GITHUB;
  return { ...base, dataset: raw.dataset ?? base.dataset, version, snapshot };
}

/* ------------------------------ normalizações ------------------------------ */

/**
 * A categoria vira id.
 *
 * O v5 grava `Assault Rifle` dentro da arma, que é o rótulo de tela e não um
 * identificador — ele muda de idioma e tem espaço no meio. Aqui ele vira
 * `assault_rifle`, e o texto original fica em `categories.json` como nome e
 * apelido, para a tradução de volta continuar existindo.
 */
const categoryId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** Os nomes de slot do v5 já são identificadores; ficam como estão. */
const SLOT_NAMES: Record<string, string> = {
  sight: 'Sight',
  muzzle: 'Muzzle',
  barrel: 'Barrel',
  magazine: 'Magazine',
  ammo: 'Ammo',
  underbarrel: 'Underbarrel',
  ergonomics: 'Ergonomics',
  laser: 'Laser',
  light: 'Light',
};

/** O v5 usa os mesmos três estados do catálogo; qualquer outro é erro. */
function entityStatus(value: string): 'active' | 'removed' | 'deprecated' {
  if (value === 'active' || value === 'removed' || value === 'deprecated') return value;
  throw new Error(`status desconhecido no import: ${value}`);
}

/**
 * As chaves que a fonte marca como suposição dela.
 *
 * O v5 anota em `assumedFields` o que ele mesmo chutou — a lanterna tem um
 * `hipSpreadDecayBoost` que veio de placeholder, não de medição. Isso não pode
 * chegar ao site como número apurado, então a marca viaja junto com o efeito.
 */
function assumedFields(properties: Record<string, unknown>): string[] {
  const assumed = properties.assumedFields;
  if (assumed && typeof assumed === 'object') return Object.keys(assumed as object);
  return properties.assumed === true ? ['*'] : [];
}

/* -------------------------------- migração -------------------------------- */

function migrate(): void {
  if (!existsSync(IMPORT_FILE)) {
    throw new Error(
      `import não encontrado em ${IMPORT_FILE} — copie BF6_Catalogo_ESCALAVEL_v5.json para data/sources/imports/`,
    );
  }

  const v5 = readJson<V5Catalog>(IMPORT_FILE);
  const version = v5.current.gameVersion;
  const snapshot = v5.current.snapshotId;
  const dir = versionDir(version);

  log(`importando ${v5.catalogId} → versão ${version}`);

  /* ------------------------------- entidades ------------------------------- */

  const categories: CategoryEntity[] = [...new Set(v5.weapons.map((w) => w.category))]
    .sort()
    .map((name) => ({ id: categoryId(name), name, aliases: [name] }));

  const slots: SlotEntity[] = [...new Set(v5.attachments.map((a) => a.slot))].sort().map((id) => ({
    id,
    name: SLOT_NAMES[id] ?? id,
    aliases: [],
    // Ordem de exibição é decisão de tela, e nenhuma fonte a publica. Fica em
    // aberto em vez de nascer de um palpite deste script.
    order: null,
  }));

  const weapons: WeaponEntity[] = v5.weapons
    .map((weapon) => ({
      id: weapon.id,
      name: weapon.name,
      category: categoryId(weapon.category),
      caliber: weapon.caliber ?? null,
      status: entityStatus(weapon.status),
      introducedIn: weapon.introducedIn,
      removedIn: weapon.removedIn,
      aliases: weapon.aliases,
      source: sourceOf(weapon.source, version, snapshot),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const attachments: AttachmentEntity[] = v5.attachments
    .map((attachment) => ({
      id: attachment.id,
      sourceId: attachment.sourceId,
      name: attachment.name,
      slot: attachment.slot,
      scope: attachment.sourceType === 'weaponSpecific' ? ('weapon' as const) : ('global' as const),
      group: attachment.sourceGroup,
      weaponScope: attachment.weaponScope,
      status: entityStatus(attachment.status),
      introducedIn: attachment.introducedIn,
      removedIn: attachment.removedIn,
      aliases: attachment.aliases,
      source: sourceOf(attachment.source, version, snapshot),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  writeJson(join(ENTITIES, 'categories.json'), { schemaVersion: 1, categories });
  writeJson(join(ENTITIES, 'slots.json'), { schemaVersion: 1, slots });
  writeJson(join(ENTITIES, 'weapons.json'), { schemaVersion: 1, weapons });
  writeJson(join(ENTITIES, 'attachments.json'), { schemaVersion: 1, attachments });

  /* ---------------------------- estado da versão ---------------------------- */

  const weaponRefs: VersionedEntityRef[] = weapons.map((weapon) => ({
    id: weapon.id,
    status: weapon.status,
    name: weapon.name,
  }));

  const attachmentRefs: VersionedEntityRef[] = attachments.map((attachment) => ({
    id: attachment.id,
    status: attachment.status,
    name: attachment.name,
  }));

  /*
   * Quando a matriz e a peça discordam sobre o slot.
   *
   * Acontece no import inicial: as cinco empunhaduras da vz61 — todas do grupo
   * `GRIPS`, todas registradas como `underbarrel` na própria peça — aparecem na
   * matriz de compatibilidade dentro do slot `laser`, e a arma fica sem nenhuma
   * linha de empunhadura. É erro da fonte, e o conserto parece óbvio.
   *
   * O pipeline não o faz. Corrigir aqui seria decidir, em nome de quem revisa,
   * qual dos dois lados da fonte está certo — e a próxima divergência pode ser
   * uma peça que mudou mesmo de slot num patch. A relação entra como pendência,
   * fica fora dos índices e do artefato público, e o evento diz exatamente o
   * que foi encontrado para alguém resolver com o jogo aberto.
   */
  const slotOfAttachment = new Map(attachments.map((a) => [a.id, a.slot]));
  const slotMismatch = v5.compatibility.filter((row) => {
    const declared = slotOfAttachment.get(row.attachmentId);
    return declared !== undefined && declared !== row.slot;
  });

  const mismatched = new Set(slotMismatch.map((row) => `${row.weaponId}|${row.attachmentId}`));

  const compatibility: CompatibilityRow[] = v5.compatibility
    .map((row) => {
      const pending = mismatched.has(`${row.weaponId}|${row.attachmentId}`);
      return {
        gameVersion: version,
        weaponId: row.weaponId,
        attachmentId: row.attachmentId,
        // O slot que a peça declara é o que fica registrado; o da matriz vai
        // para a nota, senão a divergência some ao ser anotada.
        slot: pending ? (slotOfAttachment.get(row.attachmentId) as string) : row.slot,
        status: pending
          ? ('needs_review' as const)
          : row.status === 'active'
            ? ('active' as const)
            : ('removed' as const),
        source: sourceOf(row.source, version, snapshot),
        note: pending
          ? `A matriz da fonte registra esta relação no slot "${row.slot}", e a peça declara "${slotOfAttachment.get(row.attachmentId)}". Confirmar no jogo antes de ativar.`
          : null,
      };
    })
    .sort(
      (a, b) =>
        a.weaponId.localeCompare(b.weaponId) ||
        a.slot.localeCompare(b.slot) ||
        a.attachmentId.localeCompare(b.attachmentId),
    );

  const stats: WeaponStats[] = v5.weapons
    .map((weapon) => ({
      weaponId: weapon.id,
      gameVersion: version,
      stats: weapon.current,
      source: sourceOf(weapon.source, version, snapshot),
    }))
    .sort((a, b) => a.weaponId.localeCompare(b.weaponId));

  const effects: AttachmentEffects[] = v5.attachments
    .map((attachment) => {
      // A marca de suposição sai dos efeitos e vira campo próprio: ela é
      // metadado sobre o dado, não um efeito que a peça tenha no jogo.
      const rest = { ...attachment.properties };
      delete rest.assumedFields;
      const assumed = assumedFields(attachment.properties);
      return {
        attachmentId: attachment.id,
        gameVersion: version,
        effects: rest,
        cost: attachment.cost,
        source: sourceOf(attachment.source, version, snapshot),
        ...(assumed.length ? { assumed } : {}),
      };
    })
    .sort((a, b) => a.attachmentId.localeCompare(b.attachmentId));

  /* ------------------------------- pendências ------------------------------- */

  /*
   * As peças que nenhuma linha de compatibilidade menciona.
   *
   * São 36 no import inicial: as 15 munições e as 13 ergonomias, que o v5 lista
   * como peças mas nunca liga a arma nenhuma, mais oito miras e empunhaduras.
   * Elas existem no catálogo e não aparecem em arma alguma — o que é a resposta
   * honesta enquanto nenhuma fonte disser em quais elas entram.
   */
  const related = new Set(compatibility.map((row) => row.attachmentId));
  const orphans = attachments.filter((a) => !related.has(a.id)).map((a) => a.id);

  const bySlot: Record<string, number> = {};
  for (const id of orphans) {
    const slot = attachments.find((a) => a.id === id)!.slot;
    bySlot[slot] = (bySlot[slot] ?? 0) + 1;
  }

  const events: ChangeEvent[] = [
    {
      id: `evt-${TODAY}-initial-import`,
      gameVersion: version,
      timestamp: TODAY,
      type: 'initial_import',
      entityType: 'catalog',
      entityId: null,
      changes: {
        weapons: weapons.length,
        attachments: attachments.length,
        compatibility: compatibility.length,
        stats: stats.length,
        effects: effects.length,
        attachmentsWithoutCompatibility: { total: orphans.length, bySlot, ids: orphans },
      },
      sources: [
        { ...GITHUB, version, snapshot },
        { ...LOADOUTS, version, snapshot },
      ],
      automation: 'auto',
      resolution: null,
    },
  ];

  if (slotMismatch.length) {
    events.push({
      id: `evt-${TODAY}-conflict-slot-mismatch`,
      gameVersion: version,
      timestamp: TODAY,
      type: 'source_conflict',
      entityType: 'compatibility',
      entityId: null,
      changes: {
        rows: slotMismatch.map((row) => ({
          weaponId: row.weaponId,
          attachmentId: row.attachmentId,
          slotNaMatriz: row.slot,
          slotNaPeça: slotOfAttachment.get(row.attachmentId) ?? null,
        })),
      },
      sources: [{ ...GITHUB, version, snapshot }],
      automation: 'review',
      resolution: {
        status: 'open',
        reason:
          'A mesma fonte se contradiz: a peça declara um slot e a matriz a lista em outro. Nenhuma segunda fonte foi consultada ainda; as relações ficam como needs_review até alguém conferir no jogo.',
      },
    });
  }

  /*
   * O conflito do 50 MW Violet, preservado.
   *
   * O laser é o caso conhecido em que as fontes discordam: a matriz do
   * repositório da comunidade o liga a dezenas de armas, e o BF6 Loadouts o
   * mostra em quatro. O v5 já chegou resolvido a favor do estado atual — as
   * quatro —, e é isso que o catálogo serve.
   *
   * O que não pode acontecer é a discordância sumir junto com a resolução: sem
   * este evento, daqui a três patches ninguém saberá que a lista curta foi uma
   * decisão e não um esquecimento. A lista longa do repositório não veio dentro
   * do v5, então ela fica marcada para `fetch-github-data` recuperá-la — o
   * conflito registra o que se sabe, sem inventar a matriz que falta.
   */
  const violet = compatibility.filter((row) => row.attachmentId === '50mw_violet');
  if (violet.length) {
    events.push({
      id: `evt-${TODAY}-conflict-50mw-violet`,
      gameVersion: version,
      timestamp: TODAY,
      type: 'source_conflict_resolved',
      entityType: 'attachment',
      entityId: '50mw_violet',
      changes: {
        selected: violet.map((row) => row.weaponId).sort(),
        github: {
          status: 'not_captured',
          note: 'A matriz do repositório liga o laser a um conjunto maior de armas. O import v5 já veio resolvido e não preservou a lista; recuperar com fetch-github-data antes de reabrir o conflito.',
        },
      },
      sources: [
        { ...LOADOUTS, version, snapshot },
        { ...GITHUB, version, snapshot },
      ],
      automation: 'auto',
      resolution: {
        status: 'resolved',
        selectedSource: 'bf6loadouts',
        reason:
          'Compatibilidade atual é decidida pelo estado do jogo, e quem observa o estado do jogo é o BF6 Loadouts. A matriz da comunidade vale como histórico, não como confirmação do que existe hoje.',
      },
    });
  }

  const metadata: VersionMetadata = {
    version,
    label: v5.versions[0]?.label ?? `Importado de ${v5.catalogId}`,
    releasedAt: v5.versions[0]?.releasedAt ?? null,
    importedAt: v5.versions[0]?.importedAt ?? TODAY,
    previousVersion: null,
    status: 'current',
    sources: [
      { ...GITHUB, version, snapshot },
      { ...LOADOUTS, version, snapshot },
    ],
    counts: {
      weapons: weapons.length,
      attachments: attachments.length,
      compatibility: compatibility.length,
      stats: stats.length,
      effects: effects.length,
    },
  };

  writeJson(join(dir, 'metadata.json'), metadata);
  writeJson(join(dir, 'weapons.json'), { gameVersion: version, weapons: weaponRefs });
  writeJson(join(dir, 'attachments.json'), { gameVersion: version, attachments: attachmentRefs });
  writeJson(join(dir, 'compatibility.json'), { gameVersion: version, compatibility });
  writeJson(join(dir, 'stats.json'), { gameVersion: version, stats });
  writeJson(join(dir, 'effects.json'), { gameVersion: version, effects });

  /*
   * A balística nasce vazia, e o arquivo existe assim mesmo.
   *
   * Curva de dano, queda por distância, velocidade do projétil, arrasto, recuo
   * e espalhamento não estão no v5 — e são justamente o que sustenta TTK,
   * gráficos e comparação. O arquivo vazio não é desleixo: ele fixa onde esses
   * dados vão entrar, faz o `coverage` medir a lacuna em vez de adivinhá-la, e
   * impede que alguém, sem lugar óbvio para pô-los, acabe enfiando velocidade
   * de projétil dentro de `stats.json`.
   */
  writeJson(join(dir, 'ballistics.json'), {
    gameVersion: version,
    note: 'Nenhuma fonte publicou balística até aqui. Ver docs/frontend-migration.md, fase 2.',
    ballistics: [],
  });
  writeJson(join(dir, 'changes.json'), { gameVersion: version, events });

  /* ------------------------------ registro das fontes ------------------------------ */

  writeJson(join(SOURCES, 'github.json'), {
    provider: GITHUB.provider,
    url: GITHUB.url,
    type: GITHUB.type,
    snapshots: [
      {
        snapshot,
        version,
        dataset: 'main/data',
        commit: null,
        retrievedAt: metadata.importedAt,
        via: 'BF6_Catalogo_ESCALAVEL_v5.json',
        note: 'Importação inicial. O commit de origem não veio no arquivo v5; execuções futuras devem registrar o SHA.',
      },
    ],
  });

  writeJson(join(SOURCES, 'bf6loadouts.json'), {
    provider: LOADOUTS.provider,
    url: LOADOUTS.url,
    type: LOADOUTS.type,
    snapshots: [
      {
        snapshot,
        version,
        retrievedAt: metadata.importedAt,
        via: 'BF6_Catalogo_ESCALAVEL_v5.json',
        note: 'Confirmação do estado atual embutida no import inicial.',
      },
    ],
  });

  writeJson(join(SOURCES, 'ea.json'), {
    provider: 'EA',
    url: 'https://www.ea.com/games/battlefield/battlefield-6/news',
    type: 'official',
    // Nenhum patch note foi processado ainda: a lista nasce vazia, e é
    // `discover-updates` quem a preenche.
    snapshots: [],
  });

  log('entidades', {
    categorias: categories.length,
    slots: slots.length,
    armas: weapons.length,
    acessórios: attachments.length,
  });
  log('versão', {
    versão: version,
    compatibilidade: compatibility.length,
    stats: stats.length,
    efeitos: effects.length,
  });
  log('pendências', { acessóriosSemCompatibilidade: orphans.length, porSlot: bySlot });
  log('pronto — rode catalog:indexes e catalog:build');
}

migrate();
