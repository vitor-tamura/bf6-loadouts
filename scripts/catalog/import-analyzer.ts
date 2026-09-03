#!/usr/bin/env node
/**
 * Traz a balística do BF6 Weapon Analyzer para a estrutura versionada.
 *
 *   npm run catalog:fetch-github      # primeiro, para haver instantâneo
 *   npm run catalog:import-analyzer
 *
 * O v5 trouxe identidade e compatibilidade e parou aí: quem monta uma arma sabe
 * o que cabe nela, mas não quanto ela dá de dano a quarenta metros. O Analyzer
 * cobre exatamente essa lacuna — curva de dano, velocidade do projétil, recuo,
 * espalhamento e recarga, para as 62 armas —, e é de onde estes arquivos saem.
 *
 * ## Por que não é copiar e pronto
 *
 * Três razões, e as três viram código aqui.
 *
 * **A qualidade viaja junto.** O Analyzer marca as próprias curvas de dano como
 * `provisional`, todas as 62. Importar sem essa marca transformaria uma
 * estimativa honesta em número oficial — e é exatamente o que a tela precisa
 * saber para escrever "dados provisórios" em vez de fingir precisão.
 *
 * **Arrasto é opinião, não medida.** O Analyzer usa 0,0035 por metro, com 0,002
 * para munição de longo alcance. A planilha da comunidade usa 0,0025 e 0,001. A
 * EA confirma que existe arrasto e não publica o coeficiente. Não há como
 * escolher daqui: importa-se o do Analyzer, porque é o do dataset, e registra-se
 * o conflito aberto para quem puder medir.
 *
 * **Falta de dado é dado.** Três armas não têm recarga tática, seis não têm
 * recarga com pente vazio, quatro não têm tempo de mira. Esses campos ficam
 * `null` e a capacidade correspondente fica falsa — em vez de a média das
 * outras entrar no lugar.
 */

import { join } from 'node:path';
import type { SourceRef } from '../../src/catalog/catalog.types.ts';
import {
  DATA,
  IMPORTS,
  NOW,
  TODAY,
  compareVersions,
  isGameVersion,
  log,
  readJson,
  versionDir,
  writeJson,
} from './lib/io.ts';
import { readdirSync } from 'node:fs';
import { currentVersion, weapons } from './lib/store.ts';

/* ---------------------------- o formato de origem ---------------------------- */

interface AnalyzerWeapon {
  id: string;
  name: string;
  rpm: number | null;
  mag: number | null;
  tacRld: number | null;
  emptyRld: number | null;
  bulletVel: number | null;
  adsTime: number | null;
  fireMode: string | null;
  reloadSpeed: unknown;
  recoil: unknown;
  spread: unknown;
  spreadDyn: unknown;
  dmg: { r: number; d: number; source?: string }[] | null;
  damageStatus: string | null;
  damageSource: string | null;
}

/**
 * As tabelas de balanceamento, de onde saem os multiplicadores de acerto.
 *
 * O dano de cabeça não está na arma: ele vem de uma tabela por arma, com um
 * padrão por família de arma quando ela não está listada. Membro segue o mesmo
 * princípio, por classe. Copiar só o número da arma perderia os padrões — e
 * seria justamente nas armas não listadas que a conta erraria.
 */
interface BalanceTables {
  BASE_HS_MULT: Record<string, number>;
  HP_HS_HIGH: string[];
  LIMB_CLASS: Record<string, string>;
  LIMB_CLASS_MULT: Record<string, number>;
  AUTO_HS_MULT: Record<string, number>;
}

/**
 * O multiplicador de cabeça de uma arma, com munição padrão.
 *
 * Replica `resolveHitMultipliers` do Analyzer: a tabela por arma manda; sem
 * ela, arma automática usa o padrão da família; sem nenhum dos dois, 1,34. O
 * número mágico é do Analyzer, e fica escrito aqui em vez de espalhado.
 */
