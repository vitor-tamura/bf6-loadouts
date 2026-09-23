#!/usr/bin/env node
/**
 * O que o patch mudou nas armas do site, lido e aplicado sem esperar ninguém.
 *
 *   npm run catalog:analisar-patch                   # todas as versões pendentes
 *   npm run catalog:analisar-patch -- --version 1.4.3.0
 *   npm run catalog:analisar-patch -- --pendentes    # só lista, em JSON
 *   npm run catalog:analisar-patch -- --dry-run      # analisa e mostra, sem gravar
 *
 * ## Por que existe
 *
 * O parser de `parse-patch-note.ts` lê frase por frase, com regra fixa, e grava
 * no catálogo versionado (`data/versions`). Só que o site lê `src/data`, e o
 * patch não fala a língua de uma regra. A 1.4.3.0 é o exemplo: a Interdictor
 * aparece só no título "Interdictor Balance Updates", as linhas embaixo dizem
 * "Minimum damage increased from 62 to 80" sem repetir o nome, e o comentário
 * do desenvolvedor explica que ela "now deals 80 damage to the chest and limbs
 * at all ranges". Transformar isso numa curva de dano é interpretação — foi
 * feita à mão uma vez, e esta rotina é a mesma leitura, automática.
 *
 * ## As duas fontes
 *
 * O patch note oficial, já baixado em `data/patches/<versão>.json` pela
 * descoberta (que lê a página de novidades da EA), e as linhas de arma que o
 * bf6balancelog registra para a mesma versão — ele transcreve a EA arma por
 * arma e diz de qual arma cada linha fala, que é justamente o que se perde no
 * texto corrido.
 *
 * ## O que impede número inventado
 *
 * O modelo propõe; o código decide. Toda proposta cita a frase de onde saiu, e
 * é recusada se:
 *
 * - a frase não está, palavra por palavra, no patch note ou no balancelog;
 * - algum número do valor proposto (fora o zero da curva) não aparece nas
 *   frases citadas;
 * - a arma não é a que o texto está discutindo ali — a frase tem de nomeá-la,
 *   ou ela tem de ser a arma citada mais perto antes da frase, ou o balancelog
 *   tem de ligar a frase a ela;
 * - a peça não existe na arma, ou a frase não nomeia a peça.
 *
 * O que passa é gravado em `src/data`, e o workflow ainda roda testes, tipos e
 * build antes de publicar. O que não passa fica em
 * `data/versions/<versão>/site.json`, com o motivo, para a próxima leitura.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEAPONS } from '../../src/data/weapons.ts';
import { ATTACHMENTS } from '../../src/data/attachments.ts';
import { candidatos, perguntarSemBusca, temAlgumaChave } from '../meta/provedores.mjs';
import { extrairJson } from '../meta/leitura.mjs';
import { fetchBalanceLog, type BalanceLine } from './fetch-balance-log.ts';
import { PATCHES, ROOT, compareVersions, listVersions, log, readJson, versionDir } from './lib/io.ts';

/**
 * A primeira versão lida por esta rotina.
 *
 * As anteriores foram conferidas à mão quando saíram, e relê-las agora
 * escreveria por cima de curadoria feita com o jogo aberto.
 */
export const ANALISE_DESDE = '1.4.3.0';

const WEAPONS_TS = join(ROOT, 'src', 'data', 'weapons.ts');
const ATTACHMENTS_TS = join(ROOT, 'src', 'data', 'attachments.ts');

const MODELOS = (process.env.ANALISE_MODELS ?? 'gpt-5.6-luna')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

/** Os campos da arma que um patch costuma mexer e que o site guarda como número. */
export const CAMPOS = ['damage', 'rpm', 'velocity', 'magazine', 'reload', 'emptyReload', 'headshot'] as const;
type Campo = (typeof CAMPOS)[number];

export interface PropostaArma {
  weapon: string;
  field: Campo;
  /** Número, ou a curva inteira como pares [dano, distância]. */
  value: number | [number, number][];
  evidence: string[];
}

