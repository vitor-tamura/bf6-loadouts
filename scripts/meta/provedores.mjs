/**
 * Quem responde às perguntas das rotinas: os modelos gratuitos do OpenRouter
 * e o Gemini gratuito, direto no Google.
 *
 * As rotinas que perguntam a um modelo — o meta do dia (`meta-search.mjs`), as
 * montagens (`builds-search.mjs`), a auditoria de acessórios
 * (`catalog/perguntar-acessorios.ts`) e a análise do patch
 * (`catalog/analisar-patch.ts`) — já falaram direto com a OpenAI e, depois,
 * com um modelo pago pelo OpenRouter. A chave paga parou no teto de gasto dela
 * na primeira varredura, e a decisão foi não depender de crédito: por padrão,
 * só modelo gratuito.
 *
 * ## A fila do OpenRouter
 *
 * É a lista de modelos que cada rotina passa, na ordem em que se tenta. Os
 * nomes são os do catálogo do OpenRouter: gratuito é o que termina em `:free`,
 * e `openrouter/free` é o roteador que escolhe um gratuito disponível.
 *
 * ## A busca não é gratuita
 *
 * O modelo gratuito não cobra tokens, mas a busca na web do OpenRouter cobra
 * por consulta, de qualquer modelo — e é esse gasto que bate no teto da chave.
 * Por isso, pergunta com busca não vai a modelo gratuito do OpenRouter: vai
 * direto ao Gemini, que traz a busca do Google dentro da cota gratuita dele.
 * Modelo pago posto na fila pela variável de ambiente da rotina continua
 * buscando pelo OpenRouter, por conta de quem o pôs lá.
 *
 * ## Quando o Gemini entra
 *
 * - na pergunta com busca, sempre que a fila do OpenRouter só tiver gratuito;
 * - na pergunta sem busca, depois dos gratuitos do OpenRouter, como reserva —
 *   os dois são gratuitos, e a cota do dia de um não diz nada sobre o outro;
 * - quando o OpenRouter recusa por crédito (o 402 da conta ou o 403 do teto da
 *   chave) ou quando não há chave dele no ambiente.
 *
 * O que continua fechando a porta é a resposta ruim de um modelo **pago** (sem
 * JSON, sem busca, barrada nas travas): aí o problema é a pergunta ou o
 * modelo, e trocar para um gratuito seria publicar uma leitura pior para
 * esconder isso.
 *
 * O crédito é da conta, não do modelo. Esgotou uma vez, fica esgotado pelo
 * resto do processo: a varredura de montagens são onze lotes, e bater onze
 * vezes na mesma recusa só atrasaria cada um.
 *
 * ## Qual Gemini
 *
 * Direto na API do Google e com a chave gratuita dela. A fila começa pelos
 * nomes de `GEMINI_MODELS` (ou os padrões abaixo) e termina no que a própria
 * conta disser que existe: o nome do modelo é a parte que envelhece. Modelo
 * que responde 404, 403 ou cota diária esgotada sai da fila e não é tentado de
 * novo nesta execução.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * O modelo do OpenRouter de todas as rotinas, quando a rotina não diz outro.
 *
 * É o roteador de gratuitos, e não um nome: a lista de modelos `:free` muda de
 * mês em mês, e um nome fixo viraria 404 sem ninguém ter mexido no código. O
 * roteador escolhe, entre os gratuitos no ar, um que aceite o pedido.
 */
export const MODELO_PADRAO = 'openrouter/free';

/** O modelo não cobra tokens? É o que termina em `:free`, ou o roteador de gratuitos. */
export const ehGratuito = (modelo) => modelo === 'openrouter/free' || /:free$/.test(modelo);

/** A fila gratuita quando `GEMINI_MODELS` não diz outra. Os apelidos seguem o Flash da vez. */
export const GRATUITOS_PADRAO = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

/** Espera máxima por um limite de taxa. Mais que isso é cota do dia, não do minuto. */
const ESPERA_MAXIMA_MS = 65_000;

const estado = {
  semCredito: false,
  /** @type {Set<string>} */
  gratuitosFora: new Set(),
  /** @type {string[] | null} */
  gratuitosDescobertos: null,
  avisouSemChaveGratuita: false,
};

const chaveOpenRouter = () => process.env.OPENROUTER_API_KEY;
const chaveGoogle = () => process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;

/** Há com quem falar? Sem nenhuma das duas chaves, a rotina não tem o que fazer. */
export const temAlgumaChave = () => Boolean(chaveOpenRouter() || chaveGoogle());

/** Para os testes: o estado é do processo, e cada teste quer começar do zero. */
export function reiniciarEstado() {
  estado.semCredito = false;
  estado.gratuitosFora.clear();
  estado.gratuitosDescobertos = null;
  estado.avisouSemChaveGratuita = false;
}

