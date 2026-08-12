import { ATTACHMENTS_BY_ID, attachmentsForWeapon } from '@/data/attachments';
import { budgetFor, SLOTS_BY_ID } from '@/data/classes';
import type { Attachment, SlotId, Weapon } from '@/data/types';
import { attachmentCost, attachmentName, factoryAttachments } from './loadout';
import type { CitedSource } from './sources';
import { calculateStats, type EffectiveStats } from './stats';

/**
 * A recomendação de loadout.
 *
 * Quem escolhe os acessórios é um modelo com busca na web, pesando guias e
 * discussões do Reddit (ver `src/app/api/recommend/route.ts`). Este arquivo
 * guarda o que é determinístico e testável: o vocabulário dos alcances, o
 * cardápio que o modelo recebe, a validação do que ele devolve — contra o
 * arsenal da arma e contra o orçamento, porque modelo sugere e o jogo cobra — e
 * a montagem local que entra quando a busca não vem.
 */

export const COMBAT_RANGES = [
  {
    value: 'curta',
    label: 'Curta',
    hint:
      'Mapas pequenos — Empire State, Hagental, Cerco do Cairo — e modos que forçam a briga ' +
      'de perto, como Team Deathmatch e Domination.',
  },
  {
    value: 'media',
    label: 'Média',
    hint: 'Mapas médios, como Contaminação e Eastwood: engajamentos mistos, sem dono de distância.',
  },
  {
    value: 'longa',
    label: 'Longa',
    hint:
      'Mapas grandes — Operação Fogo Cruzado, Recife de Tsuru, Ferrovia Golmud — onde o duelo ' +
      'começa longe e o alcance decide.',
  },
] as const;

export type CombatRange = (typeof COMBAT_RANGES)[number]['value'];

/**
 * O alcance que o botão único pede.
 *
 * A tela deixou de perguntar a distância — é um botão só, e quem clica quer a
 * arma montada, não um formulário. A média é a escolha honesta para quem não
 * disse nada: serve o mapa médio e não sacrifica nenhum extremo. Os outros dois
 * continuam valendo na rota, que aceita os três.
 */
export const DEFAULT_RANGE: CombatRange = 'media';

export const isCombatRange = (value: unknown): value is CombatRange =>
  COMBAT_RANGES.some((range) => range.value === value);

/**
 * O que cada alcance valoriza, e o quanto.
 *
 * Peso negativo é estatística em que menos é melhor — tempo de mira, recuo,
 * recarga. As chaves `dps` e `range` não existem em `EffectiveStats`: são
 * derivadas, e `statValue` sabe calculá-las.
 */
const WEIGHTS: Record<CombatRange, Partial<Record<keyof EffectiveStats | 'dps' | 'range', number>>> =
  {
    curta: {
      dps: 0.9,
      adsMs: -0.75,
      swapMs: -0.35,
      hipfire: 0.85,
      mobility: 0.65,
      control: 0.35,
      reload: -0.3,
      magazine: 0.2,
    },
    media: {
      dps: 0.8,
      range: 0.45,
      velocity: 0.35,
      accuracy: 0.7,
      control: 0.7,
      adsMs: -0.35,
      reload: -0.2,
      magazine: 0.25,
      mobility: 0.2,
    },
    longa: {
      dps: 0.45,
      range: 0.9,
      velocity: 0.8,
      drag: -0.35,
      accuracy: 0.8,
      control: 0.75,
      verticalRecoil: -0.65,
      horizontalRecoil: -0.65,
      adsMs: -0.15,
      magazine: 0.2,
    },
  };

/** Sem acentos e sem pontuação: `14.5" Carbine` e `145 carbine` viram a mesma coisa. */
const normalizeKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Quantas letras separam duas palavras. Levenshtein, sem economia: os nomes são curtos. */
function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const current = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = current;
    }
  }

  return previous[b.length];
}

