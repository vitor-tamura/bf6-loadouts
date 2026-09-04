#!/usr/bin/env node
/**
 * Casa o nome que as fontes escrevem com o id que o catálogo guarda — por prova.
 *
 *   npm run catalog:nomes             # o relatório: o que a prova casa e o que fica em aberto
 *   npm run catalog:nomes -- --aplicar  # grava no dataset os apelidos provados
 *
 * ## O problema
 *
 * A EA escreveu, na 1.4.2.5:
 *
 *     The Match Trigger attachment no longer affects fully automatic fire on
 *     the BROD and EF88.
 *
 * O catálogo tem `brod3`, de nome "BROD 3", sem apelido nenhum. "BROD" não casa
 * com "BROD 3" — nem deve casar por semelhança, que é como se inventa relação:
 * "M4" casaria com "M4A1", "M60" com "M60E4", e a mudança iria para a arma
 * errada com a mesma cara de certeza.
 *
 * ## A prova
 *
 * O BF6 Balance Log publica a mesma linha assim:
 *
 *     <li data-item="brod-3 ef88 match-trigger">The Match Trigger attachment…
 *
 * Quem lê o jogo já disse quais entidades a frase nomeia. `brod-3` normaliza
 * para `brod3`, que é o id do catálogo — isso é casamento por identificador, e
 * não por parecença de texto.
 *
 * Sobra ligar o **id** provado à **forma** que a EA escreveu, e é aí que este
 * script se recusa a adivinhar. Ele só registra o apelido quando a frase força
 * o par: descontadas todas as entidades que o texto já nomeia por um nome
 * conhecido, se restar exatamente um id sem nome e exatamente um nome sem id, o
 * par é o único possível. Dois de cada lado é escolha, não dedução — e vai para
 * o relatório em aberto, com a linha inteira, para uma pessoa decidir.
 *
 * ## O que ele nunca faz
 *
 * Criar entidade. Identificador que a fonte tem e o catálogo não conhece sai no
 * relatório como falta, e nada mais: um id novo precisa de categoria, calibre e
 * compatibilidade, que nenhuma linha de changelog publica.
 */

import { join } from 'node:path';
import { ENTITIES, log, readJson, readJsonIf, writeJson } from './lib/io.ts';
import { attachments, weapons } from './lib/store.ts';
import { resolveItems } from './parse-patch-note.ts';
import { BALANCE_LOG_PATH, type BalanceLog } from './fetch-balance-log.ts';

/** `M121 A2`, `m121-a2` e `M121A2` viram a mesma chave. */
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * A designação de uma arma ou peça, como o patch note a escreve.
 *
 * Fechada de propósito no que tem cara de código de equipamento — `BROD`,
 * `EF88`, `M2010 ESR`, `SVK-8.6`, `18.5KS-K`. Prosa em caixa alta e nome
 * próprio comum ficam de fora: quanto mais candidato o texto oferece, menos
 * frases forçam um par só, e uma lista larga aqui não acha mais apelidos —
 * manda todos para "em aberto".
 */
const DESIGNACAO = /\b[A-Z0-9][A-Za-z0-9.\-/]*(?:[ -][A-Z0-9][A-Za-z0-9.\-/]*)?\b/g;

/** O artigo é da frase, não do equipamento: "The 1P86" é o 1P86. */
const ARTIGO = /^(the|a|an|new|all|these|those|its|both)$/i;

/** Palavra que aparece em caixa alta no changelog e não é equipamento. */
const NAO_E_EQUIPAMENTO =
  /^(EA|DICE|REDSEC|PC|UI|HUD|AI|VFX|SFX|FPS|GPU|CPU|PS5|XBOX|NVIDIA|AMD|TTK|RPM|ADS|POI|MP|BR|SEASON|WEAPONS?|ATTACHMENTS?|GADGETS?|PORTAL|STABILITY|PLAYER|VEHICLES?)$/i;

