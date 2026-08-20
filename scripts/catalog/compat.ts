#!/usr/bin/env node
/**
 * O montador confere com o que as fontes dizem do jogo?
 *
 *   npm run catalog:compat
 *
 * O catálogo em `data/` e o dataset que a tela usa (`src/data/`) são dois
 * mundos que ninguém comparava. O catálogo é atualizado pela automação a cada
 * patch; o dataset é o que decide o que aparece no Gunsmith do site. Em agosto
 * de 2026 eles tinham divergido em silêncio: a L115 abria sem o Acessório
 * Esquerdo — sem lanterna e sem telêmetro —, quinze armas declaravam esse slot
 * e não recebiam peça nenhuma, e a família de lasers faltava em doze armas. Nada
 * disso quebrava teste, porque nada comparava as duas coisas.
 *
 * ## Ausência não é negativa
 *
 * A conferência usa duas fontes de fora, e a diferença entre elas é o que dá
 * sentido ao resultado:
 *
 * - a **matriz** da versão corrente (`data/versions/<v>/compatibility.json`),
 *   que cobre as 62 armas e vem da planilha mestra;
 * - o **instantâneo** do bf6loadouts (`data/sources/imports/`), capturado à mão
 *   e por isso incompleto: das 62 armas, ele leu 27.
 *
 * O erro fácil aqui é ler "o instantâneo não tem" como "o jogo não tem". São
 * coisas diferentes, e a distinção decide cada linha do relatório:
 *
 * - o instantâneo **leu aquela arma e enumerou aquele slot** sem a peça →
 *   `conflito`. É enumeração, não silêncio: a página lista as oito bocas da
 *   AK4D, e o Flash Comp não é uma delas. Vale como evidência contrária, e por
 *   isso nada é aplicado — mas não vira erro, porque a página também atrasa.
 * - o instantâneo **não leu aquela arma** → `não conferido`. Aqui só a matriz
 *   fala, e ela é a única evidência que existe. Continua sendo erro quando o
 *   montador não tem a peça: foi exatamente esse caso — a captura truncada da
 *   L115 — que deixou a arma sem telêmetro por meses.
 * - o montador dá e nenhuma fonte confirma → `sem fonte`. Quase sempre é o
 *   filtro por categoria do Gunsmith, curadoria declarada em ATUALIZAR.md.
 *   Vira número no resumo, nunca erro: cobrar isso faria a automação apagar
 *   curadoria para voltar a passar.
 *
 * ## O que derruba a execução, e o que só é registrado
 *
 * Falhar em toda divergência seria pior que não conferir: metade delas é fonte
 * única falando sozinha, e um CI vermelho por isso empurra quem estiver de
 * plantão a cadastrar peça sem evidência só para voltar ao verde. Então:
 *
 * - **erro sempre**: as duas fontes confirmam a peça e o montador não a tem.
 *   Não há leitura possível em que isso esteja certo.
 * - **erro por regressão**: divergência que não estava no baseline da versão.
 *   O estado aceito de cada patch fica gravado em `data/compatibility/<v>.json`,
 *   com o motivo e o que cada fonte disse; o que aparecer depois dele é
 *   mudança, e mudança precisa de gente olhando.
 * - **aviso**: divergência que o baseline já registra. Ela continua à vista, sem
 *   travar quem está mexendo em outra coisa.
 *
 * O baseline só é reescrito com `npm run catalog:compat -- --baseline`, à mão.
 * Se a execução comum pudesse regravá-lo, o CI se curaria sozinho — e a
 * conferência viraria enfeite.
 *
 * ## O que não dá para comparar
 *
 * Munição, carregador e mira ficam fora do casamento por nome, e **cano fica
 * fora da contagem**. Não é a mesma coisa que faltar dado: é modelagem
 * diferente. A matriz nomeia cano por família — `Basic`, `Extended`, `Light`,
 * `Heavy` —, e aqui cano é peça física, com polegada e papel no nome: `21.5"
 * Factory`, `11" Heavy`, `12.5" Fluted`. Comparar por nome produzia 212 pares
 * "sem confirmação" e sete avisos de peça inexistente, todos falsos. Enquanto
 * não houver mapa de família, o que sobra do cano é só a peça cujo nome bate
 * de verdade — a Cryogenic, por exemplo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATTACHMENTS, isCompatible } from '../../src/data/attachments.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import type { Attachment, Weapon } from '../../src/data/types.ts';
import {
  DATA,
  IMPORTS,
  INDEXES,
  NOW,
  ensureDir,
  log,
  readJson,
  readJsonIf,
  versionDir,
  writeJson,
} from './lib/io.ts';

interface LinhaDeCompatibilidade {
  weaponId: string;
  attachmentId: string;
  slot: string;
  status?: string;
}

interface PecaDoCatalogo {
  id: string;
  name?: string;
  cost?: number;
}

/** Slot da fonte → slot daqui. O que não está aqui não é conferido. */
const SLOTS: Record<string, string> = {
  laser: 'rightRail',
  light: 'leftRail',
  muzzle: 'muzzle',
  underbarrel: 'underbarrel',
  barrel: 'barrel',
};

