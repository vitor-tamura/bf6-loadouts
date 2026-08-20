#!/usr/bin/env node
/**
 * De que arquétipo é cada cano? — piloto, e só relatório.
 *
 *   npm run catalog:barris            # as dez armas do piloto
 *   npm run catalog:barris -- --todas # o arsenal inteiro
 *
 * O dataset tem 163 canos com nome físico — `480mm Factory`, `510mm Fluted`,
 * `27" Full` —, e a matriz de compatibilidade fala de onze arquétipos: `basic`,
 * `extended`, `heavy`, `heavy_ext`, `short`, `light`, `cryo`, `ext_light`,
 * `short_light` e os dois supressos da VSSM. Enquanto não houver ponte entre as
 * duas coisas, cano fica fora da conferência de compatibilidade — é a lacuna
 * declarada em `compat.ts`.
 *
 * Esta é a ponte, em fase de piloto. Ela **não decide nada**: monta a evidência
 * arma por arma e diz onde ela fecha e onde não fecha. Nada aqui entra no CI, e
 * é de propósito — heurística de nome erra em silêncio, e um cano atribuído ao
 * arquétipo errado vira orçamento errado no montador.
 *
 * ## Por que o nome não resolve
 *
 * `480mm Fluted` custa 20 pontos e `510mm Fluted`, 25: mesmo sufixo, peças
 * diferentes. E `480mm Factory` e `480mm MG` têm efeito idêntico e o mesmo
 * preço — o nome separa o que é igual e junta o que é diferente.
 *
 * O que separa de verdade são duas medidas que o dataset já tem:
 *
 * - **velocidade**: é o comprimento do cano. Na B36A4, 391 mm rende +6,4%,
 *   480 mm rende +14,1% e 510 mm rende +16,7%. Três degraus, três famílias.
 * - **peso**: a penalidade de mira e de mobilidade dentro do mesmo comprimento.
 *   O `480mm Factory` cobra +7,7% de tempo de mira; o `480mm Fluted`, +1,2%.
 *   Mesmo cano, perfil aliviado — que é o que a família `light` descreve.
 *
 * ## De onde vem a tabela de custos
 *
 * Os onze arquétipos e o custo de cada um estão descritos no BF6 Attachment
 * Database (AntiPhysicsGames, v0.9.3, 03/08/2026), que é referência externa e
 * está sob CC BY-NC-SA 4.0 — por isso aqui só ficam os números de ponto, que
 * são fato do jogo, com o crédito da leitura. O documento é anterior à 1.4.2.0,
 * então ele vale como modelo, não como estado atual.
 */

import { ATTACHMENTS, isCompatible } from '../../src/data/attachments.ts';
import { WEAPONS, WEAPONS_BY_ID } from '../../src/data/weapons.ts';
import type { Attachment, Weapon } from '../../src/data/types.ts';
import {
  DATA,
  INDEXES,
  NOW,
  ensureDir,
  log,
  readJson,
  ROOT,
  readJsonIf,
  versionDir,
  writeJson,
} from './lib/io.ts';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

interface LinhaDeCompatibilidade {
  weaponId: string;
  attachmentId: string;
  slot: string;
  status?: string;
}

/**
 * Custo em pontos de cada arquétipo.
 *
 * Três arquétipos custam 10 e dois custam 20: o custo sozinho nunca decide,
 * ele só monta a lista de candidatos. Quem decide é o efeito.
 */
