/**
 * O catálogo externo, normalizado para os nomes que este projeto usa.
 *
 * A origem é o backend Convex que serve o bf6loadouts.com, cujas balísticas vêm
 * do sym.gg. É a fonte pública mais completa: traz cadência, velocidade,
 * capacidade, recarga, a escada de dano e a compatibilidade acessório-por-arma.
 *
 * Este módulo só busca e traduz. Decidir o que fazer com a diferença é problema
 * de `sincronizar.mjs`.
 */

const CONVEX = 'https://formal-squirrel-844.convex.cloud/api/query';

async function consultar(path) {
  const resposta = await fetch(CONVEX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: {}, format: 'json' }),
  });
  if (!resposta.ok) throw new Error(`${path}: HTTP ${resposta.status}`);
  const corpo = await resposta.json();
  if (corpo.status !== 'success') throw new Error(`${path}: ${corpo.errorMessage ?? 'resposta inesperada'}`);
  return corpo.value;
}

/** Categorias da fonte para as nossas. */
const CATEGORIAS = {
  'Assault Rifle': 'ar',
  Carbine: 'carabina',
  SMG: 'smg',
  LMG: 'lmg',
  DMR: 'dmr',
  'Sniper Rifle': 'sniper',
  Shotgun: 'escopeta',
  Pistol: 'pistola',
  Melee: 'corpo-a-corpo',
};

/**
 * Ids que o projeto grafa diferente da fonte.
 *
 * O id local é público: ele aparece no link compartilhado. Renomear um para
 * seguir a fonte quebraria todo loadout já compartilhado, então quem se adapta é
 * o sincronizador.
 */
const APELIDOS_DE_ARMA = {
  'l85-a3': 'l85a3',
  '185ks-k': '18-5ks-k',
  m357: 'm357-trait',
};

/** Slots da fonte para os nossos. */
const SLOTS = {
  optic: 'mira',
  muzzle: 'boca',
  barrel: 'cano',
  underbarrel: 'acoplamento',
  magazine: 'carregador',
  ammunition: 'municao',
  ammo: 'municao',
  ergonomics: 'ergonomia',
  'optic-accessory': 'opticoExtra',
  'left-accessory': 'lateralEsquerda',
  'right-accessory': 'lateralDireita',
};

/**
 * A escada de dano, no nosso formato.
 *
 * A fonte descreve a curva por vértices e repete a distância a cada degrau
 * (`75 m ainda vale 25`, `de 75 m em diante vale 20`). Aqui interessa só o
 * ponto em que o valor muda: `[dano, distância em que passa a valer]`.
 */
function escadaDeDano(dropoff) {
  if (!Array.isArray(dropoff) || dropoff.length === 0) return null;
  const degraus = [];
  for (const ponto of dropoff) {
    const anterior = degraus.at(-1);
    if (anterior && anterior[0] === ponto.dmg) continue;
    degraus.push([ponto.dmg, ponto.dist]);
  }
  return degraus;
}

/** Armas da fonte, por id (o mesmo `slug` que usamos como id). */
export async function armasDaFonte() {
  const bruto = await consultar('loadouts/queries:getWeapons');
  const porConvexId = new Map();
  const armas = new Map();

  for (const w of bruto) {
    const b = w.ballistics ?? {};
    const s = w.baseStats ?? {};
    const arma = {
      id: APELIDOS_DE_ARMA[w.slug] ?? w.slug,
      name: w.name,
      category: CATEGORIAS[w.category] ?? null,
      damage: escadaDeDano(b.damageDropoff),
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
    armas.set(arma.id, arma);
    porConvexId.set(w._id, arma.id);
  }

  return { armas, porConvexId };
}

/**
 * Acessórios da fonte, por id.
 *
 * O id é derivado do slot e do nome original — o mesmo esquema já usado no
 * dataset, para que um acessório existente seja reconhecido em vez de entrar
 * duplicado.
 */
export async function acessoriosDaFonte(porConvexId) {
  const bruto = await consultar('attachments/queries:getAttachments');
  const acessorios = new Map();

  for (const a of bruto) {
    const slot = SLOTS[a.slotType];
    if (!slot) continue;
    // "None" é como a fonte representa o slot vazio; aqui isso é a ausência de
    // acessório, não um acessório.
    if (a.name === 'None') continue;

    const id = `${slot}-${a.name
      .toLowerCase()
      .replace(/["']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;

    acessorios.set(id, {
      id,
      slot,
      originalName: a.name,
      cost: a.cost,
      weapons: (a.compatibleWeapons ?? [])
        .map((convexId) => porConvexId.get(convexId))
        .filter(Boolean)
        .sort(),
    });
  }

  return acessorios;
}

export async function catalogoExterno() {
  const { armas, porConvexId } = await armasDaFonte();
  const acessorios = await acessoriosDaFonte(porConvexId);
  return { armas, acessorios };
}
