#!/usr/bin/env node
/**
 * O que a comunidade monta em cada arma, lido uma vez por dia.
 *
 *   OPENROUTER_API_KEY=... node --experimental-strip-types scripts/builds-search.mjs
 *   node --experimental-strip-types scripts/builds-search.mjs --material   # só baixa e mostra
 *
 * A leitura do meta (`meta-search.mjs`) responde que armas estão fortes — oito
 * por dia, com evidência. Esta rotina responde outra pergunta: **o que se põe
 * nelas**, para as 63, e é o contexto que faltava ao botão "sugestão da
 * comunidade". As duas saem do mesmo workflow (`meta-daily.yml`).
 *
 * ## Por que fora da rota
 *
 * Porque a busca não cabe num clique. Dentro da chamada ela custava mais que o
 * orçamento inteiro e ainda impedia o raciocínio mínimo, e a resposta não
 * fechava. Aqui ela roda em lote, junto da leitura do meta, e o resultado fica
 * no disco: quando alguém clica, o contexto já está lá, e o modelo só escolhe
 * as peças dentro do cardápio da arma.
 *
 * ## Primeiro sem busca, como o trending
 *
 * A pergunta com busca era a única forma de leitura, e ela é a parte que custa:
 * no OpenRouter a busca é cobrada por consulta até em modelo gratuito, e no
 * Gemini ela depende de uma cota que já zerou no meio da varredura. Agora o
 * script baixa a página de montagens de cada arma (`meta/montagens.mjs`) e um
 * modelo gratuito do OpenRouter, sem busca, só lê o que recebeu — o mesmo
 * desenho da leitura do trending em `meta-search.mjs`. A pergunta com busca
 * fica para as armas que ficaram sem material ou sem resposta.
 *
 * Na leitura sem busca a fonte de cada arma é a página baixada, e não a que o
 * modelo declarar: endereço que o script não abriu não sustenta nada.
 *
 * ## O que entra no arquivo
 *
 * Só o que a busca sustentou: a arma, uma frase do que a comunidade monta nela,
 * e as páginas citadas. Arma sem evidência fica de fora — o botão então usa o
 * que o modelo já sabe, e diz isso. Meia dúzia de linhas inventadas seria pior
 * que a ausência, porque a tela as apresentaria como leitura de fonte.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { WEAPONS } from '../src/data/weapons.ts';
import { SHORT_CATEGORY_NAMES } from '../src/data/classes.ts';
import { armaPorNome, extrairJson } from './meta/leitura.mjs';
import { lerMontagens } from './meta/montagens.mjs';
import {
  candidatos,
  filaEsgotada,
  modelosDe,
  perguntarComBusca,
  perguntarSemBusca,
  temAlgumaChave,
} from './meta/provedores.mjs';

const DESTINO = new URL('../src/data/builds-live.json', import.meta.url);

function numeroConfig(valor, padrao) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : padrao;
}

/**
 * Quantas armas por pergunta.
 *
 * Uma por vez seriam 62 buscas e outras tantas esperas. Todas de uma vez
 * produziriam uma resposta longa demais, cortada no meio — foi o que já
 * aconteceu com o meta. Seis é o meio-termo: cabe numa resposta e mantém a
 * varredura em pouco mais de dez chamadas.
 */
const LOTE = numeroConfig(process.env.OPENROUTER_BUILDS_LOTE, 6);
/* O teto cobre raciocínio, busca e texto — não só o texto. Seis armas com
   pesquisa em cada uma não cabem em dois mil tokens. */
const MAX_OUTPUT_TOKENS = numeroConfig(process.env.OPENROUTER_BUILDS_MAX_OUTPUT_TOKENS, 8000);
const MAX_TENTATIVAS = numeroConfig(process.env.OPENROUTER_BUILDS_RETRIES, 3);
/* Sem busca o teto é menor: só o raciocínio e o JSON — e modelo gratuito tem
   teto de saída próprio, que um pedido grande demais estoura antes de começar. */