const ARQUETIPOS: Record<string, { pts: number; perfil: string; efeitos: string[] }> = {
  extended: { pts: 5, perfil: 'o mais longo da arma', efeitos: ['+velocidade'] },
  basic: { pts: 10, perfil: 'o de série, comprimento médio', efeitos: ['+mira'] },
  heavy: { pts: 10, perfil: 'reforçado', efeitos: ['+sustentado'] },
  heavy_ext: { pts: 10, perfil: 'longo e reforçado', efeitos: ['+velocidade', '+sustentado', '−saque'] },
  short: { pts: 15, perfil: 'o mais curto', efeitos: ['+quadril', '+mira', '−velocidade'] },
  light: { pts: 20, perfil: 'perfil aliviado', efeitos: ['+precisão em movimento', '+mira'] },
  cryo: { pts: 20, perfil: 'sem efeito de comprimento', efeitos: ['+mira', '+sustentado'] },
  ext_light: {
    pts: 25,
    perfil: 'longo e aliviado',
    efeitos: ['+precisão em movimento', '+mira', '+velocidade'],
  },
  short_light: {
    pts: 25,
    perfil: 'curto e aliviado',
    efeitos: ['+precisão em movimento', '+mira', '+quadril', '−velocidade'],
  },
  vssm_suppressed: { pts: 20, perfil: 'supressão integral', efeitos: ['esconde no mapa'] },
  vssm_suppressed_asm: {
    pts: 30,
    perfil: 'supressão integral reforçada',
    efeitos: ['esconde no mapa, mais forte'],
  },
};

/**
 * O que separa os candidatos que sobraram.
 *
 * Quem for ao Gunsmith não precisa anotar a arma inteira: precisa olhar o que
 * difere entre os candidatos. Se `basic`, `heavy` e `heavy_ext` disputam a
 * peça, o que decide é a tooltip citar tiro sustentado ou saque — o resto é
 * igual nos três e não informa nada.
 */
function oQueObservar(candidatos: string[]): string[] {
  const contagem = new Map<string, number>();
  for (const id of candidatos) {
    for (const efeito of ARQUETIPOS[id]?.efeitos ?? []) {
      contagem.set(efeito, (contagem.get(efeito) ?? 0) + 1);
    }
  }
  return [...contagem]
    .filter(([, quantos]) => quantos < candidatos.length)
    .map(([efeito]) => efeito);
}

/**
 * Arma cujo cano não é peça genérica.
 *
 * A VSSM não tem cano comum: ela é subsônica com supressor integrado, e a
 * matriz confirma isso listando só `vssm_suppressed` e `vssm_suppressed_asm`
 * para ela. Forçar os três canos que temos cadastrados dentro dos onze
 * arquétipos genéricos produziria três atribuições erradas em vez de uma
 * pergunta certa — a de por que o dataset a modela como as outras.
 *
 * O mesmo cuidado vale para o "Extended Barrel" das escopetas, que a 1.4.1.0
 * introduziu como peça específica de M87A1, M1014, 18.5KS-K e DB-12: o nome
 * coincide com o arquétipo `extended` e a peça não é ele.
 */
const MODELO_ESPECIFICO = new Set(['vssm']);

/** As dez do piloto: uma de cada família, e as que mais mudaram de temporada. */
const PILOTO = [
  'b36a4',
  'ak4d',
  'm16a4',
  'm4a1',
  'vssm',
  'ef88',
  'lmr27',
  'm250',
  'l115',
  'm1014',
];

/**
 * Os quatro destinos possíveis de um cano, e o que cada um pede.
 *
 * `aprovado` entra no mapa. `precisa_tooltip` espera alguém abrir o Gunsmith —
 * não é caso de algoritmo mais esperto, é informação que não existe no dataset.
 * `conflito_de_fonte` é divergência de dado a investigar, não erro provado: o
 * custo que temos não bate com arquétipo nenhum daquela arma, e quem decide é
 * uma fonte de mais autoridade. `especifico_da_arma` é cano que o modelo
 * genérico não descreve, e forçá-lo seria inventar.
 */
type Situacao = 'aprovado' | 'precisa_tooltip' | 'conflito_de_fonte' | 'especifico_da_arma';

interface CanoLido {
  peca: string;
  nome: string;
  custo: number;
  velocidade: number | null;
  mira: number | null;
  mobilidade: number | null;
  candidatos: string[];
  situacao: Situacao;
  /** Como o empate foi desfeito, quando foi. */
  desempate?: string;
  /** Por que este cano está em conflito, quando está. */
  conflito?: string;
}

