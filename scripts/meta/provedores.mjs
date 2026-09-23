/**
 * Quem responde às perguntas com busca: a OpenAI, e o Gemini gratuito quando o
 * crédito dela acaba.
 *
 * As três rotinas que perguntam a um modelo com a busca ligada — o meta do dia
 * (`meta-search.mjs`), as montagens (`builds-search.mjs`) e a auditoria de
 * acessórios (`catalog/perguntar-acessorios.ts`) — dependiam de uma chave paga
 * só. Crédito esgotado era o 429 `insufficient_quota`, que nenhuma espera
 * resolve: a rodada inteira caía, e a tela ficava com a leitura da véspera até
 * alguém pôr dinheiro na conta.
 *
 * ## Quando o gratuito entra
 *
 * Só quando a OpenAI não pode responder por falta de crédito — ou quando não há
 * chave dela no ambiente. Resposta ruim da OpenAI (sem JSON, sem busca, barrada
 * nas travas) não abre a porta: aí o problema é a pergunta ou o modelo, e trocar
 * para um modelo gratuito seria publicar uma leitura pior para esconder isso.
 *
 * Esgotou uma vez, fica esgotado pelo resto do processo. A varredura de
 * montagens são onze lotes; bater onze vezes no mesmo 429 só atrasaria cada um.
 *
 * ## Qual gratuito
 *
 * O Gemini, porque é o gratuito que traz busca própria — a do Google — e sem
 * busca estas rotinas não têm o que ler. A fila começa pelos nomes de
 * `GEMINI_MODELS` (ou os padrões abaixo) e termina no que a própria conta
 * disser que existe: o nome do modelo é a parte que envelhece, e o confronto já
 * viu três Flash sumirem para contas novas (ver `src/app/api/matchup/route.ts`).
 * Modelo que responde 404, 403 ou cota diária esgotada sai da fila e não é
 * tentado de novo nesta execução.
 */

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** A fila gratuita quando `GEMINI_MODELS` não diz outra. Os apelidos seguem o Flash da vez. */
export const GRATUITOS_PADRAO = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

/** Espera máxima por um limite de taxa. Mais que isso é cota do dia, não do minuto. */
const ESPERA_MAXIMA_MS = 65_000;

const estado = {
  openaiSemCredito: false,
  /** @type {Set<string>} */
  gratuitosFora: new Set(),
  /** @type {string[] | null} */
  gratuitosDescobertos: null,
  avisouSemChaveGratuita: false,
};

const chaveOpenAI = () => process.env.OPENAI_API_KEY;
const chaveGoogle = () => process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;

/** Há com quem falar? Sem nenhuma das duas chaves, a rotina não tem o que fazer. */
export const temAlgumaChave = () => Boolean(chaveOpenAI() || chaveGoogle());

/** Para os testes: o estado é do processo, e cada teste quer começar do zero. */
export function reiniciarEstado() {
  estado.openaiSemCredito = false;
  estado.gratuitosFora.clear();
  estado.gratuitosDescobertos = null;
  estado.avisouSemChaveGratuita = false;
}

/**
 * O erro é falta de crédito, e não limite de taxa?
 *
 * Os dois chegam como 429 na OpenAI, e a diferença é tudo: limite de taxa passa
 * com espera, crédito esgotado não passa nunca. O código `insufficient_quota` é
 * o sinal oficial; a mensagem ("You exceeded your current quota, please check
 * your plan and billing details") é o plano B para quando o código não vier.
 */
export function ehFaltaDeCredito(status, erro) {
  if (status === 402) return true;
  const codigo = `${erro?.code ?? ''} ${erro?.type ?? ''}`;
  if (/insufficient_quota|billing_hard_limit_reached|billing_not_active/i.test(codigo)) return true;
  return status === 429 && /exceeded your current quota|billing details|out of credits/i.test(erro?.message ?? '');
}

/**
 * Dos modelos que a conta do Google lista, os que valem para esta pergunta.
 *
 * Flash, porque é a família com cota gratuita — Pro responde `limit: 0`. E só
 * geração de texto: imagem, voz, embedding e sessão ao vivo aparecem na mesma
 * lista com "flash" no nome e recusariam o pedido.
 */
