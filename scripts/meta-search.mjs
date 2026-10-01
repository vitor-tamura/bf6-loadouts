#!/usr/bin/env node
/**
 * Relê o meta a partir de uma busca, uma vez por dia.
 *
 *   OPENROUTER_API_KEY=... node --experimental-strip-types scripts/meta-search.mjs
 *
 * Lê o que a comunidade está dizendo agora sobre as armas do multiplayer e
 * grava em `src/data/meta-live.json`, que a tela lê. São dois caminhos:
 *
 * 1. **Sem busca** — o script baixa as páginas que medem e as threads da
 *    semana (`meta/paginas.mjs`) e um modelo gratuito do OpenRouter só lê o que
 *    recebeu. É o caminho de todo dia.
 * 2. **Com busca** — um modelo com a busca na web ligada procura por conta
 *    própria. Entra quando o primeiro não fecha: página fora do ar, Reddit
 *    recusando o rastreador, trending sem conversa suficiente. Quando os picks
 *    do primeiro caminho se sustentam, a busca só completa o trending.
 *
 * ## Por que o OpenRouter
 *
 * A primeira versão perguntava ao Gemini numa chave do free tier e nunca
 * publicou uma leitura; a segunda usava uma chave paga da OpenAI, com o Gemini
 * gratuito de reserva para o dia em que o crédito acabasse. Eram duas chaves e
 * dois formatos de pedido para manter.
 *
 * Agora a chave paga é a do OpenRouter, e o modelo é um nome do catálogo dele
 * — ver `meta/provedores.mjs`. O custo segue de centavos: uma chamada por dia,
 * com busca e um punhado de tokens.
 *
 * O Gemini gratuito continua de reserva, e só para o dia em que o crédito do
 * OpenRouter acabar. A resposta dele passa pelas mesmas travas, e a leitura
 * gravada diz qual modelo a escreveu.
 *
 * ## O que impede bobagem de entrar
 *
 * Ninguém revisa antes de publicar. A primeira leitura que saiu daqui mostrou
 * que conferir o nome da arma não basta: as oito armas existiam, e mesmo assim
 * o trending era o meta repetido, com rótulos que só diziam "está subindo" e
 * motivos copiados entre armas. As travas de hoje estão em `meta/leitura.mjs`,
 * separadas justamente para poderem ser testadas, e o prompt daqui é a outra
 * metade: ele diz que dia é hoje, manda descobrir o patch em vigor antes de
 * classificar qualquer coisa e cobra o fato concreto por trás de cada arma.
 *
 * Resposta que não passa nas travas não vira arquivo — vai para o próximo
 * modelo da fila, e se nenhum passar o dia fica com a leitura anterior.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { HIGHLIGHTS, SOURCES, TRENDING } from '../src/data/meta.ts';
import { SEASONS, phaseOn, seasonOn } from '../src/data/season.ts';
import { WEAPONS } from '../src/data/weapons.ts';
import {
  LIMITES,
  confiabilidade,
  dominiosQueSustentamPicks,
  extrairJson,
  listasBrutas,
  montarLeitura,
} from './meta/leitura.mjs';
import { ancorarFontes, lerConversa, lerPaginasQueMedem } from './meta/paginas.mjs';
import { briefingDoPatch, fontesDoPatch, patchAtual } from './meta/patch-atual.mjs';
import { candidatos, modelosDe, perguntarComBusca, temAlgumaChave } from './meta/provedores.mjs';

const DESTINO = new URL('../src/data/meta-live.json', import.meta.url);

function numeroConfig(valor, padrao) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : padrao;
}

/*
 * Folga de sobra no tamanho da resposta: dezesseis armas com motivo, mais cinco
 * fontes com data e escopo, passam de mil tokens, e resposta cortada no meio é
 * JSON inválido — a leitura do dia se perde por economia de fração de centavo.
 */