function hitMultipliers(weaponId: string, tables: BalanceTables) {
  const limbClass = tables.LIMB_CLASS[weaponId] ?? null;
  const headshot =
    tables.BASE_HS_MULT[weaponId] ??
    (limbClass === 'auto' ? tables.AUTO_HS_MULT.standard : undefined) ??
    1.34;

  return {
    head: headshot,
    limb: limbClass ? (tables.LIMB_CLASS_MULT[limbClass] ?? 1) : 1,
    body: 1,
    limbClass,
    /** Multiplicadores por munição, para quando o motor considerar munição. */
    byAmmo: {
      hollowPoint: tables.HP_HS_HIGH.includes(weaponId) ? 1.75 : tables.AUTO_HS_MULT.hp ?? null,
      synthetic: tables.AUTO_HS_MULT.synthetic ?? null,
    },
  };
}

interface AnalyzerBallistics {
  /** O esquema antigo: a versão do jogo, escrita direto. */
  release?: string;
  /**
   * O esquema novo, desde `fb7a214`. Traz um rótulo — `current-live` — em vez
   * da versão, e aponta em `source` o arquivo de proveniência que a declara.
   */
  baseline?: string;
  /** `data/provenance/live-baseline.json#sym-bf6-json`, quando há `baseline`. */
  source?: string;
  gravityMps2: number;
  baseDragPerMeter: number;
  weaponIds: string[];
  ammoDragPerMeter: Record<string, unknown>;
}

/** O arquivo apontado por `AnalyzerBallistics.source`. */
interface LiveBaseline {
  sources?: { id?: string; sourceVersion?: string }[];
}

interface Snapshot {
  repository: string;
  commit: string;
  committedAt: string;
  files: Record<string, unknown>;
}

/** O instantâneo mais recente baixado por `fetch-github-data`. */
function latestSnapshot(): Snapshot {
  const files = readdirSync(IMPORTS)
    .filter((name) => name.startsWith('github-') && name.endsWith('.json'))
    .sort();

  if (!files.length) {
    throw new Error('nenhum instantâneo do GitHub em data/sources/imports — rode catalog:fetch-github');
  }
  return readJson<Snapshot>(join(IMPORTS, files[files.length - 1]));
}

/**
 * A qualidade que o dataset declara de si mesmo.
 *
 * `provisional` é o que o Analyzer usa para o que ele derivou ou estimou;
 * `verified` para o que veio medido do Sym.gg. Um campo sem valor não é
 * nenhum dos dois — é `unavailable`, e a diferença importa: estimativa é um
 * número em que se pode confiar pouco, ausência é a falta de número.
 */
type Quality = 'verified' | 'provisional' | 'estimated' | 'unavailable';

function quality(declared: string | null | undefined, hasValue: boolean): Quality {
  if (!hasValue) return 'unavailable';
  if (declared === 'provisional') return 'provisional';
  if (declared === 'estimated') return 'estimated';
  return 'verified';
}

/**
 * Que versão do jogo este instantâneo descreve.
 *
 * Só existe porque a resposta mudou de lugar. Até `7907352` a versão estava em
 * `data/ballistics.json` como `release: "1.3.3.0"`. Em `fb7a214` o campo virou
 * `baseline: "current-live"` — um rótulo, não uma versão — com a versão real
 * empurrada para o arquivo que `source` aponta, que continuava dizendo
 * `1.3.3.0`.
 *
 * O estrago não foi perder a proveniência: foi a trava de dataset atrasado ler
 * `release` ausente como "sem objeção" e liberar a importação. Um dataset de
 * 1.3.3.0 sobrescreveu a balística curada da 1.4.2.0 — arrasto, velocidade de
 * saída, multiplicador de cabeça, marca de provisório —, e a 1.4.2.5 quebrou
 * seis testes no CI sem que nada aqui tivesse mudado.
 *
 * Por isso a busca é em cadeia e o fracasso dela é `null`, que agora **bloqueia**
 * a importação em vez de liberá-la. Rótulo não vira versão: `current-live` diz
 * o que o dataset gostaria de ser, e o que vale é a versão que ele declara ter
 * lido.
 */