/**
 * A designação limpa, ou nada quando o trecho não é nome de equipamento.
 *
 * As duas recusas aqui vieram de erro cometido: sem descartar o que não tem
 * letra, "Extended Barrels on all weapons now cost 5 points, reduced from 15"
 * propunha que o Extended Barrel também se chama "15"; sem tirar o artigo, o
 * apelido do 1P86 LPVO saía como "The 1P86". Um apelido errado é pior que
 * apelido nenhum: ele passa a casar frases que não falam daquela peça, e o erro
 * reaparece como mudança atribuída à arma errada, já com aparência de apurada.
 */
export function designacao(texto: string): string | null {
  const palavras = texto.trim().split(/\s+/);
  while (palavras.length && ARTIGO.test(palavras[0])) palavras.shift();
  if (!palavras.length) return null;

  const cabeca = palavras[0];
  const limpo = palavras.join(' ');

  // "15" é quantidade, não nome. Designação tem letra.
  if (!/[A-Za-z]/.test(limpo)) return null;
  if (NAO_E_EQUIPAMENTO.test(cabeca)) return null;

  // Ou traz número — `EF88`, `M2010 ESR` —, ou é sigla em caixa alta — `BROD`.
  return /\d/.test(cabeca) || /^[A-Z][A-Z.\-/]{2,}$/.test(cabeca) ? limpo : null;
}

/**
 * O nome está escrito nesta frase?
 *
 * O separador flexível é o mesmo do parser de patch note: `m60` reconhece
 * "M/60" e `18.5ks-k` reconhece "18.5KS-K". A fronteira impede que `light` case
 * dentro de "slightly".
 */
function citado(linha: string, chave: string): boolean {
  const corpo = chave.split('').join('[^a-z0-9]*');
  return new RegExp(`(?<![a-z0-9])${corpo}(?![a-z0-9])`, 'i').test(linha);
}

interface Prova {
  versao: string;
  url: string | null;
  linha: string;
}

interface Apelido {
  id: string;
  tipo: 'weapon' | 'attachment';
  /** O nome que o catálogo guarda hoje. */
  nome: string;
  /** A forma que a fonte escreveu e o catálogo não reconhecia. */
  apelido: string;
  prova: Prova;
}

interface EmAberto {
  linha: string;
  versao: string;
  /** Os ids que a fonte afirma e o texto não nomeia por forma conhecida. */
  idsSemNome: string[];
  /** As designações do texto que não casam com entidade nenhuma. */
  nomesSemId: string[];
  porQue: string;
}

interface SemEntidade {
  item: string;
  versoes: string[];
  linhas: string[];
}

export interface Relatorio {
  fonte: { provider: string; url: string; retrievedAt: string };
  provados: Apelido[];
  emAberto: EmAberto[];
  semEntidade: SemEntidade[];
}

/** Uma entidade do catálogo, no mínimo que este script precisa saber dela. */
export interface Entidade {
  id: string;
  name: string;
  aliases: string[];
}

/**
 * O catálogo contra o qual conferir.
 *
 * Existe como parâmetro para que o teste possa montar um dataset pequeno e
 * conhecido. Sem isso, o teste da regra de casamento depende de quais apelidos
 * já foram aplicados ao dataset de verdade — e passa a falhar no dia em que
 * alguém aplicar o apelido que ele usava de exemplo, que é o oposto do que um
 * teste dessa regra deveria fazer.
 */
export interface Catalogo {
  weapons: Entidade[];
  attachments: Entidade[];
}

/**
 * Todas as formas por que o catálogo já conhece uma entidade.
 *
 * Nome e apelidos, normalizados. É contra esta lista que se pergunta "o texto
 * já nomeia esta entidade?" — e o `id` também conta, porque há entidade cujo id
 * é a forma escrita.
 */
function formasConhecidas(catalogo: Catalogo): Map<string, string[]> {
  const formas = new Map<string, string[]>();

  for (const entidade of [...catalogo.weapons, ...catalogo.attachments]) {
    formas.set(entidade.id, [entidade.id, entidade.name, ...entidade.aliases].map(normalize));
  }

  return formas;
}

