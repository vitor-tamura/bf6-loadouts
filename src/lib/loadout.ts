import { ATTACHMENTS_BY_ID, attachmentsForWeapon, isCompatible } from '@/data/attachments';
import { WEAPONS_BY_ID } from '@/data/weapons';
import { GADGETS_BY_ID } from '@/data/gadgets';
import type { Attachment, Weapon, ClassId, SlotId } from '@/data/types';

export interface Loadout {
  playerClass: ClassId;
  /** Arma principal — pode ser de qualquer categoria. */
  weapon: string | null;
  /** Um acessório por slot. */
  attachments: Partial<Record<SlotId, string>>;
  /** Secundária: pistola ou corpo a corpo. */
  sidearm: string | null;
  /**
   * Acessórios da secundária, no mesmo formato dos da principal.
   *
   * Ela tem orçamento próprio no jogo — os pontos gastos na pistola não saem
   * dos cem da arma principal —, então os dois conjuntos vivem lado a lado em
   * vez de compartilharem um mapa só.
   */
  sidearmAttachments: Partial<Record<SlotId, string>>;
  gadget1: string | null;
  gadget2: string | null;
  throwable: string | null;
}

export const EMPTY_LOADOUT: Loadout = {
  playerClass: 'assault',
  weapon: null,
  attachments: {},
  sidearm: null,
  sidearmAttachments: {},
  gadget1: null,
  gadget2: null,
  throwable: null,
};

/**
 * Munição que já vem na arma.
 *
 * O slot de munição nunca fica vazio no jogo: quem não escolhe nada está com a
 * de série — encamisada nas armas de projétil único, chumbo grosso nas
 * escopetas. Ela não altera número nenhum, porque as estatísticas da arma já
 * foram medidas com ela, mas ocupa pontos do orçamento como qualquer peça.
 */
/**
 * O nome da peça na arma em que ela está montada.
 *
 * Cano é nomeado pelo papel que cumpre, e o papel depende da arma — ver
 * `namePerWeapon` em `Attachment`. Toda tela que mostra o nome de um acessório
 * junto de uma arma deve passar por aqui; usar `attachment.name` direto mostra
 * o papel mais comum da peça, que na arma errada é o nome errado.
 */
export function attachmentName(attachment: Attachment, weapon: Weapon | null): string {
  return (weapon && attachment.namePerWeapon?.[weapon.id]) ?? attachment.name;
}

export function defaultAmmo(weapon: Weapon): string | null {
  if (!weapon.slots.includes('ammo')) return null;
  return weapon.category === 'shotgun' ? 'ammo-buckshot' : 'ammo-fmj';
}

/**
 * Mira que já vem na arma.
 *
 * Toda arma sai de fábrica enxergando alguma coisa: a alça de ferro, por cinco
 * pontos. Sete não a aceitam — os seis rifles de precisão, que nascem com
 * luneta, e a UMG-40, que traz alça própria —, e nessas vale a mira mais barata
 * que a arma aceita.
 */
export function defaultSight(weapon: Weapon): string | null {
  if (!weapon.slots.includes('sight')) return null;

  const iron = ATTACHMENTS_BY_ID.get('sight-iron-sights');
  if (iron && isCompatible(iron, weapon)) return iron.id;

  // A lista de cada slot vem ordenada por custo, então a primeira é a mais barata.
  return attachmentsForWeapon(weapon).get('sight')?.[0]?.id ?? null;
}

/**
 * Quanto a peça custa na arma em que está montada.
 *
 * O preço do cano segue a categoria, e a categoria depende da arma — o mesmo
 * `20" Factory` é o Estendido da M16A4, por cinco pontos, e o Básico da M87A1,
 * por dez. Guardar um número só por peça deixava uma das duas errada, e é por
 * isso que o valor sai da tabela em vez do campo.
 *
 * A tabela foi lida em duas telas do jogo, e é a mesma nas duas. Peça que não
 * é cano não tem essa relatividade e responde pelo próprio `cost`.
 */
const CUSTO_DO_CANO: Record<string, number> = {
  'Cano Estendido': 5,
  'Cano Básico': 10,
  'Cano Pesado': 10,
  'Cano Ext. Pesado': 10,
  'Cano Curto': 15,
  'Cano Leve': 20,
  'Cano Crio': 20,
  'Cano Curto Leve': 25,
  'Cano Estendido Leve': 25,
};

export function attachmentCost(attachment: Attachment, weapon: Weapon | null): number {
  if (attachment.slot !== 'barrel') return attachment.cost;
  return CUSTO_DO_CANO[attachmentName(attachment, weapon)] ?? attachment.cost;
}

