#!/usr/bin/env node
/**
 * Sincroniza o dataset com o catálogo público, sem atropelar a curadoria.
 *
 *   node scripts/sincronizar.mjs              relatório, não escreve nada
 *   node scripts/sincronizar.mjs --aplicar    grava o que dá para gravar
 *   node scripts/sincronizar.mjs --registrar  adota o estado atual como base
 *
 * ## Por que não é só "baixar e sobrescrever"
 *
 * Parte dos números do dataset foi corrigida à mão — escadas de dano medidas no
 * jogo, valores que a fonte errou, traduções. Sobrescrever tudo a cada
 * atualização desfaria esse trabalho em silêncio, e ninguém perceberia até
 * alguém reclamar que o TTK está errado.
 *
 * A saída é comparar **três** valores por campo:
 *
 * | fonte mudou? | local mudou? | o que acontece |
 * | --- | --- | --- |
 * | não | — | nada a fazer |
 * | sim | não | atualiza: ninguém tinha opinião sobre esse campo |
 * | sim | sim | conflito: relata e **não toca** |
 * | — | sim | curadoria local, preservada |
 *
 * O "local mudou?" sai da comparação com `sync-snapshot.json`, que guarda o que
 * a fonte dizia na última sincronização. Sem ele não há como distinguir um
 * número curado de um número que simplesmente ainda não foi atualizado — por
 * isso a primeira execução só registra a base, sem escrever no dataset.
 *
 * Item novo entra inteiro, marcado para tradução. Item que sumiu da fonte é
 * relatado e mantido: arma removida do jogo é rara, e apagá-la quebraria todo
 * link compartilhado que a use.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogoExterno } from './sync/fonte.mjs';
import { DataFile, escada, listaDeIds, numero } from './sync/arquivo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(RAIZ, 'scripts', 'sync-snapshot.json');
const ARQUIVO_ARMAS = join(RAIZ, 'src', 'data', 'weapons.ts');
const ARQUIVO_ACESSORIOS = join(RAIZ, 'src', 'data', 'attachments.ts');

/** Campos de arma que a fonte governa, com o formato de cada um. */
const CAMPOS_DE_ARMA = [
  { campo: 'rpm', formato: (v) => numero(v, 0) },
  { campo: 'velocity', formato: (v) => numero(v, 0) },
  { campo: 'magazine', formato: (v) => numero(v, 0) },
  { campo: 'reload', formato: (v) => numero(v, 2) },
  { campo: 'emptyReload', formato: (v) => numero(v, 2) },
  { campo: 'adsMs', formato: (v) => numero(v, 0) },
  { campo: 'accuracy', formato: (v) => numero(v, 0) },
  { campo: 'control', formato: (v) => numero(v, 0) },
  { campo: 'mobility', formato: (v) => numero(v, 0) },
  { campo: 'hipfire', formato: (v) => numero(v, 0) },
  // A escada é lida como objeto e escrita como par; comparar exige um formato só.
  {
    campo: 'damage',
    formato: escada,
    comparar: (v) =>
      JSON.stringify(
        (v ?? []).map((d) => (Array.isArray(d) ? d : [d.damage, d.distance]).map((n) => Number(n.toFixed(2)))),
      ),
  },
];

const CAMPOS_DE_ACESSORIO = [
  { campo: 'cost', formato: (v) => numero(v, 0) },
];

const cores = {
  titulo: (t) => `\x1b[1m${t}\x1b[0m`,
  novo: (t) => `\x1b[32m${t}\x1b[0m`,
  muda: (t) => `\x1b[36m${t}\x1b[0m`,
  conflito: (t) => `\x1b[33m${t}\x1b[0m`,
  some: (t) => `\x1b[31m${t}\x1b[0m`,
};

function comoTexto(valor, comparar) {
  return comparar ? comparar(valor) : String(valor);
}

/**
 * Classifica um campo. `base` é o que a fonte dizia na última sincronização.
 */
function decidir(local, fonte, base, comparar) {
  if (fonte == null) return { acao: 'ignorar' };
  const f = comoTexto(fonte, comparar);
  const l = comoTexto(local, comparar);
  const b = base === undefined ? null : comoTexto(base, comparar);

  if (b !== null && f === b) return { acao: 'ignorar' };
  if (f === l) return { acao: 'ignorar' };
  if (b === null) return { acao: 'conflito', motivo: 'sem base' };
  if (l === b) return { acao: 'atualizar' };
  return { acao: 'conflito', motivo: 'curado localmente' };
}