/**
 * A impressão digital de uma entrada da auditoria.
 *
 * Congelar o resultado só vale se der para conferir depois de que ele saiu.
 * Números batendo com entradas diferentes não é reprodução; é coincidência. Com
 * o hash de cada entrada, quem reprocessar sabe na hora se o que mudou foi o
 * dado ou o algoritmo — e são conversas diferentes.
 */
function digital(arquivo: string): string {
  return createHash('sha256').update(readFileSync(arquivo)).digest('hex').slice(0, 16);
}

/** Uma linha da planilha preenchida no jogo. */
interface Observacao {
  arma: string;
  peca: string;
  nome: string;
  custo: number;
  candidatos: string[];
  observar: string[];
  efeitosObservados: string[];
  arquetipoObservado: string | null;
}

/**
 * O que foi olhado no Gunsmith, indexado por arma e peça.
 *
 * A planilha é o registro durável dessa observação: uma vez preenchida, a linha
 * fica lá para sempre, e é ela que faz o cano sair do balde de dúvida sem
 * ninguém editar o mapa aprovado à mão.
 */
function lerObservacoes(gameVersion: string): Map<string, Observacao> {
  const { canos } = readJsonIf<{ canos: Observacao[] }>(
    join(DATA, 'compatibility', `barris-tooltip-${gameVersion}.json`),
    { canos: [] },
  );
  return new Map(canos.map((c) => [`${c.arma}|${c.peca}`, c]));
}

/**
 * O segundo eixo: o efeito desempata o que o custo deixou empatado.
 *
 * Ele resolve o que o dataset sabe medir, e isso tem limite claro. Os dois
 * arquétipos de 20 pontos se separam aqui: o cryo não mexe em comprimento, e é
 * o único cano sem efeito de velocidade.
 *
 * Já os três de 10 pontos — basic, heavy e heavy_ext — não se separam de jeito
 * nenhum. O que os distingue é tiro sustentado e velocidade de saque, que este
 * dataset não modela, e as peças candidatas costumam vir com efeito idêntico:
 * "480mm Factory" e "480mm MG" são a mesma linha de números. Aí a resposta
 * honesta é que a evidência disponível não decide — é o balde de revisão
 * manual, e ele precisa da tooltip do jogo.
 */
function desempatarPorEfeito(
  cano: CanoLido,
  irmaos: CanoLido[],
): { candidatos: string[]; por: string | null } {
  if (cano.candidatos.length < 2) return { candidatos: cano.candidatos, por: null };

  if (cano.candidatos.includes('cryo')) {
    if (cano.velocidade === null) {
      return { candidatos: ['cryo'], por: 'é o único sem efeito de comprimento' };
    }
    return {
      candidatos: cano.candidatos.filter((a) => a !== 'cryo'),
      por: 'tem efeito de comprimento, então não é cryo',
    };
  }

  /*
    Perfil aliviado é uma relação, não um número absoluto: mesma velocidade que
    outro cano da arma, e menos penalidade de mira. É o que a família light
    descreve, e é a única parte dela que o dataset mede.
  */
  const mesmaVelocidade = irmaos.filter(
    (outro) => outro.peca !== cano.peca && outro.velocidade === cano.velocidade,
  );
  const maisLeve = mesmaVelocidade.some((outro) => (outro.mira ?? 0) > (cano.mira ?? 0));
  const leves = cano.candidatos.filter((a) => a.includes('light'));
  if (maisLeve && leves.length === 1) {
    return { candidatos: leves, por: 'mesma velocidade de outro cano, com menos penalidade de mira' };
  }

  return { candidatos: cano.candidatos, por: null };
}

const mult = (mods: Attachment['mods'], campo: string): number | null => {
  const valor = (mods as Record<string, { mult?: number; add?: number } | undefined>)[campo];
  if (!valor) return null;
  return valor.mult ?? valor.add ?? null;
};