const MAX_OUTPUT_TOKENS_SEM_BUSCA = numeroConfig(process.env.OPENROUTER_BUILDS_READ_MAX_OUTPUT_TOKENS, 4000);

/* A busca é o ponto desta rotina, então nada de modo JSON — a API recusa os
   dois juntos. O JSON vem em texto e `extrairJson` o recorta, como no meta. */

/* A mesma fila do meta: as duas leituras rodam na mesma execução diária e
   responder a mesma pergunta com modelos diferentes só faria a divergência
   entre os dois arquivos ser difícil de explicar. Sem busca, quem lê são os
   gratuitos do OpenRouter, com o Gemini gratuito de reserva; com busca, o
   Gemini gratuito, porque a busca do OpenRouter é cobrada — ver o cabeçalho
   de `MODELOS` em scripts/meta-search.mjs. */
const MODELOS = modelosDe(process.env.OPENROUTER_BUILDS_MODELS);

/*
 * Quantas fontes o arquivo guarda.
 *
 * Onze lotes devolvendo meia dúzia de links cada dão 44 fontes, e ninguém lê
 * 44 links embaixo de um card. O arquivo é contexto do botão, não bibliografia.
 */
const MAX_FONTES = 12;

const HOJE = new Date().toISOString().slice(0, 10);

/**
 * O nome da arma sem o rótulo que a própria pergunta pôs ali.
 *
 * O prompt lista "AK4D (FA)" — o nome e a categoria — e o modelo devolve os
 * dois juntos, o que é a leitura literal do que ele viu. `armaPorNome` compara
 * sem pontuação, então "ak4dfa" não bate com nenhuma arma e a leitura era
 * recusada. Foi assim que 46 armas lidas viraram 3 gravadas.
 */
