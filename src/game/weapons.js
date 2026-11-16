// Weapon, attachment and Gun Game ladder definitions. Pure data + stat math (no DOM / Three.js),
// shared by the client (prediction, UI) and the host simulation.

const D2R = Math.PI / 180;

// Recoil: per shot the view kicks up by `v` degrees (first-shot multiplier `first`) and sideways by
// `h * pat[i]` degrees, where `pat` is the weapon's repeating horizontal pattern.
export const WEAPONS = {
  kr4: {
    id: 'kr4', name: 'KR-4 Carbine', cls: 'ar', slot: 'primary', unlock: 1, auto: true,
    desc: 'Balanced assault rifle. Controllable recoil and a solid mid-range damage profile.',
    dmg: 28, rpm: 720, mag: 30, reserve: 150, reload: 2.2, pellets: 1,
    range: [26, 55], minMul: 0.64, headMul: 1.5, legMul: 0.9,
    adsTime: 0.24, zoom: 1.25, hip: 3.2, adsSpread: 0.05, moveMul: 0.96, adsMove: 0.62, sprintOut: 0.22,
    recoil: { v: 0.52, h: 0.2, first: 1.3, pat: [0, 0.4, -0.3, 0.6, 0.9, 0.5, -0.4, -1, -0.8, 0.2, 0.9, 1, 0.3, -0.6, -1] },
    kick: 1.0, sound: 'ar',
    model: { len: 0.46, barrel: 0.3, stock: 0.24, mag: [0.035, 0.17, 0.07, 0.18], hand: 0.22, color: 0x2b2e33, accent: 0x44494f },
  },
  vk47: {
    id: 'vk47', name: 'Vulkan-47', cls: 'ar', slot: 'primary', unlock: 16, auto: true,
    desc: 'Hard-hitting rifle with a slower fire rate and a heavy, climbing recoil.',
    dmg: 36, rpm: 560, mag: 30, reserve: 150, reload: 2.5, pellets: 1,
    range: [30, 62], minMul: 0.67, headMul: 1.5, legMul: 0.9,
    adsTime: 0.28, zoom: 1.25, hip: 3.6, adsSpread: 0.06, moveMul: 0.94, adsMove: 0.6, sprintOut: 0.25,
    recoil: { v: 0.86, h: 0.38, first: 1.2, pat: [0, 0.5, 0.9, 1, 0.6, -0.2, -0.8, -1, -0.9, -0.3, 0.4, 0.8, 1, 0.2, -0.7] },
    kick: 1.35, sound: 'arHeavy',
    model: { len: 0.48, barrel: 0.34, stock: 0.26, mag: [0.035, 0.2, 0.075, 0.5], hand: 0.24, color: 0x3a2a1c, accent: 0x1e1e20, wood: true },
  },
  hornet: {
    id: 'hornet', name: 'Hornet-9', cls: 'smg', slot: 'primary', unlock: 1, auto: true,
    desc: 'Fast-firing SMG. Deadly up close, quick on its feet, weak at range.',
    dmg: 22, rpm: 900, mag: 32, reserve: 160, reload: 1.8, pellets: 1,
    range: [10, 28], minMul: 0.55, headMul: 1.4, legMul: 0.9,
    adsTime: 0.17, zoom: 1.15, hip: 2.2, adsSpread: 0.12, moveMul: 1.04, adsMove: 0.78, sprintOut: 0.13,
    recoil: { v: 0.4, h: 0.3, first: 1.1, pat: [0, -0.5, 0.6, -0.8, 0.9, 1, -0.3, -1, 0.5, 0.8, -0.9, 0.2] },
    kick: 0.75, sound: 'smg',
    model: { len: 0.32, barrel: 0.14, stock: 0.2, mag: [0.03, 0.2, 0.045, 0], hand: 0.12, color: 0x26282c, accent: 0x3b3f45 },
  },
  wasp: {
    id: 'wasp', name: 'Wasp-45', cls: 'smg', slot: 'primary', unlock: 20, auto: true,
    desc: 'Heavier-calibre SMG. Fewer rounds, more damage per shot, snappy handling.',
    dmg: 27, rpm: 780, mag: 25, reserve: 150, reload: 1.9, pellets: 1,
    range: [12, 30], minMul: 0.56, headMul: 1.4, legMul: 0.9,
    adsTime: 0.19, zoom: 1.15, hip: 2.4, adsSpread: 0.12, moveMul: 1.02, adsMove: 0.76, sprintOut: 0.14,
    recoil: { v: 0.5, h: 0.26, first: 1.2, pat: [0, 0.6, 0.9, 0.4, -0.5, -1, -0.6, 0.3, 1, 0.7, -0.4, -0.9] },
    kick: 0.9, sound: 'smgHeavy',
    model: { len: 0.3, barrel: 0.1, stock: 0.18, mag: [0.035, 0.16, 0.05, 0], hand: 0.1, color: 0x33342f, accent: 0x52544c, boxy: true },
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', cls: 'shotgun', slot: 'primary', unlock: 4, auto: false,
    desc: 'Pump-action shotgun. Eight pellets per shell; devastating inside ten metres.',
    dmg: 17, rpm: 72, mag: 6, reserve: 36, reload: 2.9, pellets: 8, pelletSpread: 3.4,
    range: [7, 19], minMul: 0.25, headMul: 1.2, legMul: 0.9,
    adsTime: 0.24, zoom: 1.12, hip: 1.6, adsSpread: 0.2, moveMul: 0.97, adsMove: 0.7, sprintOut: 0.2,
    recoil: { v: 3.4, h: 0.9, first: 1, pat: [0.4, -0.5, 0.7, -0.3] },
    kick: 2.6, sound: 'shotgun',
    model: { len: 0.42, barrel: 0.38, stock: 0.26, mag: null, hand: 0.2, color: 0x232323, accent: 0x5a3b22, pump: true, wood: true, barrelR: 0.016 },
  },
  ranger: {
    id: 'ranger', name: 'DMR-14 Ranger', cls: 'dmr', slot: 'primary', unlock: 7, auto: false,
    desc: 'Semi-automatic marksman rifle. Two-shot kill that holds its damage across the map.',
    dmg: 52, rpm: 300, mag: 15, reserve: 75, reload: 2.4, pellets: 1,
    range: [45, 90], minMul: 0.8, headMul: 1.75, legMul: 0.85,
    adsTime: 0.3, zoom: 2.0, hip: 4.4, adsSpread: 0.02, moveMul: 0.94, adsMove: 0.58, sprintOut: 0.26,
    recoil: { v: 1.5, h: 0.35, first: 1, pat: [0.3, -0.4, 0.6, -0.6, 0.2] },
    kick: 1.7, sound: 'dmr', sight: 'scope2',
    model: { len: 0.5, barrel: 0.4, stock: 0.28, mag: [0.035, 0.12, 0.08, 0.05], hand: 0.26, color: 0x3d3a30, accent: 0x25241f },
  },
  bulldog: {
    id: 'bulldog', name: 'Bulldog MG', cls: 'lmg', slot: 'primary', unlock: 10, auto: true,
    desc: 'Belt-fed LMG. Huge magazine and sustained fire, at the cost of mobility and a long reload.',
    dmg: 32, rpm: 620, mag: 75, reserve: 150, reload: 4.6, pellets: 1,
    range: [36, 72], minMul: 0.72, headMul: 1.4, legMul: 0.9,
    adsTime: 0.4, zoom: 1.25, hip: 4.6, adsSpread: 0.08, moveMul: 0.88, adsMove: 0.5, sprintOut: 0.34,
    recoil: { v: 0.6, h: 0.3, first: 1.5, pat: [0, 0.3, 0.7, 1, 0.8, 0.3, -0.3, -0.8, -1, -0.7, -0.2, 0.4, 0.9, 0.5, -0.5, -1, -0.4, 0.6] },
    kick: 1.2, sound: 'lmg',
    model: { len: 0.56, barrel: 0.4, stock: 0.26, mag: [0.11, 0.13, 0.13, 0], hand: 0.24, color: 0x2a2d2a, accent: 0x40443f, heavy: true },
  },
  longbow: {
    id: 'longbow', name: 'Longbow .338', cls: 'sniper', slot: 'primary', unlock: 13, auto: false,
    desc: 'Bolt-action sniper. One shot to the torso or head; slow to aim and slower to cycle.',
    dmg: 105, rpm: 46, mag: 5, reserve: 30, reload: 3.2, pellets: 1,
    range: [80, 160], minMul: 0.9, headMul: 2.0, legMul: 0.75,
    adsTime: 0.42, zoom: 5.0, hip: 7.5, adsSpread: 0, moveMul: 0.92, adsMove: 0.45, sprintOut: 0.3,
    recoil: { v: 4.2, h: 0.8, first: 1, pat: [0.5, -0.5] },
    kick: 3.2, sound: 'sniper', sight: 'scope',
    model: { len: 0.56, barrel: 0.56, stock: 0.32, mag: [0.035, 0.08, 0.09, 0], hand: 0.3, color: 0x2e3528, accent: 0x191b17, bolt: true, barrelR: 0.014 },
  },
  p9: {
    id: 'p9', name: 'P9 Sidearm', cls: 'pistol', slot: 'secondary', unlock: 1, auto: false,
    desc: 'Reliable 9mm pistol. Fast to draw, fast to fire.',
    dmg: 26, rpm: 420, mag: 15, reserve: 60, reload: 1.5, pellets: 1,
    range: [12, 30], minMul: 0.6, headMul: 1.5, legMul: 0.9,
    adsTime: 0.14, zoom: 1.1, hip: 2.0, adsSpread: 0.1, moveMul: 1.05, adsMove: 0.85, sprintOut: 0.1,
    recoil: { v: 1.0, h: 0.3, first: 1, pat: [0.3, -0.5, 0.6, -0.2] },
    kick: 1.3, sound: 'pistol',
    model: { pistol: true, len: 0.19, color: 0x2a2b2e, accent: 0x1b1b1d },
  },
  magnus: {
    id: 'magnus', name: 'Magnus .50', cls: 'pistol', slot: 'secondary', unlock: 9, auto: false,
    desc: 'Hand cannon. Two shots to kill up close, with a kick to match.',
    dmg: 55, rpm: 170, mag: 7, reserve: 35, reload: 1.9, pellets: 1,
    range: [18, 40], minMul: 0.6, headMul: 1.8, legMul: 0.85,
    adsTime: 0.18, zoom: 1.12, hip: 2.6, adsSpread: 0.06, moveMul: 1.03, adsMove: 0.82, sprintOut: 0.12,
    recoil: { v: 3.6, h: 0.9, first: 1, pat: [0.5, -0.6, 0.3] },
    kick: 2.8, sound: 'magnum',
    model: { pistol: true, len: 0.25, color: 0x8d8f94, accent: 0x2a211a, big: true },
  },
  knife: {
    id: 'knife', name: 'Combat Knife', cls: 'melee', slot: 'melee', unlock: 1, auto: false,
    desc: 'Quick melee. One hit from behind.',
    dmg: 60, rpm: 100, mag: 0, reserve: 0, reload: 0, pellets: 0,
    range: [2, 2], minMul: 1, headMul: 1, legMul: 1,
    adsTime: 0.2, zoom: 1, hip: 0, adsSpread: 0, moveMul: 1.08, adsMove: 1, sprintOut: 0.08,
    recoil: { v: 0, h: 0, first: 1, pat: [0] },
    kick: 0, sound: 'knife',
    model: { knife: true, color: 0x9aa0a6, accent: 0x1c1c1c },
  },
};