function lerArma(
  arma: Weapon,
  matriz: LinhaDeCompatibilidade[],
  observado: Map<string, Observacao>,
) {
  const chave = arma.id.replace(/[^a-z0-9]/g, '');
  const arquetipos = [
    ...new Set(
      matriz
        .filter(
          (r) =>
            r.slot === 'barrel' &&
            r.weaponId.replace(/[^a-z0-9]/g, '') === chave &&
            (!r.status || r.status === 'active'),
        )
        .map((r) => r.attachmentId),
    ),
  ];

  const canos = ATTACHMENTS.filter((a) => a.slot === 'barrel' && isCompatible(a, arma));
  const especifica = MODELO_ESPECIFICO.has(arma.id);

  const situar = (candidatos: string[]): Situacao => {
    if (especifica) return 'especifico_da_arma';
    if (candidatos.length === 1) return 'aprovado';
    return candidatos.length ? 'precisa_tooltip' : 'conflito_de_fonte';
  };

  const lidos: CanoLido[] = canos.map((cano) => {
    const candidatos = especifica ? [] : arquetipos.filter((a) => ARQUETIPOS[a]?.pts === cano.cost);
    return {
      peca: cano.id,
      nome: cano.originalName,
      custo: cano.cost,
      velocidade: mult(cano.mods, 'velocity'),
      mira: mult(cano.mods, 'adsMs'),
      mobilidade: mult(cano.mods, 'mobility'),
      candidatos,
      situacao: situar(candidatos),
    };
  });

  /*
    O desempate roda depois de todos os canos serem lidos, porque ele compara um
    cano com os outros da mesma arma.
  */
  for (const cano of lidos) {
    if (especifica) continue;
    const { candidatos, por } = desempatarPorEfeito(cano, lidos);
    if (!por) continue;
    cano.candidatos = candidatos;
    cano.desempate = por;
    cano.situacao = situar(candidatos);
  }

  /*
    A tooltip fecha o que sobrou — e é conferida contra os candidatos.

    Anotação fora da lista não promove nada: ou alguém anotou errado, ou o jogo
    mudou desde que a matriz foi montada. Nos dois casos a resposta é a mesma,
    e não é confiar na anotação — é registrar o desencontro e ir investigar.
  */
  for (const cano of lidos) {
    const anotado = observado.get(`${arma.id}|${cano.peca}`)?.arquetipoObservado;
    if (!anotado) continue;

    if (!cano.candidatos.includes(anotado)) {
      cano.situacao = 'conflito_de_fonte';
      cano.conflito = `a tooltip diz ${anotado}, que não está entre os candidatos (${cano.candidatos.join(', ') || 'nenhum'})`;
      continue;
    }

    cano.candidatos = [anotado];
    cano.desempate = 'tooltip do Gunsmith';
    cano.situacao = 'aprovado';
  }

  return { arquetipos, canos: lidos };
}