/*
 * O teto cobre raciocínio, chamadas de busca **e** o texto final.
 *
 * Com 2500 o gpt-5-mini gastava tudo antes de escrever a mensagem e devolvia
 * uma resposta vazia; com 8000 ainda cortava. Buscar em várias páginas e depois
 * resumir 8 armas não cabe num orçamento apertado.
 *
 * É teto, não reserva: quem responde em 3 mil tokens paga 3 mil. O número alto
 * não encarece a rodada boa — evita a rodada perdida, que custa a chamada
 * inteira e não entrega nada.
 */
const MAX_OUTPUT_TOKENS = numeroConfig(process.env.OPENROUTER_META_MAX_OUTPUT_TOKENS, 12_000);
/*
 * O teto da leitura sem busca é menor: não há chamada de busca para caber
 * nele, só o raciocínio e o JSON. E modelo gratuito tem teto de saída próprio,
 * que um pedido de doze mil tokens pode estourar antes de começar.
 */
const MAX_OUTPUT_TOKENS_SEM_BUSCA = numeroConfig(process.env.OPENROUTER_META_READ_MAX_OUTPUT_TOKENS, 6000);
const MAX_TENTATIVAS = numeroConfig(process.env.OPENROUTER_META_RETRIES, 3);
const FALHAR_SEM_ATUALIZAR = process.env.OPENROUTER_META_STRICT === '1';

/*
 * A fila de modelos, que vale para os dois caminhos.
 *
 * Sem busca, quem lê são os gratuitos do OpenRouter, com o Gemini gratuito de
 * reserva. Com busca, os gratuitos do OpenRouter ficam de fora — a busca dele
 * é cobrada por consulta até em modelo gratuito, e foi ela que estourou o teto
 * da chave — e quem procura é o Gemini, com a busca do Google na cota gratuita
 * dele (ver `meta/provedores.mjs`).
 *
 * Já foi diferente: a fila teve o `gpt-4.1-mini`, que gravou o trending
 * genérico que motivou as travas de `meta/leitura.mjs`, e depois o
 * `gpt-5.6-luna`, pago. As travas continuam valendo para quem quer que
 * responda.
 *
 * `OPENROUTER_META_MODELS` ainda aceita um modelo pago do catálogo do
 * OpenRouter (`openai/gpt-5.6-luna`): ele busca pelo OpenRouter, por conta do
 * crédito de quem o configurar.
 */
const MODELOS = modelosDe(process.env.OPENROUTER_META_MODELS);

const HOJE = new Date().toISOString().slice(0, 10);

/*
 * A temporada em curso, tirada do calendário do próprio site. É o que dá ao
 * modelo o "quando" da pergunta: sem isso, "temporada atual" é o que o índice
 * de busca tiver à mão, e a leitura sai apoiada em guia de antes do patch.
 */
const TEMPORADA = seasonOn(new Date(`${HOJE}T12:00:00Z`)) ?? SEASONS.at(-1);
const FASE = phaseOn(new Date(`${HOJE}T12:00:00Z`), TEMPORADA);
const TIMEFRAME = `season-${TEMPORADA.number}`;

const ARMAS_PERMITIDAS = WEAPONS.map((w) => w.name).join(', ');

/*
 * Os domínios que podem pôr uma arma no topo, ditos por quem decide.
 *
 * Estavam escritos duas vezes — uma no prompt, outra no classificador de
 * `meta/leitura.mjs` — e as duas listas já tinham divergido: o prompt nomeava
 * cinco sites de análise e o código aceita oito. Três fontes boas eram
 * recusadas antes de existir, porque o modelo não sabia que podia abri-las.
 */
const DOMINIOS_DE_PICKS = dominiosQueSustentamPicks()
  .map((dominio) => `\`${dominio}\``)
  .join(', ');

/*
 * As páginas que medem, com endereço, tiradas da curadoria do próprio site.
 *
 * A rodada de 04/09 é o motivo: o modelo fez quatro buscas, voltou com oito
 * armas sustentadas em fórum e Reddit e perdeu as oito na trava — nunca chegou
 * a abrir uma página que mede. Procurar por elas é gasto e é sorte; o endereço
 * está em `src/data/meta.ts` desde sempre.
 *
 * Sai de `SOURCES` filtrado pelo mesmo classificador que julga a resposta, e
 * não de uma lista à parte: assim, o dia em que alguém curar uma fonte de
 * análise nova, ela entra aqui sozinha — e o dia em que uma sair, ela some
 * daqui junto.
 */