/** O casamento por identificador, nos mesmos moldes de `knownEntities`. */
function mapaDe(entidades: Entidade[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const entidade of entidades) {
    mapa.set(normalize(entidade.name), entidade.id);
    mapa.set(normalize(entidade.id), entidade.id);
    for (const alias of entidade.aliases) mapa.set(normalize(alias), entidade.id);
  }
  return mapa;
}

export function catalogoDoDisco(): Catalogo {
  return {
    weapons: weapons().map(({ id, name, aliases }) => ({ id, name, aliases })),
    /*
     * Só peça global, pela mesma razão que `knownEntities` usa.
     *
     * As específicas de arma repetem nome entre si — há 283 carregadores, e
     * dezenas se chamam "30 Rnd". Indexá-las por nome faria uma delas responder
     * por todas, a esmo, e um apelido casado com a peça errada é exatamente o
     * erro que este script existe para não cometer.
     */
    attachments: attachments()
      .filter((attachment) => attachment.scope === 'global')
      .map(({ id, name, aliases }) => ({ id, name, aliases })),
  };
}

export function conferirNomes(
  balanceLog: BalanceLog,
  catalogo: Catalogo = catalogoDoDisco(),
): Relatorio {
  const known = { weapons: mapaDe(catalogo.weapons), attachments: mapaDe(catalogo.attachments) };
  const formas = formasConhecidas(catalogo);
  const nomeDe = new Map<string, { nome: string; tipo: 'weapon' | 'attachment' }>();

  for (const weapon of catalogo.weapons) nomeDe.set(weapon.id, { nome: weapon.name, tipo: 'weapon' });
  for (const attachment of catalogo.attachments) {
    nomeDe.set(attachment.id, { nome: attachment.name, tipo: 'attachment' });
  }

  /** Toda forma que o catálogo já reconhece, de qualquer entidade. */
  const conhecidas = new Set([...formas.values()].flat());

  const provados: Apelido[] = [];
  const emAberto: EmAberto[] = [];
  const faltantes = new Map<string, SemEntidade>();
  const jaProvado = new Set<string>();

  for (const patch of balanceLog.patches) {
    for (const linha of patch.weaponLines) {
      const { weaponIds, attachmentIds } = resolveItems(linha.items, known);
      const ids = [...weaponIds, ...attachmentIds];

      /*
       * Identificador que a fonte tem e o catálogo não. Não vira entidade aqui
       * — vira pergunta, com as linhas em que apareceu para quem for cadastrar.
       *
       * O vocabulário de slot da fonte (`scopes`, `barrels`, `recon`) cai neste
       * balde e é ruído conhecido: por isso a lista sai no relatório, e não numa
       * issue por item.
       */
      for (const item of linha.items) {
        const chave = normalize(item);
        if (known.weapons.has(chave) || known.attachments.has(chave)) continue;

        const falta = faltantes.get(item) ?? { item, versoes: [], linhas: [] };
        if (!falta.versoes.includes(patch.version)) falta.versoes.push(patch.version);
        if (falta.linhas.length < 3) falta.linhas.push(linha.text);
        faltantes.set(item, falta);
      }

      // Quem o texto já nomeia por forma conhecida está resolvido — sobra o resto.
      const idsSemNome = ids.filter(
        (id) => !(formas.get(id) ?? []).some((forma) => forma.length >= 2 && citado(linha.text, forma)),
      );
      if (!idsSemNome.length) continue;

      const nomesSemId = [
        ...new Set(
          (linha.text.match(DESIGNACAO) ?? [])
            .map(designacao)
            .filter((texto): texto is string => texto !== null),
        ),
      ].filter((texto) => !conhecidas.has(normalize(texto)));

      /*
       * A regra que impede o chute: um de cada lado.
       *
       * Descontado tudo que o texto já nomeia, se resta um id sem nome e um nome
       * sem id, não há outra atribuição possível — a frase força o par. Com dois
       * de cada lado haveria duas atribuições, e escolher uma é adivinhar.
       */
      if (idsSemNome.length === 1 && nomesSemId.length === 1) {
        const id = idsSemNome[0];
        const apelido = nomesSemId[0];
        const chave = `${id}::${normalize(apelido)}`;
        if (jaProvado.has(chave)) continue;
        jaProvado.add(chave);

        const entidade = nomeDe.get(id);
        provados.push({
          id,
          tipo: entidade?.tipo ?? 'weapon',
          nome: entidade?.nome ?? id,
          apelido,
          prova: { versao: patch.version, url: patch.url, linha: linha.text },
        });
        continue;
      }

      emAberto.push({
        linha: linha.text,
        versao: patch.version,
        idsSemNome,
        nomesSemId,
        porQue: !nomesSemId.length
          ? 'a fonte afirma a entidade e a frase não escreve nome nenhum que sirva de apelido'
          : `${idsSemNome.length} entidades sem nome para ${nomesSemId.length} nomes sem entidade — a frase não força um par só`,
      });
    }
  }

  return {
    fonte: {
      provider: balanceLog.source.provider,
      url: balanceLog.source.url,
      retrievedAt: balanceLog.source.retrievedAt,
    },
    provados,
    emAberto,
    semEntidade: [...faltantes.values()].sort((a, b) => a.item.localeCompare(b.item)),
  };
}

