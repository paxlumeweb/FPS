// Procedural textures and materials. Everything is painted onto canvases at load time —
// there are no image files in this project.

import * as THREE from 'three';

const SIZE = 256;

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Tileable value noise in [0,1]. */
function valueNoise(size, cells, seed) {
  const r = rng(seed), lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(size * size), k = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * k, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % cells) * cells, yb = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = x * k, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % cells, xb = (x0 + 1) % cells;
      const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * sx, b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

function fbm(size, cells, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, Math.min(size, cells << o), seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

/** Base layer: colour modulated by multi-octave noise plus fine grain. */
function base(ctx, color, variance, cells, seed, grain = 0.05) {
  const [r, g, b] = hex(color), n = fbm(SIZE, cells, 4, seed), rr = rng(seed + 7);
  const img = ctx.createImageData(SIZE, SIZE), d = img.data;
  for (let i = 0; i < n.length; i++) {
    const k = 1 + (n[i] - 0.5) * 2 * variance + (rr() - 0.5) * 2 * grain;
    d[i * 4] = Math.max(0, Math.min(255, r * k)); d[i * 4 + 1] = Math.max(0, Math.min(255, g * k)); d[i * 4 + 2] = Math.max(0, Math.min(255, b * k)); d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const P = {
  bricks(ctx, o, seed) {
    const r = rng(seed), rows = o.rows || 12, cols = o.cols || 5, bh = SIZE / rows, bw = SIZE / cols;
    for (let y = 0; y < rows; y++) for (let x = -1; x < cols; x++) {
      const ox = (y % 2) * bw * 0.5, v = r();
      ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.03 + v * 0.22})` : `rgba(255,220,190,${(v - 0.5) * 0.16})`;
      ctx.fillRect(x * bw + ox + 1, y * bh + 1, bw - 2, bh - 2);
    }
    ctx.strokeStyle = o.mortar || 'rgba(205,195,180,0.55)'; ctx.lineWidth = 2;
    for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * bh); ctx.lineTo(SIZE, y * bh); ctx.stroke(); }
    for (let y = 0; y < rows; y++) for (let x = 0; x <= cols; x++) { const ox = (y % 2) * bw * 0.5; ctx.beginPath(); ctx.moveTo((x * bw + ox) % SIZE, y * bh); ctx.lineTo((x * bw + ox) % SIZE, (y + 1) * bh); ctx.stroke(); }
  },
  grid(ctx, o) {
    const n = o.n || 4, s = SIZE / n;
    ctx.strokeStyle = o.line || 'rgba(0,0,0,0.35)'; ctx.lineWidth = o.lw || 2;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, SIZE); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(SIZE, i * s); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s + 2, 0); ctx.lineTo(i * s + 2, SIZE); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s + 2); ctx.lineTo(SIZE, i * s + 2); ctx.stroke(); }
  },
  tilesVar(ctx, o, seed) {
    const r = rng(seed), n = o.n || 4, s = SIZE / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = r(); ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${v * 0.18})` : `rgba(255,255,255,${(v - 0.5) * 0.12})`; ctx.fillRect(x * s, y * s, s, s); }
    P.grid(ctx, o);
  },
  planks(ctx, o, seed) {
    const r = rng(seed), n = o.n || 6, s = SIZE / n;
    for (let i = 0; i < n; i++) {
      const v = r(); ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${v * 0.3})` : `rgba(255,230,190,${(v - 0.5) * 0.2})`; ctx.fillRect(0, i * s, SIZE, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(SIZE, i * s); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) { const yy = i * s + r() * s; ctx.beginPath(); ctx.moveTo(0, yy); ctx.bezierCurveTo(SIZE * 0.3, yy + (r() - 0.5) * 6, SIZE * 0.6, yy + (r() - 0.5) * 6, SIZE, yy); ctx.stroke(); }
      const jx = r() * SIZE; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.moveTo(jx, i * s); ctx.lineTo(jx, (i + 1) * s); ctx.stroke();
    }
  },
  brushed(ctx, o, seed) {
    const r = rng(seed);
    for (let i = 0; i < 260; i++) { const y = r() * SIZE; ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke(); }
    if (o.panels) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      for (const [x, y] of [[10, 10], [SIZE - 10, 10], [10, SIZE - 10], [SIZE - 10, SIZE - 10]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    }
    if (o.rust) for (let i = 0; i < 40; i++) { const x = r() * SIZE, y = r() * SIZE, s = 4 + r() * 22; const g = ctx.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, 'rgba(120,60,25,0.35)'); g.addColorStop(1, 'rgba(120,60,25,0)'); ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2); }
  },
  corrugated(ctx) {
    const n = 16, s = SIZE / n;
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(i * s, 0, (i + 1) * s, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.5, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = g; ctx.fillRect(i * s, 0, s, SIZE);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, SIZE, 5); ctx.fillRect(0, SIZE - 5, SIZE, 5);
  },
  speckle(ctx, o, seed) {
    const r = rng(seed);
    for (let i = 0; i < (o.count || 900); i++) { const v = r(); ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.1 + v * 0.3})` : `rgba(255,255,255,${(v - 0.5) * 0.35})`; const s = 1 + r() * (o.max || 2); ctx.fillRect(r() * SIZE, r() * SIZE, s, s); }
    if (o.cracks) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; for (let i = 0; i < o.cracks; i++) { let x = r() * SIZE, y = r() * SIZE; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); } }
  },
  stains(ctx, o, seed) {
    const r = rng(seed);
    for (let i = 0; i < (o.count || 10); i++) { const x = r() * SIZE, w = 6 + r() * 24, h = 40 + r() * 120; const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(40,30,20,0.16)'); g.addColorStop(1, 'rgba(40,30,20,0)'); ctx.save(); ctx.translate(x, r() * SIZE * 0.3); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore(); }
    if (o.seams) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, SIZE, SIZE); ctx.beginPath(); ctx.moveTo(0, SIZE / 2); ctx.lineTo(SIZE, SIZE / 2); ctx.stroke(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (const [x, y] of [[20, 20], [SIZE - 20, 20], [20, SIZE / 2 + 20], [SIZE - 20, SIZE / 2 + 20]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); } }
  },
  leaves(ctx, o, seed) {
    const r = rng(seed);
    for (let i = 0; i < 700; i++) { const v = r(); ctx.fillStyle = v < 0.5 ? `rgba(10,30,5,${0.15 + v * 0.4})` : `rgba(170,210,90,${(v - 0.5) * 0.4})`; ctx.beginPath(); ctx.ellipse(r() * SIZE, r() * SIZE, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, 7); ctx.fill(); }
  },
  weave(ctx) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke(); }
  },
  window(ctx, o) {
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    if (o.lit) { g.addColorStop(0, '#ffd98a'); g.addColorStop(1, '#f2a541'); } else { g.addColorStop(0, '#22384a'); g.addColorStop(0.5, '#0f1c27'); g.addColorStop(1, '#1b3142'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
    if (!o.lit) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.moveTo(0, SIZE * 0.7); ctx.lineTo(SIZE * 0.6, 0); ctx.lineTo(SIZE * 0.85, 0); ctx.lineTo(0, SIZE); ctx.fill(); }
    else { ctx.fillStyle = 'rgba(90,50,20,0.35)'; ctx.fillRect(SIZE * 0.1, SIZE * 0.55, SIZE * 0.3, SIZE * 0.45); }
    ctx.strokeStyle = o.lit ? '#3a2c1c' : '#2a2c2e'; ctx.lineWidth = 18; ctx.strokeRect(0, 0, SIZE, SIZE);
    ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(SIZE / 2, 0); ctx.lineTo(SIZE / 2, SIZE); ctx.moveTo(0, SIZE / 2); ctx.lineTo(SIZE, SIZE / 2); ctx.stroke();
  },
};