export function filtrarGratuitos(modelos) {
  return (modelos ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => String(m.name ?? '').replace(/^models\//, ''))
    .filter((nome) => /flash/i.test(nome) && !/image|tts|audio|live|embedding|vision/i.test(nome));
}

async function modelosGratuitos() {
  const configurados = (process.env.GEMINI_MODELS ?? GRATUITOS_PADRAO.join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (estado.gratuitosDescobertos === null) {
    estado.gratuitosDescobertos = [];
    try {
      const resposta = await fetch(`${GEMINI_URL}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': chaveGoogle() },
        signal: AbortSignal.timeout(15_000),
      });
      if (resposta.ok) estado.gratuitosDescobertos = filtrarGratuitos((await resposta.json()).models);
    } catch {
      // Sem a lista, a fila fica com os nomes configurados — que é o que havia antes.
    }
  }

  return [...new Set([...configurados, ...estado.gratuitosDescobertos])];
}

/**
 * A fila de quem pode responder, na ordem em que se tenta.
 *
 * É gerador, e não lista, porque a parte gratuita só se decide depois de a
 * OpenAI ter sido tentada: é o 429 dela que libera o resto da fila.
 */
export async function* candidatos(modelosOpenAI) {
  if (chaveOpenAI()) {
    for (const modelo of modelosOpenAI) {
      if (estado.openaiSemCredito) break;
      yield { provedor: 'openai', modelo };
    }
  }

  if (chaveOpenAI() && !estado.openaiSemCredito) return;

  if (!chaveGoogle()) {
    if (!estado.avisouSemChaveGratuita) {
      estado.avisouSemChaveGratuita = true;
      console.warn('Sem GEMINI_API_KEY nem GOOGLE_GENERATIVE_AI_API_KEY: não há modelo gratuito para cair.');
    }
    return;
  }

  for (const modelo of await modelosGratuitos()) {
    if (!estado.gratuitosFora.has(modelo)) yield { provedor: 'google', modelo };
  }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function recuo(tentativa) {
  return Math.min(30_000, 1500 * 2 ** (tentativa - 1));
}

/* ========================================================================== *
 * OpenAI
 * ========================================================================== */

/**
 * A ferramenta de busca tem dois nomes: `web_search` na geração atual,
 * `web_search_preview` nos gpt-4.1 — que diante do nome novo respondiam de
 * memória.
 */
const ferramentaDeBusca = (modelo) =>
  modelo.startsWith('gpt-5') || modelo.startsWith('o')
    ? { type: 'web_search' }
    : { type: 'web_search_preview' };

/**
 * O esforço de raciocínio dito em voz alta: o padrão do `gpt-5.6-luna` é
 * `medium`, e `max_output_tokens` cobre raciocínio, busca e texto no mesmo bolo.
 */
const raciocinio = (modelo) => (modelo.startsWith('gpt-5') ? { reasoning: { effort: 'low' } } : {});

async function chamarOpenAI(modelo, prompt, { maxOutputTokens, tentativa }) {
  const resposta = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${chaveOpenAI()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      tools: [ferramentaDeBusca(modelo)],
      ...raciocinio(modelo),
      // Obrigatória: com `auto` o modelo decide não buscar e responde de memória.
      tool_choice: 'required',
      input: prompt,
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || corpo.error) {
    const erro = new Error(
      corpo.error?.message ? `${resposta.status} ${corpo.error.message}` : `${resposta.status} ${resposta.statusText}`,
    );
    erro.status = resposta.status;
    erro.semCredito = ehFaltaDeCredito(resposta.status, corpo.error);

    const header = resposta.headers.get('retry-after');
    const dito = /try again in ([0-9.]+)s/i.exec(erro.message);
    erro.esperarMs =
      header && !Number.isNaN(Number(header))
        ? Number(header) * 1000
        : dito
          ? Math.ceil(Number(dito[1]) * 1000)
          : recuo(tentativa);
    throw erro;
  }

  if (corpo.status === 'incomplete') {
    throw new Error(
      `resposta cortada (${corpo.incomplete_details?.reason ?? 'motivo não informado'}) — o teto é ${maxOutputTokens} tokens`,
    );
  }

  const itens = corpo.output ?? [];
  const mensagem = itens.find((item) => item.type === 'message');
  const partes = (mensagem?.content ?? []).filter((p) => p.type === 'output_text');
  const uso = corpo.usage ?? null;
  const buscas = itens.filter((item) => item.type === 'web_search_call').length;

  return {
    texto: partes.map((p) => p.text ?? '').join(''),
    anotacoes: partes.flatMap((p) => p.annotations ?? []).filter((a) => a.type === 'url_citation'),
    // A prova de que a busca rodou é o `web_search_call`, não a citação no texto.
    buscou: buscas > 0,
    tipos: [...new Set(itens.map((i) => i.type))],
    custo: uso && {
      entrada: uso.input_tokens ?? 0,
      saida: uso.output_tokens ?? 0,
      raciocinio: uso.output_tokens_details?.reasoning_tokens ?? 0,
      buscas,
    },
  };
}

/* ========================================================================== *
 * Gemini
 * ========================================================================== */

/**
 * O endereço de verdade por trás do link da busca do Google.
 *
 * O Gemini não devolve a página citada: devolve um redirecionamento do
 * `vertexaisearch.cloud.google.com`, com o domínio como título. As travas de
 * `meta/leitura.mjs` julgam a fonte pelo domínio e pelo caminho — `wzstats.gg`
 * de multiplayer serve, o de REDSEC não —, e o redirecionamento esconde os dois.
 * Link que não se resolve é descartado: vale mais uma fonte a menos do que uma
 * que as travas não conseguem ler.
 */
async function resolverLinks(web) {
  const resolvidos = await Promise.all(
    web.slice(0, 20).map(async ({ uri, title }) => {
      if (!/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(uri)) return { url: uri, title };
      try {
        const resposta = await fetch(uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
        const destino = resposta.headers.get('location');
        return destino ? { url: destino, title } : null;
      } catch {
        return null;
      }
    }),
  );
  return resolvidos.filter(Boolean);
}

/** Quanto o Google mandou esperar, quando mandou: `RetryInfo.retryDelay`, em "37s". */
function esperaDoGoogle(erro) {
  const info = (erro?.details ?? []).find((d) => String(d['@type'] ?? '').endsWith('RetryInfo'));
  const segundos = /([0-9.]+)s/.exec(info?.retryDelay ?? '');
  return segundos ? Math.ceil(Number(segundos[1]) * 1000) : null;
}

/**
 * O texto da resposta do Gemini, no mesmo formato que a OpenAI devolve.
 *
 * Separado da chamada para poder ser testado sem rede.
 */
export function lerRespostaGemini(corpo, maxOutputTokens) {
  const candidato = corpo?.candidates?.[0];
  if (!candidato) {
    throw new Error(`resposta sem candidato (${corpo?.promptFeedback?.blockReason ?? 'motivo não informado'})`);
  }
  if (candidato.finishReason === 'MAX_TOKENS') {
    throw new Error(`resposta cortada (MAX_TOKENS) — o teto é ${maxOutputTokens} tokens`);
  }

  // As partes de raciocínio vêm marcadas com `thought` e não são a resposta.
  const texto = (candidato.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');

  const busca = candidato.groundingMetadata ?? {};
  const consultas = busca.webSearchQueries ?? [];
  const web = (busca.groundingChunks ?? []).map((c) => c.web).filter((w) => w?.uri);
  const uso = corpo.usageMetadata ?? null;

  return {
    texto,
    web,
    buscou: consultas.length > 0 || web.length > 0,
    tipos: [consultas.length ? 'google_search' : null, texto ? 'message' : null].filter(Boolean),
    custo: uso && {
      entrada: uso.promptTokenCount ?? 0,
      saida: (uso.candidatesTokenCount ?? 0) + (uso.thoughtsTokenCount ?? 0),
      raciocinio: uso.thoughtsTokenCount ?? 0,
      buscas: consultas.length,
    },
  };
}

async function chamarGemini(modelo, prompt, { maxOutputTokens, tentativa }) {
  const resposta = await fetch(`${GEMINI_URL}/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': chaveGoogle(), 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens },
    }),
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || corpo.error) {
    const erro = new Error(`${resposta.status} ${corpo.error?.message ?? resposta.statusText}`);
    erro.status = resposta.status;
    erro.esperarMs = esperaDoGoogle(corpo.error) ?? recuo(tentativa);
    /*
     * Modelo fora: nome que a conta não tem, pedido que ele não aceita, ou a
     * cota gratuita do dia gasta. Nenhum dos três passa com espera, e cada
     * modelo tem a própria cota — o próximo da fila pode ter.
     */
    erro.modeloFora =
      [400, 403, 404].includes(resposta.status) ||
      (resposta.status === 429 &&
        (/per ?day|PerDay|limit: 0/i.test(JSON.stringify(corpo.error ?? {})) || erro.esperarMs > ESPERA_MAXIMA_MS));
    throw erro;
  }

  const { web, ...lido } = lerRespostaGemini(corpo, maxOutputTokens);
  return { ...lido, anotacoes: await resolverLinks(web) };
}

/* ========================================================================== */

/**
 * Pergunta a um candidato da fila, insistindo só onde insistir resolve.
 *
 * Limite de taxa passa com espera; crédito esgotado e modelo fora não — esses
 * sobem para quem chamou, que segue para o próximo da fila.
 *
 * @returns {Promise<{texto: string, anotacoes: {url: string, title?: string}[], buscou: boolean, tipos: string[], custo: object | null, modelo: string, provedor: string}>}
 */
export async function perguntarComBusca({ provedor, modelo }, prompt, { maxOutputTokens, tentativas = 3 }) {
  const chamar = provedor === 'google' ? chamarGemini : chamarOpenAI;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const resposta = await chamar(modelo, prompt, { maxOutputTokens, tentativa });
      return { ...resposta, modelo, provedor };
    } catch (erro) {
      ultimoErro = erro;

      if (erro.semCredito) {
        estado.openaiSemCredito = true;
        console.warn(`${modelo}: a OpenAI está sem crédito — o resto da execução vai para o modelo gratuito.`);
        throw erro;
      }
      if (erro.modeloFora) {
        estado.gratuitosFora.add(modelo);
        throw erro;
      }
      if (erro.status === 429 && tentativa < tentativas) {
        const ms = Math.min(erro.esperarMs ?? 1000, ESPERA_MAXIMA_MS);
        console.warn(`${modelo}: limite de taxa, aguardando ${Math.ceil(ms / 1000)}s.`);
        await esperar(ms);
        continue;
      }
      throw erro;
    }
  }

  throw ultimoErro;
}