const PAGINAS_QUE_MEDEM = SOURCES.filter((fonte) => confiabilidade(fonte.url) === 'analise')
  .map((fonte) => `- ${fonte.url}\n  ${fonte.scope}`)
  .join('\n');

/*
 * A atualização em vigor vem do catálogo, e não da busca.
 *
 * Antes, a primeira coisa que o prompt mandava fazer era descobrir na busca
 * qual é o patch mais recente — uma pergunta cuja resposta está em disco, num
 * arquivo que o pipeline do catálogo escreve a cada versão nova. Sair
 * perguntando custava chamadas de busca e o contexto das páginas abertas, e
 * ainda errava: índice de busca alcança patch novo devagar, e a leitura de
 * 02/09 saiu apontando a 1.4.1.5, de 04/08, com a 1.4.2.5 no ar desde 31/08.
 *
 * Com o fato dado, a busca inteira desta rodada vai para o que só a comunidade
 * sabe: que armas estão fortes e do que se fala.
 */
const PATCH = patchAtual();

/*
 * Sem catálogo em disco, a pergunta antiga volta — é pior e mais cara, mas o
 * silêncio seria a tela anunciar um jogo sem dizer de que versão fala.
 */
const SECAO_DO_PATCH =
  briefingDoPatch(PATCH) ||
  `## 1. Antes de classificar qualquer arma

Descubra na busca:
- qual é a atualização mais recente do jogo e em que dia ela saiu;
- que armas ela mexeu — dano, TTK, recuo, cadência, alcance, munição, acessórios;
- se ela mudou o equilíbrio ou não encostou em arma.

Essa data manda no resto da leitura. Guia ou tier list publicado antes dela só vale se alguma coisa posterior o confirmar.`;

/*
 * O prompt em três partes, porque os dois caminhos só diferem no meio.
 *
 * A abertura (data, temporada, patch) e as regras (o que é cada lista, como
 * escrever, limites, formato) valem para qualquer leitura. O que muda é de
 * onde vem a evidência: da busca do modelo, ou do material que o script baixou.
 */
const ABERTURA = `Hoje é ${HOJE}. Monte a leitura de hoje do meta de armas do Battlefield 6, considerando SOMENTE o multiplayer tradicional. REDSEC, battle royale e modos derivados ficam de fora, inclusive quando a fonte só fala deles.

O jogo está na Temporada ${TEMPORADA.number} — ${TEMPORADA.name}, começada em ${TEMPORADA.startsOn}, fase "${FASE.name}" desde ${FASE.startsOn}.

${SECAO_DO_PATCH}`;