// color, noise variance, noise cells, metres per texture tile, roughness, metalness, painter(s)
const DEFS = {
  asphalt: { c: 0x3a3c3f, v: 0.16, n: 8, s: 6, r: 0.95, p: [['speckle', { count: 1600, max: 2, cracks: 5 }]] },
  sidewalk: { c: 0x8f8c86, v: 0.1, n: 6, s: 4, r: 0.9, p: [['tilesVar', { n: 2, lw: 3 }], ['speckle', { count: 500 }]] },
  paving: { c: 0x9c8f7d, v: 0.1, n: 6, s: 3, r: 0.88, p: [['tilesVar', { n: 4 }]] },
  grass: { c: 0x4c6a31, v: 0.3, n: 10, s: 5, r: 1, p: [['leaves', {}]] },
  brick: { c: 0x8c4c3b, v: 0.12, n: 6, s: 2.4, r: 0.9, p: [['bricks', {}]] },
  brickDark: { c: 0x5c3b34, v: 0.12, n: 6, s: 2.4, r: 0.9, p: [['bricks', { mortar: 'rgba(150,140,130,0.5)' }]] },
  plaster: { c: 0xcbbfab, v: 0.08, n: 5, s: 5, r: 0.92, p: [['stains', { count: 9 }], ['speckle', { count: 300, cracks: 3 }]] },
  concrete: { c: 0x9a9a95, v: 0.12, n: 6, s: 4, r: 0.88, p: [['stains', { count: 8, seams: true }], ['speckle', { count: 700 }]] },
  concreteDark: { c: 0x5e5f61, v: 0.12, n: 6, s: 4, r: 0.9, p: [['speckle', { count: 700 }]] },
  stone: { c: 0xa49f94, v: 0.14, n: 6, s: 3, r: 0.85, p: [['bricks', { rows: 6, cols: 3, mortar: 'rgba(60,55,50,0.45)' }]] },
  metal: { c: 0x8a9096, v: 0.06, n: 4, s: 3, r: 0.45, m: 0.7, p: [['brushed', { panels: true }]] },
  metalDark: { c: 0x2f3337, v: 0.08, n: 4, s: 3, r: 0.5, m: 0.7, p: [['brushed', {}]] },
  metalGreen: { c: 0x3f5b48, v: 0.08, n: 4, s: 3, r: 0.6, m: 0.4, p: [['brushed', { panels: true, rust: true }]] },
  metalYellow: { c: 0xc79a1e, v: 0.08, n: 4, s: 3, r: 0.6, m: 0.4, p: [['brushed', { rust: true }]] },
  rust: { c: 0x7b4a2c, v: 0.25, n: 8, s: 3, r: 0.85, m: 0.3, p: [['brushed', { rust: true }], ['speckle', { count: 900 }]] },
  wood: { c: 0x8b6b46, v: 0.1, n: 5, s: 2, r: 0.8, p: [['planks', {}]] },
  woodDark: { c: 0x5b422a, v: 0.1, n: 5, s: 2, r: 0.8, p: [['planks', { n: 5 }]] },
  tile: { c: 0xb8b3a7, v: 0.05, n: 4, s: 2.4, r: 0.5, p: [['tilesVar', { n: 6, line: 'rgba(60,55,50,0.5)' }]] },
  roof: { c: 0x4b4845, v: 0.15, n: 10, s: 4, r: 1, p: [['speckle', { count: 2400, max: 3 }]] },
  glass: { c: 0x243643, v: 0.04, n: 3, s: 4, r: 0.08, m: 0.6, p: [] },
  paint: { c: 0xffffff, v: 0.05, n: 4, s: 3, r: 0.4, m: 0.45, p: [['speckle', { count: 120 }]] },
  rubber: { c: 0x161616, v: 0.1, n: 6, s: 2, r: 0.95, p: [] },
  container: { c: 0xffffff, v: 0.1, n: 5, s: 2.44, r: 0.6, m: 0.35, p: [['corrugated', {}], ['brushed', { rust: true }]] },
  bark: { c: 0x4b3b2b, v: 0.25, n: 12, s: 1.5, r: 1, p: [['planks', { n: 10 }]] },
  leaves: { c: 0x3f6a2f, v: 0.3, n: 8, s: 3, r: 1, p: [['leaves', {}]] },
  cloth: { c: 0xffffff, v: 0.08, n: 6, s: 1.5, r: 1, p: [['weave', {}]] },
  paintWhite: { c: 0xd9d9d0, v: 0.12, n: 8, s: 2, r: 0.8, p: [['speckle', { count: 300 }]] },
  sand: { c: 0xc8a268, v: 0.1, n: 8, s: 7, r: 1, p: [['speckle', { count: 1800, max: 2 }]] },
  sandDark: { c: 0xa98652, v: 0.12, n: 8, s: 6, r: 1, p: [['speckle', { count: 1800, max: 2 }]] },
  sandstone: { c: 0xc4a474, v: 0.12, n: 6, s: 3, r: 0.9, p: [['bricks', { rows: 6, cols: 3, mortar: 'rgba(90,70,40,0.4)' }]] },
  mudbrick: { c: 0xb38c5c, v: 0.12, n: 6, s: 4, r: 0.95, p: [['stains', { count: 8 }], ['speckle', { count: 600, cracks: 6 }]] },
  mudDark: { c: 0x8c6a45, v: 0.14, n: 6, s: 4, r: 0.95, p: [['speckle', { count: 600, cracks: 6 }]] },
  rock: { c: 0x8f7f6a, v: 0.25, n: 7, s: 4, r: 0.95, p: [['speckle', { count: 900, cracks: 8 }]] },
  floorIndustrial: { c: 0x74767a, v: 0.1, n: 6, s: 5, r: 0.7, p: [['stains', { count: 4, seams: true }], ['speckle', { count: 900, cracks: 4 }]] },
  hazard: { c: 0xd1a416, v: 0.06, n: 4, s: 1.6, r: 0.7, p: [['hazard', {}]] },
  window: { fit: true, r: 0.1, m: 0.5, p: [['window', {}]] },
  windowLit: { fit: true, glow: true, p: [['window', { lit: true }]] },
  lampGlow: { glow: true, c: 0xffe6b0 },
  skylight: { glow: true, c: 0xdfeaf2 },
};