export const PRIMARIES = ['kr4', 'hornet', 'breacher', 'ranger', 'bulldog', 'longbow', 'vk47', 'wasp'];
export const SECONDARIES = ['p9', 'magnus'];
export const CLASS_NAMES = { ar: 'Assault Rifle', smg: 'SMG', shotgun: 'Shotgun', dmr: 'Marksman Rifle', lmg: 'LMG', sniper: 'Sniper Rifle', pistol: 'Pistol', melee: 'Melee' };

// Gun Game: fixed ladder for everybody, no attachments. Final tier is the knife (melee kill wins).
export const GUN_GAME_LADDER = ['p9', 'hornet', 'kr4', 'breacher', 'vk47', 'wasp', 'ranger', 'bulldog', 'magnus', 'longbow', 'knife'];

export const MELEE = { range: 2.3, dmg: 60, cooldown: 0.6, backDot: 0.35 };
export const FRAG = { fuse: 3.5, radius: 7.5, maxDmg: 160, minDmg: 18, throwSpeed: 17, count: 2 };
export const SLOTS = ['optic', 'barrel', 'mag', 'grip', 'stock'];
export const SLOT_NAMES = { optic: 'Optic', barrel: 'Barrel', mag: 'Magazine', grip: 'Underbarrel', stock: 'Stock' };
export const MAX_MASTERY = 12;