/**
 * A lista de modelos de uma rotina, a partir da variável de ambiente dela.
 *
 * Vazia ou ausente, vale o padrão — é o que deixa trocar o modelo de uma
 * rotina sem publicar versão nova.
 */
export function modelosDe(valor, padrao = MODELO_PADRAO) {
  return (valor || padrao)
    .split(',')
    .map((modelo) => modelo.trim())
    .filter(Boolean);
}

/**
 * O erro é falta de crédito, e não limite de taxa?
 *
 * No OpenRouter o sinal oficial é o 402 — "Your account or API key has
 * insufficient credits". Mas a chave também pode ter teto de gasto próprio, e
 * esse chega como 403: "Key limit exceeded (total limit)". Foi o que derrubou
 * a varredura de montagens de 01/10 — onze lotes, onze 403, e a reserva
 * gratuita parada porque só o 402 a liberava.
 *
 * A mensagem é também o plano B para quando a casa por trás do modelo devolve
 * a própria recusa de cobrança num 429, que nenhuma espera resolve.
 */
export function ehFaltaDeCredito(status, erro) {
  if (status === 402) return true;
  const mensagem = erro?.message ?? '';
  if (status === 403 && /key limit exceeded/i.test(mensagem)) return true;
  return (
    status === 429 &&
    /insufficient (credits|quota)|exceeded your current quota|billing details|out of credits/i.test(mensagem)
  );
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
      // Sem a lista, a fila fica com os nomes configurados.
    }
  }

  return [...new Set([...configurados, ...estado.gratuitosDescobertos])];
}

/**
 * A fila de quem pode responder, na ordem em que se tenta.
 *
 * É gerador, e não lista, porque a parte do Gemini só se decide depois de o
 * OpenRouter ter sido tentado: a recusa por crédito dele muda o resto da fila.
 *
 * `busca` diz se a pergunta vai com a busca ligada — é o que decide se os
 * gratuitos do OpenRouter entram (ver "A busca não é gratuita", no cabeçalho).
 */