const ONDE_PROCURAR = `## 2. Janela de tempo

- Últimas 24 h: mudança quente, prioridade máxima.
- Últimos 7 dias: é o que sustenta trending.
- Últimos 30 dias: contexto.

Informação mais recente pesa mais. Não repita tier list antiga.

## 3. Onde procurar

As duas listas não se abastecem no mesmo lugar, e a ordem importa: **os picks primeiro**, porque são eles que dependem de uma página específica. Tendência se acha em qualquer lugar, e por isso pode esperar.

### 3.0. Abra estas páginas antes de qualquer busca

São as que medem arma por arma no multiplayer, e o endereço delas já está apurado. Não procure por elas — abra:

${PAGINAS_QUE_MEDEM}

Isto não é sugestão. A rodada de 04/09 gastou quatro buscas e voltou com oito armas sustentadas em fórum e Reddit: as oito foram descartadas pelo código e o dia ficou sem leitura nenhuma. Fórum e Reddit provam que se **fala** da arma — nunca que ela é forte, e força é o que o topo afirma.

**Não tente abrir \`ea.com\`.** As páginas de Battlefield no site da EA ficam atrás de um portão de verificação de idade, e o que volta de lá é o formulário de data de nascimento, não o patch note — gastar busca ali é gastar duas vezes, porque depois falta a que resolveria. As palavras oficiais você já tem: estão na seção 1, transcritas da página. Cite o endereço da EA quando a evidência for o changelog, e leia o changelog na seção 1 ou no \`bf6balancelog.com\`, que existe justamente para publicar cada linha da EA sem esse portão.

Se, depois de abertas, essas páginas sustentarem menos de oito armas, entregue as que elas sustentarem. Quatro armas com número valem mais que oito com conversa, e a lista curta o código aceita. A lista inteira apoiada em thread, não.

**Para picks**, procure quem testa e argumenta desempenho depois do patch: análise de balanceamento, tier list ou ranking de meta que explique **por que** a arma é forte, tabela de TTK, dano, recuo ou alcance, discussão técnica em fórum e comunidade especializada. Termos que costumam achar: "meta", "best weapons", "tier list", "weapon ranking", "TTK chart", "after patch", com o número da temporada junto. Posição em ranking de meta vale como julgamento de força da fonte. Uso alto sozinho não põe arma em picks — isso é trending.

**Para trending**, procure volume de conversa e de uso — de que a comunidade está falando e o que ela está levando para a partida:
- fórum oficial da EA — forums.ea.com e answers.ea.com, seções de Battlefield 6, tanto discussão geral quanto relato de bug;
- Reddit recente — r/Battlefield6, r/Battlefield, r/BF6 —, por "everyone is using", "why is everyone using", "most used", "broken", "new build", "meta right now";
- comentários e relatos de quem joga sobre o que anda aparecendo em toda partida;
- tracker ou comparador que publique uso, quando houver — é a única coisa parecida com medição que existe aqui.

O que a atualização mexeu você já tem na seção 1 e não precisa procurar. Se ainda assim faltar o histórico de uma arma específica — que patches mexeram nela e o que cada um fez —, \`bf6balancelog.com\` transcreve o changelog oficial arma por arma e tem página por arma e por peça. É uma consulta dirigida, não uma varredura: só vale a pena quando uma arma que você já escolheu precisa da frase exata do patch.

**Quem pode sustentar cada lista.** Isto é verificado no código, e arma que não passar é descartada antes de a leitura ser gravada:

- **picks** só aceitam estes domínios: ${DOMINIOS_DE_PICKS} — mais análise equivalente que publique número. Em \`wzstats.gg\`, só caminho de multiplayer;
- **trending** aceita qualquer uma dessas mais fórum, Reddit, Steam, vídeo e comentário — é onde a conversa está, e conversa é o que essa lista mede.

Fórum e Reddit **não** põem arma em picks, por mais convincente que seja a thread: eles provam que se fala da arma, não que ela é forte. Se a única evidência que você achou para uma arma forte é conversa, ponha a arma em trending e diga isso no motivo. Material de marketing — site de VPN, loja, guia patrocinado — não sustenta nenhuma das duas.

Nenhum site sozinho decide. O mesmo site em idiomas diferentes (/pt, /es) conta como uma fonte só. Fórum e Reddit mostram percepção, não medição: quando eles disserem que uma arma é absurda e os números não confirmarem, diga isso no motivo em vez de tratar como fato.

## 3.1. O modo está no endereço, não no texto

Este é o erro que mais estraga esta leitura, e ele **não parece** erro: uma lista de armas que existem, bem escrita, publicada ontem — descrevendo o battle royale.

Os rastreadores que ranqueiam os dois modos separam por caminho, e só o caminho declara o modo:

- \`wzstats.gg/battlefield-6/multiplayer/...\` → **serve**;
- \`wzstats.gg/battlefield-6/meta\` e \`wzstats.gg/battlefield-6/ranked/meta\` → REDSEC, **não serve** (o Ranqueado do BF6 é battle royale);
- endereço com \`redsec\` ou \`battle-royale\` em qualquer parte → não serve;
- raiz de site de meta, sem \`multiplayer\` no caminho → assuma battle royale.

O teste de sanidade é a KTS100 MK8: ela é a primeira colocada **geral** do REDSEC e não chega ao pódio das metralhadoras do multiplayer. Se ela aparecer no topo da sua lista, você está lendo o modo errado — recomece.

Guia editorial que não diz de que modo fala está no mesmo caso: por padrão essas matérias descrevem o battle royale, porque é dele que vêm os vídeos. Sem uma frase que prove o modo, a fonte não entra.

Fonte publicada antes de ${TEMPORADA.startsOn} — o começo da temporada — não sustenta posição nenhuma. Ela pode aparecer como contexto no motivo, nunca como a evidência que põe a arma na lista. E o campo "patch" precisa ser uma atualização desta temporada: apontar um patch anterior a ${TEMPORADA.startsOn} anula a leitura inteira, porque a tela passa a anunciar hoje o jogo de dois meses atrás.`;