// Attachments. `lvl` = weapon mastery level that unlocks it. `mods` are multipliers unless noted.
export const ATTACHMENTS = {
  reddot: {
    id: 'reddot', slot: 'optic', name: 'Red Dot Sight', lvl: 2, not: ['sniper', 'dmr'],
    pros: ['Clear sight picture', '+10% zoom'], cons: ['+4% ADS time'],
    mods: { zoomMul: 1.1, adsTime: 1.04 }, sight: 'reddot',
  },
  scope: {
    id: 'scope', slot: 'optic', name: '2.5x Combat Scope', lvl: 6, not: ['sniper', 'dmr', 'pistol', 'shotgun'],
    pros: ['2.5x magnification', '-10% vertical recoil when aiming'], cons: ['+14% ADS time', '-10% ADS move speed'],
    mods: { zoomSet: 2.5, adsTime: 1.14, adsMove: 0.9, recoilV: 0.9 }, sight: 'scope2',
  },
  suppressor: {
    id: 'suppressor', slot: 'barrel', name: 'Suppressor', lvl: 3, not: ['shotgun'],
    pros: ['Hidden from the minimap when firing', 'Quieter shots'], cons: ['-18% damage range', '+3% ADS time'],
    mods: { range: 0.82, adsTime: 1.03, suppressed: 1 },
  },
  longbarrel: {
    id: 'longbarrel', slot: 'barrel', name: 'Long Barrel', lvl: 7, not: ['pistol'],
    pros: ['+25% damage range', 'Tighter pellet/hip spread (-8%)'], cons: ['+8% ADS time', '-3% move speed'],
    mods: { range: 1.25, hip: 0.92, adsTime: 1.08, moveMul: 0.97 },
  },
  compensator: {
    id: 'compensator', slot: 'barrel', name: 'Compensator', lvl: 10, not: ['pistol', 'sniper', 'shotgun'],
    pros: ['-20% vertical recoil'], cons: ['+12% hip-fire spread', '+10% horizontal recoil'],
    mods: { recoilV: 0.8, recoilH: 1.1, hip: 1.12 },
  },
  extmag: {
    id: 'extmag', slot: 'mag', name: 'Extended Mag', lvl: 4, not: [],
    pros: ['+40% magazine size'], cons: ['+12% reload time', '+3% ADS time'],
    mods: { mag: 1.4, reload: 1.12, adsTime: 1.03 },
  },
  fastmag: {
    id: 'fastmag', slot: 'mag', name: 'Speed Mag', lvl: 9, not: ['shotgun'],
    pros: ['-28% reload time'], cons: ['-15% magazine size'],
    mods: { reload: 0.72, mag: 0.85 },
  },
  foregrip: {
    id: 'foregrip', slot: 'grip', name: 'Foregrip', lvl: 5, not: ['pistol', 'sniper'],
    pros: ['-22% horizontal recoil', '-6% vertical recoil'], cons: ['+5% ADS time', '-2% move speed'],
    mods: { recoilH: 0.78, recoilV: 0.94, adsTime: 1.05, moveMul: 0.98 },
  },
  laser: {
    id: 'laser', slot: 'grip', name: 'Laser Sight', lvl: 8, not: ['sniper'],
    pros: ['-30% hip-fire spread', '-10% sprint-to-fire time'], cons: ['+6% ADS time'],
    mods: { hip: 0.7, sprintOut: 0.9, adsTime: 1.06 },
  },
  lightstock: {
    id: 'lightstock', slot: 'stock', name: 'Skeleton Stock', lvl: 11, not: ['pistol'],
    pros: ['-12% ADS time', '+25% ADS move speed', '-15% sprint-to-fire time'], cons: ['+14% recoil'],
    mods: { adsTime: 0.88, adsMove: 1.25, sprintOut: 0.85, recoilV: 1.14, recoilH: 1.14 },
  },
  heavystock: {
    id: 'heavystock', slot: 'stock', name: 'Padded Stock', lvl: 12, not: ['pistol'],
    pros: ['-14% recoil'], cons: ['+8% ADS time', '-4% move speed'],
    mods: { recoilV: 0.86, recoilH: 0.86, adsTime: 1.08, moveMul: 0.96 },
  },
};

