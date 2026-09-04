#!/usr/bin/env node
/**
 * Descobre em que armas as peças novas entram — enumerando primeiro, perguntando depois.
 *
 *   npm run catalog:perguntar-acessorios              # só a varredura
 *   OPENAI_API_KEY=... npm run catalog:perguntar-acessorios   # varredura + pergunta
 *
 * Existe porque a lista de armas de uma peça de temporada não aparece em lugar
 * nenhum no dia do patch. A EA anuncia a peça e descreve o efeito; ela não
 * publica matriz de compatibilidade. O Reddit, onde a lista costuma ser
 * levantada à mão, recusa o rastreador; a Fandom responde 402, o IMFDB e o
 * bf6loadouts respondem 403.
 *
 * A rotina ataca isso em duas etapas, nesta ordem, porque a ordem é o ponto:
 *
 * ## 1. Varredura — enumerar
 *
 * O rnkd.gg publica a ficha de cada arma com **o slot inteiro listado**: as
 * doze bocas da M4A1, as duas da M87A1. Isso é qualitativamente diferente de
 * uma fonte que fala de uma arma por vez, e é o que permite ler ausência como
 * negativa: se a ficha enumerou o slot daquela arma e a peça não está lá, ela
 * não entra naquela arma. É a mesma distinção que o `catalog:compat` faz entre
 * `conflito` e `não conferido`, e ela decide o resultado inteiro.
 *
 * Determinística, sem chave de API e sem modelo no meio: 63 páginas, uma por
 * arma de fogo, e o que volta é o que está escrito nelas.
 *
 * ### A trava que impede o falso negativo
 *
 * Peça que a fonte **não conhece** dá zero acerto em 63 armas — e ler isso como
 * "63 conflitos" seria concluir que a peça não existe em arma nenhuma, a partir
 * de uma fonte que simplesmente ainda não a cadastrou. Foi o que aconteceu com
 * a Vertical Inclinada em agosto de 2026: o rnkd tinha os três Supressores
 * Híbridos e não tinha ela. Por isso, candidato sem nenhuma confirmação sai
 * como `ausente_da_fonte`, com os conflitos anulados — a fonte não opinou.
 *
 * ## 2. Pergunta — quando enumerar não bastou
 *
 * O que a varredura não fechou vai para um modelo com busca ligada, que alcança
 * páginas que este ambiente não alcança. É o acesso que se terceiriza, não o
 * julgamento: o que volta é relato com endereço, e a escala de evidência do
 * ATUALIZAR.md continua valendo. Sem `OPENAI_API_KEY` esta etapa não roda, e a
 * varredura já terá escrito o que descobriu.
 *
 * ## O que a rotina não pode fazer
 *
 * Escreve **apenas** em `data/compatibility/acessorios-a-confirmar-<v>.json`, e
 * nunca no campo `armas` — que é reservado ao que foi visto no Gunsmith — nem
 * em `src/data/attachments.ts`. A varredura grava em `armasEnumeradas` e a
 * pergunta em `armasRelatadas`. Promover qualquer um dos dois para o dataset é
 * decisão de gente, com o jogo aberto.
 *
 * Duas travas antes de gravar o que o modelo diz:
 *
 * - **nome de arma é conferido contra o arsenal.** Modelo com busca inventa
 *   arma de outro jogo — a P90 já apareceu nesta investigação, e aqui ela se
 *   chama USG-90. O que não casar é descartado e aparece no log.
 * - **sem página aberta, sem resposta.** Se a chamada não trouxer anotação de
 *   busca, a resposta é recusada: seria memória do modelo, que é exatamente o
 *   que não se quer.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEAPONS } from '../../src/data/weapons.ts';
import { fetchText, htmlToText } from './lib/http.ts';
import { fonteAtiva } from './lib/sources.ts';
import { DATA, INDEXES, log, readJson } from './lib/io.ts';

const API_KEY = process.env.OPENAI_API_KEY;

/*
 * Um modelo só, o mesmo das leituras diárias. A varredura enumerada já fechou
 * o que dava para fechar sem modelo nenhum, e o que sobra para esta pergunta é
 * pouco e vai para `armasRelatadas`, que ninguém promove sem conferir. Não é
 * lugar de gastar com modelo grande. Ver `MODELOS` em scripts/meta-search.mjs.
 */