/**
 * Cano que já vem na arma.
 *
 * Nenhuma arma sai de fábrica sem cano, e o que vem montado é sempre o Básico —
 * ele ocupa o slot e cobra os dez pontos de sempre, sem opção de tirar para
 * recuperá-los. É a mesma regra da munição e da mira.
 *
 * Onze armas têm dois canos disputando o papel de Básico, e a tela do jogo é o
 * único lugar que diz qual é o verdadeiro. O desempate aqui não altera conta
 * nenhuma: os candidatos têm modificadores e custo idênticos, então a escolha
 * muda o nome exibido e mais nada. Fica com o de nome mais óbvio, e é estável
 * entre execuções para o link compartilhado não mudar de sentido.
 */
export function defaultBarrel(weapon: Weapon): string | null {
  if (!weapon.slots.includes('barrel')) return null;

  const basicos = (attachmentsForWeapon(weapon).get('barrel') ?? []).filter(
    (cano) => attachmentName(cano, weapon) === 'Cano Básico',
  );
  if (basicos.length === 0) return null;

  const obvio = basicos.find((c) => /factory|standard|basic/i.test(c.originalName));
  return (obvio ?? basicos[0]).id;
}

/** Tudo que a arma já traz montada antes de qualquer escolha do jogador. */
export function factoryAttachments(weapon: Weapon): Partial<Record<SlotId, string>> {
  const montadas: Partial<Record<SlotId, string>> = {};
  const ammo = defaultAmmo(weapon);
  const sight = defaultSight(weapon);
  const barrel = defaultBarrel(weapon);
  if (ammo) montadas.ammo = ammo;
  if (sight) montadas.sight = sight;
  if (barrel) montadas.barrel = barrel;
  return montadas;
}

/** Lista de acessórios escolhidos, na ordem dos slots da arma. */
export function loadoutAttachments(
  chosen: Partial<Record<SlotId, string>>,
  weapon: Weapon | null,
): Attachment[] {
  if (!weapon) return [];
  const list: Attachment[] = [];
  for (const slot of weapon.slots) {
    const id = chosen[slot];
    if (!id) continue;
    const attachment = ATTACHMENTS_BY_ID.get(id);
    if (attachment && isCompatible(attachment, weapon)) list.push(attachment);
  }
  return list;
}

/**
 * Remove do loadout tudo que não faz sentido para a arma atual: acessórios de
 * slots que ela não possui ou incompatíveis com a categoria. Usado ao trocar de
 * arma e ao abrir um link compartilhado.
 */
export function stripIncompatible(loadout: Loadout): Loadout {
  const weapon = loadout.weapon ? WEAPONS_BY_ID.get(loadout.weapon) : null;
  const sidearm = loadout.sidearm ? WEAPONS_BY_ID.get(loadout.sidearm) : null;

  const attachments = keepValidAttachments(loadout.attachments, weapon ?? null);
  const sidearmAttachments = keepValidAttachments(loadout.sidearmAttachments, sidearm ?? null);

  const keepValidGadget = (id: string | null) => {
    if (!id) return null;
    const g = GADGETS_BY_ID.get(id);
    if (!g) return null;
    return g.playerClass === loadout.playerClass || g.playerClass === 'all' ? id : null;
  };

  return {
    ...loadout,
    attachments,
    sidearmAttachments,
    gadget1: keepValidGadget(loadout.gadget1),
    gadget2: keepValidGadget(loadout.gadget2),
  };
}

/** Só o que cabe nos slots daquela arma e é compatível com ela. */
function keepValidAttachments(
  chosen: Partial<Record<SlotId, string>>,
  weapon: Weapon | null,
): Partial<Record<SlotId, string>> {
  if (!weapon) return {};
  const kept: Partial<Record<SlotId, string>> = {};
  for (const slot of weapon.slots) {
    const id = chosen[slot];
    if (!id) continue;
    const attachment = ATTACHMENTS_BY_ID.get(id);
    if (attachment && attachment.slot === slot && isCompatible(attachment, weapon)) {
      kept[slot] = id;
    }
  }

  // Trocar de arma, abrir um link antigo ou limpar a montagem não deixa slot de
  // fábrica vazio: mira e munição voltam para o que vem na arma.
  for (const [slot, id] of Object.entries(factoryAttachments(weapon)) as [SlotId, string][]) {
    if (!kept[slot]) kept[slot] = id;
  }

  return kept;
}

/** Nome curto do loadout, usado em título de página e no compartilhamento. */
export function loadoutName(loadout: Loadout): string {
  const weapon = loadout.weapon ? WEAPONS_BY_ID.get(loadout.weapon) : null;
  return weapon ? weapon.name : 'Novo loadout';
}