/**
 * Slot em que a fonte e o dataset descrevem a peça em eixos diferentes.
 *
 * O par continua sendo conferido quando o nome bate; o que sai é a contagem e o
 * aviso de peça inexistente, que ali só mediriam a diferença de modelagem.
 */
const SEM_METRICA = new Set(['barrel']);

/** Slot da fonte → slot no instantâneo, que usa outro vocabulário. */
const NO_INSTANTANEO: Record<string, string[]> = {
  laser: ['right accessory', 'top accessory'],
  light: ['right accessory', 'top accessory'],
  muzzle: ['muzzle'],
  underbarrel: ['underbarrel'],
  barrel: ['barrel'],
};

/**
 * A matriz encurta alguns nomes de arma, e o dataset não.
 *
 * Sem isto as três somem do casamento e viram falso "o montador dá e a fonte
 * não" — uma divergência inventada pela comparação, que é o pior tipo.
 */
const APELIDOS: Record<string, string> = {
  ks18k: '18-5ks-k',
  kts100: 'kts100-mk8',
  sor556: 'sor-556-mk2',
};

/**
 * Nome que a fonte escreve de outro jeito.
 *
 * Sem isto o Combo vira "peça da fonte sem correspondência" em nove armas, e o
 * aviso esconde o que ele deveria mostrar: peça que realmente não existe aqui.
 */
const APELIDOS_DE_PECA: Record<string, string> = {
  'combo red': 'Laser/Light Combo Red',
  'combo green': 'Laser/Light Combo Green',
};

const chave = (valor: string) => String(valor).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Onde o estado aceito de cada versão fica gravado. */
const baselineDe = (versao: string) => join(DATA, 'compatibility', `${versao}.json`);

type Status = 'conflito' | 'nao_conferido' | 'exclusao_declarada' | 'confirmado_e_ausente';

interface Divergencia {
  arma: string;
  peca: string;
  slot: string;
  status: Status;
  motivo: string;
  fontes: { matriz: boolean; instantaneo: 'nao_leu' | 'slot_enumerado' | 'confirma' };
}

interface Baseline {
  gameVersion: string;
  geradoEm: string;
  fontes: { matriz: string; instantaneo: string };
  resumo: Record<string, number>;
  divergencias: Divergencia[];
}

/** Uma divergência é a mesma quando fala da mesma peça na mesma arma. */
const idDaDivergencia = (d: Divergencia) => `${d.peca}|${d.arma}`;