const nomeDeArma = (bruto) => String(bruto ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();

function promptDoLote(armas) {
  const lista = armas
    .map((arma) => `- ${arma.name} (${SHORT_CATEGORY_NAMES[arma.category]})`)
    .join('\n');

  return `Você acompanha a comunidade de Battlefield 6 MULTIPLAYER.

Para cada arma abaixo, pesquise o que a comunidade recomenda montar nela hoje — Reddit (r/Battlefield6, r/Battlefield), guias recentes e criadores de conteúdo.

${lista}

## Regras

- Uma a três frases por arma, dizendo o que se monta nela e por quê: que tipo de boca, cano, empunhadura, mira ou munição a comunidade prefere, e o que isso corrige na arma.
- **Escreva em português do Brasil.** A pesquisa é em inglês, a resposta não: diga "compensador", "cano curto", "empunhadura vertical", "munição de ponta oca" — nunca "muzzle compensator" ou "short barrel". Meia frase em cada idioma é o pior dos dois.
- Fale por tipo de peça, não por nome exato de acessório: quem escolhe o nome é outra etapa, com a lista da arma em mãos.
- Priorize os últimos 30 dias.
- Arma sem evidência recente fica de fora da resposta. Não escreva nada genérico para preencher: quatro armas sustentadas valem mais que doze inventadas.
- Só multiplayer. O que vale só no REDSEC fica de fora.
- Em "weapon", escreva só o nome: "AK4D", nunca "AK4D (FA)". O que está entre parênteses na lista acima é a categoria, e não faz parte do nome.

## Resposta

Responda SOMENTE com este JSON, sem cercas de código:

{"builds":[{"weapon":"NOME DA ARMA, sem o rótulo entre parênteses","advice":"o que a comunidade monta nela e por quê","source":"https://..."}],"sources":[{"name":"nome curto da fonte","url":"https://...","date":"YYYY-MM-DD"}]}`;
}

/**
 * O prompt do lote sem busca: as mesmas regras, com as montagens baixadas no
 * lugar da instrução de pesquisar.
 */
export function promptSemBusca(armas, material) {
  const blocos = armas
    .map((arma) => {
      const pagina = material.get(arma.id);
      return `### ${arma.name} (${SHORT_CATEGORY_NAMES[arma.category]})\nURL: ${pagina.url}\nTexto:\n"""\n${pagina.texto}\n"""`;
    })
    .join('\n\n');

  return `Você acompanha a comunidade de Battlefield 6 MULTIPLAYER.

Você **não tem busca**. Abaixo está, para cada arma, o texto da página de montagens do wzstats.gg baixada hoje — só as montagens do multiplayer (mapa grande e mapa pequeno); as de battle royale e ranqueado já foram tiradas. Cada montagem lista a peça escolhida em cada slot (Barrel, Muzzle, Underbarrel, Magazine, Ammunition, Ergonomics, Scope…).

${blocos}

## Regras

- Uma a três frases por arma, dizendo o que se monta nela e por quê: que tipo de boca, cano, empunhadura, mira ou munição as montagens acima escolhem, e o que isso corrige ou reforça na arma. Quando as montagens de mapa grande e pequeno divergirem, diga a diferença.
- Use **só** o que está no texto da arma. Não acrescente peça, número nem opinião de fora — o que não está no material não existe para esta resposta.
- **Escreva em português do Brasil.** Diga "compensador", "cano pesado", "empunhadura vertical", "munição FMJ", "mira 3x" — nunca a frase inteira em inglês.
- Fale por tipo de peça, não por nome exato de acessório: quem escolhe o nome é outra etapa, com a lista da arma em mãos.
- Arma cujo texto não traz montagem utilizável fica de fora da resposta. Não preencha.
- Em "weapon", escreva só o nome, como no título do bloco, sem o rótulo entre parênteses.

## Resposta

Responda SOMENTE com este JSON, sem cercas de código:

{"builds":[{"weapon":"NOME DA ARMA","advice":"o que as montagens põem nela e por quê"}]}`;
}

/**
 * Pergunta pelo lote sem busca, descendo a fila até alguém devolver JSON.
 *
 * Sem busca a fila começa pelos gratuitos do OpenRouter e termina no Gemini
 * gratuito (`meta/provedores.mjs`).
 */
async function perguntarSemMaterialDeFora(prompt) {
  let ultimoErro = null;

  for await (const candidato of candidatos(MODELOS, { busca: false })) {
    try {
      const resposta = await perguntarSemBusca(candidato, prompt, {
        maxOutputTokens: MAX_OUTPUT_TOKENS_SEM_BUSCA,
        tentativas: MAX_TENTATIVAS,
      });
      const dados = extrairJson(resposta.texto);
      if (!dados?.builds?.length) throw new Error('resposta sem JSON utilizável');
      return { dados, modelo: resposta.modelo };
    } catch (erro) {
      ultimoErro = erro;
      console.warn(`[builds] ${candidato.modelo}: ${erro.message}`);
    }
  }

  throw ultimoErro ?? new Error('sem resposta');
}

/**
 * Pergunta pelo lote, descendo a fila até alguém responder com busca.
 *
 * A fila é a de `meta/provedores.mjs`: com busca, os gratuitos do OpenRouter
 * ficam de fora e quem responde é o Gemini gratuito. Modelo dele que gasta a
 * cota do dia num lote sai da fila para os seguintes.
 */
async function perguntar(prompt) {
  let ultimoErro = null;

  for await (const candidato of candidatos(MODELOS)) {
    try {
      const resposta = await perguntarComBusca(candidato, prompt, {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        tentativas: MAX_TENTATIVAS,
      });

      // Sem busca não houve leitura, e sim memória do modelo. O lote cai para o
      // próximo da fila — a prova é a chamada de busca, não a citação, que o
      // modelo pode simplesmente omitir.
      if (!resposta.buscou) {
        throw new Error(`o modelo não chamou a busca (${resposta.tipos.join(', ') || 'resposta vazia'})`);
      }
      return { texto: resposta.texto, modelo: resposta.modelo };
    } catch (erro) {
      ultimoErro = erro;
    }
  }

  throw ultimoErro ?? new Error('sem resposta');
}

/** A leitura da rodada anterior, ou o arquivo vazio se ainda não houver. */
function leituraAnterior() {
  try {
    return JSON.parse(readFileSync(DESTINO, 'utf8'));
  } catch {
    return { readAt: null, builds: [], sources: [], withoutEvidence: [] };
  }
}

async function main() {
  // Ver o que o modelo receberia, sem perguntar a ninguém.
  if (process.argv.includes('--material')) {
    const arsenal = WEAPONS.filter((arma) => arma.category !== 'melee');
    const material = await lerMontagens(arsenal, { hoje: HOJE });
    const comMaterial = arsenal.filter((arma) => material.has(arma.id));
    console.log(comMaterial.length ? promptSemBusca(comMaterial.slice(0, LOTE), material) : 'Nenhuma página de montagem abriu.');
    console.log(`\n[builds] material para ${comMaterial.length} de ${arsenal.length} armas.`);
    return;
  }

  if (!temAlgumaChave()) {
    console.error('Falta OPENROUTER_API_KEY ou GEMINI_API_KEY.');
    process.exit(1);
  }

  const anterior = leituraAnterior();
  const jaLidas = new Set((anterior.builds ?? []).map((item) => item.weapon));
  const soFaltantes = process.argv.includes('--faltantes');

  const arsenal = WEAPONS.filter((arma) => arma.category !== 'melee');
  /*
   * `--faltantes` pergunta só pelo que ainda não tem leitura.
   *
   * A varredura inteira são onze buscas, e repeti-las para preencher meia dúzia
   * de armas é gastar dez à toa. O workflow diário continua varrendo tudo, que é
   * como a leitura envelhece e se renova; este modo existe para a rodada avulsa,
   * logo depois de um lote ter falhado.
   */
  const armas = soFaltantes ? arsenal.filter((arma) => !jaLidas.has(arma.id)) : arsenal;

  if (!armas.length) {
    console.log('[builds] todas as armas já têm leitura.');
    return;
  }

  if (soFaltantes) {
    console.log(`[builds] só as que faltam: ${armas.length} de ${arsenal.length}`);
  }
  const builds = [];
  const fontes = new Map();
  /** Armas cujo lote não voltou nesta rodada — falha de busca, não ausência de evidência. */
  const naoPerguntadas = [];
  const descartes = [];
  /** Arma já lida num lote anterior — o modelo às vezes repete a vizinha. */
  const vistas = new Set();

  /**
   * Põe na leitura o que o modelo devolveu para um lote.
   *
   * `material` vem na leitura sem busca: aí só vale arma do lote que tinha
   * página baixada, e a fonte é essa página — não a que o modelo declarar.
   */
  function aceitar(dados, lote, { material = null } = {}) {
    const doLote = new Set(lote.map((arma) => arma.id));
    let aceitas = 0;

    for (const item of dados.builds ?? []) {
      const arma = armaPorNome(nomeDeArma(item.weapon));
      const conselho = String(item.advice ?? '').trim();

      // Arma que não existe no arsenal, ou conselho vazio, não entra: o
      // arquivo alimenta o prompt do botão, e ali um nome errado vira
      // contexto errado. Mas o descarte vai para o log, sempre — foi o
      // silêncio daqui que escondeu, por uma rodada inteira, 43 leituras
      // recusadas por causa do rótulo entre parênteses.
      if (!arma) {
        descartes.push(`${item.weapon}: não é arma do arsenal`);
        continue;
      }
      if (material && !doLote.has(arma.id)) {
        descartes.push(`${arma.name}: não estava no material deste lote`);
        continue;
      }
      if (conselho.length < 20) {
        descartes.push(`${arma.name}: sem conselho`);
        continue;
      }
      if (vistas.has(arma.id)) continue;

      const pagina = material?.get(arma.id);
      vistas.add(arma.id);
      aceitas += 1;
      builds.push({ weapon: arma.id, advice: conselho.slice(0, 400), source: pagina?.url ?? item.source ?? null });
      if (pagina && fontes.size < MAX_FONTES) {
        fontes.set(pagina.url, { name: pagina.name, url: pagina.url, date: pagina.date });
      }
    }

    if (!material) {
      for (const fonte of dados.sources ?? []) {
        if (fonte?.url && fontes.size < MAX_FONTES) {
          fontes.set(fonte.url, { name: fonte.name ?? fonte.url, url: fonte.url, date: fonte.date ?? null });
        }
      }
    }

    return aceitas;
  }

  /*
   * 1. Sem busca: as páginas de montagem baixadas, lidas por um gratuito.
   *
   * `BUILDS_SO_BUSCA=1` pula esta etapa — para comparar as duas leituras, ou
   * para o dia em que o site de montagens mudar de layout.
   */
  const material = process.env.BUILDS_SO_BUSCA === '1' ? new Map() : await lerMontagens(armas, { hoje: HOJE });
  console.log(`[builds] material baixado para ${material.size} de ${armas.length} armas.`);

  const comMaterial = armas.filter((arma) => material.has(arma.id));
  for (let inicio = 0; inicio < comMaterial.length; inicio += LOTE) {
    const lote = comMaterial.slice(inicio, inicio + LOTE);
    const rotulo = lote.map((arma) => arma.name).join(', ');

    try {
      const { dados, modelo } = await perguntarSemMaterialDeFora(promptSemBusca(lote, material));
      const aceitas = aceitar(dados, lote, { material });
      console.log(`[builds] ${rotulo} → ${aceitas} de ${dados.builds.length} (${modelo}, sem busca)`);
    } catch (erro) {
      console.warn(`[builds] leitura sem busca falhou em ${rotulo}: ${erro.message}`);
      if (filaEsgotada(MODELOS, { busca: false })) {
        console.warn('[builds] ninguém para ler sem busca: o resto vai para a pergunta com busca.');
        break;
      }
    }
  }

  /*
   * 2. Com busca: só o que a primeira etapa não leu — arma sem página, ou cujo
   * lote não voltou.
   */
  const paraBuscar = armas.filter((arma) => !vistas.has(arma.id));
  if (paraBuscar.length) console.log(`[builds] ${paraBuscar.length} armas vão para a pergunta com busca.`);

  for (let inicio = 0; inicio < paraBuscar.length; inicio += LOTE) {
    const lote = paraBuscar.slice(inicio, inicio + LOTE);
    const rotulo = lote.map((arma) => arma.name).join(', ');

    if (filaEsgotada(MODELOS)) {
      const restantes = paraBuscar.slice(inicio);
      naoPerguntadas.push(...restantes.map((arma) => arma.id));
      console.warn(`[builds] ninguém para perguntar com busca: ${restantes.length} armas ficam para a próxima rodada.`);
      break;
    }

    try {
      const { texto, modelo } = await perguntar(promptDoLote(lote));
      const dados = extrairJson(texto);

      if (!dados?.builds?.length) {
        naoPerguntadas.push(...lote.map((arma) => arma.id));
        console.warn(`[builds] sem leitura para ${rotulo}`);
        continue;
      }

      const aceitas = aceitar(dados, lote);
      console.log(`[builds] ${rotulo} → ${aceitas} de ${dados.builds.length} (${modelo})`);
    } catch (erro) {
      naoPerguntadas.push(...lote.map((arma) => arma.id));
      console.warn(`[builds] falhou em ${rotulo}: ${erro.message}`);

      /*
       * Sem ninguém para perguntar, os lotes que faltam dariam a mesma recusa.
       *
       * A rodada de 01/10 seguiu até o fim com a chave do Google sem cota: onze
       * lotes, dez modelos, três tentativas cada. Crédito e cota são da conta,
       * não do lote — acabou num, acabou nos outros.
       */
      if (filaEsgotada(MODELOS)) {
        const restantes = paraBuscar.slice(inicio + LOTE);
        naoPerguntadas.push(...restantes.map((arma) => arma.id));
        if (restantes.length) {
          console.warn(`[builds] ninguém para perguntar: ${restantes.length} armas ficam para a próxima rodada.`);
        }
        break;
      }
    }
  }

  // Lote que não voltou é diferente de arma sem evidência: a primeira pode ter
  // leitura na próxima rodada, a segunda a comunidade simplesmente não discute.
  const perdidas = naoPerguntadas.filter((id) => !vistas.has(id) && !jaLidas.has(id));
  if (perdidas.length) {
    console.warn(`[builds] ${perdidas.length} ficaram sem leitura por falha de busca: ${perdidas.join(', ')}`);
  }

  if (descartes.length) {
    console.warn(`[builds] ${descartes.length} descartadas:`);
    for (const motivo of descartes.slice(0, 20)) console.warn(`  ${motivo}`);
    if (descartes.length > 20) console.warn(`  … e mais ${descartes.length - 20}`);
  }

  if (!builds.length) {
    /*
     * Nenhuma arma lida: o arquivo anterior continua valendo.
     *
     * Sobrescrever com uma lista vazia apagaria a leitura da rodada passada em
     * troca de nada — e o botão perderia o contexto que já tinha.
     */
    console.error('[builds] nenhuma leitura utilizável; o arquivo anterior fica como está.');
    process.exit(1);
  }

  /*
   * A leitura nova se soma à anterior, não a substitui.
   *
   * Cada rodada relê o arsenal inteiro, e um lote que falhe leva junto as seis
   * armas dele. Gravando só o que voltou, uma rodada ruim apagaria a leitura
   * boa da véspera — a cobertura andaria para trás sozinha, sem ninguém pedir.
   * Quem foi relida hoje entra com o texto de hoje; quem não foi mantém o que
   * já tinha, e é assim que as armas que faltam vão sendo preenchidas ao longo
   * dos dias em vez de exigirem uma varredura perfeita.
   */
  const porArma = new Map((anterior.builds ?? []).map((item) => [item.weapon, item]));
  for (const item of builds) porArma.set(item.weapon, item);

  const mantidas = [...porArma.values()];
  const comLeitura = new Set(mantidas.map((item) => item.weapon));

  const conteudo = {
    readAt: HOJE,
    builds: mantidas,
    // As fontes da rodada vêm primeiro; as antigas completam até o teto, porque
    // sustentam as leituras que sobreviveram.
    sources: [...fontes.values(), ...(anterior.sources ?? [])]
      .filter((fonte, i, todas) => todas.findIndex((f) => f.url === fonte.url) === i)
      .slice(0, MAX_FONTES),
    withoutEvidence: arsenal.map((arma) => arma.id).filter((id) => !comLeitura.has(id)),
  };

  const anteriorBruto = (() => {
    try {
      return readFileSync(DESTINO, 'utf8');
    } catch {
      return '';
    }
  })();

  const proximo = `${JSON.stringify(conteudo, null, 2)}\n`;
  if (anteriorBruto === proximo) {
    console.log('[builds] nada mudou.');
    return;
  }

  writeFileSync(DESTINO, proximo, 'utf8');
  console.log(
    `[builds] gravado: ${mantidas.length} armas com leitura ` +
      `(${builds.length} desta rodada, ${mantidas.length - builds.length} preservadas), ` +
      `${conteudo.sources.length} fontes, ${conteudo.withoutEvidence.length} sem leitura.`,
  );
}

await main();