const REGRAS = `## 4. Uma lista é força, a outra é conversa

META: as armas **mais fortes depois da atualização mais recente**, segundo quem testa e analisa — TTK, dano, controle, alcance, versatilidade, consistência, desempenho no jogo de nível alto. Uso alto sozinho não põe arma aqui; força que só apareceu antes do patch, também não.

TRENDING: as armas **mais comentadas e/ou mais usadas** pela comunidade e pelas fontes especializadas nesta semana — do que se fala, o que aparece em toda partida, que build viralizou, para onde as pessoas migraram. Não precisa ser forte, e a arma não precisa ter mudado: basta que a conversa ou o uso estejam ali, com onde isso foi visto.

As duas se cruzam de vez em quando — arma forte costuma ser usada —, mas uma não é a outra em outra ordem. Prefira em trending armas que não estão em picks. Uma arma pode aparecer nas duas listas, no máximo duas ao todo, e só quando a evidência da conversa ou do uso estiver dita.

## 5. Como escrever cada arma

- "reason": uma frase em português do Brasil com o fato concreto. Em picks, o que sustenta a força: o número, o teste, a análise, a posição no ranking, o que o patch fez com ela. Em trending, onde a conversa ou o uso foi visto: a thread, o vídeo, o relato, a build que apareceu. Duas armas nunca com a mesma frase.
- Elogio sem fato é recusado pelo código, e a frase inteira cai junto com a arma: "desempenho superior", "escolha dominante", "domina o meta", "uma das melhores armas", "altamente versátil", "muito eficaz", "eficaz em diversas situações", "excelente desempenho". Se a sua frase caberia igual em outra arma da lista, ela não é evidência.
- "trend": rótulo curto do assunto daquela arma, do que mudou nela e etc — "build full-auto", "todo mundo usando", "reclamação de recuo", "chegou no patch", "migração da X". Não use "popularidade crescente", "aumento de uso", "tendência crescente" nem qualquer sinônimo de "está subindo": isso vale para a seção inteira e não informa nada.
- "source": a URL, entre as que você listar em "sources", que sustenta aquela arma.

## 6. Limites

- No máximo ${LIMITES.picks} armas em picks, da mais forte para a menos forte.
- No máximo ${LIMITES.trending} armas em trending, da mais comentada ou usada para a menos.
- No máximo ${LIMITES.fontes} fontes, e nenhuma publicada antes de ${TEMPORADA.startsOn} — data anterior ao começo da temporada é descartada, e a arma que dependia dela cai junto.
- **Toda página que você citar em \`source\` tem de estar em \`sources\`.** O código resolve o \`source\` de cada arma contra essa lista, e arma que aponta endereço de fora é descartada — foi assim que a rodada de 04/09 perdeu duas de quatro armas em trending. Se uma thread sustenta uma arma, liste a thread. Use as ${LIMITES.fontes} vagas: as páginas que medem ocupam as primeiras, e o trending precisa das outras para citar onde a conversa aconteceu.
- Repetir a mesma fonte em duas armas é permitido quando é verdade. Inventar uma segunda fonte para não repetir, não.
- Use exatamente estes nomes de arma, sem apelido e sem acessório junto: ${ARMAS_PERMITIDAS}.
- Não invente pick rate, TTK, tendência nem fala de comunidade. Sem evidência, a arma fica de fora: quatro armas sustentadas valem mais que oito preenchidas.

## 7. Resposta

Responda SOMENTE com este JSON, sem cercas de código e sem texto antes ou depois:

{"picks":[{"weapon":"NOME EXATO DA ARMA","reason":"o que mostra que ela está forte depois do patch e por que esta forte agora","source":"https://..."}],"trending":[{"weapon":"NOME EXATO DA ARMA","trend":"do que se fala nela","reason":"onde a conversa ou o uso recente foi visto","source":"https://..."}],"sources":[{"name":"nome curto da fonte","url":"https://...","date":"YYYY-MM-DD","scope":"por que essa fonte vale para o multiplayer"}]}`;