function main(): void {
  const { gameVersion } = readJson<{ gameVersion: string }>(join(INDEXES, 'current.json'));
  const { compatibility } = readJson<{ compatibility: LinhaDeCompatibilidade[] }>(
    join(versionDir(gameVersion), 'compatibility.json'),
  );
  const catalogo = readJson<PecaDoCatalogo[] | { attachments: PecaDoCatalogo[] }>(
    join(versionDir(gameVersion), 'attachments.json'),
  );
  const pecasDoCatalogo = new Map(
    (Array.isArray(catalogo) ? catalogo : catalogo.attachments).map((p) => [p.id, p.name ?? p.id]),
  );

  const instantaneo = lerInstantaneo();

  const porChave = new Map(WEAPONS.map((w) => [chave(w.id), w]));
  for (const [naFonte, aqui] of Object.entries(APELIDOS)) {
    const arma = WEAPONS.find((w) => w.id === aqui);
    if (arma) porChave.set(naFonte, arma);
  }

  const erros: string[] = [];
  const avisos: string[] = [];
  const semCorrespondencia = new Map<string, number>();
  const naMatriz = new Set<string>();
  const daFonte = new Set<string>();
  const divergencias: Divergencia[] = [];
  let confirmados = 0;

  for (const linha of compatibility) {
    if (linha.status && linha.status !== 'active') continue;

    const arma = porChave.get(chave(linha.weaponId));
    if (arma) naMatriz.add(arma.id);

    const slot = SLOTS[linha.slot];
    if (!slot || !arma) continue;

    const bruto = pecasDoCatalogo.get(linha.attachmentId) ?? linha.attachmentId;
    const nome = APELIDOS_DE_PECA[bruto.toLowerCase()] ?? bruto;
    const peca = ATTACHMENTS.find((a) => a.slot === slot && chave(a.originalName) === chave(nome));

    if (!peca) {
      if (SEM_METRICA.has(linha.slot)) continue;
      const rotulo = `${linha.slot}: ${nome}`;
      semCorrespondencia.set(rotulo, (semCorrespondencia.get(rotulo) ?? 0) + 1);
      continue;
    }

    daFonte.add(`${peca.id}|${arma.id}`);
    if (isCompatible(peca, arma)) {
      confirmados += 1;
      continue;
    }

    const lido = instantaneo.get(arma.id);
    const enumerouOSlot = Boolean(lido && NO_INSTANTANEO[linha.slot].some((s) => lido.has(s)));
    const confirmaOInstantaneo = Boolean(
      lido && NO_INSTANTANEO[linha.slot].some((s) => lido.get(s)?.has(chave(nome))),
    );
    const noInstantaneo = confirmaOInstantaneo
      ? ('confirma' as const)
      : enumerouOSlot
        ? ('slot_enumerado' as const)
        : ('nao_leu' as const);

    /*
      `except` é decisão escrita à mão: alguém olhou aquela arma e disse que a
      peça não entra. Cobrar isso como erro faria a conferência exigir que a
      curadoria fosse desfeita para o pipeline voltar a passar.
    */
    if (peca.compat.except?.includes(arma.id)) {
      divergencias.push({
        arma: arma.id,
        peca: peca.id,
        slot: peca.slot,
        status: 'exclusao_declarada',
        motivo: 'a matriz dá e o dataset exclui de propósito, por except',
        fontes: { matriz: true, instantaneo: noInstantaneo },
      });
      continue;
    }

    divergencias.push({
      arma: arma.id,
      peca: peca.id,
      slot: peca.slot,
      status: confirmaOInstantaneo ? 'confirmado_e_ausente' : enumerouOSlot ? 'conflito' : 'nao_conferido',
      motivo: confirmaOInstantaneo
        ? 'as duas fontes confirmam a peça e o montador não a oferece'
        : enumerouOSlot
          ? 'a matriz dá, e o instantâneo enumerou o slot dessa arma sem a peça'
          : 'fonte única: a matriz dá e o instantâneo não leu esta arma',
      fontes: { matriz: true, instantaneo: noInstantaneo },
    });
  }

  /*
    O outro lado: o que a tela oferece e nenhuma fonte confirma. Não é erro — é
    o tamanho da área que ninguém audita, e serve para saber se ela cresce.
  */
  const semFonte = new Map<string, number>();
  for (const peca of ATTACHMENTS) {
    if (!Object.values(SLOTS).includes(peca.slot)) continue;
    if (SEM_METRICA.has(peca.slot)) continue;
    for (const arma of WEAPONS) {
      if (!isCompatible(peca, arma)) continue;
      if (daFonte.has(`${peca.id}|${arma.id}`)) continue;
      semFonte.set(peca.slot, (semFonte.get(peca.slot) ?? 0) + 1);
    }
  }

  for (const [rotulo, armas] of [...semCorrespondencia].sort((a, b) => b[1] - a[1])) {
    avisos.push(`peça da fonte sem correspondência aqui — ${rotulo} (${armas} armas)`);
  }

  /*
    Arma que a matriz não cobre não tem como ser conferida, e o silêncio dela
    não é aval. É o caso do Interdictor, que chegou na 1.4.2.0 depois de a
    matriz ser montada — e de qualquer arma que entrar na próxima temporada.
  */
  const foraDaMatriz = WEAPONS.filter((w) => w.category !== 'melee' && !naMatriz.has(w.id));
  if (foraDaMatriz.length) {
    avisos.push(
      `fora da matriz, sem conferência possível: ${foraDaMatriz.map((w) => w.id).join(', ')}`,
    );
  }

  for (const [slot, armas] of slotsVazios()) {
    avisos.push(`slot ${slot} declarado sem nenhuma peça em ${armas.length}: ${armas.join(', ')}`);
  }

  const resumo = {
    confirmado: confirmados,
    conflito: divergencias.filter((d) => d.status === 'conflito').length,
    nao_conferido: divergencias.filter((d) => d.status === 'nao_conferido').length,
    exclusao_declarada: divergencias.filter((d) => d.status === 'exclusao_declarada').length,
    confirmado_e_ausente: divergencias.filter((d) => d.status === 'confirmado_e_ausente').length,
    sem_fonte: [...semFonte.values()].reduce((total, n) => total + n, 0),
  };

  const novo: Baseline = {
    gameVersion,
    geradoEm: NOW,
    fontes: {
      matriz: `data/versions/${gameVersion}/compatibility.json`,
      instantaneo: 'data/sources/imports/bf6loadouts-weapons-2026-08-12.json',
    },
    resumo,
    divergencias: divergencias.sort((a, b) => idDaDivergencia(a).localeCompare(idDaDivergencia(b))),
  };

  if (process.argv.includes('--baseline')) {
    ensureDir(join(DATA, 'compatibility'));
    writeJson(baselineDe(gameVersion), novo);
    log('baseline gravado', { arquivo: `data/compatibility/${gameVersion}.json`, ...resumo });
    return;
  }

  const anterior = readJsonIf<Baseline | null>(baselineDe(gameVersion), null);
  const conhecidas = new Set((anterior?.divergencias ?? []).map(idDaDivergencia));

  for (const d of divergencias) {
    const linha = `${d.peca} em ${d.arma} · ${d.status} — ${d.motivo}`;

    // Peça que as duas fontes confirmam e o montador não tem não espera baseline:
    // não existe leitura em que isso esteja certo.
    if (d.status === 'confirmado_e_ausente') {
      erros.push(linha);
      continue;
    }
    if (!anterior) {
      avisos.push(`${linha} (sem baseline gravado para esta versão)`);
      continue;
    }
    if (conhecidas.has(idDaDivergencia(d))) avisos.push(linha);
    else erros.push(`${linha} — divergência nova desde o baseline`);
  }

  /*
    Divergência que sumiu é notícia boa, e ainda assim precisa de gente: alguém
    cadastrou a peça, e o baseline tem de acompanhar para não guardar um estado
    que não existe mais.
  */
  const agora = new Set(divergencias.map(idDaDivergencia));
  for (const d of anterior?.divergencias ?? []) {
    if (!agora.has(idDaDivergencia(d))) {
      avisos.push(`resolvida desde o baseline · ${d.peca} em ${d.arma} — regrave com --baseline`);
    }
  }

  for (const aviso of avisos) console.warn(`  aviso  ${aviso}`);
  for (const erro of erros) console.error(`  ERRO   ${erro}`);

  log('compatibilidade', {
    'versão': gameVersion,
    'armas na matriz': naMatriz.size,
    'armas no instantâneo': instantaneo.size,
    baseline: anterior ? `data/compatibility/${gameVersion}.json` : 'não gravado',
    ...resumo,
    'sem fonte por slot': [...semFonte].map(([s, n]) => `${s}:${n}`).join(' ') || '0',
    erros: erros.length,
    avisos: avisos.length,
  });

  if (erros.length) {
    console.error(
      `\n${erros.length} divergência(s) que o baseline desta versão não previa. Confira no jogo antes de regravar o baseline.`,
    );
    process.exit(1);
  }
}