export async function* candidatos(modelos, { busca = true } = {}) {
  let ofereceuPago = false;

  if (chaveOpenRouter()) {
    for (const modelo of modelos) {
      if (estado.semCredito) break;
      // A busca do OpenRouter é cobrada por consulta, inclusive em modelo
      // gratuito: com busca, o gratuito daqui fica de fora e quem lê é o Gemini.
      if (busca && ehGratuito(modelo)) continue;
      if (!ehGratuito(modelo)) ofereceuPago = true;
      yield { provedor: 'openrouter', modelo };
    }
  }

  // Modelo pago respondeu mal: o problema é dele ou da pergunta, e o gratuito
  // não entra para esconder isso.
  if (ofereceuPago && !estado.semCredito) return;

  if (!chaveGoogle()) {
    if (!estado.avisouSemChaveGratuita) {
      estado.avisouSemChaveGratuita = true;
      console.warn('Sem GEMINI_API_KEY nem GOOGLE_GENERATIVE_AI_API_KEY: não há Gemini gratuito para responder.');
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
 * OpenRouter
 * ========================================================================== */

/**
 * O texto da mensagem, que pode chegar inteiro ou em partes.
 *
 * O formato de chat admite os dois: uma string, ou uma lista de partes em que
 * só as de texto interessam.
 */
function textoDaMensagem(conteudo) {
  if (typeof conteudo === 'string') return conteudo;
  if (!Array.isArray(conteudo)) return '';
  return conteudo
    .filter((parte) => parte?.type === 'text' || parte?.type === 'output_text')
    .map((parte) => parte.text ?? '')
    .join('');
}

/**
 * A resposta do OpenRouter, no formato que as rotinas leem.
 *
 * Separado da chamada para poder ser testado sem rede.
 */
export function lerRespostaOpenRouter(corpo, maxOutputTokens) {
  const escolha = corpo?.choices?.[0];
  if (!escolha) throw new Error('resposta sem mensagem');

  /*
   * Erro com status 200: a casa por trás do modelo caiu no meio da resposta, e
   * o OpenRouter entrega o que tinha com `finish_reason: "error"`. Texto pela
   * metade é JSON inválido — melhor a recusa dizer de onde veio.
   */
  if (escolha.error || escolha.finish_reason === 'error') {
    throw new Error(`o modelo falhou no meio da resposta (${escolha.error?.message ?? 'motivo não informado'})`);
  }

  // O teto cobre raciocínio e texto juntos: quem pensa demais devolve `length`
  // com a mensagem vazia, e isso não é "resposta sem JSON".
  if (escolha.finish_reason === 'length') {
    throw new Error(`resposta cortada (length) — o teto é ${maxOutputTokens} tokens`);
  }

  const mensagem = escolha.message ?? {};
  const texto = textoDaMensagem(mensagem.content);
  const anotacoes = (mensagem.annotations ?? [])
    .filter((a) => a?.type === 'url_citation' && a.url_citation?.url)
    .map((a) => ({ url: a.url_citation.url, title: a.url_citation.title }));

  const uso = corpo.usage ?? null;
  const buscas = uso?.server_tool_use?.web_search_requests ?? 0;

  return {
    texto,
    anotacoes,
    // A prova de que a busca rodou é a contagem do servidor; a citação é o
    // plano B, para a casa que busca e não conta.
    buscou: buscas > 0 || anotacoes.length > 0,
    tipos: [buscas > 0 || anotacoes.length ? 'web_search' : null, texto ? 'message' : null].filter(Boolean),
    custo: uso && {
      entrada: uso.prompt_tokens ?? 0,
      saida: uso.completion_tokens ?? 0,
      raciocinio: uso.completion_tokens_details?.reasoning_tokens ?? 0,
      buscas,
    },
  };
}

async function chamarOpenRouter(modelo, prompt, { maxOutputTokens, tentativa, busca = true }) {
  const resposta = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${chaveOpenRouter()}`,
      'content-type': 'application/json',
      'x-title': 'bf6-loadouts',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      /*
       * A busca é a ferramenta do próprio OpenRouter: usa a busca nativa da
       * casa quando ela tem uma, e a do Exa quando não tem. Quem decide buscar
       * é o modelo — não há como obrigar —, e por isso quem chama confere
       * `buscou` antes de aceitar a resposta. Sem busca, o modelo lê só o que
       * vai no prompt.
       */
      ...(busca ? { tools: [{ type: 'openrouter:web_search' }] } : {}),
      // Dito em voz alta: o padrão das casas é `medium`, e `max_tokens` cobre
      // raciocínio e texto no mesmo bolo. Modelo que não raciocina ignora.
      reasoning: { effort: 'low' },
      max_tokens: maxOutputTokens,
    }),
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || corpo.error) {
    // O erro pode vir com status 200 e o código de verdade dentro do corpo.
    const status = resposta.ok ? Number(corpo.error?.code) || resposta.status : resposta.status;
    const erro = new Error(
      corpo.error?.message ? `${status} ${corpo.error.message}` : `${status} ${resposta.statusText}`,
    );
    erro.status = status;
    erro.semCredito = ehFaltaDeCredito(status, corpo.error);

    const header = resposta.headers.get('retry-after');
    erro.esperarMs = header && !Number.isNaN(Number(header)) ? Number(header) * 1000 : recuo(tentativa);
    throw erro;
  }

  return lerRespostaOpenRouter(corpo, maxOutputTokens);
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
 * O texto da resposta do Gemini, no mesmo formato que o OpenRouter devolve.
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

async function chamarGemini(modelo, prompt, { maxOutputTokens, tentativa, busca = true }) {
  const resposta = await fetch(`${GEMINI_URL}/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': chaveGoogle(), 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(busca ? { tools: [{ google_search: {} }] } : {}),
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
export async function perguntarComBusca({ provedor, modelo }, prompt, { maxOutputTokens, tentativas = 3, busca = true }) {
  const chamar = provedor === 'google' ? chamarGemini : chamarOpenRouter;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const resposta = await chamar(modelo, prompt, { maxOutputTokens, tentativa, busca });
      return { ...resposta, modelo, provedor };
    } catch (erro) {
      ultimoErro = erro;

      if (erro.semCredito) {
        estado.semCredito = true;
        console.warn(`${modelo}: o OpenRouter está sem crédito — o resto da execução vai para o modelo gratuito.`);
        throw erro;
      }
      if (erro.modeloFora) {
        estado.gratuitosFora.add(modelo);
        throw erro;
      }
      // Espera maior que o teto é cota do dia — a dos gratuitos do OpenRouter
      // é contada por dia —, e insistir só gastaria a execução parada.
      if (erro.status === 429 && tentativa < tentativas && (erro.esperarMs ?? 0) <= ESPERA_MAXIMA_MS) {
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

/**
 * A mesma fila, sem busca: para quando o texto a ler já está no prompt.
 *
 * É o caso da análise do patch (`catalog/analisar-patch.ts`), que recebe o
 * patch note baixado da EA e as linhas do bf6balancelog. Buscar ali só abriria
 * espaço para o modelo trazer número de fora do texto oficial.
 */
export const perguntarSemBusca = (candidato, prompt, opcoes) =>
  perguntarComBusca(candidato, prompt, { ...opcoes, busca: false });