/** Bloco de arma nova, com o que a fonte sabe e o resto marcado para revisão. */
function blocoDeArma(arma) {
  return `  {
    id: '${arma.id}',
    name: '${arma.name.replace(/'/g, "\\'")}',
    category: '${arma.category ?? 'ar'}',
    archetype: 'ar-otan',
    summary: 'TODO: descrever em português.',
    damage: ${arma.damage ? escada(arma.damage) : '[[25, 0]]'},
    rpm: ${numero(arma.rpm ?? 600, 0)},
    velocity: ${numero(arma.velocity ?? 700, 0)},
    drag: 1.0,
    headshot: 1.5,
    magazine: ${numero(arma.magazine ?? 30, 0)},
    reload: ${numero(arma.reload ?? 2.5, 2)},
    emptyReload: ${numero(arma.emptyReload ?? 3.2, 2)},
    adsMs: ${numero(arma.adsMs ?? 300, 0)},
    swapMs: 600,
    accuracy: ${numero(arma.accuracy ?? 50, 0)},
    control: ${numero(arma.control ?? 50, 0)},
    mobility: ${numero(arma.mobility ?? 50, 0)},
    hipfire: ${numero(arma.hipfire ?? 40, 0)},
    verticalRecoil: 0.7,
    horizontalRecoil: 0.4,
    fireModes: ['automatico'],
    provenance: 'jogo',
  },
`;
}

