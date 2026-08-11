import { ATTACHMENTS_BY_ID, attachmentsForWeapon } from '@/data/attachments';
import { budgetFor, SLOTS_BY_ID } from '@/data/classes';
import type { Attachment, SlotId, Weapon } from '@/data/types';
import { attachmentCost, attachmentName, factoryAttachments } from './loadout';
import { calculateStats, type EffectiveStats } from './stats';

/**
 * A recomendação de loadout por distância de combate.
 *
 * Quem escolhe os acessórios é um modelo com busca na web, pesando guias e
 * discussões do Reddit (ver `src/app/api/recomendar/route.ts`). Este arquivo
 * guarda o que é determinístico e testável: o vocabulário das três distâncias,
 * o cardápio que o modelo recebe e a validação do que ele devolve — contra o
 * arsenal da arma e contra o orçamento, porque modelo sugere e o jogo cobra.
 */

export const DISTANCIAS = [
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

export type Distancia = (typeof DISTANCIAS)[number]['value'];

export const isDistancia = (valor: unknown): valor is Distancia =>
  DISTANCIAS.some((d) => d.value === valor);

const PESOS: Record<Distancia, Partial<Record<keyof EffectiveStats | 'dps' | 'range', number>>> = {
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
const chave = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * O cardápio da arma, slot a slot, no formato que entra no prompt.
 *
 * Cada linha traz o id do slot — que é a chave que o modelo devolve —, o nome
 * do slot em português e as peças com o custo ao lado, porque o orçamento é
 * regra do jogo e o modelo só respeita o que consegue ver.
 */
export function cardapio(weapon: Weapon): string {
  const porSlot = attachmentsForWeapon(weapon);
  return weapon.slots
    .map((slot) => {
      const pecas = porSlot.get(slot) ?? [];
      if (!pecas.length) return null;
      const nomes = [
        ...new Set(pecas.map((a) => `${attachmentName(a, weapon)} (${attachmentCost(a, weapon)} pts)`)),
      ];
      return `${slot} (${SLOTS_BY_ID.get(slot)?.name ?? slot}): ${nomes.join(' | ')}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** Quanto a montagem custa nesta arma, pela mesma tabela que a tela usa. */
export function custoDaMontagem(
  weapon: Weapon,
  montagem: Partial<Record<SlotId, string>>,
): number {
  return Object.values(montagem).reduce((soma, id) => {
    const peca = id ? ATTACHMENTS_BY_ID.get(id) : undefined;
    return soma + (peca ? attachmentCost(peca, weapon) : 0);
  }, 0);
}

function valorDoScore(stats: EffectiveStats, chaveScore: keyof EffectiveStats | 'dps' | 'range') {
  if (chaveScore === 'dps') {
    return ((stats.damage[0]?.damage ?? 0) * stats.pellets * stats.rpm) / 60;
  }
  if (chaveScore === 'range') {
    return Math.max(0, ...stats.damage.map((d) => d.distance));
  }

  const valor = stats[chaveScore];
  return typeof valor === 'number' ? valor : 0;
}

function pontuar(stats: EffectiveStats, distancia: Distancia) {
  const pesos = PESOS[distancia];
  return Object.entries(pesos).reduce((total, [chaveScore, peso]) => {
    const valor = valorDoScore(stats, chaveScore as keyof EffectiveStats | 'dps' | 'range');
    return total + valor * (peso ?? 0);
  }, 0);
}

/**
 * Montagem local, sem IA, para o botão "Ideal".
 *
 * Ela parte do que vem de fábrica e troca uma peça por slot quando a troca
 * melhora a pontuação daquela distância e ainda cabe no orçamento. A sugestão
 * com IA continua existindo para capturar moda e consenso da comunidade; esta
 * aqui é o caminho rápido e sempre disponível.
 */
export function loadoutIdeal(
  weapon: Weapon,
  distancia: Distancia = 'media',
): Partial<Record<SlotId, string>> {
  const porSlot = attachmentsForWeapon(weapon);
  const total = budgetFor(weapon.category);
  const montagem: Partial<Record<SlotId, string>> = { ...factoryAttachments(weapon) };

  const candidatos: { slot: SlotId; attachment: Attachment; ganho: number }[] = [];
  for (const slot of weapon.slots) {
    const atual = montagem[slot];
    const atualAttachment = atual ? ATTACHMENTS_BY_ID.get(atual) : null;
    const baseDoSlot = atualAttachment ? pontuar(calculateStats(weapon, [atualAttachment]), distancia) : 0;

    for (const attachment of porSlot.get(slot) ?? []) {
      if (attachment.id === atual) continue;
      const ganho = pontuar(calculateStats(weapon, [attachment]), distancia) - baseDoSlot;
      if (ganho > 0) candidatos.push({ slot, attachment, ganho });
    }
  }

  candidatos.sort((a, b) => b.ganho - a.ganho);

  for (const { slot, attachment } of candidatos) {
    const anterior = montagem[slot];
    montagem[slot] = attachment.id;
    if (custoDaMontagem(weapon, montagem) > total) {
      if (anterior) montagem[slot] = anterior;
      else delete montagem[slot];
    }
  }

  return montagem;
}

export interface Recomendacao {
  attachments: Partial<Record<SlotId, string>>;
  /** O que o modelo pediu e não entrou, com o motivo — vai para o log da rota. */
  descartados: string[];
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
export function validarRecomendacao(
  weapon: Weapon,
  escolhas: Partial<Record<SlotId, unknown>>,
): Recomendacao {
  const porSlot = attachmentsForWeapon(weapon);
  const total = budgetFor(weapon.category);
  const montagem: Partial<Record<SlotId, string>> = { ...factoryAttachments(weapon) };
  const descartados: string[] = [];

  for (const slot of weapon.slots) {
    const desejado = escolhas[slot];
    if (typeof desejado !== 'string' || !desejado.trim()) continue;

    const alvo = (porSlot.get(slot) ?? []).find(
      (a) => chave(attachmentName(a, weapon)) === chave(desejado),
    );
    if (!alvo) {
      descartados.push(`${desejado} (não existe no slot ${slot} desta arma)`);
      continue;
    }

    const anterior = montagem[slot];
    montagem[slot] = alvo.id;
    if (custoDaMontagem(weapon, montagem) > total) {
      if (anterior === undefined) delete montagem[slot];
      else montagem[slot] = anterior;
      descartados.push(`${attachmentName(alvo, weapon)} (não coube no orçamento)`);
    }
  }

  return { attachments: montagem, descartados };
}
