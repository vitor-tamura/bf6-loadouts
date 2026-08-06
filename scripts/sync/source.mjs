/**
 * O catálogo source, normalizado para os nomes que este projeto usa.
 *
 * A origem é o backend Convex que serve o bf6loadouts.com, cujas balísticas vêm
 * do sym.gg. É a source pública mais completa: traz cadência, velocidade,
 * capacidade, recarga, a escada de dano e a compatibilidade acessório-por-arma.
 *
 * Este módulo só busca e traduz. Decidir o que fazer com a diferença é problema
 * de `sincronizar.mjs`.
 */

const CONVEX = 'https://formal-squirrel-844.convex.cloud/api/query';

async function query(path) {
  const response = await fetch(CONVEX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: {}, format: 'json' }),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.status !== 'success') throw new Error(`${path}: ${body.errorMessage ?? 'resposta inesperada'}`);
  return body.value;
}

/** Categorias da source para as nossas. */
const CATEGORIES = {
  'Assault Rifle': 'ar',
  Carbine: 'carbine',
  SMG: 'smg',
  LMG: 'lmg',
  DMR: 'dmr',
  'Sniper Rifle': 'sniper',
  Shotgun: 'shotgun',
  Pistol: 'pistol',
  Melee: 'melee',
};

/**
 * Ids que o projeto grafa diferente da source.
 *
 * O id local é público: ele aparece no link compartilhado. Renomear um para
 * seguir a source quebraria todo loadout já compartilhado, então quem se adapta é
 * o sincronizador.
 */
const WEAPON_ALIASES = {
  'l85-a3': 'l85a3',
  '185ks-k': '18-5ks-k',
  m357: 'm357-trait',
};

/** Slots da source para os nossos. */
const SLOTS = {
  optic: 'sight',
  muzzle: 'muzzle',
  barrel: 'barrel',
  underbarrel: 'underbarrel',
  magazine: 'magazine',
  ammunition: 'ammo',
  ammo: 'ammo',
  ergonomics: 'ergonomics',
  'optic-accessory': 'opticAccessory',
  'left-accessory': 'leftRail',
  'right-accessory': 'rightRail',
};

/**
 * A damageLadder de damage, no nosso format.
 *
 * A source descreve a curva por vértices e repete a distância a cada degrau
 * (`75 m ainda vale 25`, `de 75 m em diante vale 20`). Aqui interessa só o
 * point em que o value muda: `[damage, distância em que passa a valer]`.
 */
function damageSteps(dropoff) {
  if (!Array.isArray(dropoff) || dropoff.length === 0) return null;
  const steps = [];
  for (const point of dropoff) {
    const previous = steps.at(-1);
    if (previous && previous[0] === point.dmg) continue;
    steps.push([point.dmg, point.dist]);
  }
  return steps;
}

/** Armas da source, por id (o mesmo `slug` que usamos como id). */
export async function sourceWeapons() {
  const raw = await query('loadouts/queries:getWeapons');
  const byConvexId = new Map();
  const weapons = new Map();

  for (const w of raw) {
    const b = w.ballistics ?? {};
    const s = w.baseStats ?? {};
    const weapon = {
      id: WEAPON_ALIASES[w.slug] ?? w.slug,
      name: w.name,
      category: CATEGORIES[w.category] ?? null,
      damage: damageSteps(b.damageDropoff),
      rpm: b.rof != null ? Math.round(b.rof) : s.rof,
      velocity: b.velocity ?? s.velocity,
      magazine: b.magSize ?? s.mag,
      reload: b.reloadTactical ?? s.reload,
      emptyReload: b.reloadEmpty,
      adsMs: s.ads,
      accuracy: s.precision,
      control: s.control,
      mobility: s.mobility,
      hipfire: s.hipfire,
    };
    weapons.set(weapon.id, weapon);
    byConvexId.set(w._id, weapon.id);
  }

  return { weapons, byConvexId };
}

/**
 * Acessórios da source, por id.
 *
 * O id é derivado do slot e do name original — o mesmo esquema já usado no
 * dataset, para que um acessório existente seja reconhecido em vez de entrar
 * duplicado.
 */
export async function sourceAttachments(byConvexId) {
  const raw = await query('attachments/queries:getAttachments');
  const attachments = new Map();

  for (const a of raw) {
    const slot = SLOTS[a.slotType];
    if (!slot) continue;
    // "None" é como a source representa o slot vazio; aqui isso é a ausência de
    // acessório, não um acessório.
    if (a.name === 'None') continue;

    const id = `${slot}-${a.name
      .toLowerCase()
      .replace(/["']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;

    attachments.set(id, {
      id,
      slot,
      originalName: a.name,
      cost: a.cost,
      weapons: (a.compatibleWeapons ?? [])
        .map((convexId) => byConvexId.get(convexId))
        .filter(Boolean)
        .sort(),
    });
  }

  return attachments;
}

export async function externalCatalog() {
  const { weapons, byConvexId } = await sourceWeapons();
  const attachments = await sourceAttachments(byConvexId);
  return { weapons, attachments };
}