const MODELOS = ['gpt-5.6-luna'];

/** Quantas fichas ler ao mesmo tempo. Baixo de propósito: é o site de outra pessoa. */
const EM_PARALELO = 4;

interface Enumerado {
  fonte: string;
  quando: string;
  /** A ficha da arma lista a peça naquele slot. */
  confirmado: string[];
  /** A ficha enumerou o slot e a peça não está nele — evidência contrária. */
  conflito: string[];
  /** A arma não tem esse slot. Não é negativa sobre a peça. */
  semSlot: string[];
  /** A ficha não abriu. Silêncio, e nada mais. */
  naoConferido: string[];
  /** O custo que a ficha mostra, quando todas as armas mostram o mesmo. */
  custo?: number | number[];
  /** A fonte não conhece esta peça: zero acertos, e por isso zero conflitos. */
  ausenteDaFonte?: string;
}

interface Candidato {
  nome: string;
  slotEsperado: string;
  /** Confirmado no jogo. Esta rotina nunca escreve aqui. */
  armas: string[];
  /** O que a varredura leu, arma por arma, numa fonte que enumera o slot. */
  armasEnumeradas?: Enumerado;
  /** O que a pergunta ouviu, com a fonte e o tier de cada arma. */
  armasRelatadas?: {
    arma: string;
    fonte: string | null;
    tier: number | null;
    classificacao: string;
  }[];
  statusDaAuditoria?: string;
  relatos?: unknown[];
  conflitos?: unknown[];
  fontesRepetidas?: string;
}

interface Investigacao {
  gameVersion: string;
  candidatos: Candidato[];
  [chave: string]: unknown;
}

const chave = (valor: string) =>
  String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const PORNOME = new Map(WEAPONS.map((w) => [chave(w.name), w.id]));

/* ========================================================================== *
 * 1. Varredura
 * ========================================================================== */

/**
 * O id daqui não é o endereço de lá.
 *
 * Mesma doutrina dos apelidos do sincronizador: id é contrato, aparece em link
 * compartilhado, e quem se adapta à grafia da fonte é a rotina. Duas armas
 * divergem — e uma delas só na caixa das letras, que num caminho de URL importa.
 */
const ENDERECO_DA_ARMA: Record<string, string> = {
  '18-5ks-k': '185ks-k',
  svdm: 'SVDM',
};

/**
 * O nome da peça na investigação nem sempre é o nome dela no jogo.
 *
 * O arquivo de investigação nasce do roadmap, que escreve o nome comercial
 * completo; a ficha usa o nome curto da tela. A Curta Inclinada é `CANTED
 * STUBBY` no rnkd e "Canted Stubby Grip" no anúncio — mesma peça, e é por isso
 * que a Vertical Inclinada entra aqui com o "Grip" removido.
 */
const NOME_NA_FONTE: Record<string, string> = {
  'Canted Vertical Grip': 'Canted Vertical',
};

/** O slot como o arquivo o chama, e como a ficha o intitula. */
const SECAO_DO_SLOT: Record<string, string> = {
  sight: 'Scope',
  muzzle: 'Muzzle',
  barrel: 'Barrel',
  magazine: 'Magazine',
  ammo: 'Ammunition',
  underbarrel: 'Underbarrel',
  ergonomics: 'Ergonomics',
  opticAccessory: 'Optic Accessory',
  leftRail: 'Left Accessory',
  rightRail: 'Right Accessory',
};

/**
 * A ficha, reduzida ao que interessa: por seção, as peças e o custo de cada uma.
 *
 * Lê estrutura, o que é uma escolha e um risco: `htmlToText` bastaria para achar
 * o nome da peça, mas jogaria fora a seção a que ela pertence — e sem seção não
 * há como distinguir "esta arma não tem boca" de "esta arma tem boca e a peça
 * não está nela", que é a única pergunta que esta varredura responde. O layout
 * vai mudar um dia; quando mudar, a varredura devolve zero e o resultado é
 * `ausente_da_fonte` para tudo, que é ruído visível — não dado errado.
 */
