#!/usr/bin/env node
/**
 * Liga as peças de ergonomia às armas que as aceitam.
 *
 *   npm run catalog:fetch-github          # primeiro, para haver instantâneo
 *   npm run catalog:import-analyzer-compat
 *
 * Existe por causa de uma lacuna que ninguém tinha atacado: treze peças de
 * ergonomia — Gatilho, Amortecedor, Retentor de Carregador, Modo Rajada e as
 * outras — estavam no catálogo como peças ativas e **não estavam ligadas a arma
 * nenhuma**. Era metade dos vinte e três acessórios sem arma que o resumo do
 * pipeline reportava a cada patch, e a matriz de compatibilidade não tinha uma
 * linha sequer no slot `ergonomics`: ela veio da planilha mestra, e a planilha
 * não cobre esse slot.
 *
 * ## Por que este importador é separado do `import-analyzer`
 *
 * Porque as duas coisas envelhecem em ritmos diferentes, e a trava de uma
 * mataria a outra.
 *
 * O `import-analyzer` traz **números** — curva de dano, velocidade, recuo — e
 * recusa dataset que descreva versão anterior à corrente, porque número velho
 * sobrescrevendo número novo é regressão. Hoje o dataset está em 1.3.3.0 e essa
 * trava está fechada.
 *
 * Compatibilidade não é isso. "A M16A4 aceita Gatilho" não é uma medição que a
 * temporada seguinte refaz com outro valor: é um fato sobre o arsenal, que a EA
 * muda acrescentando peça, não corrigindo casa decimal. Um dataset de 1.3.3.0
 * continua respondendo por ele, e a alternativa — deixar as treze peças sem arma
 * enquanto se espera o dataset alcançar o patch — é pior e não é mais honesta.
 *
 * ## O que ele não faz
 *
 * **Não sobrescreve.** Só escreve linha para peça que não tem nenhuma. Onde a
 * planilha mestra falou, ela continua valendo — este importador preenche
 * silêncio, não corrige quem já respondeu.
 *
 * **Não inventa mira.** As quatro miras sem arma — `thermal`, `therm_hyb`,
 * `var_high`, `var_low` — ficam de fora, e isso é leitura da fonte, não
 * desistência. O Analyzer enumera `sight` por arma **apenas para as sete
 * secundárias**, e nelas lista exatamente `iron` e `std_optic` — as catorze
 * linhas que a matriz já tem. Para as primárias ele não declara lista nenhuma:
 * as quatro miras são o modelo de nível óptico dele, sem arma associada.
 * Espalhá-las pelas 62 armas seria afirmar o que a fonte não disse, e ainda
 * contradizer o que ela diz das secundárias.
 *
 * As oito armas sem chave em `WEAPON_ERGO` — três escopetas, três metralhadoras,
 * `miniscout` e `svk86` — ficam sem ergonomia pelo mesmo princípio que rege o
 * `catalog:compat`: a fonte **enumera** o slot arma por arma, então a ausência
 * ali é evidência contrária, não silêncio.
 */

import { join } from 'node:path';
import type { SourceRef } from '../../src/catalog/catalog.types.ts';
import { IMPORTS, NOW, log, readJson, versionDir, writeJson } from './lib/io.ts';
import { readdirSync } from 'node:fs';
import { attachments, compatibility, currentVersion, weapons } from './lib/store.ts';

interface Snapshot {
  repository: string;
  commit: string;
  files: Record<string, unknown>;
}

/** O recorte de `data/attachments.json` que este importador lê. */
interface AnalyzerAttachments {
  /** `{ m433: { avail: ['mag_flare', 'match_trigger'] } }` — arma por arma. */
  WEAPON_ERGO?: Record<string, { avail?: string[] }>;
}

interface CompatRow {
  gameVersion: string;
  weaponId: string;
  attachmentId: string;
  slot: string;
  status: string;
  source: SourceRef;
  note: string | null;
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

export function main(): void {
  const version = currentVersion();
  const snapshot = latestSnapshot();

  const dataset = snapshot.files['data/attachments.json'] as AnalyzerAttachments | undefined;
  const porArma = dataset?.WEAPON_ERGO;

  if (!porArma) {
    throw new Error('o instantâneo não tem data/attachments.json#WEAPON_ERGO — sem ele não há o que ligar');
  }

  const path = join(versionDir(version), 'compatibility.json');
  const existentes = compatibility(version) as unknown as CompatRow[];

  /*
   * Peça que já tem linha não é tocada.
   *
   * A conta é por peça, não por par arma-peça: uma peça que a planilha mestra
   * cobriu em parte foi decidida por uma fonte melhor, e completá-la aqui
   * misturaria duas leituras num mesmo slot sem que nada dissesse qual é qual.
   */
  const jaLigadas = new Set(existentes.map((row) => row.attachmentId));

  const armasConhecidas = new Set(weapons().map((weapon) => weapon.id));
  const orfas = attachments().filter(
    (attachment) =>
      attachment.slot === 'ergonomics' &&
      attachment.status !== 'removed' &&
      !jaLigadas.has(attachment.id),
  );

  const source: SourceRef = {
    provider: snapshot.repository,
    type: 'community',
    url: `https://github.com/${snapshot.repository}`,
    dataset: 'data/attachments.json#WEAPON_ERGO',
    commit: snapshot.commit,
    /*
     * A versão fica nula de propósito.
     *
     * O dataset não declara a que patch esta enumeração se refere — o campo que
     * a declarava saiu do esquema do Analyzer —, e escrever a versão corrente
     * aqui carimbaria como leitura de hoje o que pode ser leitura de três
     * patches atrás. Ver `declaredRelease` em `import-analyzer.ts`.
     */
    version: null,
    retrievedAt: NOW,
    snapshot: `github-${snapshot.commit.slice(0, 7)}`,
  };

  const novas: CompatRow[] = [];
  const semFonte: string[] = [];
  const armasIgnoradas = new Set<string>();

  for (const peca of orfas) {
    const armas = Object.entries(porArma)
      .filter(([, ergo]) => (ergo.avail ?? []).includes(peca.id))
      .map(([weaponId]) => weaponId);

    if (!armas.length) {
      semFonte.push(peca.id);
      continue;
    }

    for (const weaponId of armas) {
      /*
       * Arma que o catálogo não conhece não entra.
       *
       * O validador recusa linha com `weaponId` desconhecido, e com razão: o
       * elenco é decidido pelo estado do jogo, não por quem publica números.
       */
      if (!armasConhecidas.has(weaponId)) {
        armasIgnoradas.add(weaponId);
        continue;
      }

      novas.push({
        gameVersion: version,
        weaponId,
        attachmentId: peca.id,
        slot: 'ergonomics',
        status: 'active',
        source,
        note: null,
      });
    }
  }

  if (!novas.length) {
    log('compatibilidade de ergonomia', {
      'peças sem arma': orfas.length,
      'nada a ligar': 'o instantâneo não enumera nenhuma delas',
    });
    return;
  }

  writeJson(path, {
    gameVersion: version,
    compatibility: [...existentes, ...novas],
  });

  log('compatibilidade de ergonomia', {
    'peças ligadas': orfas.length - semFonte.length,
    'linhas novas': novas.length,
    armas: new Set(novas.map((row) => row.weaponId)).size,
    'sem enumeração na fonte': semFonte.length ? semFonte : 'nenhuma',
    'armas fora do catálogo': armasIgnoradas.size ? [...armasIgnoradas] : 'nenhuma',
  });
}

if (process.argv[1] && process.argv[1].endsWith('import-analyzer-compat.ts')) main();
