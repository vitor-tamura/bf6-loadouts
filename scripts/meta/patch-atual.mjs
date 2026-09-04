/**
 * A atualização em vigor, lida do catálogo em vez de procurada na web.
 *
 * Este repositório já sabe qual é o patch em vigor: o pipeline do catálogo
 * descobre a versão na página de novidades da EA, baixa o patch note inteiro e
 * o guarda em `data/patches/<versão>.json`, com a versão registrada em
 * `data/versions/<versão>/metadata.json`. É informação apurada, datada e
 * conferida — e mesmo assim nada dela chegava ao prompt da leitura do meta.
 *
 * ## O que isso custava
 *
 * A leitura mandava o modelo *descobrir na busca* qual é a atualização mais
 * recente antes de classificar qualquer arma. Duas contas erradas de uma vez:
 *
 * - **Custo.** Uma pergunta cuja resposta está em disco virava chamadas de
 *   busca pagas, com o conteúdo das páginas entrando no contexto, mais o
 *   raciocínio para conciliá-las. Tudo isso sai do mesmo `max_output_tokens`
 *   que precisa sobrar para escrever a leitura.
 *
 * - **Precisão.** Índice de busca premia página antiga e linkada, não página
 *   nova. A leitura de 02/09 saiu apontando a 1.4.1.5, de 04/08 — duas versões
 *   atrás — enquanto a 1.4.2.5 estava no ar desde 31/08 e no catálogo desde
 *   03/09. A tela anunciava "revisado hoje" e descrevia o jogo do mês passado.
 *
 * Fato que o repositório tem não se pergunta a modelo nenhum. O que sobra para
 * a busca é o que só a comunidade sabe: que armas estão fortes e do que se
 * fala. É onde o dinheiro da chamada rende.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const VERSOES = join(RAIZ, 'data', 'versions');
const PATCHES = join(RAIZ, 'data', 'patches');

/** `1.4.2.5` vem depois de `1.4.1.15`? Não: cada grupo é número, não texto. */
function compararVersoes(a, b) {
  const partes = (versao) => versao.split('.').map(Number);
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const diferenca = (x[i] ?? 0) - (y[i] ?? 0);
    if (diferenca) return diferenca;
  }
  return 0;
}

const ehVersao = (valor) => /^\d+\.\d+\.\d+\.\d+$/.test(valor);