export const RELATORIO_PATH = join(ENTITIES, 'nomes-das-fontes.json');

/**
 * Grava os apelidos provados no dataset.
 *
 * Só acrescenta: nome e apelidos que já estavam ficam, porque o que veio à mão
 * foi conferido no jogo e esta rodada não sabe disso. A prova de cada apelido
 * fica no relatório, e não no lado da entidade — o schema da entidade guarda o
 * nome, e a auditoria de onde ele veio é assunto do arquivo de auditoria.
 */
function aplicar(relatorio: Relatorio): number {
  const arquivos = {
    weapon: join(ENTITIES, 'weapons.json'),
    attachment: join(ENTITIES, 'attachments.json'),
  } as const;

  const chaves = { weapon: 'weapons', attachment: 'attachments' } as const;
  let gravados = 0;

  for (const tipo of ['weapon', 'attachment'] as const) {
    const novos = relatorio.provados.filter((apelido) => apelido.tipo === tipo);
    if (!novos.length) continue;

    const arquivo = readJson<Record<string, unknown>>(arquivos[tipo]);
    const lista = arquivo[chaves[tipo]] as { id: string; aliases?: string[] }[];

    for (const { id, apelido } of novos) {
      const entidade = lista.find((candidata) => candidata.id === id);
      if (!entidade) continue;

      entidade.aliases ??= [];
      if (entidade.aliases.some((existente) => normalize(existente) === normalize(apelido))) continue;

      entidade.aliases.push(apelido);
      gravados += 1;
    }

    writeJson(arquivos[tipo], arquivo);
  }

  return gravados;
}

function main(): void {
  const balanceLog = readJsonIf<BalanceLog | null>(BALANCE_LOG_PATH, null);

  if (!balanceLog) {
    console.error(
      'sem data/sources/balance-log.json — rode `npm run catalog:fetch-balance-log` primeiro',
    );
    process.exit(1);
  }

  const relatorio = conferirNomes(balanceLog);
  writeJson(RELATORIO_PATH, relatorio);

  log('nomes das fontes', {
    provados: relatorio.provados.length,
    'em aberto': relatorio.emAberto.length,
    'sem entidade': relatorio.semEntidade.length,
    arquivo: 'data/entities/nomes-das-fontes.json',
  });

  for (const { nome, apelido, prova } of relatorio.provados) {
    log(`  🟢 ${nome} também é "${apelido}"`, `${prova.versao}: ${prova.linha.slice(0, 80)}`);
  }
  for (const aberto of relatorio.emAberto) {
    log(`  🟡 ${aberto.versao}`, `${aberto.porQue} — ${aberto.linha.slice(0, 80)}`);
  }

  if (process.argv.includes('--aplicar')) {
    const gravados = aplicar(relatorio);
    log('apelidos gravados no dataset', gravados);
  } else if (relatorio.provados.length) {
    log('nada foi gravado', 'rode com --aplicar para registrar os apelidos provados');
  }
}

if (process.argv[1] && process.argv[1].endsWith('nomes.ts')) main();