/**
 * A peça daquele slot com esse nome, aceitando o erro de uma sílaba.
 *
 * O modelo lê a lista e reescreve o nome de memória, e às vezes reescreve
 * torto: pediu "Mini Reflex 1.00x" onde a TR-7 tem "Mini Flex 1.00x", e a
 * resposta inteira foi para o lixo por duas letras. O nome exato manda; só se
 * ele não existir é que a peça mais próxima entra, e apenas quando é a única
 * perto o bastante — em dúvida entre duas, recusar é mais seguro que sortear.
 *
 * O limiar é apertado de propósito. Nomes de acessório se distinguem por
 * pouco — "Cano de 46 cm" e "Cano de 41 cm" estão a uma letra —, então nomes
 * curtos só toleram um deslize, e nenhum tolera diferença em dígito.
 */
function findPart(parts: Attachment[], weapon: Weapon, wanted: string): Attachment | undefined {
  /*
   * O custo vem colado no nome, e não é culpa do modelo.
   *
   * O cardápio do prompt lista "Compensador Linear (10 pts)", porque o preço é
   * o que decide o que cabe no orçamento. O modelo então devolve o nome com o
   * preço junto — e a peça deixava de ser encontrada por causa do sufixo que a
   * própria pergunta pôs ali.
   */
  const target = normalizeKey(wanted.replace(/\s*\(\s*\d+\s*pts?\s*\)\s*$/i, ''));
  const exact = parts.find((part) => normalizeKey(attachmentName(part, weapon)) === target);
  if (exact) return exact;

  const digits = (value: string) => value.replace(/\D/g, '');
  const limit = target.length >= 8 ? 2 : 1;

  const near = parts.filter((part) => {
    const key = normalizeKey(attachmentName(part, weapon));
    if (digits(key) !== digits(target)) return false;
    return editDistance(key, target) <= limit;
  });

  if (near.length === 1) return near[0];

  /*
   * O nome abreviado, quando ele só pode ser um.
   *
   * O modelo escreveu "RO-M" para a "RO-M 1.00x" — cortou a ampliação, que é o
   * que distingue uma mira da outra na lista. A distância de edição não salva
   * esse caso: faltam seis caracteres e os dígitos não batem.
   *
   * O prefixo salva, com uma condição: ele precisa apontar para uma peça só. Se
   * "RO-M" servisse para duas miras, escolher uma seria adivinhar qual — e o
   * descarte, com o nome no log, é a resposta honesta.
   */
  const prefixed = parts.filter((part) =>
    normalizeKey(attachmentName(part, weapon)).startsWith(target),
  );

  return prefixed.length === 1 ? prefixed[0] : undefined;
}

/**
 * O cardápio da arma, slot a slot, no formato que entra no prompt.
 *
 * Cada linha traz o id do slot — que é a chave que o modelo devolve —, o nome
 * do slot em português e as peças com o custo ao lado, porque o orçamento é
 * regra do jogo e o modelo só respeita o que consegue ver.
 */