/**
 * O instantâneo do bf6loadouts, indexado por arma e slot.
 *
 * Ele não é obrigatório: a captura é manual, e um repositório recém-clonado pode
 * não tê-la. Sem ele a conferência continua, valendo só a matriz — e o resumo
 * diz quantas armas ele cobriu, para ninguém confundir "passou" com "conferido".
 */
function lerInstantaneo(): Map<string, Map<string, Set<string>>> {
  const arquivos = [join(IMPORTS, 'bf6loadouts-weapons-2026-08-12.json')];
  const porArma = new Map<string, Map<string, Set<string>>>();

  for (const arquivo of arquivos) {
    let bruto: { weapons?: Record<string, { slot: string; name: string }[]> };
    try {
      bruto = JSON.parse(readFileSync(arquivo, 'utf8'));
    } catch {
      continue;
    }
    for (const [id, pecas] of Object.entries(bruto.weapons ?? {})) {
      const porSlot = porArma.get(id) ?? new Map<string, Set<string>>();
      for (const peca of pecas) {
        const nomes = porSlot.get(peca.slot) ?? new Set<string>();
        nomes.add(chave(peca.name));
        porSlot.set(peca.slot, nomes);
      }
      porArma.set(id, porSlot);
    }
  }

  return porArma;
}

/**
 * Slot que a arma declara e para o qual não existe peça compatível nenhuma.
 *
 * Não é erro: slot pode existir no Gunsmith sem opção que caiba naquela arma, e
 * a tela nem o desenha quando ele fica vazio. Vira aviso porque é onde um
 * buraco de dado costuma aparecer primeiro.
 */
function slotsVazios(): Map<string, string[]> {
  const porSlot = new Map<string, string[]>();
  for (const arma of WEAPONS as Weapon[]) {
    for (const slot of arma.slots) {
      const tem = ATTACHMENTS.some(
        (peca: Attachment) => peca.slot === slot && isCompatible(peca, arma),
      );
      if (!tem) porSlot.set(slot, [...(porSlot.get(slot) ?? []), arma.id]);
    }
  }
  return porSlot;
}

main();
