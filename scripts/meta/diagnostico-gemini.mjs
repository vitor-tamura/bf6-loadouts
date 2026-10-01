#!/usr/bin/env node
/**
 * Diz por que o Gemini está recusando — com a chave que este ambiente tem.
 *
 *   GEMINI_API_KEY=... node scripts/meta/diagnostico-gemini.mjs
 *
 * O 429 do Google é a mesma frase para tudo: limite do minuto, do dia, projeto
 * sem cota, busca sem cota. A rodada de 01/10 leu essa frase 330 vezes sem
 * saber qual era. Este script faz três perguntas pequenas e mostra a resposta
 * inteira de cada uma:
 *
 * 1. a lista de modelos — a chave é aceita?
 * 2. uma pergunta sem busca — a cota de geração responde?
 * 3. a mesma pergunta com a busca do Google ligada — a cota da busca responde?
 *
 * A diferença entre a 2 e a 3 é o ponto: as rotinas diárias perguntam com
 * busca, e a busca tem cota própria.
 *
 * A chave nunca é impressa. Saem só os quatro últimos caracteres, que é o que
 * basta para conferir, no painel do Google, de qual projeto ela é — e se é a
 * mesma que se acabou de trocar.
 */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';

const chave = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!chave) {
  console.error('Falta GEMINI_API_KEY (ou GOOGLE_GENERATIVE_AI_API_KEY).');
  process.exit(1);
}

const modelos = (process.argv[2] ?? process.env.GEMINI_MODELS ?? 'gemini-3.6-flash,gemini-flash-latest')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

console.log(`Chave em uso: termina em …${chave.slice(-4)} (${chave.length} caracteres).`);

async function pedir(rotulo, url, corpo) {
  try {
    const resposta = await fetch(url, {
      method: corpo ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': chave, 'content-type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    const json = await resposta.json().catch(() => ({}));

    if (resposta.ok && !json.error) {
      console.log(`  ✓ ${rotulo}: ${resposta.status}`);
      return json;
    }

    console.log(`  ✗ ${rotulo}: ${resposta.status} ${json.error?.status ?? ''}`);
    console.log(`    mensagem: ${json.error?.message ?? resposta.statusText}`);
    // Os detalhes são onde o Google diz qual cota foi, de qual projeto e
    // quanto esperar. Vão inteiros: é exatamente o que faltava no log.
    for (const detalhe of json.error?.details ?? []) {
      console.log(`    detalhe: ${JSON.stringify(detalhe)}`);
    }
    return null;
  } catch (erro) {
    console.log(`  ✗ ${rotulo}: ${erro.message}`);
    return null;
  }
}

console.log('\n1. A chave é aceita?');
const lista = await pedir('lista de modelos', `${GEMINI_URL}/models?pageSize=200`);
if (lista) {
  const flash = (lista.models ?? []).map((m) => String(m.name).replace(/^models\//, '')).filter((n) => /flash/i.test(n));
  console.log(`    ${lista.models?.length ?? 0} modelos na conta; Flash: ${flash.slice(0, 12).join(', ')}`);
}

const pergunta = { contents: [{ role: 'user', parts: [{ text: 'Responda só com a palavra: ok' }] }] };

for (const modelo of modelos) {
  const url = `${GEMINI_URL}/models/${modelo}:generateContent`;

  console.log(`\n2. ${modelo} sem busca`);
  await pedir('geração de texto', url, { ...pergunta, generationConfig: { maxOutputTokens: 200 } });

  console.log(`3. ${modelo} com a busca do Google`);
  const comBusca = await pedir('geração com busca', url, {
    contents: [{ role: 'user', parts: [{ text: 'Qual foi a atualização mais recente do Battlefield 6? Uma frase.' }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 400 },
  });
  if (comBusca) {
    const consultas = comBusca.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [];
    console.log(`    buscas feitas: ${consultas.length}`);
  }
}

console.log(`
Como ler:
- 1 falha             → a chave é inválida ou foi revogada.
- 2 passa, 3 falha    → a cota que acabou é a da busca, não a de geração.
- 2 e 3 falham        → a cota é do projeto desta chave; o "detalhe" diz qual.
- 2 e 3 passam        → esta chave está boa: o workflow usa outra (confira o secret).`);