export function declaredRelease(
  ballistics: AnalyzerBallistics,
  files: Record<string, unknown>,
): { version: string | null; how: string } {
  for (const [field, value] of [
    ['release', ballistics.release],
    ['baseline', ballistics.baseline],
  ] as const) {
    if (isGameVersion(value)) return { version: value, how: `data/ballistics.json#${field}` };
  }

  const pointer = ballistics.source;
  if (!pointer) return { version: null, how: 'o instantâneo não declara versão em lugar nenhum' };

  const [path, anchor] = pointer.split('#');
  const provenance = files[path] as LiveBaseline | undefined;
  if (!provenance?.sources?.length) {
    return { version: null, how: `${pointer} não está no instantâneo, ou não lista fontes` };
  }

  /*
   * A mais nova entre as fontes, e não a apontada pela âncora.
   *
   * A trava pergunta se o dataset alcançou o patch, e quem responde por isso é
   * a leitura mais recente que ele declara ter feito — travar numa fonte só
   * seguraria uma importação legítima no dia em que o upstream atualizasse as
   * outras primeiro.
   */
  const versions = provenance.sources
    .map((entry) => entry.sourceVersion)
    .filter((value): value is string => isGameVersion(value))
    .sort(compareVersions);

  const newest = versions[versions.length - 1];
  if (!newest) return { version: null, how: `${pointer} não declara sourceVersion utilizável` };

  return { version: newest, how: `${path}${anchor ? ` (âncora ${anchor})` : ''} → sourceVersion` };
}