const PROMPT = [ABERTURA, ONDE_PROCURAR, REGRAS].join('\n\n');

function temMetaLiveValida() {
  try {
    const atual = JSON.parse(readFileSync(DESTINO, 'utf8'));
    return Boolean(atual?.picks?.length || atual?.trending?.length || SOURCES.length);
  } catch {
    return SOURCES.length > 0;
  }
}

/**
 * O prompt da leitura sem busca: a mesma abertura e as mesmas regras, com o
 * material baixado no lugar das instruções de onde procurar.
 */
function promptSemBusca({ paginas, conversa }) {
  const blocosDePagina = paginas
    .map((pagina, i) => `[P${i + 1}] ${pagina.name}\nURL: ${pagina.url}\nEscopo: ${pagina.scope}\nTexto:\n"""\n${pagina.texto}\n"""`)
    .join('\n\n');

  const blocosDeConversa = conversa.length
    ? conversa
        .map(
          (thread, i) =>
            `[T${i + 1}] ${thread.date ?? 'sem data'} — ${thread.title}\nURL: ${thread.url}\nArmas citadas: ${thread.armas.join(', ')}\nTrecho: ${thread.text || '(só o título)'}`,
        )
        .join('\n\n')
    : 'Hoje não foi possível baixar conversa nenhuma. Devolva "trending": [] — não preencha a lista com o ranking.';

  return [
    ABERTURA,
    `## 2. O material desta leitura

Você **não tem busca**. Tudo o que pode usar está transcrito abaixo, baixado hoje pelo script desta rotina. Não cite página, número, thread ou fala que não esteja aqui: endereço de fora deste material é descartado pelo código, e a arma cai junto.

### 2.1. Páginas que medem — sustentam os picks

Cada bloco é o texto de uma página de ranking do multiplayer, na ordem em que a página lista as armas. A posição no ranking é o julgamento de força da fonte.

${blocosDePagina}

### 2.2. Conversa da semana — sustenta o trending

Threads do r/Battlefield6 dos últimos sete dias que citam arma do arsenal, da mais recente para a mais antiga. Elas provam que se **fala** da arma; não provam que ela é forte.

${blocosDeConversa}

### 2.3. Como usar o material

- Em "source", copie a URL exatamente como aparece acima.
- **Picks** saem só das páginas de 2.1. No motivo, diga a posição da arma no ranking — a geral e a da classe — e, quando a seção 1 disser o que o patch fez com ela, diga também. Duas armas nunca com a mesma frase.
- **Trending** sai só das threads de 2.2. Uma arma entra quando alguma thread fala dela de fato — reclamação, dúvida, build, comparação. Citação de passagem numa lista de armas não é conversa. Diga no motivo o que a thread discute.
- Thread sobre REDSEC, battle royale ou Gauntlet não sustenta nada aqui.
- Se o material sustentar menos armas que o limite, entregue as que ele sustentar. Lista curta o código aceita; lista preenchida de memória, não.`,
    REGRAS,
  ].join('\n\n');
}

/** Pergunta a um candidato e põe no log o que a resposta custou. */
async function perguntar(candidato, prompt, opcoes) {
  const { modelo } = candidato;
  console.log(`Perguntando ao ${modelo} (${candidato.provedor}${opcoes.busca === false ? ', sem busca' : ''})…`);

  const resposta = await perguntarComBusca(candidato, prompt, { tentativas: MAX_TENTATIVAS, ...opcoes });
  const { texto, buscou, tipos, custo } = resposta;

  console.log(`  ${modelo}: ${tipos.join(', ') || 'resposta vazia'}${buscou || opcoes.busca === false ? '' : ' — sem busca'}`);
  if (custo) {
    console.log(
      `  ${modelo}: ${custo.entrada} tokens de entrada, ${custo.saida} de saída ` +
        `(${custo.raciocinio} de raciocínio), ${custo.buscas} busca(s).`,
    );
  }

  const bruto = extrairJson(texto);
  if (!bruto) {
    const amostra = texto.replace(/\s+/g, ' ').slice(0, 220);
    throw new Error(`resposta sem JSON${amostra ? `: ${amostra}` : ''}`);
  }
  return { ...resposta, bruto };
}