export function attachmentsFor(weaponId, slot) {
  const w = WEAPONS[weaponId];
  if (!w || w.cls === 'melee') return [];
  return Object.values(ATTACHMENTS).filter((a) => (!slot || a.slot === slot) && !a.not.includes(w.cls));
}

export function slotsFor(weaponId) {
  return SLOTS.filter((s) => attachmentsFor(weaponId, s).length > 0);
}

/** Keep only valid attachments: must exist, fit the weapon, one per slot. */
export function sanitizeAttachments(weaponId, att) {
  const out = [];
  const used = new Set();
  if (!Array.isArray(att)) return out;
  for (const id of att) {
    const a = ATTACHMENTS[id];
    const w = WEAPONS[weaponId];
    if (!a || !w || a.not.includes(w.cls) || w.cls === 'melee' || used.has(a.slot)) continue;
    used.add(a.slot);
    out.push(id);
  }
  return out.sort();
}

const statCache = new Map();

/** Resolve final stats for a weapon + attachment list. Cached by key. */
export function weaponStats(id, att) {
  const key = att && att.length ? id + ':' + att.join(',') : id;
  let s = statCache.get(key);
  if (s) return s;
  const w = WEAPONS[id] || WEAPONS.kr4;
  s = {
    id: w.id, key, cls: w.cls, auto: w.auto, dmg: w.dmg, rpm: w.rpm, mag: w.mag, reserve: w.reserve, reload: w.reload,
    pellets: w.pellets, pelletSpread: w.pelletSpread || 0, r0: w.range[0], r1: w.range[1], minMul: w.minMul,
    headMul: w.headMul, legMul: w.legMul, adsTime: w.adsTime, zoom: w.zoom, hip: w.hip, adsSpread: w.adsSpread,
    moveMul: w.moveMul, adsMove: w.adsMove, sprintOut: w.sprintOut, recoilV: w.recoil.v, recoilH: w.recoil.h,
    recoilFirst: w.recoil.first, pat: w.recoil.pat, kick: w.kick, sound: w.sound, suppressed: 0,
    sight: w.sight || 'iron', interval: 60 / w.rpm,
  };
  for (const aid of att || []) {
    const a = ATTACHMENTS[aid];
    if (!a) continue;
    const m = a.mods;
    if (m.zoomMul) s.zoom *= m.zoomMul;
    if (m.zoomSet) s.zoom = m.zoomSet;
    if (m.adsTime) s.adsTime *= m.adsTime;
    if (m.adsMove) s.adsMove *= m.adsMove;
    if (m.recoilV) s.recoilV *= m.recoilV;
    if (m.recoilH) s.recoilH *= m.recoilH;
    if (m.range) { s.r0 *= m.range; s.r1 *= m.range; }
    if (m.hip) { s.hip *= m.hip; s.pelletSpread *= m.hip; }
    if (m.mag) s.mag = Math.max(1, Math.round(s.mag * m.mag));
    if (m.reload) s.reload *= m.reload;
    if (m.moveMul) s.moveMul *= m.moveMul;
    if (m.sprintOut) s.sprintOut *= m.sprintOut;
    if (m.suppressed) s.suppressed = 1;
    if (a.sight) s.sight = a.sight;
  }
  statCache.set(key, s);
  return s;
}