export function lerFicha(html: string): Map<string, Map<string, number | null>> {
  const ficha = new Map<string, Map<string, number | null>>();

  for (const bloco of html.split(/<h3[^>]*>/).slice(1)) {
    const fim = bloco.indexOf('<');
    if (fim < 0) continue;

    const secao = htmlToText(bloco.slice(0, fim));
    const pecas = new Map<string, number | null>();

    /*
      O cartão de cada peça vai do `<h4>` dela até o `<h4>` seguinte. Delimitar
      assim, e não por uma janela de tantos caracteres, é o que faz o custo ser
      sempre o custo daquela peça: entre um cartão e outro há markup demais para
      qualquer número fixo acertar, e um número fixo curto simplesmente não casa.
    */
    const marcas = [...bloco.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)];

    for (const [i, marca] of marcas.entries()) {
      const cartao = bloco.slice(
        marca.index + marca[0].length,
        marcas[i + 1]?.index ?? bloco.length,
      );
      const custo = /(\d+)\s*pts/.exec(cartao);
      pecas.set(chave(htmlToText(marca[1])), custo ? Number(custo[1]) : null);
    }

    if (pecas.size) ficha.set(secao, pecas);
  }

  return ficha;
}

type Situacao = 'confirmado' | 'conflito' | 'semSlot' | 'naoConferido';

async function varrer(candidatos: Candidato[], hoje: string) {
  const armas = WEAPONS.filter((w) => w.category !== 'melee');
  const leitura = new Map<string, Map<string, { situacao: Situacao; custo: number | null }>>(
    candidatos.map((c) => [c.nome, new Map()]),
  );
  const falhas: string[] = [];

  for (let i = 0; i < armas.length; i += EM_PARALELO) {
    await Promise.all(
      armas.slice(i, i + EM_PARALELO).map(async (arma) => {
        const endereco = ENDERECO_DA_ARMA[arma.id] ?? arma.id;
        let ficha: Map<string, Map<string, number | null>> | null = null;

        try {
          ficha = lerFicha(await fetchText(`${fonteAtiva('enumeracao_de_slot').url}/${endereco}/`));
        } catch (erro) {
          falhas.push(`${arma.id}: ${(erro as Error).message}`);
        }

        for (const candidato of candidatos) {
          const nome = chave(NOME_NA_FONTE[candidato.nome] ?? candidato.nome);
          const secao = ficha?.get(SECAO_DO_SLOT[candidato.slotEsperado] ?? '');

          const situacao: Situacao = !ficha
            ? 'naoConferido'
            : !secao
              ? 'semSlot'
              : secao.has(nome)
                ? 'confirmado'
                : 'conflito';

          leitura.get(candidato.nome)!.set(arma.id, {
            situacao,
            custo: secao?.get(nome) ?? null,
          });
        }
      }),
    );
  }

  let ausentes = 0;

  for (const candidato of candidatos) {
    const porArma = leitura.get(candidato.nome)!;
    const de = (situacao: Situacao) =>
      [...porArma].filter(([, v]) => v.situacao === situacao).map(([id]) => id);

    const confirmado = de('confirmado');
    const custos = [
      ...new Set(
        confirmado.map((id) => porArma.get(id)!.custo).filter((c): c is number => c !== null),
      ),
    ];

    const enumerado: Enumerado = {
      fonte: fonteAtiva('enumeracao_de_slot').url,
      quando: hoje,
      confirmado,
      conflito: de('conflito'),
      semSlot: de('semSlot'),
      naoConferido: de('naoConferido'),
    };

    if (custos.length === 1) enumerado.custo = custos[0];
    else if (custos.length > 1) enumerado.custo = custos.sort((a, b) => a - b);

    /*
      Zero acertos em todas as armas: a fonte não cadastrou a peça. Os conflitos
      são apagados de propósito — mantê-los seria transformar o atraso da fonte
      em prova de que a peça não entra em arma nenhuma.
    */
    if (!confirmado.length) {
      ausentes += 1;
      enumerado.ausenteDaFonte =
        `nenhuma das ${porArma.size} fichas lista esta peça. Isso é peça ausente do ` +
        'instantâneo da fonte, não exclusão por arma — as armas que enumeraram o slot ' +
        'sem ela não contam como evidência contrária, e por isso não foram registradas.';
      enumerado.conflito = [];
      candidato.statusDaAuditoria = 'ausente_da_fonte';
    } else {
      candidato.statusDaAuditoria = enumerado.conflito.length
        ? 'enumerado_com_recorte'
        : 'enumerado';
    }

    candidato.armasEnumeradas = enumerado;

    log(candidato.nome, {
      confirmado: confirmado.length,
      conflito: enumerado.conflito.length,
      'sem slot': enumerado.semSlot.length,
      custo: enumerado.custo ?? '—',
      ...(enumerado.ausenteDaFonte ? { situação: 'ausente da fonte' } : {}),
    });
  }

  for (const f of falhas) console.warn(`  não abriu  ${f}`);

  return { armasLidas: armas.length - falhas.length, armasTotais: armas.length, falhas, ausentes };
}