P.hazard = (ctx) => {
  ctx.fillStyle = '#1b1b1b';
  for (let i = -SIZE; i < SIZE * 2; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 32, 0); ctx.lineTo(i + 32 - SIZE, SIZE); ctx.lineTo(i - SIZE, SIZE); ctx.fill(); }
};

export const FIT_UV = new Set(Object.keys(DEFS).filter((k) => DEFS[k].fit));
export const UV_SCALE = Object.fromEntries(Object.keys(DEFS).map((k) => [k, DEFS[k].s || 3]));
export const GLOW = new Set(Object.keys(DEFS).filter((k) => DEFS[k].glow));

const texCache = new Map();
const surfaceCache = new Map();

function texture(name, aniso) {
  if (texCache.has(name)) {
    const t = texCache.get(name);
    if (t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
    return t;
  }
  const d = DEFS[name];
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');
  let seed = 0; for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0;
  if (d.c !== undefined) base(ctx, d.c, d.v || 0.1, d.n || 6, seed);
  for (const [fn, o] of d.p || []) P[fn](ctx, o, seed + 13);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (!d.fit) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(name, t);
  return t;
}

// Small physical relief catches grazing light without changing the map geometry. These maps
// share the colour texture's UVs and are cached for the lifetime of the application.
const RELIEF = {
  asphalt: 0.018, sidewalk: 0.014, paving: 0.016, brick: 0.027, brickDark: 0.027,
  plaster: 0.009, concrete: 0.012, concreteDark: 0.012, stone: 0.025,
  metal: 0.004, metalDark: 0.003, metalGreen: 0.005, metalYellow: 0.004,
  rust: 0.012, wood: 0.015, woodDark: 0.015, tile: 0.009, roof: 0.014,
  container: 0.014, bark: 0.022, sand: 0.012, sandDark: 0.012,
  sandstone: 0.025, mudbrick: 0.013, mudDark: 0.012, rock: 0.025,
  floorIndustrial: 0.009,
};

function surfaceMaps(name, map, aniso) {
  let maps = surfaceCache.get(name);
  if (!maps) {
    const def = DEFS[name], cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    const ctx = cv.getContext('2d'), pixels = map.image.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const height = ctx.createImageData(SIZE, SIZE), rough = ctx.createImageData(SIZE, SIZE);
    const brick = def.p?.find(([fn]) => fn === 'bricks');
    const tile = def.p?.find(([fn]) => fn === 'tilesVar');
    const plank = def.p?.find(([fn]) => fn === 'planks');
    const random = rng(7281 + name.length * 317);
    const baseColor = hex(def.c || 0x808080), mean = Math.max(1, baseColor.reduce((a, b) => a + b, 0) / 3);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * mean);
      let h = 0.53 + (light - 1) * 0.32;
      if (brick) {
        const bh = SIZE / (brick[1].rows || 12), bw = SIZE / (brick[1].cols || 5);
        const row = Math.floor(y / bh), bx = ((x - (row % 2) * bw * 0.5) % bw + bw) % bw;
        if (y % bh < 1.8 || bx < 1.8) h = 0.18;
      }
      if (tile) {
        const s = SIZE / (tile[1].n || 4);
        if (x % s < 1.6 || y % s < 1.6) h = 0.23;
      }
      if (plank && y % (SIZE / (plank[1].n || 6)) < 1.7) h = 0.2;
      if (name === 'container') h = 0.5 - Math.cos(x / SIZE * Math.PI * 32) * 0.32;
      const r = (def.r ?? 0.85) + (1 - light) * 0.12 + (random() - 0.5) * 0.045;
      const v = Math.round(Math.max(0, Math.min(1, h)) * 255), rv = Math.round(Math.max(0.08, Math.min(1, r)) * 255);
      height.data[i] = height.data[i + 1] = height.data[i + 2] = v; height.data[i + 3] = 255;
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = rv; rough.data[i + 3] = 255;
    }
    ctx.putImageData(height, 0, 0);
    const rc = document.createElement('canvas'); rc.width = rc.height = SIZE; rc.getContext('2d').putImageData(rough, 0, 0);
    const bumpMap = new THREE.CanvasTexture(cv), roughnessMap = new THREE.CanvasTexture(rc);
    for (const t of [bumpMap, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter;
    }
    maps = { bumpMap, roughnessMap }; surfaceCache.set(name, maps);
  }
  for (const t of Object.values(maps)) if (t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
  return maps;
}

/** Material for a map material key. `standard` picks PBR (medium+) or cheap Lambert (low). */
export function makeMaterial(name, standard, aniso = 4) {
  const d = DEFS[name] || DEFS.concrete;
  if (d.glow) {
    return new THREE.MeshBasicMaterial(d.p ? { map: texture(name, aniso), toneMapped: false } : { color: d.c, toneMapped: false });
  }
  const map = texture(DEFS[name] ? name : 'concrete', aniso);
  if (standard) {
    const detail = RELIEF[name] ? surfaceMaps(name, map, aniso) : null;
    return new THREE.MeshStandardMaterial({
      map, roughness: detail ? 1 : (d.r === undefined ? 0.85 : d.r), metalness: d.m || 0, vertexColors: true,
      ...(detail ? { ...detail, bumpScale: RELIEF[name] } : {}),
    });
  }
  return new THREE.MeshLambertMaterial({ map, vertexColors: true });
}

export function materialNames() { return Object.keys(DEFS); }

/** Soft round sprite texture (particles, muzzle flash, glows). */
const spriteCache = new Map();
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const key = inner + outer + size;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, t);
  return t;
}

/** Bullet hole / scorch decal texture. */
export function decalTexture(kind = 'hole') {
  if (spriteCache.has('decal:' + kind)) return spriteCache.get('decal:' + kind);
  const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d'), r = rng(kind === 'hole' ? 5 : 9);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  if (kind === 'hole') { g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.22, 'rgba(10,8,6,0.9)'); g.addColorStop(0.5, 'rgba(30,25,20,0.35)'); g.addColorStop(1, 'rgba(30,25,20,0)'); }
  else { g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.5, 'rgba(15,12,10,0.6)'); g.addColorStop(1, 'rgba(15,12,10,0)'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
  for (let i = 0; i < (kind === 'hole' ? 6 : 14); i++) { const a = r() * 6.28, l = s * (0.2 + r() * 0.28); ctx.beginPath(); ctx.moveTo(s / 2, s / 2); ctx.lineTo(s / 2 + Math.cos(a) * l, s / 2 + Math.sin(a) * l); ctx.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set('decal:' + kind, t);
  return t;
}