export function attachmentMenu(weapon: Weapon): string {
  const bySlot = attachmentsForWeapon(weapon);
  return weapon.slots
    .map((slot) => {
      const parts = bySlot.get(slot) ?? [];
      if (!parts.length) return null;
      const names = [
        ...new Set(
          parts.map((part) => `${attachmentName(part, weapon)} (${attachmentCost(part, weapon)} pts)`),
        ),
      ];
      return `${slot} (${SLOTS_BY_ID.get(slot)?.name ?? slot}): ${names.join(' | ')}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** Quanto a montagem custa nesta arma, pela mesma tabela que a tela usa. */
export function buildCost(weapon: Weapon, build: Partial<Record<SlotId, string>>): number {
  return Object.values(build).reduce((total, id) => {
    const part = id ? ATTACHMENTS_BY_ID.get(id) : undefined;
    return total + (part ? attachmentCost(part, weapon) : 0);
  }, 0);
}

function statValue(stats: EffectiveStats, key: keyof EffectiveStats | 'dps' | 'range') {
  if (key === 'dps') {
    return ((stats.damage[0]?.damage ?? 0) * stats.pellets * stats.rpm) / 60;
  }
  if (key === 'range') {
    return Math.max(0, ...stats.damage.map((step) => step.distance));
  }

  const value = stats[key];
  return typeof value === 'number' ? value : 0;
}

function score(stats: EffectiveStats, range: CombatRange) {
  return Object.entries(WEIGHTS[range]).reduce((total, [key, weight]) => {
    const value = statValue(stats, key as keyof EffectiveStats | 'dps' | 'range');
    return total + value * (weight ?? 0);
  }, 0);
}

/**
 * Quanto uma peça vale nesta arma, para aquele alcance.
 *
 * A peça é medida sozinha na arma, e não junto das outras: o que interessa é
 * ordenar candidatas dentro do mesmo slot, e para isso a comparação em pé de
 * igualdade basta. É a nota que decide a montagem local.
 */
export function attachmentScore(
  weapon: Weapon,
  attachment: Attachment,
  range: CombatRange,
): number {
  return score(calculateStats(weapon, [attachment]), range);
}

/**
 * Montagem local, sem IA.
 *
 * Ela parte do que vem de fábrica e troca uma peça por slot quando a troca
 * melhora a pontuação daquele alcance e ainda cabe no orçamento. A sugestão da
 * comunidade continua sendo o caminho principal — esta aqui é a rede de
 * segurança para quando a busca não vem.
 */
export function idealLoadout(
  weapon: Weapon,
  range: CombatRange = DEFAULT_RANGE,
): Partial<Record<SlotId, string>> {
  const bySlot = attachmentsForWeapon(weapon);
  const budget = budgetFor(weapon.category);
  const build: Partial<Record<SlotId, string>> = { ...factoryAttachments(weapon) };

  const candidates: { slot: SlotId; attachment: Attachment; gain: number }[] = [];
  for (const slot of weapon.slots) {
    const currentId = build[slot];
    const current = currentId ? ATTACHMENTS_BY_ID.get(currentId) : null;
    const baseline = current ? attachmentScore(weapon, current, range) : 0;

    for (const attachment of bySlot.get(slot) ?? []) {
      if (attachment.id === currentId) continue;
      const gain = attachmentScore(weapon, attachment, range) - baseline;
      if (gain > 0) candidates.push({ slot, attachment, gain });
    }
  }

  candidates.sort((a, b) => b.gain - a.gain);

  /*
   * Um slot é decidido uma vez só.
   *
   * A lista vem do melhor ganho para o pior, e sem esta trava a candidata
   * seguinte do mesmo slot sobrescrevia a que já tinha entrado — o resultado
   * era sempre a pior das candidatas positivas, não a melhor. Slot que não
   * recebeu ninguém continua aberto de propósito: quando a preferida não cabe
   * no orçamento, a próxima da fila daquele slot ainda tem vez.
   */
  const settled = new Set<SlotId>();

  for (const { slot, attachment } of candidates) {
    if (settled.has(slot)) continue;

    const previous = build[slot];
    build[slot] = attachment.id;
    if (buildCost(weapon, build) > budget) {
      if (previous) build[slot] = previous;
      else delete build[slot];
      continue;
    }
    settled.add(slot);
  }

  return build;
}

export interface Recommendation {
  attachments: Partial<Record<SlotId, string>>;
  /** O que o modelo pediu e não entrou, com o motivo — vai para o log da rota. */
  discarded: string[];
  /**
   * Os slots em que a peça pedida é a peça que ficou.
   *
   * Slot que não está aqui ou não foi escolhido, ou teve a escolha recusada e
   * voltou para a de fábrica — e a explicação que o modelo escreveu para ele
   * fala de uma peça que não está montada.
   */
  accepted: SlotId[];
}

/**
 * Onde a arma está hoje. Popularidade não é força: arma muito levada e mediana
 * é `POPULAR`, não `META` — a distinção existe para a tela não chamar de meta o
 * que é só hábito.
 */
export const RECOMMENDATION_STATUSES = [
  'META',
  'STRONG',
  'TRENDING',
  'POPULAR',
  'NICHE',
  'OFF-META',
] as const;

/** Quanto a leitura se sustenta: fontes concordando e dado junto, ou opinião solta. */
export const RECOMMENDATION_CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];
export type RecommendationConfidence = (typeof RECOMMENDATION_CONFIDENCES)[number];

/**
 * A sugestão da comunidade como a tela a recebe.
 *
 * Tudo que não é a montagem em si pode faltar: a resposta é de um modelo, e
 * campo sem evidência é melhor vazio que preenchido no chute. Só `attachments`
 * e `reason` são garantidos — o resto a tela mostra quando vier.
 */
export interface LoadoutAdvice {
  attachments: Partial<Record<SlotId, string>>;
  /** Uma frase por slot: o que aquela peça resolve nesta arma. */
  why: Partial<Record<SlotId, string>>;
  reason: string;
  playstyle: string | null;
  range: { main: string | null; secondary: string | null };
  status: RecommendationStatus | null;
  confidence: RecommendationConfidence | null;
  /** Uma outra montagem, para uma situação diferente — aplicável com um clique. */
  alternative: {
    label: string;
    when: string | null;
    attachments: Partial<Record<SlotId, string>>;
  } | null;
  consensus: string | null;
  changes: string | null;
  sources: CitedSource[];
  /** A busca não citou uma página sequer: isto é memória do modelo, não leitura. */
  unsourced: boolean;
}

/** A resposta do modelo, crua, antes de qualquer trava. */
export interface RawAdvice {
  picks?: unknown;
  why?: unknown;
  reason?: unknown;
  playstyle?: unknown;
  range?: { main?: unknown; secondary?: unknown };
  status?: unknown;
  confidence?: unknown;
  alternative?: { label?: unknown; when?: unknown; picks?: unknown };
  consensus?: unknown;
  changes?: unknown;
}

/**
 * Texto do modelo, aparado.
 *
 * O limite não é decoração: o painel tem tamanho, e uma resposta que resolveu
 * escrever um guia inteiro num campo de duas frases quebraria o desenho da tela
 * em vez de informar mais.
 */
function trimmedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean ? clean.slice(0, max) : null;
}

/** Vocabulário fechado: rótulo fora da lista é rótulo inventado. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return allowed.find((item) => item === upper) ?? null;
}

/**
 * A resposta do modelo virada conselho publicável.
 *
 * `discarded` sai junto porque a política de quem chama é não entregar build
 * com peça recusada: a montagem que aparece na tela é para ser montável no jogo
 * inteira, e um resto de build ainda vem acompanhado de um texto que descreve a
 * build completa que o modelo imaginou. Quem chama refaz o pedido.
 *
 * A alternativa é contada à parte, e por experiência: uma resposta com a build
 * principal impecável foi recusada duas vezes porque a alternativa pedia uma
 * mira com o nome trocado. Ela é um extra da tela — quando não se sustenta, sai
 * de cena sozinha, e o que o visitante pediu continua de pé.
 *
 * Lança quando não sobra montagem nenhuma — o sinal para tentar outro modelo em
 * vez de entregar o que a arma já vinha de fábrica.
 */
export function buildAdvice(
  weapon: Weapon,
  raw: RawAdvice,
  sources: CitedSource[],
): { advice: LoadoutAdvice; discarded: string[]; alternativeDiscarded: string[] } {
  if (!raw.picks || typeof raw.picks !== 'object') throw new Error('resposta sem escolhas');

  const { attachments, discarded, accepted } = validateRecommendation(
    weapon,
    raw.picks as Partial<Record<SlotId, unknown>>,
  );

  // Recomendação que não muda nada além da fábrica não vale publicar.
  const factory = factoryAttachments(weapon);
  const changedSomething = Object.entries(attachments).some(
    ([slot, id]) => factory[slot as SlotId] !== id,
  );
  if (!changedSomething) throw new Error('nenhuma peça reconhecida além da fábrica');

  /*
   * A frase de cada peça só vale para o slot em que a peça pedida é a que
   * ficou. Sem esta trava, a explicação da munição Hollow Point aparecia
   * embaixo da FMJ que o funil manteve — o texto descrevendo uma arma e a
   * lista mostrando outra.
   */
  const why: Partial<Record<SlotId, string>> = {};
  if (raw.why && typeof raw.why === 'object') {
    for (const slot of accepted) {
      const phrase = trimmedText((raw.why as Record<string, unknown>)[slot], 140);
      if (phrase) why[slot] = phrase;
    }
  }

  /*
   * A alternativa passa pelo mesmo funil da principal: ela aplica com um
   * clique, e peça inventada ou fora do orçamento estragaria a build de quem
   * clicasse. Alternativa que chega igual à principal não é alternativa.
   */
  const alternativeDiscarded: string[] = [];
  const alternative = (() => {
    const other = raw.alternative;
    if (!other?.picks || typeof other.picks !== 'object') return null;

    const built = validateRecommendation(weapon, other.picks as Partial<Record<SlotId, unknown>>);
    if (built.discarded.length) {
      alternativeDiscarded.push(...built.discarded);
      return null;
    }
    if (JSON.stringify(built.attachments) === JSON.stringify(attachments)) return null;

    return {
      label: trimmedText(other.label, 40) ?? 'outra situação',
      when: trimmedText(other.when, 200),
      attachments: built.attachments,
    };
  })();

  /*
   * Confiança alta exige lastro.
   *
   * A busca é uma ferramenta que o modelo pode simplesmente não usar, e quando
   * ele não usa a resposta sai da memória dele — com a mesma cara segura de
   * sempre. Já veio um "status META, confiança HIGH" sem uma única página
   * aberta. Sem fonte, o teto é LOW.
   */
  const unsourced = sources.length === 0;
  const declared = oneOf(raw.confidence, RECOMMENDATION_CONFIDENCES);

  return {
    advice: {
      attachments,
      why,
      /*
       * A resposta encolheu para caber em vinte segundos: o modelo devolve só
       * as peças. Quando ele mesmo assim escrever um porquê, ele é aproveitado;
       * quando não, fica a frase que descreve o que a montagem é.
       */
      reason: trimmedText(raw.reason, 600) ?? 'Montagem citada pela comunidade para este alcance.',
      playstyle: trimmedText(raw.playstyle, 500),
      range: {
        main: trimmedText(raw.range?.main, 40),
        secondary: trimmedText(raw.range?.secondary, 40),
      },
      status: oneOf(raw.status, RECOMMENDATION_STATUSES),
      confidence: unsourced ? 'LOW' : declared,
      alternative,
      consensus: trimmedText(raw.consensus, 600),
      changes: trimmedText(raw.changes, 400),
      sources,
      unsourced,
    },
    discarded,
    alternativeDiscarded,
  };
}

/**
 * Valida o que o modelo escolheu e devolve uma montagem válida por construção.
 *
 * Parte do que a arma traz de fábrica — slot de fábrica nunca fica vazio — e
 * aplica as escolhas na ordem dos slots da arma, uma por slot. Nome que não
 * existe naquele slot desta arma é descartado; peça que estoura o orçamento
 * também, e a de fábrica volta ao lugar. O modelo sugere; quem garante a regra
 * é este funil.
 */
export function validateRecommendation(
  weapon: Weapon,
  choices: Partial<Record<SlotId, unknown>>,
): Recommendation {
  const bySlot = attachmentsForWeapon(weapon);
  const budget = budgetFor(weapon.category);
  const build: Partial<Record<SlotId, string>> = { ...factoryAttachments(weapon) };
  const discarded: string[] = [];
  const accepted: SlotId[] = [];

  for (const slot of weapon.slots) {
    const wanted = choices[slot];
    if (typeof wanted !== 'string' || !wanted.trim()) continue;

    const match = findPart(bySlot.get(slot) ?? [], weapon, wanted);
    if (!match) {
      discarded.push(`${wanted} (não existe no slot ${slot} desta arma)`);
      continue;
    }

    const previous = build[slot];
    build[slot] = match.id;
    if (buildCost(weapon, build) > budget) {
      if (previous === undefined) delete build[slot];
      else build[slot] = previous;
      discarded.push(`${attachmentName(match, weapon)} (não coube no orçamento)`);
      continue;
    }
    accepted.push(slot);
  }

  return { attachments: build, discarded, accepted };
}