/* ========================================================================== *
 * 2. Pergunta
 * ========================================================================== */

const prompt = (candidatos: Candidato[], hoje: string, versao: string) =>
  `Hoje é ${hoje}. Você está auditando os acessórios que a atualização ${versao} do Battlefield 6 acrescentou, para um catálogo que não pode receber dado não confirmado.

## O que preciso

Para cada peça abaixo, em que armas ela pode ser equipada — e de onde essa informação saiu.

${candidatos.map((c, i) => `- id "${i}": ${c.nome}, que vai no slot ${c.slotEsperado}`).join('\n')}

Uma varredura automática já leu a ficha de todas as armas numa base que enumera o slot inteiro, e **não achou estas peças lá** — ou a base ainda não as cadastrou, ou elas aparecem com outro nome. Procure em outro lugar.

## A hierarquia que decide o peso de cada coisa

- **tier 0** — o jogo: Gunsmith, Arsenal, o que se observa na tela;
- **tier 1** — oficial: EA, DICE, notas de patch, roadmap;
- **tier 2** — técnico: datamine, sym.gg, datasets de arma e acessório;
- **tier 3** — catálogo: bf6loadouts, battlefinity, wikis;
- **tier 4** — comunidade: Reddit, Discord, YouTube, guia, build.

Tier 4 serve para **descobrir** que algo mudou. Sozinho, ele não confirma valor nenhum.

## Regras

1. Responda com o que a página disser, não com o que faz sentido. Se ela não lista as armas, isso é "não encontrei" — nunca deduza por categoria ("é boca, logo entra em toda arma com boca").
2. Cite a URL exata de cada arma. Sem URL, a arma não entra.
3. Fontes que copiam umas às outras contam como **uma**. Se três páginas repetem o mesmo post, diga isso.
4. Ausência não é negativa. Se uma fonte enumerou o slot daquela arma e a peça não aparece, é **conflito**; se a fonte simplesmente não cobre a arma, é **desconhecido**.
5. Distinga quatro coisas que costumam ser confundidas: asset existir no jogo, peça estar liberada, peça ser equipável, e peça ser compatível com uma arma específica.
6. Não invente custo nem efeito. Se só houver relato, devolva como relato, com a fonte.
7. Use o nome da arma como o jogo escreve. Se a fonte usar o nome real da arma de fogo, traduza (a FN P90 é a USG-90 no BF6).
8. É melhor devolver "não confirmado" do que preencher.

## Resposta

Só este JSON, sem cercas de código e sem texto em volta:

{"pecas":[{
  "id":"0",
  "status":"confirmed_exists | not_found | unknown | partial_confirmation | source_conflict",
  "armas":[{"arma":"NOME DA ARMA","fonte":"https://...","tier":3,"classificacao":"confirmed | conflict | unknown"}],
  "relatos":[{"campo":"custo","valor":30,"fonte":"https://...","tier":4}],
  "conflitos":[{"campo":"custo","valores":[25,15],"fontes":["https://...","https://..."]}],
  "fontesRepetidas":"o que apenas copia outra fonte, se houver"
}]}

O id é o da lista acima, e é por ele que a resposta é casada — não troque por nome.`;

