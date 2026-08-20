#!/usr/bin/env node
/**
 * Pergunta a um modelo com busca ligada em que armas as peças novas entram.
 *
 *   OPENAI_API_KEY=... npm run catalog:perguntar-acessorios
 *
 * Existe porque a lista de armas das peças da 1.4.2.0 — os três Supressores
 * Híbridos e a Vertical Inclinada — está fora do alcance daqui. O Reddit, que é
 * onde ela foi publicada, recusa o rastreador; a EA, a Fandom, o IMFDB e o
 * bf6loadouts responderam 402, 403 ou não resolveram. Um modelo com busca própria
 * alcança páginas que este ambiente não alcança, e é essa a única coisa que se
 * está terceirizando: o acesso, não o julgamento.
 *
 * ## O que ele pode e o que ele não pode fazer
 *
 * Ele escreve **apenas** em `data/compatibility/acessorios-a-confirmar-<v>.json`,
 * e apenas no campo `armasRelatadas` — nunca em `armas`, que é reservado ao que
 * foi visto no Gunsmith, e nunca em `src/data/attachments.ts`. O que volta daqui
 * é relato com endereço, não dado confirmado, e a escala de evidência do
 * ATUALIZAR.md continua valendo: uma resposta de modelo é, no melhor caso, a
 * fonte que ele citou.
 *
 * Duas travas antes de gravar:
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
import { DATA, INDEXES, log, readJson } from './lib/io.ts';

const API_KEY = process.env.OPENAI_API_KEY;
const MODELOS = ['gpt-5-mini', 'gpt-4.1'];

interface Candidato {
  nome: string;
  slotEsperado: string;
  /** Confirmado no jogo. Este script nunca escreve aqui. */
  armas: string[];
  /** O que a auditoria ouviu, com a fonte e o tier de cada arma. */
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

const prompt = (candidatos: Candidato[], hoje: string, versao: string) =>
  `Hoje é ${hoje}. Você está auditando os acessórios que a atualização ${versao} do Battlefield 6 acrescentou, para um catálogo que não pode receber dado não confirmado.

## O que preciso

Para cada peça abaixo, em que armas ela pode ser equipada — e de onde essa informação saiu.

${candidatos.map((c, i) => `- id "${i}": ${c.nome}, que vai no slot ${c.slotEsperado}`).join('\n')}

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

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error(
      'Falta OPENAI_API_KEY. Rode com a chave no ambiente:\n' +
        '  OPENAI_API_KEY=... npm run catalog:perguntar-acessorios',
    );
    process.exit(1);
  }

  /*
    A versão é parâmetro, não constante: o mesmo script audita a próxima
    atualização sem uma linha de mudança. Sem PATCH_VERSION, vale a corrente.
  */
  const gameVersion =
    process.env.PATCH_VERSION ??
    readJson<{ gameVersion: string }>(join(INDEXES, 'current.json')).gameVersion;
  const arquivo = join(DATA, 'compatibility', `acessorios-a-confirmar-${gameVersion}.json`);
  const investigacao = readJson<Investigacao>(arquivo);
  const hoje = new Date().toISOString().slice(0, 10);

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

  let bruto: { pecas?: Resposta[] } | null = null;
  for (const modelo of MODELOS) {
    try {
      const { buscou, texto } = await perguntar(
        modelo,
        prompt(investigacao.candidatos, hoje, gameVersion),
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

  if (!bruto?.pecas) {
    console.error('\nNenhum modelo devolveu lista utilizável. Nada foi gravado.');
    process.exit(1);
  }

  const descartadas: string[] = [];
  let gravadas = 0;

  for (const peca of bruto.pecas) {
    // Casa pelo id que o prompt distribuiu; o nome é só o plano B, porque o
    // modelo às vezes devolve o rótulo inteiro da lista, com o slot junto.
    const porId = Number(peca.id);
    const candidato =
      investigacao.candidatos[porId] ??
      investigacao.candidatos.find((c) => chave(peca.nome ?? '').includes(chave(c.nome)));
    if (!candidato) {
      descartadas.push(`peça desconhecida: ${peca.id ?? peca.nome}`);
      continue;
    }

    /*
      O status vem do modelo e é guardado como ele veio, mas nunca decide nada
      sozinho: quem promove peça para o dataset é o Gunsmith, e a regra está
      escrita no ATUALIZAR.md.
    */
    candidato.statusDaAuditoria = peca.status ?? (peca.achou === false ? 'not_found' : 'unknown');
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
      relatadas.push({ arma: id, fonte: fonte ?? null, tier: tier ?? null, classificacao: classificacao ?? 'unknown' });
    }

    if (!relatadas.length) {
      descartadas.push(`${candidato.nome}: sem lista de armas — status ${candidato.statusDaAuditoria}`);
      continue;
    }

    candidato.armasRelatadas = relatadas;
    gravadas += relatadas.length;
  }

  investigacao.perguntaAoModelo = {
    quando: hoje,
    modelos: MODELOS,
    oQueFoiPedido: 'a lista de armas de cada peça, com a URL de onde ela saiu',
    status: 'relatado — nada aqui é dado confirmado, e nada disso entra no dataset',
    proximoPasso: 'conferir no Gunsmith e mover o que bater para o campo armas',
  };

  writeFileSync(arquivo, JSON.stringify(investigacao, null, 2) + '\n', 'utf8');

  for (const d of descartadas) console.warn(`  descartado  ${d}`);
  log('armas relatadas', {
    gravadas,
    descartadas: descartadas.length,
    arquivo: `data/compatibility/acessorios-a-confirmar-${gameVersion}.json`,
  });
}

main();