export interface PropostaCusto {
  attachment: string;
  /** A arma em que o custo muda; nulo quando muda em todas. */
  weapon: string | null;
  cost: number;
  evidence: string[];
}

export interface Proposta {
  weapons?: PropostaArma[];
  attachmentCosts?: PropostaCusto[];
}

export interface Contexto {
  /** O patch note da EA. */
  texto: string;
  /** As linhas do bf6balancelog para a mesma versão. */
  linhas: BalanceLine[];
  armas: { id: string; name: string }[];
  pecas: { id: string; originalName: string; compat: string[] }[];
}

/* ========================================================================== *
 * Validação
 * ========================================================================== */

/** Texto comparável: sem entidade HTML, sem aspas tipográficas, sem espaço duplo. */
export function normalizar(texto: string): string {
  return String(texto ?? '')
    .replace(/&#x27;|&#39;|&apos;|[’‘]/g, "'")
    .replace(/&quot;|[“”]/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Os números de um texto, como aparecem: "120m" dá 120, "1.75x" dá 1.75. */
export function numerosDe(texto: string): number[] {
  return [...String(texto).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

const nomeComparavel = (nome: string) => normalizar(nome).replace(/[^a-z0-9]/g, '');

/** "Iron Sights" e "Iron Sight" são a mesma peça no texto da EA. */
const semPlural = (nome: string) => normalizar(nome).replace(/s\b/g, '');

/** Onde uma arma é citada no texto — pelo nome, sem pontuação no meio. */
function posicoesDaArma(textoNormal: string, nome: string): number[] {
  const alvo = normalizar(nome);
  const posicoes: number[] = [];
  let i = textoNormal.indexOf(alvo);
  while (i >= 0) {
    posicoes.push(i);
    i = textoNormal.indexOf(alvo, i + 1);
  }
  return posicoes;
}

/**
 * A arma que o texto está discutindo na altura de uma frase: a citada mais
 * perto antes dela, dentro de uma janela curta — é o título da seção, no caso
 * da 1.4.3.0.
 */
export function armaDaVez(textoNormal: string, posicao: number, armas: { id: string; name: string }[]) {
  const JANELA = 1500;
  let melhor: { id: string; at: number } | null = null;

  for (const arma of armas) {
    // Nome de uma letra ou número solto casaria com qualquer coisa.
    if (nomeComparavel(arma.name).length < 3) continue;
    for (const at of posicoesDaArma(textoNormal, arma.name)) {
      if (at <= posicao && posicao - at <= JANELA && (!melhor || at > melhor.at)) melhor = { id: arma.id, at };
    }
  }

  return melhor?.id ?? null;
}

function evidenciaValida(evidencias: string[], ctx: Contexto): string | null {
  if (!Array.isArray(evidencias) || !evidencias.length) return 'sem frase citada';
  const texto = normalizar(ctx.texto);
  const linhas = ctx.linhas.map((l) => normalizar(l.text));

  for (const frase of evidencias) {
    const alvo = normalizar(frase);
    if (alvo.length < 8) return `frase curta demais para conferir: "${frase}"`;
    if (!texto.includes(alvo) && !linhas.some((l) => l.includes(alvo))) {
      return `a frase não está no patch nem no balancelog: "${frase}"`;
    }
  }
  return null;
}

/** A frase fala desta arma? Pelo nome nela, pela vizinhança no texto, ou pelo balancelog. */
function frasesDaArma(evidencias: string[], armaId: string, ctx: Contexto): boolean {
  const arma = ctx.armas.find((a) => a.id === armaId);
  if (!arma) return false;

  const texto = normalizar(ctx.texto);
  const idDoLog = nomeComparavel(armaId);

  return evidencias.every((frase) => {
    const alvo = normalizar(frase);
    if (alvo.includes(normalizar(arma.name))) return true;

    const noLog = ctx.linhas.find((l) => normalizar(l.text).includes(alvo));
    if (noLog?.items.some((item) => nomeComparavel(item) === idDoLog)) return true;

    const at = texto.indexOf(alvo);
    return at >= 0 && armaDaVez(texto, at, ctx.armas) === armaId;
  });
}

function numerosSustentados(valores: number[], evidencias: string[]): string | null {
  const citados = new Set(evidencias.flatMap(numerosDe));
  const soltos = valores.filter((v) => v !== 0 && !citados.has(v));
  return soltos.length ? `número sem frase que o sustente: ${soltos.join(', ')}` : null;
}

function curvaValida(valor: unknown): string | null {
  if (!Array.isArray(valor) || !valor.length) return 'curva vazia';
  let anterior = -1;
  for (const par of valor) {
    if (!Array.isArray(par) || par.length !== 2 || !par.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return 'curva fora do formato [dano, distância]';
    }
    const [dano, distancia] = par;
    if (dano <= 0 || dano > 1000) return `dano fora de escala: ${dano}`;
    if (distancia <= anterior) return 'distâncias fora de ordem';
    anterior = distancia;
  }
  if (valor[0][1] !== 0) return 'a curva tem de começar em 0 m';
  return null;
}

export interface Veredito {
  aceitas: { armas: PropostaArma[]; custos: PropostaCusto[] };
  recusadas: { proposta: unknown; motivo: string }[];
}

/** O que da proposta do modelo o texto oficial sustenta. */
export function validarProposta(proposta: Proposta | null, ctx: Contexto): Veredito {
  const veredito: Veredito = { aceitas: { armas: [], custos: [] }, recusadas: [] };
  const recusar = (p: unknown, motivo: string) => veredito.recusadas.push({ proposta: p, motivo });

  for (const p of proposta?.weapons ?? []) {
    if (!ctx.armas.some((a) => a.id === p.weapon)) {
      recusar(p, `arma fora do arsenal: ${p.weapon}`);
      continue;
    }
    if (!CAMPOS.includes(p.field)) {
      recusar(p, `campo que o site não guarda: ${p.field}`);
      continue;
    }

    const erroFrase = evidenciaValida(p.evidence, ctx);
    if (erroFrase) {
      recusar(p, erroFrase);
      continue;
    }
    if (!frasesDaArma(p.evidence, p.weapon, ctx)) {
      recusar(p, `a frase não fala da ${p.weapon}`);
      continue;
    }

    const numeros =
      p.field === 'damage'
        ? (() => {
            const erroCurva = curvaValida(p.value);
            if (erroCurva) {
              recusar(p, erroCurva);
              return null;
            }
            return (p.value as [number, number][]).flat();
          })()
        : typeof p.value === 'number' && Number.isFinite(p.value) && p.value > 0
          ? [p.value]
          : (recusar(p, 'valor que não é número positivo'), null);
    if (!numeros) continue;

    const erroNumero = numerosSustentados(numeros, p.evidence);
    if (erroNumero) {
      recusar(p, erroNumero);
      continue;
    }

    veredito.aceitas.armas.push(p);
  }

  for (const p of proposta?.attachmentCosts ?? []) {
    const peca = ctx.pecas.find((a) => a.id === p.attachment);
    if (!peca) {
      recusar(p, `peça desconhecida: ${p.attachment}`);
      continue;
    }
    if (p.weapon && !peca.compat.includes(p.weapon)) {
      recusar(p, `a ${p.weapon} não aceita ${p.attachment}`);
      continue;
    }
    if (!Number.isInteger(p.cost) || p.cost < 0 || p.cost > 100) {
      recusar(p, `custo fora do orçamento: ${p.cost}`);
      continue;
    }

    const erroFrase = evidenciaValida(p.evidence, ctx);
    if (erroFrase) {
      recusar(p, erroFrase);
      continue;
    }
    if (!p.evidence.some((f) => semPlural(f).includes(semPlural(peca.originalName)))) {
      recusar(p, `a frase não nomeia a peça ${peca.originalName}`);
      continue;
    }
    if (p.weapon && !frasesDaArma(p.evidence, p.weapon, ctx)) {
      recusar(p, `a frase não fala da ${p.weapon}`);
      continue;
    }
    const erroNumero = numerosSustentados([p.cost], p.evidence);
    if (erroNumero) {
      recusar(p, erroNumero);
      continue;
    }

    veredito.aceitas.custos.push(p);
  }

  return veredito;
}

/* ========================================================================== *
 * Aplicação no código-fonte do dataset
 * ========================================================================== */

/** O trecho `{ ... }` de uma entrada, achado pelo id. */
function blocoDe(fonte: string, id: string): { inicio: number; fim: number } | null {
  const marca = fonte.indexOf(`\n    id: '${id}',`);
  if (marca < 0) return null;
  const inicio = fonte.lastIndexOf('\n  {', marca);
  const fim = fonte.indexOf('\n  },', marca);
  if (inicio < 0 || fim < 0) return null;
  return { inicio, fim: fim + '\n  },'.length };
}

/** A curva escrita como o resto do arquivo escreve. */
function curvaEmTexto(curva: [number, number][]): string {
  return `damage: [\n${curva.map(([d, m]) => `      [${d}, ${m}],`).join('\n')}\n    ],`;
}

/** Onde termina o `damage: [...]` — os colchetes se aninham, então conta-se. */
function fimDaCurva(bloco: string, inicio: number): number {
  let profundidade = 0;
  for (let i = bloco.indexOf('[', inicio); i < bloco.length; i += 1) {
    if (bloco[i] === '[') profundidade += 1;
    if (bloco[i] === ']') {
      profundidade -= 1;
      if (profundidade === 0) return bloco[i + 1] === ',' ? i + 2 : i + 1;
    }
  }
  return -1;
}

const comentario = (versao: string, evidencias: string[]) =>
  `    // Atualização ${versao}: ${evidencias.map((e) => `"${e.replace(/\s+/g, ' ').trim()}"`).join(' ')}\n`;

/** Grava a mudança de uma arma em `weapons.ts`. Devolve o texto novo, ou nulo se nada mudou. */
export function aplicarNaArma(fonte: string, p: PropostaArma, versao: string): string | null {
  const onde = blocoDe(fonte, p.weapon);
  if (!onde) throw new Error(`entrada da ${p.weapon} não encontrada em weapons.ts`);
  const bloco = fonte.slice(onde.inicio, onde.fim);

  let novo: string;
  if (p.field === 'damage') {
    const inicio = bloco.indexOf('\n    damage: [');
    if (inicio < 0) throw new Error(`a ${p.weapon} não tem curva de dano no arquivo`);
    const fim = fimDaCurva(bloco, inicio + 1);
    const nova = `\n${comentario(versao, p.evidence)}    ${curvaEmTexto(p.value as [number, number][])}`;
    if (bloco.slice(inicio, fim).replace(/\s/g, '') === nova.replace(/\/\/.*\n/, '').replace(/\s/g, '')) return null;
    novo = bloco.slice(0, inicio) + nova + bloco.slice(fim);
  } else {
    const padrao = new RegExp(`\\n    ${p.field}: [^,\\n]+,`);
    const atual = padrao.exec(bloco);
    const linha = `\n${comentario(versao, p.evidence)}    ${p.field}: ${p.value},`;
    if (atual) {
      if (atual[0].trim() === `${p.field}: ${p.value},`) return null;
      novo = bloco.replace(padrao, linha);
    } else {
      // O campo não estava escrito: entra antes do fechamento da entrada.
      novo = bloco.replace(/\n  \},$/, `${linha}\n  },`);
    }
  }

  return fonte.slice(0, onde.inicio) + novo + fonte.slice(onde.fim);
}

/**
 * Grava o custo novo de uma peça em `attachments.ts`.
 *
 * O custo no site é da peça, não da peça na arma. Quando o patch muda o preço
 * numa arma só, a peça se divide — a mesma decisão das entradas de cano por
 * família que o arquivo já tem: a arma sai da lista da peça comum e ganha uma
 * entrada própria, com o preço novo.
 */
export function aplicarCusto(fonte: string, p: PropostaCusto, versao: string): string | null {
  const onde = blocoDe(fonte, p.attachment);
  if (!onde) throw new Error(`peça ${p.attachment} não encontrada em attachments.ts`);
  const bloco = fonte.slice(onde.inicio, onde.fim);
  const compat = /compat: \{ weapons: \[([^\]]*)\]/.exec(bloco);
  const armas = compat ? [...compat[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];

  const trocarCusto = (texto: string) =>
    texto.replace(/\n    cost: \d+,/, `\n${comentario(versao, p.evidence)}    cost: ${p.cost},`);

  if (!p.weapon || (armas.length === 1 && armas[0] === p.weapon)) {
    if (new RegExp(`\\n    cost: ${p.cost},`).test(bloco)) return null;
    return fonte.slice(0, onde.inicio) + trocarCusto(bloco) + fonte.slice(onde.fim);
  }

  const idProprio = `${p.attachment}-${p.weapon}`;
  const existente = blocoDe(fonte, idProprio);
  if (existente) return aplicarCusto(fonte, { ...p, attachment: idProprio, weapon: null }, versao);

  const semArma = bloco.replace(new RegExp(`, '${p.weapon}'|'${p.weapon}', `), '');
  const proprio = trocarCusto(
    bloco
      .replace(`\n    id: '${p.attachment}',`, `\n    id: '${idProprio}',`)
      .replace(/compat: \{ weapons: \[[^\]]*\](, except: \[[^\]]*\])? \}/, `compat: { weapons: ['${p.weapon}'] }`)
      // O comentário da peça comum não fala desta entrada.
      .replace(/\n    \/\*[\s\S]*?\*\//g, ''),
  );

  return fonte.slice(0, onde.inicio) + semArma + proprio + fonte.slice(onde.fim);
}

/* ========================================================================== *
 * A pergunta
 * ========================================================================== */

function promptDaAnalise(versao: string, ctx: Contexto, citadas: typeof WEAPONS, pecas: typeof ATTACHMENTS) {
  const armas = citadas
    .map((w) => {
      const curva = w.damage.map((d) => `[${d.damage}, ${d.distance}]`).join(', ');
      return `- ${w.id} (${w.name}): damage [${curva}], rpm ${w.rpm}, velocity ${w.velocity}, magazine ${w.magazine}, reload ${w.reload}, emptyReload ${w.emptyReload}, headshot ${w.headshot}`;
    })
    .join('\n');

  const listaPecas = pecas
    .map((a) => `- ${a.id} "${a.originalName}" (${a.slot}), ${a.cost} pts, armas: ${(a.compat.weapons ?? []).join(' ')}`)
    .join('\n');

  const linhas = ctx.linhas.map((l) => `- [${l.items.join(', ') || 'sem arma'}] ${l.text}`).join('\n');

  return `Você mantém o dataset de armas de um montador de loadouts de Battlefield 6 (multiplayer). Leia a atualização ${versao} e diga o que ela muda nos números abaixo.

## Como o dataset guarda uma arma

- damage: curva em degraus, pares [dano, distância em metros], em ordem de distância, começando em 0. O dano vale a partir da distância do par até a do próximo. Um "sweet spot" é um degrau mais alto no meio da curva.
- Dano é no peito. headshot é o multiplicador de cabeça.
- rpm, velocity (m/s), magazine, reload e emptyReload (segundos).

## Armas citadas na atualização, como estão hoje

${armas || '(nenhuma arma do arsenal é citada pelo nome)'}

## Peças citadas na atualização, como estão hoje

${listaPecas || '(nenhuma)'}

## Linhas de arma que o bf6balancelog registrou para ${versao} (entre colchetes, a arma a que ele liga a linha)

${linhas || '(nenhuma)'}

## Patch note oficial da EA

${ctx.texto.slice(0, 45_000)}

## Regras

1. Só o que o texto diz. Número que não está escrito na atualização não entra, nem por dedução de outra arma.
2. Uma linha sem o nome da arma pertence à arma do título da seção em que ela está ("Interdictor Balance Updates" → as linhas embaixo são da Interdictor).
3. Para mudança de dano, devolva a curva inteira nova. Frases como "deals 80 damage at all ranges" ou "sweet spot adjusted to 120m to 160m" definem a curva; use a curva atual só para o que o texto não mudou.
4. "Limb damage now matches chest damage" não muda a curva (ela já é de peito) — ignore.
5. Ignore veículos, REDSEC/battle royale, visuais, ícones, descrição e correções sem número.
6. Custo de peça ("now costs 15 points"): use o id exato da lista de peças e a arma, quando a frase for de uma arma só.
7. "evidence": as frases exatas, copiadas do patch note ou do balancelog, que sustentam cada valor. Toda frase citada tem de existir no texto, e todo número do valor tem de estar nelas.
8. Na dúvida, deixe de fora.

## Resposta

Somente este JSON, sem cercas de código:

{"weapons":[{"weapon":"id","field":"damage|rpm|velocity|magazine|reload|emptyReload|headshot","value":0,"evidence":["frase exata"]}],"attachmentCosts":[{"attachment":"id","weapon":"id ou null","cost":0,"evidence":["frase exata"]}]}`;
}

/* ========================================================================== *
 * Execução
 * ========================================================================== */

const marcador = (versao: string) => join(versionDir(versao), 'site.json');

/** As versões do catálogo que ainda não passaram por esta análise. */
export function pendentes(versoes = listVersions()): string[] {
  return versoes
    .filter((v) => compareVersions(v, ANALISE_DESDE) >= 0)
    .filter((v) => !existsSync(marcador(v)))
    .sort(compareVersions);
}

async function linhasDoBalancelog(versao: string): Promise<BalanceLine[]> {
  try {
    const { patches } = await fetchBalanceLog();
    return patches.find((p) => p.version === versao)?.weaponLines ?? [];
  } catch (erro) {
    log('balancelog indisponível — vale o texto da EA sozinho', { erro: (erro as Error).message });
    return [];
  }
}

async function analisar(versao: string, dryRun: boolean): Promise<boolean> {
  const caminho = join(PATCHES, `${versao}.json`);
  if (!existsSync(caminho)) {
    log(`${versao}: sem patch note baixado — rode catalog:update antes`);
    return false;
  }

  const nota = readJson<{ rawContent: string; publishedAt?: string }>(caminho);
  const linhas = await linhasDoBalancelog(versao);
  const textoNormal = normalizar(nota.rawContent);

  const armas = WEAPONS.map((w) => ({ id: w.id, name: w.name }));
  const citadasIds = new Set([
    ...WEAPONS.filter((w) => nomeComparavel(w.name).length >= 3 && textoNormal.includes(normalizar(w.name))).map((w) => w.id),
    ...linhas.flatMap((l) => l.items).flatMap((item) => WEAPONS.filter((w) => nomeComparavel(w.id) === nomeComparavel(item)).map((w) => w.id)),
  ]);
  const citadas = WEAPONS.filter((w) => citadasIds.has(w.id));
  const pecasCitadas = ATTACHMENTS.filter(
    (a) => textoNormal.includes(semPlural(a.originalName)) && (a.compat.weapons ?? []).some((id) => citadasIds.has(id)),
  );

  const ctx: Contexto = {
    texto: nota.rawContent,
    linhas,
    armas,
    pecas: ATTACHMENTS.map((a) => ({ id: a.id, originalName: a.originalName, compat: a.compat.weapons ?? [] })),
  };

  log(`${versao}: analisando`, { armasCitadas: citadas.map((w) => w.id), pecasCitadas: pecasCitadas.length, linhasDoBalancelog: linhas.length });

  let proposta: Proposta | null = null;
  let modelo: string | null = null;

  for await (const candidato of candidatos(MODELOS)) {
    try {
      const resposta = await perguntarSemBusca(candidato, promptDaAnalise(versao, ctx, citadas, pecasCitadas), {
        maxOutputTokens: 8000,
      });
      proposta = extrairJson(resposta.texto) as Proposta | null;
      if (proposta) {
        modelo = resposta.modelo;
        break;
      }
      log(`${candidato.modelo}: resposta sem JSON`);
    } catch (erro) {
      log(`${candidato.modelo}: falhou`, { erro: (erro as Error).message });
    }
  }

  if (!proposta) {
    // Sem marcador: a versão continua pendente e a próxima rodada tenta de novo.
    console.error(`${versao}: nenhum modelo devolveu análise utilizável — fica para a próxima rodada`);
    return false;
  }

  const veredito = validarProposta(proposta, ctx);
  for (const { proposta: p, motivo } of veredito.recusadas) {
    log('  recusada', { motivo, proposta: JSON.stringify(p).slice(0, 200) });
  }

  let armasTs = readFileSync(WEAPONS_TS, 'utf8');
  let pecasTs = readFileSync(ATTACHMENTS_TS, 'utf8');
  const aplicadas: unknown[] = [];

  for (const p of veredito.aceitas.armas) {
    const novo = aplicarNaArma(armasTs, p, versao);
    if (novo) {
      armasTs = novo;
      aplicadas.push(p);
      log('  aplicada', { arma: p.weapon, campo: p.field, valor: JSON.stringify(p.value) });
    }
  }
  for (const p of veredito.aceitas.custos) {
    const novo = aplicarCusto(pecasTs, p, versao);
    if (novo) {
      pecasTs = novo;
      aplicadas.push(p);
      log('  aplicada', { peca: p.attachment, arma: p.weapon ?? 'todas', custo: p.cost });
    }
  }

  if (dryRun) {
    log(`${versao}: nada gravado (--dry-run)`, { aplicariam: aplicadas.length, recusadas: veredito.recusadas.length });
    return true;
  }

  writeFileSync(WEAPONS_TS, armasTs);
  writeFileSync(ATTACHMENTS_TS, pecasTs);
  writeFileSync(
    marcador(versao),
    `${JSON.stringify(
      {
        version: versao,
        analisadoEm: new Date().toISOString().slice(0, 10),
        modelo,
        fontes: {
          ea: caminho.slice(ROOT.length + 1).replace(/\\/g, '/'),
          balancelog: linhas.length ? 'bf6balancelog.com' : null,
        },
        aplicadas,
        recusadas: veredito.recusadas,
      },
      null,
      2,
    )}\n`,
  );

  log(`${versao}: análise gravada`, { aplicadas: aplicadas.length, recusadas: veredito.recusadas.length });
  return true;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf('--version');
  const versoes = at >= 0 ? [args[at + 1]] : pendentes();

  if (args.includes('--pendentes')) {
    console.log(JSON.stringify({ pendentes: pendentes() }));
    return;
  }

  if (!versoes.length) {
    log('nenhuma versão pendente de análise');
    return;
  }
  if (!temAlgumaChave()) {
    console.error('Sem OPENAI_API_KEY nem GEMINI_API_KEY: a análise não roda.');
    process.exit(1);
  }

  let falhou = false;
  // Em ordem: cada versão parte do dataset que a anterior deixou.
  for (const versao of versoes) {
    if (!(await analisar(versao, args.includes('--dry-run')))) {
      falhou = true;
      break;
    }
  }
  if (falhou) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('analisar-patch.ts')) await main();