async function perguntar(modelo: string, texto: string) {
  const busca = modelo.startsWith('gpt-5') ? 'web_search' : 'web_search_preview';
  const resposta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: busca }],
      ...(modelo.startsWith('gpt-5') ? { reasoning: { effort: 'low' } } : {}),
      tool_choice: 'required',
      input: texto,
      max_output_tokens: 4000,
      store: false,
    }),
  });

  const corpo = await resposta.json();
  if (!resposta.ok || corpo.error) {
    throw new Error(`${resposta.status} ${corpo.error?.message ?? resposta.statusText}`);
  }

  const saida = JSON.stringify(corpo.output ?? corpo);
  const buscou = saida.includes('web_search_call');
  const texto_ = (corpo.output ?? [])
    .flatMap((item: { content?: { text?: string }[] }) => item.content ?? [])
    .map((parte: { text?: string }) => parte.text ?? '')
    .join('\n');

  return { buscou, texto: texto_ };
}

function extrairJson(bruto: string) {
  const inicio = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return null;
  try {
    return JSON.parse(bruto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

type Resposta = {
  id?: string;
  nome?: string;
  status?: string;
  achou?: boolean;
  armas?: { arma: string; fonte: string; tier?: number; classificacao?: string }[];
  relatos?: { campo: string; valor: unknown; fonte: string; tier?: number }[];
  conflitos?: { campo: string; valores: unknown[]; fontes: string[] }[];
  fontesRepetidas?: string;
};

/** Pergunta ao modelo sobre os candidatos passados; devolve quantas armas gravou. */
async function auditar(
  investigacao: Investigacao,
  pendentes: Candidato[],
  hoje: string,
): Promise<number | null> {
  let bruto: { pecas?: Resposta[] } | null = null;

  for (const modelo of MODELOS) {
    try {
      const { buscou, texto } = await perguntar(
        modelo,
        prompt(pendentes, hoje, investigacao.gameVersion),
      );
      if (!buscou) {
        log('recusado', { modelo, motivo: 'não chamou a busca — responderia de memória' });
        continue;
      }
      bruto = extrairJson(texto);
      if (bruto?.pecas) {
        log('respondeu', { modelo, pecas: bruto.pecas.length });
        break;
      }
      log('recusado', { modelo, motivo: 'resposta sem JSON utilizável' });
    } catch (erro) {
      log('falhou', { modelo, erro: (erro as Error).message });
    }
  }

  if (!bruto?.pecas) return null;

  const descartadas: string[] = [];
  let gravadas = 0;

  for (const peca of bruto.pecas) {
    // Casa pelo id que o prompt distribuiu; o nome é só o plano B, porque o
    // modelo às vezes devolve o rótulo inteiro da lista, com o slot junto.
    const porId = Number(peca.id);
    const candidato =
      pendentes[porId] ?? pendentes.find((c) => chave(peca.nome ?? '').includes(chave(c.nome)));
    if (!candidato) {
      descartadas.push(`peça desconhecida: ${peca.id ?? peca.nome}`);
      continue;
    }

    /*
      O status do modelo só entra onde a varredura não chegou. Onde ela chegou,
      quem manda é ela: enumeração vale mais que relato, e sobrescrever seria
      trocar a fonte melhor pela pior.
    */
    if (candidato.statusDaAuditoria === 'ausente_da_fonte') {
      candidato.statusDaAuditoria = peca.status ?? (peca.achou === false ? 'not_found' : 'unknown');
    }
    if (peca.relatos?.length) candidato.relatos = peca.relatos;
    if (peca.conflitos?.length) candidato.conflitos = peca.conflitos;
    if (peca.fontesRepetidas) candidato.fontesRepetidas = peca.fontesRepetidas;

    const relatadas = [];
    for (const { arma, fonte, tier, classificacao } of peca.armas ?? []) {
      const id = PORNOME.get(chave(arma));
      if (!id) {
        descartadas.push(`${candidato.nome}: "${arma}" não existe no arsenal`);
        continue;
      }
      relatadas.push({
        arma: id,
        fonte: fonte ?? null,
        tier: tier ?? null,
        classificacao: classificacao ?? 'unknown',
      });
    }

    if (!relatadas.length) {
      descartadas.push(
        `${candidato.nome}: sem lista de armas — status ${candidato.statusDaAuditoria}`,
      );
      continue;
    }

    candidato.armasRelatadas = relatadas;
    gravadas += relatadas.length;
  }

  for (const d of descartadas) console.warn(`  descartado  ${d}`);

  investigacao.perguntaAoModelo = {
    quando: hoje,
    modelos: MODELOS,
    oQueFoiPedido: 'a lista de armas das peças que a varredura não achou, com a URL de onde ela saiu',
    pecas: pendentes.map((c) => c.nome),
    status: 'relatado — nada aqui é dado confirmado, e nada disso entra no dataset',
    proximoPasso: 'conferir no Gunsmith e mover o que bater para o campo armas',
  };

  return gravadas;
}

/* ========================================================================== */

async function main(): Promise<void> {
  /*
    A versão é parâmetro, não constante: a mesma rotina audita a próxima
    atualização sem uma linha de mudança. Sem PATCH_VERSION, vale a corrente.
  */
  const gameVersion =
    process.env.PATCH_VERSION ??
    readJson<{ gameVersion: string }>(join(INDEXES, 'current.json')).gameVersion;
  const arquivo = join(DATA, 'compatibility', `acessorios-a-confirmar-${gameVersion}.json`);
  const investigacao = readJson<Investigacao>(arquivo);
  const hoje = new Date().toISOString().slice(0, 10);

  log('varrendo o arsenal', {
    fonte: fonteAtiva('enumeracao_de_slot').url,
    pecas: investigacao.candidatos.length,
    'versão': gameVersion,
  });

  const varredura = await varrer(investigacao.candidatos, hoje);

  investigacao.varreduraDoArsenal = {
    quando: hoje,
    fonte: fonteAtiva('enumeracao_de_slot').url,
    porQue:
      'a única fonte alcançável que enumera o slot inteiro de cada arma, o que permite ler ausência como negativa',
    armasLidas: varredura.armasLidas,
    armasNoArsenal: varredura.armasTotais,
    ...(varredura.falhas.length ? { fichasQueNaoAbriram: varredura.falhas } : {}),
    comoLer: {
      confirmado: 'a ficha daquela arma lista a peça no slot esperado',
      conflito: 'a ficha enumerou o slot e a peça não está nele — evidência contrária',
      semSlot: 'a arma não tem esse slot; não diz nada sobre a peça',
      naoConferido: 'a ficha não abriu; silêncio, e nada mais',
      ausenteDaFonte:
        'zero acertos no arsenal inteiro: a fonte não cadastrou a peça, e por isso os conflitos são anulados',
    },
    limite:
      'enumerar não é o Gunsmith. Isto entra em armasEnumeradas, nunca em armas — promover é decisão de gente, com o jogo aberto.',
  };

  writeFileSync(arquivo, JSON.stringify(investigacao, null, 2) + '\n', 'utf8');

  log('varredura', {
    'fichas lidas': `${varredura.armasLidas}/${varredura.armasTotais}`,
    'peças achadas': investigacao.candidatos.length - varredura.ausentes,
    'peças ausentes da fonte': varredura.ausentes,
    arquivo: `data/compatibility/acessorios-a-confirmar-${gameVersion}.json`,
  });

  if (!varredura.armasLidas) {
    console.error('\nNenhuma ficha abriu. A fonte mudou de endereço, ou a rede está fora.');
    process.exit(1);
  }

  /*
    A pergunta é para o que sobrou. Peça que a varredura enumerou não precisa de
    modelo — e gastar chamada nela seria trocar uma fonte que lista o slot
    inteiro por uma que repete post de fórum.
  */
  const pendentes = investigacao.candidatos.filter(
    (c) => c.statusDaAuditoria === 'ausente_da_fonte',
  );

  if (!pendentes.length) {
    log('pergunta', { pulada: 'a varredura fechou todas as peças' });
    return;
  }

  if (!API_KEY) {
    log('pergunta', {
      pulada: 'sem OPENAI_API_KEY',
      pendentes: pendentes.map((c) => c.nome),
      comoRodar: 'OPENAI_API_KEY=... npm run catalog:perguntar-acessorios',
    });
    return;
  }

  const gravadas = await auditar(investigacao, pendentes, hoje);

  if (gravadas === null) {
    console.error('\nNenhum modelo devolveu lista utilizável. A varredura já foi gravada.');
    process.exit(1);
  }

  writeFileSync(arquivo, JSON.stringify(investigacao, null, 2) + '\n', 'utf8');
  log('armas relatadas', { gravadas, pecas: pendentes.length });
}

if (process.argv[1] && process.argv[1].endsWith('perguntar-acessorios.ts')) await main();