/** Damage at a distance, before body-part multipliers. */
export function damageAt(st, dist) {
  if (dist <= st.r0) return st.dmg;
  if (dist >= st.r1) return st.dmg * st.minMul;
  const k = (dist - st.r0) / (st.r1 - st.r0);
  return st.dmg * (1 - k * (1 - st.minMul));
}

/** Small deterministic PRNG so the host and the shooter derive identical pellet directions. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Directions for one trigger pull. `spreadDeg` is the cone half-angle applied to the whole shot,
 * `pelletDeg` an additional per-pellet cone (shotguns). Returns a flat [x,y,z, x,y,z, ...] array.
 */
export function shotDirs(yaw, pitch, spreadDeg, pellets, pelletDeg, seed) {
  const rnd = mulberry32(seed * 2654435761);
  const out = [];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // forward, right, up basis
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  const rx = cy, rz = -sy;
  const ux = sy * sp, uy = cp, uz = cy * sp;
  const base = spreadDeg * D2R;
  const ba = rnd() * Math.PI * 2, br = Math.sqrt(rnd()) * Math.tan(base);
  const bx = Math.cos(ba) * br, by = Math.sin(ba) * br;
  for (let i = 0; i < pellets; i++) {
    let ox = bx, oy = by;
    if (pelletDeg > 0) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * Math.tan(pelletDeg * D2R);
      ox += Math.cos(a) * r; oy += Math.sin(a) * r;
    }
    let dx = fx + rx * ox + ux * oy, dy = fy + uy * oy, dz = fz + rz * ox + uz * oy;
    const l = Math.hypot(dx, dy, dz);
    out.push(dx / l, dy / l, dz / l);
  }
  return out;
}

/** Default loadout for a brand-new player. */
export function defaultLoadout() {
  return { primary: 'kr4', primaryAtt: [], secondary: 'p9', secondaryAtt: [] };
}

/** Make an untrusted loadout safe to use on the host (valid ids, valid attachment combos). */
export function sanitizeLoadout(lo) {
  const d = defaultLoadout();
  if (!lo || typeof lo !== 'object') return d;
  const primary = PRIMARIES.includes(lo.primary) ? lo.primary : d.primary;
  const secondary = SECONDARIES.includes(lo.secondary) ? lo.secondary : d.secondary;
  return {
    primary, secondary,
    primaryAtt: sanitizeAttachments(primary, lo.primaryAtt),
    secondaryAtt: sanitizeAttachments(secondary, lo.secondaryAtt),
  };
}
