#!/usr/bin/env node
/**
 * O que a comunidade monta em cada arma, lido uma vez por dia.
 *
 *   OPENAI_API_KEY=... node --experimental-strip-types scripts/builds-search.mjs
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
import { candidatos, perguntarComBusca, temAlgumaChave } from './meta/provedores.mjs';

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
const LOTE = numeroConfig(process.env.OPENAI_BUILDS_LOTE, 6);
/* O teto cobre raciocínio, busca e texto — não só o texto. Seis armas com
   pesquisa em cada uma não cabem em dois mil tokens. */
const MAX_OUTPUT_TOKENS = numeroConfig(process.env.OPENAI_BUILDS_MAX_OUTPUT_TOKENS, 8000);
const MAX_TENTATIVAS = numeroConfig(process.env.OPENAI_BUILDS_RETRIES, 3);

/* A busca é o ponto desta rotina, então nada de modo JSON — a API recusa os
   dois juntos. O JSON vem em texto e `extrairJson` o recorta, como no meta. */

/* Um modelo só, o mesmo do meta: as duas leituras rodam na mesma execução
   diária e responder a mesma pergunta com modelos diferentes só faria a
   divergência entre os dois arquivos ser difícil de explicar. Ver o cabeçalho
   de `MODELOS` em scripts/meta-search.mjs para a conta. */
const MODELOS = (process.env.OPENAI_BUILDS_MODELS ?? 'gpt-5.6-luna')
  .split(',')
  .map((modelo) => modelo.trim())
  .filter(Boolean);

/*
 * Quantas fontes o arquivo guarda.
 *
 * Onze lotes devolvendo meia dúzia de links cada dão 44 fontes, e ninguém lê
 * 44 links embaixo de um card. O arquivo é contexto do botão, não bibliografia.
 */
const MAX_FONTES = 12;

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
 * Pergunta pelo lote, descendo a fila até alguém responder com busca.
 *
 * A fila é a de `meta/provedores.mjs`: a OpenAI e, quando o crédito dela
 * acaba, o Gemini gratuito — e esgotar num lote vale para os seguintes, que já
 * começam pelo gratuito.
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
  if (!temAlgumaChave()) {
    console.error('OPENAI_API_KEY não definida (nem GEMINI_API_KEY, para o modelo gratuito).');
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

  for (let inicio = 0; inicio < armas.length; inicio += LOTE) {
    const lote = armas.slice(inicio, inicio + LOTE);
    const rotulo = lote.map((arma) => arma.name).join(', ');

    try {
      const { texto, modelo } = await perguntar(promptDoLote(lote));
      const dados = extrairJson(texto);

      if (!dados?.builds?.length) {
        naoPerguntadas.push(...lote.map((arma) => arma.id));
        console.warn(`[builds] sem leitura para ${rotulo}`);
        continue;
      }

      let aceitas = 0;

      for (const item of dados.builds) {
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
        if (conselho.length < 20) {
          descartes.push(`${arma.name}: sem conselho`);
          continue;
        }
        if (vistas.has(arma.id)) continue;

        vistas.add(arma.id);
        aceitas += 1;
        builds.push({ weapon: arma.id, advice: conselho.slice(0, 400), source: item.source ?? null });
      }

      for (const fonte of dados.sources ?? []) {
        if (fonte?.url && fontes.size < MAX_FONTES) {
          fontes.set(fonte.url, { name: fonte.name ?? fonte.url, url: fonte.url, date: fonte.date ?? null });
        }
      }

      console.log(
        `[builds] ${rotulo} → ${aceitas} de ${dados.builds.length} (${modelo})`,
      );
    } catch (erro) {
      naoPerguntadas.push(...lote.map((arma) => arma.id));
      console.warn(`[builds] falhou em ${rotulo}: ${erro.message}`);
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
    readAt: new Date().toISOString().slice(0, 10),
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