function lerJson(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * A versão que o catálogo diz estar em vigor.
 *
 * `status: "current"` é a resposta quando existe — é o próprio pipeline
 * declarando qual é a de agora. A maior versão é o desempate, e não o
 * critério: uma pasta escrita pela metade por uma execução interrompida tem
 * número alto e não é o estado do jogo.
 */
export function versaoAtual() {
  if (!existsSync(VERSOES)) return null;

  const versoes = readdirSync(VERSOES, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory() && ehVersao(entrada.name))
    .map((entrada) => entrada.name)
    .sort(compararVersoes);

  if (!versoes.length) return null;

  const metadados = versoes
    .map((version) => ({ version, meta: lerJson(join(VERSOES, version, 'metadata.json')) }))
    .filter((entrada) => entrada.meta);

  const declarada = metadados.find((entrada) => entrada.meta.status === 'current');
  return declarada ?? metadados.at(-1) ?? { version: versoes.at(-1), meta: null };
}

/**
 * O corpo do changelog, sem o site em volta e sem o REDSEC.
 *
 * A leitura do meta é do multiplayer tradicional, e o patch note traz os dois
 * modos no mesmo texto, separados por um cabeçalho `REDSEC`. Mandar o bloco
 * inteiro para o prompt seria pedir ao modelo que ignorasse metade do que
 * acabou de receber — e essa é justamente a regra que ele mais erra.
 */
/** Os cabeçalhos que abrem o corpo do artigo, depois do site em volta. */
const ABERTURA = /^\s*(NEW CONTENT|CHANGELOG|MAJOR UPDATES? FOR [\d. ]+)\s*:?\s*$/i;

/**
 * Onde o artigo começa de verdade.
 *
 * O patch note grande traz um sumário — `TABLE OF CONTENTS:` seguido de
 * `NEW CONTENT`, `CHANGELOG`, `REDSEC` — e os mesmos títulos reaparecem
 * adiante, agora com texto embaixo. Cortar no primeiro `CHANGELOG` pegava a
 * linha do sumário, e o `REDSEC` da linha seguinte fechava o corpo antes de
 * ele começar: a 1.4.2.0, que tem armas novas e vinte linhas na seção de
 * armas, saía daqui com zero.
 *
 * Vale a última ocorrência de cada título — a do corpo — e, entre elas, a que
 * vem primeiro: `NEW CONTENT` anuncia o que entrou no jogo, e é conteúdo que a
 * leitura do meta precisa tanto quanto o changelog.
 */
function inicioDoCorpo(linhas) {
  const ultima = new Map();
  linhas.forEach((linha, indice) => {
    const cabecalho = linha.match(ABERTURA);
    if (cabecalho) ultima.set(cabecalho[1].trim().toUpperCase(), indice);
  });

  const indices = [...ultima.values()];
  return indices.length ? Math.min(...indices) : -1;
}

export function changelogDeMultiplayer(raw) {
  const linhas = raw.split('\n');
  const inicio = inicioDoCorpo(linhas);
  const corpo = inicio >= 0 ? linhas.slice(inicio + 1) : linhas;

  const redsec = corpo.findIndex((linha) => /^\s*REDSEC\s*$/.test(linha));
  return (redsec > 0 ? corpo.slice(0, redsec) : corpo).join('\n');
}

/** `WEAPONS:`, `UI & HUD:` — o cabeçalho que abre uma seção do changelog. */
const CABECALHO = /^\s*([A-Z][A-Z0-9 &/-]{2,30}):\s*$/;

/** As seções que falam do que se leva para a partida. */
const SECOES_DE_ARMA = /^(WEAPONS?|ATTACHMENTS?|GUNSMITH)$/;

/** Fora dessas seções, é a palavra que denuncia mudança de arma. */
const ASSUNTO_DE_ARMA =
  /\b(weapons?|attachments?|rifles?|carbines?|SMGs?|LMGs?|DMRs?|snipers?|shotguns?|sidearms?|barrels?|muzzles?|magazines?|grips?|optics?|sights?|ammo|recoil|damage|TTK|rate of fire|spread|velocity)\b/i;

/**
 * O que fala de arma montada em veículo, e não de arma de infantaria.
 *
 * "Helicopter miniguns can now damage enemy soldiers who are in the water" tem
 * a palavra `damage` e nada a ver com esta leitura, que é do arsenal que o
 * jogador leva a pé. Sem este corte, metade do briefing vira linha de veículo
 * — e cada linha à toa é contexto pago que empurra a resposta para o assunto
 * errado.
 */
const E_DE_VEICULO =
  /\b(vehicles?|helicopters?|tanks?|jets?|aircraft|airplanes?|boats?|miniguns?|turrets?|designation|APC|transport|gunships?)\b/i;

/**
 * As linhas do changelog que tratam de arma, peça ou balanceamento.
 *
 * Vêm primeiro da seção — a EA agrupa em `WEAPONS:`, que é a fonte mais limpa
 * que existe aqui, e o que está lá entra inteiro. O resto do changelog entra
 * por palavra-chave e sai pelo filtro de veículo, porque nem toda mudança de
 * arma mora na seção de armas: efeito colateral de correção sai em `PLAYER` ou
 * `STABILITY` e mexe no equilíbrio do mesmo jeito.
 */
export function linhasDeArma(raw, { maxLinhas = 12 } = {}) {
  const corpo = changelogDeMultiplayer(raw);
  const daSecao = [];
  const doResto = [];

  let secao = null;
  for (const bruta of corpo.split('\n')) {
    const cabecalho = bruta.match(CABECALHO);
    if (cabecalho) {
      secao = cabecalho[1].trim();
      continue;
    }

    const linha = bruta.replace(/\s+/g, ' ').trim();
    if (linha.length < 20) continue;

    if (secao && SECOES_DE_ARMA.test(secao)) daSecao.push(linha);
    else if (ASSUNTO_DE_ARMA.test(linha) && !E_DE_VEICULO.test(linha)) doResto.push(linha);
  }

  return [...new Set([...daSecao, ...doResto])].slice(0, maxLinhas);
}

/**
 * O que o prompt precisa saber sobre a atualização em vigor.
 *
 * Devolve `null` quando o catálogo não tem a versão em disco — repositório
 * recém-clonado, ou pipeline que ainda não rodou. Aí a leitura volta a
 * perguntar à busca: pior e mais caro, mas melhor que anunciar na tela um
 * patch que ninguém apurou.
 */
/**
 * O que o BF6 Balance Log diz desta versão, se ele já tiver sido baixado.
 *
 * Ele é melhor que a extração daqui em duas coisas, e por isso vem primeiro:
 *
 * - **a separação por categoria.** As linhas de arma vêm rotuladas pela fonte,
 *   e não deduzidas por palavra-chave do texto corrido. Sem isso é preciso
 *   adivinhar se "Helicopter miniguns can now damage…" é arma de infantaria.
 * - **o endereço canônico.** A 1.4.2.5 foi baixada de `/redsec/news/…` porque
 *   foi onde a EA pendurou o cartão naquele dia; a fonte aponta a página em
 *   `battlefield-6`, que é a que alguém abre para conferir.
 */
function registroDaVersao(version) {
  const balanceLog = lerJson(join(RAIZ, 'data', 'sources', 'balance-log.json'));
  return balanceLog?.patches?.find((patch) => patch.version === version) ?? null;
}

export function patchAtual() {
  const atual = versaoAtual();
  if (!atual) return null;

  const nota = lerJson(join(PATCHES, `${atual.version}.json`));
  const registro = registroDaVersao(atual.version);
  const meta = atual.meta;

  return {
    version: atual.version,
    label: meta?.label ?? nota?.title ?? `Game Update ${atual.version}`,
    releasedAt: meta?.releasedAt ?? registro?.publishedAt ?? nota?.publishedAt ?? null,
    anterior: meta?.previousVersion ?? null,
    url: registro?.url ?? nota?.source?.url ?? meta?.sources?.[0]?.url ?? null,
    linhasDeArma: registro?.weaponLines?.length
      ? registro.weaponLines.map((linha) => linha.text)
      : nota?.rawContent
        ? linhasDeArma(nota.rawContent)
        : [],
  };
}

/**
 * O bloco que entra no prompt.
 *
 * Curto de propósito: o que ele economiza em busca não pode voltar como
 * parágrafo. São os dois números que ancoram a leitura — versão e data — mais
 * as linhas de arma do changelog, que são poucas em qualquer patch e nenhuma
 * na maioria.
 *
 * A frase sobre changelog sem arma é a que mais importa. Um patch de correções
 * legitimamente não mexe em arma, e sem dizer isso o modelo sai procurando a
 * mudança que não existe até achar alguma — que vai ser a do patch anterior,
 * escrita como se fosse desta semana. Foi assim que a 1.4.2.0 virou "a
 * atualização em vigor" na tela, duas semanas depois de deixar de ser.
 */
export function briefingDoPatch(patch) {
  if (!patch) return '';

  const data = patch.releasedAt ? `, publicada em ${patch.releasedAt}` : '';
  const anterior = patch.anterior ? ` A anterior era a ${patch.anterior}.` : '';
  const notas = patch.url ? `\n- Notas oficiais: ${patch.url}` : '';

  const mudancas = patch.linhasDeArma.length
    ? `O que ela mexeu em arma, peça ou acessório no multiplayer, transcrito do changelog oficial:\n\n${patch.linhasDeArma
        .map((linha) => `- ${linha}`)
        .join('\n')}`
    : 'O changelog dela **não tem mudança de arma, peça nem acessório no multiplayer** — é atualização de correção. Isso é fato apurado, e não lacuna da sua busca: não saia atrás da mudança de balanceamento que ela teria feito, porque não houve. O equilíbrio em vigor é o que o patch anterior deixou, e dizer isso no motivo de uma arma é resposta certa.';

  return `## 1. A atualização em vigor — já apurada, não pesquise

O catálogo deste site acompanha as notas oficiais da EA e já sabe qual é a atualização no ar:

- **${patch.label}** (versão ${patch.version})${data}.${anterior}${notas}

${mudancas}

Trate isso como dado, não como hipótese a confirmar:

- **não gaste busca** perguntando qual é a atualização mais recente, nem abra a página do patch note — as duas respostas estão aí em cima;
- resultado de busca que apresente uma versão anterior à ${patch.version} como "a mais recente" é material velho: o índice das ferramentas de busca demora a alcançar patch novo. Vale pela análise que faz das armas, nunca pela data que declara;
- guia ou tier list publicado antes de ${patch.releasedAt ?? 'a data acima'} continua valendo como medição, desde que a lista acima não tenha mexido na arma de que ele fala.

A busca desta rodada serve para descobrir **que armas estão fortes e do que a comunidade está falando** — só isso. É nisso que a chamada tem de gastar.`;
}
