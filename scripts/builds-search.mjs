#!/usr/bin/env node
/**
 * O que a comunidade monta em cada arma, lido uma vez por semana.
 *
 *   OPENAI_API_KEY=... node --experimental-strip-types scripts/builds-search.mjs
 *
 * A leitura diária do meta (`meta-search.mjs`) responde que armas estão fortes
 * — oito por dia, com evidência. Esta rotina responde outra pergunta: **o que
 * se põe nelas**, para as 62, e é o contexto que faltava ao botão "sugestão da
 * comunidade".
 *
 * ## Por que fora da rota
 *
 * Porque a busca não cabe num clique. Dentro da chamada ela custava mais que o
 * orçamento inteiro e ainda impedia o raciocínio mínimo, e a resposta não
 * fechava. Aqui ela roda uma vez por semana, em lote, e o resultado fica no
 * disco: quando alguém clica, o contexto já está lá, e o modelo só escolhe as
 * peças dentro do cardápio da arma.
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

const API_KEY = process.env.OPENAI_API_KEY;
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
const MAX_OUTPUT_TOKENS = numeroConfig(process.env.OPENAI_BUILDS_MAX_OUTPUT_TOKENS, 2000);
const MAX_TENTATIVAS = numeroConfig(process.env.OPENAI_BUILDS_RETRIES, 3);

/* A busca é o ponto desta rotina, então nada de modo JSON nem de raciocínio —
   a API recusa os dois junto com ela. O JSON vem em texto e `extrairJson` o
   recorta, como no meta. */
const MODELOS = (process.env.OPENAI_BUILDS_MODELS ?? 'gpt-5-mini,gpt-4.1-mini')
  .split(',')
  .map((modelo) => modelo.trim())
  .filter(Boolean);

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function promptDoLote(armas) {
  const lista = armas
    .map((arma) => `- ${arma.name} (${SHORT_CATEGORY_NAMES[arma.category]})`)
    .join('\n');

  return `Você acompanha a comunidade de Battlefield 6 MULTIPLAYER.

Para cada arma abaixo, pesquise o que a comunidade recomenda montar nela hoje — Reddit (r/Battlefield6, r/Battlefield), guias recentes e criadores de conteúdo.

${lista}

## Regras

- Uma a três frases por arma, dizendo o que se monta nela e por quê: que tipo de boca, cano, empunhadura, mira ou munição a comunidade prefere, e o que isso corrige na arma.
- Fale por tipo de peça, não por nome exato de acessório: quem escolhe o nome é outra etapa, com a lista da arma em mãos.
- Priorize os últimos 30 dias.
- Arma sem evidência recente fica de fora da resposta. Não escreva nada genérico para preencher: quatro armas sustentadas valem mais que doze inventadas.
- Só multiplayer. O que vale só no REDSEC fica de fora.

## Resposta

Responda SOMENTE com este JSON, sem cercas de código:

{"builds":[{"weapon":"NOME EXATO DA ARMA","advice":"o que a comunidade monta nela e por quê","source":"https://..."}],"sources":[{"name":"nome curto da fonte","url":"https://...","date":"YYYY-MM-DD"}]}`;
}

async function chamar(modelo, prompt, tentativa) {
  const resposta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: 'web_search' }],
      input: prompt,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    }),
  });

  const corpo = await resposta.json();
  if (!resposta.ok || corpo.error) {
    const erro = new Error(
      corpo.error?.message
        ? `${resposta.status} ${corpo.error.message}`
        : `${resposta.status} ${resposta.statusText}`,
    );
    erro.status = resposta.status;
    erro.esperar = /try again in ([0-9.]+)s/i.exec(erro.message)
      ? Math.ceil(Number(/try again in ([0-9.]+)s/i.exec(erro.message)[1]) * 1000)
      : Math.min(30_000, 1500 * 2 ** (tentativa - 1));
    throw erro;
  }

  const mensagem = (corpo.output ?? []).find((item) => item.type === 'message');
  const partes = (mensagem?.content ?? []).filter((p) => p.type === 'output_text');

  if (corpo.status === 'incomplete') {
    throw new Error(`resposta cortada (${corpo.incomplete_details?.reason ?? 'sem motivo'})`);
  }

  return partes.map((p) => p.text ?? '').join('');
}

async function perguntar(prompt) {
  let ultimoErro = null;

  for (const modelo of MODELOS) {
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
      try {
        return { texto: await chamar(modelo, prompt, tentativa), modelo };
      } catch (erro) {
        ultimoErro = erro;
        if (erro.status === 429 && tentativa < MAX_TENTATIVAS) {
          await espera(erro.esperar ?? 1000);
          continue;
        }
        break;
      }
    }
  }

  throw ultimoErro ?? new Error('sem resposta');
}

async function main() {
  if (!API_KEY) {
    console.error('OPENAI_API_KEY não definida.');
    process.exit(1);
  }

  const armas = WEAPONS.filter((arma) => arma.category !== 'melee');
  const builds = [];
  const fontes = new Map();
  const semEvidencia = [];

  for (let inicio = 0; inicio < armas.length; inicio += LOTE) {
    const lote = armas.slice(inicio, inicio + LOTE);
    const rotulo = lote.map((arma) => arma.name).join(', ');

    try {
      const { texto, modelo } = await perguntar(promptDoLote(lote));
      const dados = extrairJson(texto);

      if (!dados?.builds?.length) {
        semEvidencia.push(...lote.map((arma) => arma.id));
        console.warn(`[builds] sem leitura para ${rotulo}`);
        continue;
      }

      for (const item of dados.builds) {
        const arma = armaPorNome(item.weapon);
        const conselho = String(item.advice ?? '').trim();

        // Arma que não existe no arsenal, ou conselho vazio, não entra: o
        // arquivo alimenta o prompt do botão, e ali um nome errado vira
        // contexto errado.
        if (!arma || conselho.length < 20) continue;

        builds.push({ weapon: arma.id, advice: conselho.slice(0, 400), source: item.source ?? null });
      }

      for (const fonte of dados.sources ?? []) {
        if (fonte?.url) fontes.set(fonte.url, { name: fonte.name ?? fonte.url, url: fonte.url, date: fonte.date ?? null });
      }

      console.log(`[builds] ${rotulo} → ${dados.builds.length} (${modelo})`);
    } catch (erro) {
      semEvidencia.push(...lote.map((arma) => arma.id));
      console.warn(`[builds] falhou em ${rotulo}: ${erro.message}`);
    }
  }

  if (!builds.length) {
    /*
     * Nenhuma arma lida: o arquivo anterior continua valendo.
     *
     * Sobrescrever com uma lista vazia apagaria a leitura da semana passada em
     * troca de nada — e o botão perderia o contexto que já tinha.
     */
    console.error('[builds] nenhuma leitura utilizável; o arquivo anterior fica como está.');
    process.exit(1);
  }

  const conteudo = {
    readAt: new Date().toISOString().slice(0, 10),
    builds,
    sources: [...fontes.values()],
    withoutEvidence: semEvidencia,
  };

  const anterior = (() => {
    try {
      return readFileSync(DESTINO, 'utf8');
    } catch {
      return '';
    }
  })();

  const proximo = `${JSON.stringify(conteudo, null, 2)}\n`;
  if (anterior === proximo) {
    console.log('[builds] nada mudou.');
    return;
  }

  writeFileSync(DESTINO, proximo, 'utf8');
  console.log(
    `[builds] gravado: ${builds.length} armas com leitura, ${conteudo.sources.length} fontes, ${semEvidencia.length} sem evidência.`,
  );
}

await main();