/*
 * A atualização que a tela anuncia sai do catálogo, e não da resposta.
 *
 * O modelo não é mais perguntado sobre isso — o prompt já lhe deu o número —, e
 * pedir de volta o que se acabou de informar seria pagar tokens para receber ou
 * a mesma coisa, ou uma pior. Quando o catálogo não tem a versão em disco,
 * `patchConhecido` vem nulo e a resposta do modelo volta a valer, que é o
 * caminho antigo.
 *
 * O rótulo da EA vem em caixa alta — "BATTLEFIELD 6 GAME UPDATE 1.4.2.5" —, e
 * quem lê a tela quer o número, não o grito.
 */
const CONTEXTO_DA_LEITURA = {
  hoje: HOJE,
  timeframe: TIMEFRAME,
  patchConhecido: PATCH && { name: `Atualização ${PATCH.version}`, date: PATCH.releasedAt },
};

/**
 * O que o script consegue baixar hoje.
 *
 * As duas idas são independentes: página de ranking fora do ar não impede a
 * conversa, e o Reddit recusando não impede os picks.
 */
async function juntarMaterial() {
  const [paginas, conversa] = await Promise.all([
    lerPaginasQueMedem(SOURCES, { hoje: HOJE }),
    lerConversa({ desde: TEMPORADA.startsOn }),
  ]);
  console.log(`Material baixado: ${paginas.length} página(s) que medem, ${conversa.length} thread(s) que citam arma.`);
  return { paginas, conversa };
}

/**
 * O primeiro caminho: um modelo sem busca lê o material baixado.
 *
 * Devolve a leitura pronta, ou `null` quando nenhum modelo da fila entregou
 * uma que passe nas travas.
 */
async function lerSemBusca(material) {
  const prompt = promptSemBusca(material);

  for await (const candidato of candidatos(MODELOS, { busca: false })) {
    const { modelo } = candidato;
    try {
      const resposta = await perguntar(candidato, prompt, {
        maxOutputTokens: MAX_OUTPUT_TOKENS_SEM_BUSCA,
        busca: false,
      });

      // As listas com o nome canônico, e as fontes presas ao que foi baixado.
      const bruto = ancorarFontes({ ...resposta.bruto, ...listasBrutas(resposta.bruto) }, material);

      const leitura = montarLeitura({
        bruto,
        // Não houve busca do modelo, e não precisava: as páginas foram abertas
        // pelo script, e as fontes acima são exatamente elas.
        buscou: true,
        modelo,
        ...CONTEXTO_DA_LEITURA,
      });

      return {
        ...leitura,
        picks: bruto.picks,
        fontesDosPicks: ancorarFontes({ picks: bruto.picks }, material).sources,
        modelo,
      };
    } catch (erro) {
      console.warn(`${modelo}: ${erro.message}`);
    }
  }

  return null;
}

/**
 * O segundo caminho: um modelo com busca procura por conta própria.
 *
 * Com `base`, os picks já foram lidos sem busca e ficam como estão: a resposta
 * daqui só entra com o trending. As páginas dos picks vão na frente da lista
 * de fontes, como páginas abertas — foram, pelo script —, para não perderem o
 * lugar para as que a busca abrir.
 */