function blocoDeAcessorio(acessorio) {
  return `  {
    id: '${acessorio.id}',
    name: 'TODO: traduzir',
    originalName: '${acessorio.originalName.replace(/'/g, "\\'")}',
    slot: '${acessorio.slot}',
    cost: ${numero(acessorio.cost ?? 0, 0)},
    description: 'TODO: descrever em português.',
    mods: {},
    compat: { weapons: ${listaDeIds(acessorio.weapons)} },
    provenance: 'jogo',
  },
`;
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const registrar = process.argv.includes('--registrar');

  const [{ WEAPONS }, { ATTACHMENTS }] = await Promise.all([
    import('../src/data/weapons.ts'),
    import('../src/data/attachments.ts'),
  ]);
  const externo = await catalogoExterno();

  const base = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null;
  if (!base) {
    console.log(
      'Sem base de comparação: esta execução apenas registra o que a fonte diz hoje.\n' +
        'A partir da próxima, o script consegue distinguir número curado de número desatualizado.\n',
    );
  }

  const armasLocais = new Map(WEAPONS.map((w) => [w.id, w]));
  const acessoriosLocais = new Map(ATTACHMENTS.map((a) => [a.id, a]));
  /*
   * O mesmo acessório pode viver em outro slot aqui — os lasers, por exemplo,
   * que a fonte trata como acoplamento e o jogo mostra na lateral. O nome
   * original é o que identifica a peça de verdade, então ele serve de segunda
   * chave: sem isso, cada peça reclassificada voltaria como "novidade".
   */
  const porNomeOriginal = new Map(ATTACHMENTS.map((a) => [a.originalName.toLowerCase(), a]));

  const relatorio = { atualizar: [], conflito: [], novo: [], sumiu: [] };

  // ------------------------------------------------------------------ armas
  const arquivoArmas = new DataFile(ARQUIVO_ARMAS);
  let armasNovas = 0;

  for (const [id, fonte] of externo.armas) {
    const local = armasLocais.get(id);
    if (!local) {
      relatorio.novo.push(`arma ${id} — ${fonte.name}`);
      if (aplicar) {
        arquivoArmas.acrescentar(blocoDeArma(fonte));
        armasNovas++;
      }
      continue;
    }

    for (const { campo, formato, comparar } of CAMPOS_DE_ARMA) {
      const { acao, motivo } = decidir(local[campo], fonte[campo], base?.armas?.[id]?.[campo], comparar);
      if (acao === 'atualizar') {
        relatorio.atualizar.push(
          `arma ${id}.${campo}: ${comoTexto(local[campo], comparar)} → ${comoTexto(fonte[campo], comparar)}`,
        );
        if (aplicar) arquivoArmas.definir(id, campo, formato(fonte[campo]));
      } else if (acao === 'conflito') {
        relatorio.conflito.push(
          `arma ${id}.${campo}: local ${comoTexto(local[campo], comparar)} · fonte ${comoTexto(fonte[campo], comparar)} (${motivo})`,
        );
      }
    }
  }

  /*
   * Corpo a corpo nunca esteve na fonte — ela só cataloga arma de fogo. O que
   * sobra aqui é conteúdo recente que a fonte ainda não cadastrou, e vale
   * saber: é o inverso do fluxo normal, este projeto na frente dela.
   */
  for (const [id, local] of armasLocais) {
    if (!externo.armas.has(id) && local.category !== 'corpo-a-corpo') relatorio.sumiu.push(`arma ${id}`);
  }

  // ------------------------------------------------------------- acessórios
  const arquivoAcessorios = new DataFile(ARQUIVO_ACESSORIOS);
  let acessoriosNovos = 0;

  for (const [idDaFonte, fonte] of externo.acessorios) {
    const local = acessoriosLocais.get(idDaFonte) ?? porNomeOriginal.get(fonte.originalName.toLowerCase());
    const id = local?.id ?? idDaFonte;
    if (!local) {
      relatorio.novo.push(`acessório ${id} — ${fonte.originalName}`);
      if (aplicar) {
        arquivoAcessorios.acrescentar(blocoDeAcessorio(fonte));
        acessoriosNovos++;
      }
      continue;
    }

    for (const { campo, formato } of CAMPOS_DE_ACESSORIO) {
      const { acao, motivo } = decidir(local[campo], fonte[campo], base?.acessorios?.[id]?.[campo]);
      if (acao === 'atualizar') {
        relatorio.atualizar.push(`acessório ${id}.${campo}: ${local[campo]} → ${fonte[campo]}`);
        if (aplicar) arquivoAcessorios.definir(id, campo, formato(fonte[campo]));
      } else if (acao === 'conflito') {
        relatorio.conflito.push(
          `acessório ${id}.${campo}: local ${local[campo]} · fonte ${fonte[campo]} (${motivo})`,
        );
      }
    }

    /*
     * Compatibilidade, pela mesma regra de três vias — e aqui ela importa mais
     * que em qualquer outro campo. A lista local não é a da fonte: ela passou
     * pelo filtro por categoria da planilha do Gunsmith (mira de sniper precisa
     * de 2,5× para cima, escopeta não aceita supressor). Comparar direto com a
     * fonte proporia desfazer esse filtro inteiro, toda vez.
     *
     * O que interessa é o que a fonte **mudou** desde a última sincronização.
     */
    const naBase = base?.acessorios?.[idDaFonte]?.weapons;
    if (naBase) {
      const antes = new Set(naBase);
      const locais = new Set(local.compat?.weapons ?? []);
      const ganhou = fonte.weapons.filter((w) => !antes.has(w) && !locais.has(w) && armasLocais.has(w));
      const perdeu = [...locais].filter((w) => antes.has(w) && !fonte.weapons.includes(w));

      if (ganhou.length > 0 || perdeu.length > 0) {
        const mudanca = [ganhou.length ? `+ ${ganhou.join(', ')}` : '', perdeu.length ? `− ${perdeu.join(', ')}` : '']
          .filter(Boolean)
          .join(' · ');
        relatorio.atualizar.push(`acessório ${id}.compat: ${mudanca}`);
        if (aplicar) {
          const lista = [...locais, ...ganhou].filter((w) => !perdeu.includes(w)).sort();
          arquivoAcessorios.definir(id, 'compat', `{ weapons: ${listaDeIds(lista)} }`);
        }
      }
    }
  }

  // ------------------------------------------------------------- relatório
  const secoes = [
    ['Novidades', relatorio.novo, cores.novo],
    ['Estatísticas a atualizar', relatorio.atualizar, cores.muda],
    ['Conflitos — resolver à mão', relatorio.conflito, cores.conflito],
    ['Sumiram da fonte — mantidos', relatorio.sumiu, cores.some],
  ];

  for (const [titulo, itens, cor] of secoes) {
    if (itens.length === 0) continue;
    console.log(cores.titulo(`\n${titulo} · ${itens.length}`));

    /*
     * Na primeira execução tudo que difere vira "conflito por falta de base", e
     * listar centenas de linhas esconderia o que importa. O número basta: ele é
     * a distância entre este dataset e a fonte, e ela é grande de propósito.
     */
    if (!base && titulo.startsWith('Conflitos')) {
      console.log(
        `  ${cor(`${itens.length} campos diferem da fonte e ficam como estão.`)}\n` +
          '  Boa parte é curadoria deliberada — dano medido no jogo, valores corrigidos à mão.\n' +
          '  A partir da próxima execução, só aparece aqui o que a fonte mudar de verdade.',
      );
      continue;
    }

    for (const item of itens.slice(0, 40)) console.log(`  ${cor(item)}`);
    if (itens.length > 40) console.log(`  … e mais ${itens.length - 40}`);
  }

  if (aplicar) {
    const gravouArmas = arquivoArmas.salvar({ itensEsperados: WEAPONS.length + armasNovas });
    const gravouAcessorios = arquivoAcessorios.salvar({
      itensEsperados: ATTACHMENTS.length + acessoriosNovos,
    });
    console.log(
      cores.titulo('\nGravado') +
        `\n  weapons.ts     ${gravouArmas ? `${arquivoArmas.alteracoes.length} alterações` : 'sem mudança'}` +
        `\n  attachments.ts ${gravouAcessorios ? `${arquivoAcessorios.alteracoes.length} alterações` : 'sem mudança'}`,
    );
    if (relatorio.novo.length > 0) {
      console.log(
        cores.conflito('\n  Itens novos entraram com campos marcados TODO — traduza antes de publicar.'),
      );
    }
  }

  if (aplicar || registrar || !base) {
    writeFileSync(
      SNAPSHOT,
      JSON.stringify(
        {
          registradoEm: new Date().toISOString().slice(0, 10),
          armas: Object.fromEntries(externo.armas),
          acessorios: Object.fromEntries(externo.acessorios),
        },
        null,
        1,
      ) + '\n',
      'utf8',
    );
    console.log('\nBase de comparação registrada em scripts/sync-snapshot.json');
  }

  const nada = Object.values(relatorio).every((lista) => lista.length === 0);
  if (nada) console.log('\nO dataset está em dia com a fonte.');
  else if (!aplicar) console.log('\nNada foi gravado. Rode com --aplicar para escrever.');

  // Conflito não é erro: é trabalho humano pendente, e o CI deve seguir.
  return 0;
}

main().then((codigo) => process.exit(codigo));