function main(): void {
  const version = currentVersion();
  const snapshot = latestSnapshot();
  const short = snapshot.commit.slice(0, 7);

  const analyzerWeapons = snapshot.files['data/weapons.json'] as AnalyzerWeapon[] | undefined;
  const analyzerBallistics = snapshot.files['data/ballistics.json'] as AnalyzerBallistics | undefined;

  if (!analyzerWeapons || !analyzerBallistics) {
    throw new Error('o instantâneo não tem data/weapons.json e data/ballistics.json');
  }

  /*
   * A versão que o dataset descreve não é a versão em que ele está sendo
   * escrito, e confundir as duas é como um número de 1.3.3.0 entra no catálogo
   * carimbado como medição de 1.4.2.0.
   */
  const { version: release, how } = declaredRelease(analyzerBallistics, snapshot.files);
  const forced = process.argv.includes('--force');

  /*
   * Dataset atrasado não sobrescreve dado melhor — e dataset que não diz de
   * quando é conta como atrasado.
   *
   * A comunidade demora dias para reprocessar um patch, e o pipeline roda no
   * dia. Sem esta trava, a primeira execução depois da atualização substituiria
   * a curva de dano medida da versão anterior pela de duas versões atrás — e a
   * regressão viria assinada como importação nova.
   *
   * A versão ausente era a brecha: `release` indefinido curto-circuitava a
   * comparação e liberava exatamente a importação que a trava existia para
   * barrar. Agora a dúvida para o passo, como manda a regra do pipeline.
   */
  if (!release && !forced) {
    log('nada importado', {
      'o dataset descreve': 'não declara versão',
      'onde se procurou': how,
      'a versão corrente é': version,
      'o que fazer':
        'conferir se o esquema do Analyzer mudou de novo, ou passar --force para sobrescrever assumindo o risco',
    });
    return;
  }

  if (release && compareVersions(release, version) < 0 && !forced) {
    log('nada importado', {
      'o dataset descreve': release,
      'lido em': how,
      'a versão corrente é': version,
      'o que fazer': 'esperar o dataset alcançar o patch, ou passar --force para sobrescrever',
    });
    return;
  }

  const source: SourceRef = {
    provider: snapshot.repository,
    type: 'community',
    url: `https://github.com/${snapshot.repository}`,
    dataset: 'data/weapons.json',
    commit: snapshot.commit,
    version: release,
    retrievedAt: NOW,
    snapshot: `github-${short}`,
  };

  /*
   * Só entra arma que já existe no catálogo.
   *
   * O Analyzer é fonte de números, não de elenco: quem decide que armas existem
   * é o estado atual do jogo. Uma arma que aparecesse só aqui entraria sem id
   * estável, sem categoria e sem compatibilidade — e o catálogo passaria a ter
   * uma arma que ninguém pode montar.
   */
  const known = new Set(weapons().map((weapon) => weapon.id));
  const usable = analyzerWeapons.filter((weapon) => known.has(weapon.id));
  const ignored = analyzerWeapons.filter((weapon) => !known.has(weapon.id)).map((w) => w.id);

  const dir = versionDir(version);

  /* ------------------------------- balística ------------------------------- */

  const ballistics = usable
    .map((weapon) => ({
      weaponId: weapon.id,
      muzzleVelocity: weapon.bulletVel ?? null,
      /*
       * O arrasto é do modelo, não da arma.
       *
       * O Analyzer aplica um coeficiente base a todas e o troca por munição —
       * longo alcance e penetração em DMR e sniper. Guardar o número repetido em
       * cada arma daria a entender que ele foi medido arma a arma.
       */
      drag: { model: 'analyzer', coefficient: analyzerBallistics.baseDragPerMeter },
      gravity: analyzerBallistics.gravityMps2,
      status: quality(null, weapon.bulletVel != null),
      source,
    }))
    .sort((a, b) => a.weaponId.localeCompare(b.weaponId));

  writeJson(join(dir, 'ballistics.json'), {
    gameVersion: version,
    model: {
      name: 'bf6_projectile',
      gravityMps2: analyzerBallistics.gravityMps2,
      baseDragPerMeter: analyzerBallistics.baseDragPerMeter,
      ammoDragPerMeter: analyzerBallistics.ammoDragPerMeter,
      /*
       * O conflito fica na cara de quem for usar o modelo.
       *
       * Não adianta ele existir só em `changes.json`: quem escrever a conta de
       * queda de bala vai abrir este arquivo, e é aqui que precisa ler que o
       * coeficiente é disputado.
       */
      dragConflict: {
        status: 'open',
        analyzer: { base: 0.0035, longRange: 0.002 },
        communitySpreadsheet: { base: 0.0025, longRange: 0.001 },
        note: 'A EA confirma que existe arrasto e não publica o coeficiente. Os dois valores circulam; o catálogo usa o do Analyzer por ser o do dataset importado. Ver changes.json.',
      },
    },
    ballistics,
  });

  /* ---------------------------- modelos de dano ---------------------------- */

  const tables = snapshot.files['data/balance_tables.json'] as BalanceTables | undefined;
  if (!tables?.BASE_HS_MULT) {
    throw new Error('o instantâneo não tem data/balance_tables.json — sem ele não há zona de acerto');
  }

  const damageModels = usable
    .map((weapon) => ({
      weaponId: weapon.id,
      model: 'piecewise_linear',
      /*
       * As zonas viajam com a curva.
       *
       * Sem elas a curva responde só "quanto dano no peito", e tiros para
       * abater com acerto na cabeça — que é metade das perguntas de quem
       * compara armas — não teria como ser calculado.
       */
      zones: hitMultipliers(weapon.id, tables),
      /*
       * A curva vem em pontos, e cada ponto traz a fonte dele.
       *
       * Guardar `damageMin`/`damageMax` seria perder os degraus intermediários,
       * que é justamente onde a arma muda de comportamento. Com os pontos, o
       * dano em qualquer distância sai por interpolação — e o gráfico desenha o
       * que existe, sem inventar o meio.
       */
      curve: (weapon.dmg ?? []).map((point) => ({
        distance: point.r,
        damage: point.d,
        source: point.source ?? null,
      })),
      status: quality(weapon.damageStatus, Boolean(weapon.dmg?.length)),
      declaredSource: weapon.damageSource ?? null,
      source,
    }))
    .sort((a, b) => a.weaponId.localeCompare(b.weaponId));

  writeJson(join(dir, 'damage-models.json'), { gameVersion: version, models: damageModels });

  /* ------------------------- recuo, espalhamento, recarga ------------------------- */

  const recoil = usable
    .map((weapon) => ({
      weaponId: weapon.id,
      // O modelo do BF6 é polar: direção e variação, não X e Y.
      model: 'polar',
      recoil: weapon.recoil ?? null,
      status: quality(null, Boolean(weapon.recoil)),
      source,
    }))
    .sort((a, b) => a.weaponId.localeCompare(b.weaponId));

  const spread = usable
    .map((weapon) => ({
      weaponId: weapon.id,
      spread: weapon.spread ?? null,
      dynamic: weapon.spreadDyn ?? null,
      status: quality(null, Boolean(weapon.spread)),
      source,
    }))
    .sort((a, b) => a.weaponId.localeCompare(b.weaponId));

  const reload = usable
    .map((weapon) => ({
      weaponId: weapon.id,
      tactical: weapon.tacRld ?? null,
      empty: weapon.emptyRld ?? null,
      speed: weapon.reloadSpeed ?? null,
      status: quality(null, weapon.tacRld != null && weapon.emptyRld != null),
      source,
    }))
    .sort((a, b) => a.weaponId.localeCompare(b.weaponId));

  writeJson(join(dir, 'recoil.json'), { gameVersion: version, recoil });
  writeJson(join(dir, 'spread.json'), { gameVersion: version, spread });
  writeJson(join(dir, 'reload.json'), { gameVersion: version, reload });

  /* ------------------------------ estatísticas ------------------------------ */

  /*
   * `stats.json` ganha os campos que faltavam, e os que já existiam são
   * conferidos em vez de sobrescritos.
   *
   * O v5 também saiu deste repositório, então cadência e carregador deveriam
   * bater. Quando não batem, o certo não é o número novo vencer por ser mais
   * recente — é a divergência aparecer.
   */
  const existing = readJson<{ stats: { weaponId: string; stats: Record<string, number | null> }[] }>(
    join(dir, 'stats.json'),
  ).stats;

  const divergences: { weaponId: string; field: string; catalog: unknown; analyzer: unknown }[] = [];
  const byId = new Map(usable.map((weapon) => [weapon.id, weapon]));

  const stats = existing
    .map((entry) => {
      const weapon = byId.get(entry.weaponId);
      if (!weapon) return entry;

      for (const [field, value] of [
        ['rpm', weapon.rpm],
        ['magazineCapacity', weapon.mag],
      ] as const) {
        const current = entry.stats[field];
        if (current != null && value != null && Math.abs(current - value) > 0.001) {
          divergences.push({ weaponId: entry.weaponId, field, catalog: current, analyzer: value });
        }
      }

      return {
        ...entry,
        stats: {
          ...entry.stats,
          rpm: entry.stats.rpm ?? weapon.rpm ?? null,
          magazineCapacity: entry.stats.magazineCapacity ?? weapon.mag ?? null,
          adsMs: weapon.adsTime ?? null,
          reload: weapon.tacRld ?? null,
          emptyReload: weapon.emptyRld ?? null,
          velocity: weapon.bulletVel ?? null,
        },
      };
    })
    .sort((a, b) => a.weaponId.localeCompare(b.weaponId));

  writeJson(join(dir, 'stats.json'), { gameVersion: version, stats });

  /*
   * A conferência entre as duas importações vira registro.
   *
   * O v5 e o Analyzer saíram do mesmo repositório, e cadência e carregador
   * bateram em todas as 62 armas. Isso não é um não-evento: é a prova de que as
   * duas leituras descrevem o mesmo jogo, e é o que dá confiança para o
   * workflow automático reimportar sem revisão campo a campo. Um dia em que
   * elas divergirem, a comparação com este arquivo mostra o que mudou.
   */
  writeJson(join(DATA, 'validation', `analyzer-vs-v5-${version}.json`), {
    gameVersion: version,
    checkedAt: TODAY,
    domain: 'weapon_stats',
    fields: ['rpm', 'magazineCapacity'],
    weapons: usable.length,
    status: divergences.length ? 'differences_found' : 'verified_no_difference',
    differences: divergences,
    sources: [
      { provider: snapshot.repository, commit: snapshot.commit, dataset: 'data/weapons.json' },
      { provider: 'BF6_Catalogo_ESCALAVEL_v5.json', dataset: 'data/sources/imports' },
    ],
  });

  /* --------------------------------- eventos --------------------------------- */

  const changesPath = join(dir, 'changes.json');
  const changes = readJson<{ gameVersion: string; events: ({ id: string } & Record<string, unknown>)[] }>(
    changesPath,
  );

  /*
   * Reimportar substitui, não empilha.
   *
   * Este script é idempotente por natureza — roda de novo quando o dataset da
   * comunidade muda — e a lista de eventos cresce por acréscimo. Sem tirar os
   * anteriores, quatro execuções deixaram quatro cópias do mesmo conflito de
   * arrasto, com o mesmo id. Um id repetido faz "três conflitos abertos" virar
   * uma contagem que não corresponde a nada.
   */
  const rewritten = new Set([
    `evt-${TODAY}-analyzer-import`,
    `evt-${TODAY}-conflict-drag`,
    `evt-${TODAY}-conflict-stats`,
  ]);

  changes.events = [
    ...changes.events.filter((event) => !rewritten.has(event.id)),
    {
      id: `evt-${TODAY}-analyzer-import`,
      gameVersion: version,
      timestamp: TODAY,
      type: 'initial_import',
      entityType: 'catalog',
      entityId: null,
      changes: {
        armas: usable.length,
        curvasDeDano: damageModels.filter((model) => model.curve.length).length,
        provisionais: damageModels.filter((model) => model.status === 'provisional').length,
        semRecargaTática: reload.filter((entry) => entry.tactical == null).map((e) => e.weaponId),
        semRecargaVazia: reload.filter((entry) => entry.empty == null).map((e) => e.weaponId),
        semTempoDeMira: stats.filter((entry) => entry.stats.adsMs == null).map((e) => e.weaponId),
        ignoradas: ignored,
      },
      sources: [source],
      automation: 'auto',
      resolution: null,
    },
    {
      id: `evt-${TODAY}-conflict-drag`,
      gameVersion: version,
      timestamp: TODAY,
      type: 'source_conflict',
      entityType: 'catalog',
      entityId: null,
      changes: {
        campo: 'coeficiente de arrasto',
        analyzer: { base: 0.0035, longRange: 0.002, fonte: `${snapshot.repository}@${short}` },
        comunidade: {
          base: 0.0025,
          longRange: 0.001,
          fonte: 'planilha interativa de armas (r/Battlefield), comentário do autor',
        },
        ea: 'Confirma que existe arrasto e que ele pesa mais a longa distância; não publica o coeficiente.',
      },
      sources: [
        source,
        {
          provider: 'r/Battlefield — planilha da comunidade',
          type: 'community',
          url: 'https://www.reddit.com/r/Battlefield/comments/1pjw7ha/',
          version,
          retrievedAt: null,
        },
      ],
      automation: 'review',
      resolution: {
        status: 'open',
        reason:
          'Dois coeficientes circulam e nenhuma fonte oficial arbitra. O catálogo usa o do Analyzer por ser o do dataset importado; a queda de bala calculada com ele é aproximada, e a tela deve dizer isso.',
      },
    },
    ...(divergences.length
      ? [
          {
            id: `evt-${TODAY}-conflict-stats`,
            gameVersion: version,
            timestamp: TODAY,
            type: 'source_conflict',
            entityType: 'weapon',
            entityId: null,
            changes: { divergences },
            sources: [source],
            automation: 'review',
            resolution: {
              status: 'open',
              reason:
                'O v5 e o Analyzer saíram do mesmo repositório e mesmo assim discordam nestes campos. O valor antigo foi mantido; confirmar qual é o do jogo.',
            },
          },
        ]
      : []),
  ];

  writeJson(changesPath, changes);

  log('importação do Analyzer', {
    commit: short,
    armas: usable.length,
    'curvas de dano': damageModels.filter((model) => model.curve.length).length,
    provisionais: damageModels.filter((model) => model.status === 'provisional').length,
    'divergências de stats': divergences.length,
    ignoradas: ignored.length,
  });

  if (ignored.length) log('armas fora do catálogo, ignoradas', ignored);
}

/*
 * Só executa quando é ele que foi chamado.
 *
 * Era a única exceção da pasta: um `main()` solto, que rodava a importação
 * inteira — e escrevia em `data/versions/` — no ato de alguém importar este
 * arquivo. Enquanto ninguém o importava, não incomodava; o teste de
 * `declaredRelease` passou a importar, e a suíte reescreveria o catálogo no meio
 * da execução se a trava do dataset atrasado não estivesse fechada.
 */
if (process.argv[1] && process.argv[1].endsWith('import-analyzer.ts')) main();