function main(): void {
  const { gameVersion } = readJson<{ gameVersion: string }>(join(INDEXES, 'current.json'));
  const { compatibility } = readJson<{ compatibility: LinhaDeCompatibilidade[] }>(
    join(versionDir(gameVersion), 'compatibility.json'),
  );

  const alvos = process.argv.includes('--todas')
    ? WEAPONS.filter((w) => w.category !== 'melee').map((w) => w.id)
    : PILOTO;

  const observado = lerObservacoes(gameVersion);
  const relatorio: Record<string, ReturnType<typeof lerArma>> = {};
  const total: Record<Situacao, number> = {
    aprovado: 0,
    precisa_tooltip: 0,
    conflito_de_fonte: 0,
    especifico_da_arma: 0,
  };

  for (const id of alvos) {
    const arma = WEAPONS_BY_ID.get(id);
    if (!arma) continue;

    const leitura = lerArma(arma, compatibility, observado);
    relatorio[id] = leitura;

    console.log(`\n${arma.name} — ${leitura.canos.length} canos, ${leitura.arquetipos.length} arquétipos`);
    console.log(`  matriz: ${leitura.arquetipos.join(', ') || '(nenhum)'}`);
    for (const cano of leitura.canos) {
      total[cano.situacao] += 1;
      const vel = cano.velocidade ? `vel ×${cano.velocidade.toFixed(3)}` : 'sem efeito';
      const mira = cano.mira ? `mira ×${cano.mira.toFixed(3)}` : '';
      const marca = {
        aprovado: '  ',
        precisa_tooltip: '? ',
        conflito_de_fonte: '! ',
        especifico_da_arma: '~ ',
      }[cano.situacao];
      console.log(
        `  ${marca}${cano.nome.padEnd(20)} ${String(cano.custo).padStart(2)}pts  ${vel.padEnd(12)} ${mira.padEnd(12)} → ${
          cano.candidatos.join(' | ') ||
          (cano.situacao === 'especifico_da_arma'
            ? 'cano específico da arma; fora do modelo genérico'
            : 'nenhum arquétipo desta arma custa isso')
        }${cano.desempate ? `  (${cano.desempate})` : ''}`,
      );
    }
  }

  const todos = Object.entries(relatorio).flatMap(([arma, leitura]) =>
    leitura.canos.map((cano) => ({ arma, ...cano })),
  );

  /*
    O que fica pendente vira lista de tarefa, e não parágrafo de relatório: são
    duas perguntas diferentes, e cada uma se responde num lugar.
  */
  const paraTooltip = todos.filter((c) => c.situacao === 'precisa_tooltip');
  if (paraTooltip.length) {
    console.log(`\nPrecisam da tooltip do Gunsmith — ${paraTooltip.length}:`);
    for (const c of paraTooltip) {
      console.log(
        `  ${c.arma.padEnd(8)} ${c.nome.padEnd(20)} ${c.custo}pts → ${c.candidatos.join(' | ')}\n` +
          `           olhe na tooltip: ${oQueObservar(c.candidatos).join(', ')}`,
      );
    }
  }

  const conflitos = todos.filter((c) => c.situacao === 'conflito_de_fonte');
  if (conflitos.length) {
    console.log(`\nConflito de fonte — ${conflitos.length}, com o que está em disputa em cada um:`);
    for (const c of conflitos) {
      console.log(
        `  ${c.arma.padEnd(8)} ${c.nome.padEnd(20)} ${c.conflito ?? `dataset diz ${c.custo}pts; nenhum arquétipo desta arma custa isso`}`,
      );
    }
  }

  ensureDir(join(DATA, 'compatibility'));
  const escopo = process.argv.includes('--todas') ? 'arsenal' : 'piloto';

  if (process.argv.includes('--approve')) {
    /*
      Promover é só o que já está decidido. O mapa aprovado não carrega dúvida
      nem conflito: quem for usá-lo depois — o `compat.ts`, um dia — precisa
      poder confiar em cada linha sem reler o relatório.
    */
    /*
      A trava é literal, e não confia no filtro acima.

      Promover é a única operação daqui que produz dado para outro programa
      consumir. Se um dia alguém mexer na classificação e um cano ambíguo, um
      conflito de custo ou um cano específico da arma escorregar para cá, o
      comando para — em vez de gravar uma certeza que ninguém teve.
    */
    const promovidos = todos.filter((c) => c.situacao === 'aprovado');
    const intruso = promovidos.find((c) => c.candidatos.length !== 1);
    if (intruso) {
      throw new Error(
        `${intruso.peca} em ${intruso.arma} chegou à promoção com ${intruso.candidatos.length} candidatos`,
      );
    }

    const aprovados = promovidos.map((c) => ({
        arma: c.arma,
        peca: c.peca,
        nome: c.nome,
        arquetipo: c.candidatos[0],
        // Sobrou um candidato só: nos dois caminhos a evidência fecha. O que
        // muda é por onde ela fechou, e é isso que `evidencia` guarda.
        confianca: 'alta',
        evidencia:
          c.desempate === 'tooltip do Gunsmith'
            ? ['custo', 'tooltip']
            : c.desempate
              ? ['custo', 'efeito']
              : ['custo'],
        desempate: c.desempate ?? null,
      }));

    const arquivo = join(DATA, 'compatibility', `barris-${gameVersion}.json`);
    writeJson(arquivo, {
      gameVersion,
      geradoEm: NOW,
      fase: 'aprovado',
      escopo,
      modelo:
        'BF6 Attachment Database v0.9.3 (AntiPhysicsGames, CC BY-NC-SA 4.0) — só os custos por arquétipo',
      canos: aprovados,
    });
    log('canos aprovados', {
      arquivo: `data/compatibility/barris-${gameVersion}.json`,
      aprovados: aprovados.length,
      'fora do mapa': todos.length - aprovados.length,
    });
    return;
  }

  /*
    A planilha do Gunsmith é o artefato que sai daqui para uma pessoa, e por
    isso ela já vem com os campos vazios no formato em que voltarão: quem
    preencher não precisa inventar estrutura, e o reprocessamento lê de volta.
  */
  /*
    A planilha é regravada a cada auditoria, e por isso ela **funde** em vez de
    sobrescrever: linha já preenchida no jogo é trabalho manual que nenhuma
    execução automática pode apagar. Ela sai da lista de pendências assim que a
    observação resolve o cano, mas continua no arquivo — é o registro de que
    alguém olhou, e é o que faz o reprocessamento chegar ao mesmo resultado sem
    ninguém abrir o jogo de novo.
  */
  const preenchidas = [...observado.values()].filter((o) => o.arquetipoObservado);
  const pendentes = paraTooltip
    .filter((c) => !observado.get(`${c.arma}|${c.peca}`)?.arquetipoObservado)
    .map((c) => ({
      arma: c.arma,
      peca: c.peca,
      nome: c.nome,
      custo: c.custo,
      candidatos: c.candidatos,
      observar: oQueObservar(c.candidatos),
      efeitosObservados: [],
      arquetipoObservado: null,
    }));

  if (pendentes.length || preenchidas.length) {
    writeJson(join(DATA, 'compatibility', `barris-tooltip-${gameVersion}.json`), {
      gameVersion,
      geradoEm: NOW,
      fase: 'a observar no jogo',
      escopo,
      comoPreencher:
        'Abra o Gunsmith na arma, selecione o cano e copie da tooltip só os efeitos listados em observar. Depois preencha arquetipoObservado com um dos candidatos.',
      pendentes: pendentes.length,
      observados: preenchidas.length,
      canos: [...preenchidas, ...pendentes],
    });
    console.log(
      `\nplanilha: data/compatibility/barris-tooltip-${gameVersion}.json — ${pendentes.length} a preencher, ${preenchidas.length} já observados`,
    );
  }

  /*
    O estado congelado: os números e de que entradas eles saíram.

    Sem as digitais, "29 aprovados" é uma frase; com elas, é uma afirmação
    conferível. Reprocessou e deu outro número? Compare os hashes primeiro: se
    mudaram, mudou o dado; se não, mudou o algoritmo — e só o segundo caso pede
    releitura do método.
  */
  const congelado = {
    ...total,
    entradas: {
      matriz: digital(join(versionDir(gameVersion), 'compatibility.json')),
      acessorios: digital(join(ROOT, 'src', 'data', 'attachments.ts')),
      armas: digital(join(ROOT, 'src', 'data', 'weapons.ts')),
      planilha: { pendentes: pendentes.length, observados: preenchidas.length },
    },
  };

  writeJson(join(DATA, 'compatibility', `barris-piloto-${gameVersion}.json`), {
    gameVersion,
    geradoEm: NOW,
    fase: 'auditoria',
    escopo,
    congelado,
    modelo:
      'BF6 Attachment Database v0.9.3 (AntiPhysicsGames, CC BY-NC-SA 4.0) — só os custos por arquétipo',
    armas: relatorio,
  });

  log('canos', {
    'versão': gameVersion,
    armas: Object.keys(relatorio).length,
    canos: todos.length,
    ...total,
    arquivo: `data/compatibility/barris-piloto-${gameVersion}.json`,
  });
}

main();