async function lerComBusca(base) {
  let ultimoErro = null;

  for await (const candidato of candidatos(MODELOS)) {
    try {
      const resposta = await perguntar(candidato, PROMPT, { maxOutputTokens: MAX_OUTPUT_TOKENS });

      let { bruto, anotacoes } = resposta;
      let modelo = candidato.modelo;

      if (base) {
        bruto = {
          ...bruto,
          ...listasBrutas(bruto),
          picks: base.picks,
          sources: [...base.fontesDosPicks, ...(bruto.sources ?? [])],
        };
        anotacoes = [...base.fontesDosPicks.map((fonte) => ({ url: fonte.url, title: fonte.name })), ...anotacoes];
        modelo = `${base.modelo} + ${modelo}`;
      }

      return {
        ...montarLeitura({ bruto, anotacoes, buscou: resposta.buscou, modelo, ...CONTEXTO_DA_LEITURA }),
        modelo,
      };
    } catch (erro) {
      ultimoErro = erro;
      console.warn(`${candidato.modelo}: ${erro.message}`);
    }
  }

  if (ultimoErro) console.warn(`Leitura com busca não saiu. Último erro: ${ultimoErro.message}`);
  return null;
}

/** Grava a leitura, se ela mudou. */
function gravar({ conteudo, descartes }) {
  for (const { nome, motivo } of descartes) console.warn(`Descartada — ${nome}: ${motivo}`);

  // A atualização em vigor entra na lista de fontes pelo catálogo, no fim,
  // sem mexer na numeração que os cartões já citam.
  const citadas = new Set(conteudo.sources.map((f) => f.name));
  conteudo.sources.push(...fontesDoPatch(PATCH, { timeframe: TIMEFRAME }).filter((f) => !citadas.has(f.name)));

  const anterior = (() => {
    try {
      return readFileSync(DESTINO, 'utf8');
    } catch {
      return null;
    }
  })();

  const novo = `${JSON.stringify(conteudo, null, 2)}\n`;
  if (anterior === novo) {
    console.log('Nada mudou.');
    return;
  }

  writeFileSync(DESTINO, novo);
  const patch = conteudo.patch ? `${conteudo.patch.name ?? 'patch'} de ${conteudo.patch.date ?? 'data desconhecida'}` : 'patch não identificado';
  console.log(
    `Gravado por ${conteudo.model}: ${conteudo.picks.length} armas, ${conteudo.trending.length} trending, ${conteudo.sources.length} fontes (${patch}).`,
  );
}

async function main() {
  // O prompt muda sozinho todo dia — data, temporada, fase, arsenal. Ver o que
  // vai ser perguntado hoje não deveria custar uma chamada.
  if (process.argv.includes('--prompt')) {
    console.log(PROMPT);
    return;
  }
  // O mesmo para a leitura sem busca: baixa o material e mostra o que o modelo
  // receberia, sem perguntar a ninguém.
  if (process.argv.includes('--material')) {
    console.log(promptSemBusca(await juntarMaterial()));
    return;
  }

  if (!temAlgumaChave()) {
    console.error('Falta OPENROUTER_API_KEY ou GEMINI_API_KEY.');
    process.exit(1);
  }

  const material = await juntarMaterial();
  const semBusca = material.paginas.length ? await lerSemBusca(material) : null;

  if (semBusca && semBusca.conteudo.trending.length >= LIMITES.minimoDeTrending) {
    gravar(semBusca);
    return;
  }

  console.log(
    semBusca
      ? `Picks lidos sem busca; o trending ficou em ${semBusca.conteudo.trending.length} — a busca tenta completar.`
      : 'A leitura sem busca não saiu — vai para a leitura com busca.',
  );

  const comBusca = await lerComBusca(semBusca);
  if (comBusca) {
    gravar(comBusca);
    return;
  }

  // Picks sustentados com trending curto ainda são leitura: a tela completa a
  // tendência pelo catálogo, e dizer menos é melhor que repetir a de ontem.
  if (semBusca) {
    gravar(semBusca);
    return;
  }

  console.error('Nenhum modelo entregou leitura utilizável.');

  if (!FALHAR_SEM_ATUALIZAR && temMetaLiveValida()) {
    console.warn(
      `Mantendo a meta atual/fallback estático: ${HIGHLIGHTS.length} armas meta, ${TRENDING.length} trending, ${SOURCES.length} fontes.`,
    );
    return;
  }

  process.exit(1);
}

await main();
