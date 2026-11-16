// Map construction toolkit. Maps are built from axis-aligned boxes only: every box is both
// rendered and collidable (except `decor`, which is flush surface detail), so there is no way for
// visual geometry and collision geometry to disagree.

export class MapBuilder {
  constructor(id, name) {
    this.id = id; this.name = name;
    this.boxes = [];
    this.spawns = { a: [], b: [], ffa: [] };
    this.env = {};
    this.lights = [];
  }

  /** Solid box from two corners. opts: {tint: 0xRRGGBB, decor: true (no collision)} */
  box(x0, y0, z0, x1, y1, z1, mat, opts) {
    const a = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    const b = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    if (b[0] - a[0] < 1e-4 || b[1] - a[1] < 1e-4 || b[2] - a[2] < 1e-4) return null;
    const box = { a, b, mat };
    if (opts) { if (opts.tint !== undefined) box.tint = opts.tint; if (opts.decor) box.decor = true; if (opts.glow) box.glow = true; }
    this.boxes.push(box);
    return box;
  }

  /** Box by centre (x,z), size and base height. */
  cbox(cx, cz, w, d, y0, h, mat, opts) { return this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, mat, opts); }

  /** Non-colliding flush detail (road paint, window panels). Keep it within a few cm of a solid surface. */
  decor(x0, y0, z0, x1, y1, z1, mat, opts) { return this.box(x0, y0, z0, x1, y1, z1, mat, Object.assign({ decor: true }, opts)); }

  /**
   * Wall running along X, occupying z..z+th. openings: [[u0,u1,v0,v1], ...] (x range, y range).
   */
  wallX(x0, x1, z, y0, y1, th, mat, openings = [], opts) {
    this._wall(x0, x1, y0, y1, openings, (u0, u1, v0, v1) => this.box(u0, v0, z, u1, v1, z + th, mat, opts));
  }

  /** Wall running along Z, occupying x..x+th. openings: [[u0,u1,v0,v1], ...] (z range, y range). */
  wallZ(z0, z1, x, y0, y1, th, mat, openings = [], opts) {
    this._wall(z0, z1, y0, y1, openings, (u0, u1, v0, v1) => this.box(x, v0, u0, x + th, v1, u1, mat, opts));
  }

  _wall(u0, u1, y0, y1, openings, emit) {
    const ops = openings.map((o) => [Math.max(u0, Math.min(o[0], o[1])), Math.min(u1, Math.max(o[0], o[1])), Math.max(y0, o[2]), Math.min(y1, o[3])])
      .filter((o) => o[1] > o[0] && o[3] > o[2]);
    // Cut the wall into vertical strips at every opening edge; each strip is solid except where
    // openings cover it (openings may stack above each other or overlap).
    const cuts = [...new Set([u0, u1, ...ops.flatMap((o) => [o[0], o[1]])])].sort((p, q) => p - q);
    let run = null; // merge neighbouring strips with identical solid spans
    const flush = () => { if (run) for (const [a, c] of run.spans) emit(run.u0, run.u1, a, c); run = null; };
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], c = cuts[i + 1], mid = (a + c) / 2;
      const holes = ops.filter((o) => o[0] < mid && o[1] > mid).map((o) => [o[2], o[3]]).sort((p, q) => p[0] - q[0]);
      const spans = []; let y = y0;
      for (const h of holes) { if (h[0] > y) spans.push([y, h[0]]); y = Math.max(y, h[1]); }
      if (y < y1) spans.push([y, y1]);
      const key = JSON.stringify(spans);
      if (run && run.key === key) run.u1 = c; else { flush(); run = { u0: a, u1: c, spans, key }; }
    }
    flush();
  }

  /** Horizontal slab with optional rectangular holes [[hx0,hz0,hx1,hz1], ...] (non-overlapping). */
  slab(x0, z0, x1, z1, y0, y1, mat, holes = [], opts) {
    let rects = [[x0, z0, x1, z1]];
    for (const h of holes) {
      const next = [];
      for (const r of rects) {
        const ix0 = Math.max(r[0], h[0]), iz0 = Math.max(r[1], h[1]), ix1 = Math.min(r[2], h[2]), iz1 = Math.min(r[3], h[3]);
        if (ix0 >= ix1 || iz0 >= iz1) { next.push(r); continue; }
        if (r[1] < iz0) next.push([r[0], r[1], r[2], iz0]);
        if (iz1 < r[3]) next.push([r[0], iz1, r[2], r[3]]);
        if (r[0] < ix0) next.push([r[0], iz0, ix0, iz1]);
        if (ix1 < r[2]) next.push([ix1, iz0, r[2], iz1]);
      }
      rects = next;
    }
    for (const r of rects) this.box(r[0], y0, r[1], r[2], y1, r[3], mat, opts);
  }

  /**
   * Four walls (+ optional floor and roof). o: {x0,z0,x1,z1,y0,h,th,mat,floor,floorMat,roof,roofMat,
   * roofTh, roofHoles, open:{n:[],s:[],e:[],w:[]}, skip:'ns..' sides to omit}
   * n = wall at z0, s = wall at z1, w = wall at x0, e = wall at x1. Openings use absolute x (n/s) or z (e/w) and absolute y.
   */
  room(o) {
    const th = o.th || 0.3, y0 = o.y0 || 0, y1 = y0 + o.h, open = o.open || {}, skip = o.skip || '';
    if (!skip.includes('n')) this.wallX(o.x0, o.x1, o.z0, y0, y1, th, o.mat, open.n, o.opts);
    if (!skip.includes('s')) this.wallX(o.x0, o.x1, o.z1 - th, y0, y1, th, o.mat, open.s, o.opts);
    if (!skip.includes('w')) this.wallZ(o.z0 + th, o.z1 - th, o.x0, y0, y1, th, o.mat, open.w, o.opts);
    if (!skip.includes('e')) this.wallZ(o.z0 + th, o.z1 - th, o.x1 - th, y0, y1, th, o.mat, open.e, o.opts);
    if (o.floor) this.box(o.x0 + th, y0, o.z0 + th, o.x1 - th, y0 + (o.floorTh || 0.1), o.z1 - th, o.floorMat || 'concrete');
    if (o.roof) this.slab(o.x0, o.z0, o.x1, o.z1, y1, y1 + (o.roofTh || 0.3), o.roofMat || 'concrete', o.roofHoles || []);
  }

  /**
   * Staircase of solid steps. Starts at (x,z) = centre of the bottom edge, climbs toward dir
   * ('+x','-x','+z','-z') from y0 to y1 over `n` steps, each `run` deep and `width` wide.
   */
  stairs(x, z, dir, width, y0, y1, n, run, mat, base = y0) {
    const rise = (y1 - y0) / n, hw = width / 2;
    for (let i = 0; i < n; i++) {
      const a = run * i, c = run * (i + 1), top = y0 + rise * (i + 1);
      if (dir === '+x') this.box(x + a, base, z - hw, x + c, top, z + hw, mat);
      else if (dir === '-x') this.box(x - c, base, z - hw, x - a, top, z + hw, mat);
      else if (dir === '+z') this.box(x - hw, base, z + a, x + hw, top, z + c, mat);
      else this.box(x - hw, base, z - c, x + hw, top, z - a, mat);
    }
  }

  crate(cx, cz, size, y0 = 0, mat = 'wood', opts) { return this.cbox(cx, cz, size, size, y0, size, mat, opts); }

  /** Sedan-sized car as cover. alongX: true if its length runs along X. */
  car(cx, cz, alongX, tint = 0x8a2b22, y0 = 0) {
    const L = 4.4, Wd = 1.9;
    const w = alongX ? L : Wd, d = alongX ? Wd : L;
    this.cbox(cx, cz, w * 0.92, d * 0.92, y0, 0.3, 'rubber');
    this.cbox(cx, cz, w, d, y0 + 0.3, 0.7, 'paint', { tint });
    this.cbox(cx, cz, alongX ? L * 0.5 : Wd * 0.88, alongX ? Wd * 0.88 : L * 0.5, y0 + 1.0, 0.55, 'glass');
  }

  van(cx, cz, alongX, tint = 0xd8d8d0) {
    const L = 5.6, Wd = 2.2;
    const w = alongX ? L : Wd, d = alongX ? Wd : L;
    this.cbox(cx, cz, w * 0.94, d * 0.94, 0, 0.35, 'rubber');
    this.cbox(cx, cz, w, d, 0.35, 2.1, 'paint', { tint });
  }

  bus(cx, cz, alongX, tint = 0xc9a227) {
    const L = 11, Wd = 2.6;
    const w = alongX ? L : Wd, d = alongX ? Wd : L;
    this.cbox(cx, cz, w * 0.96, d * 0.96, 0, 0.4, 'rubber');
    this.cbox(cx, cz, w, d, 0.4, 1.0, 'paint', { tint });
    this.cbox(cx, cz, w - 0.1, d - 0.1, 1.4, 1.1, 'glass');
    this.cbox(cx, cz, w, d, 2.5, 0.5, 'paint', { tint });
  }

  /** Shipping container. hollow = walk-through tunnel open at both ends along its length. */
  container(cx, cz, alongX, y0 = 0, tint = 0x9c3b2a, hollow = false) {
    const L = 6.1, Wd = 2.44, H = 2.6, t = 0.12;
    const w = alongX ? L : Wd, d = alongX ? Wd : L;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (!hollow) { this.box(x0, y0, z0, x1, y0 + H, z1, 'container', { tint }); return; }
    this.box(x0, y0, z0, x1, y0 + 0.1, z1, 'container', { tint });
    this.box(x0, y0 + H - t, z0, x1, y0 + H, z1, 'container', { tint });
    if (alongX) {
      this.box(x0, y0 + 0.1, z0, x1, y0 + H - t, z0 + t, 'container', { tint });
      this.box(x0, y0 + 0.1, z1 - t, x1, y0 + H - t, z1, 'container', { tint });
    } else {
      this.box(x0, y0 + 0.1, z0, x0 + t, y0 + H - t, z1, 'container', { tint });
      this.box(x1 - t, y0 + 0.1, z0, x1, y0 + H - t, z1, 'container', { tint });
    }
  }

  tree(cx, cz, h = 3.2, r = 1.6) {
    this.cbox(cx, cz, 0.45, 0.45, 0, h, 'bark');
    this.cbox(cx, cz, r * 2, r * 2, h, r * 1.3, 'leaves');
    this.cbox(cx, cz, r * 1.3, r * 1.3, h + r * 1.3, r * 0.7, 'leaves');
  }

  /** Street lamp. `glow` boxes render emissive. */
  lamp(cx, cz, h = 5.5, armX = 0, armZ = 0) {
    this.cbox(cx, cz, 0.22, 0.22, 0, h, 'metalDark');
    if (armX || armZ) {
      this.box(cx - 0.08 + Math.min(0, armX), h - 0.15, cz - 0.08 + Math.min(0, armZ), cx + 0.08 + Math.max(0, armX), h, cz + 0.08 + Math.max(0, armZ), 'metalDark');
      this.cbox(cx + armX, cz + armZ, 0.5, 0.5, h - 0.3, 0.15, 'lampGlow', { glow: true });
    } else this.cbox(cx, cz, 0.5, 0.5, h, 0.2, 'lampGlow', { glow: true });
  }

  /**
   * Solid building mass with window panels (decor) on the given faces. faces: string of n,s,e,w.
   */
  facade(x0, z0, x1, z1, h, mat, faces = '', opts = {}) {
    this.box(x0, 0, z0, x1, h, z1, mat, opts);
    this.box(x0 - 0.15, h, z0 - 0.15, x1 + 0.15, h + 0.35, z1 + 0.15, opts.trim || 'concreteDark');
    const winMat = opts.win || 'window', floorH = opts.floorH || 3.4, ww = 1.5, wh = 1.6, gap = opts.gap || 3.2;
    const rows = Math.floor((h - 0.8) / floorH);
    let seed = Math.floor(Math.abs(x0 * 31.7 + z0 * 17.3)) + 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let r = 0; r < rows; r++) {
      const y = (opts.firstY !== undefined ? opts.firstY : 1.2) + r * floorH;
      if (y + wh > h - 0.3) break;
      for (const f of faces) {
        const along = (f === 'n' || f === 's') ? x1 - x0 : z1 - z0;
        const n = Math.max(1, Math.floor((along - 1.2) / gap));
        const start = ((f === 'n' || f === 's') ? x0 : z0) + (along - (n - 1) * gap) / 2;
        for (let i = 0; i < n; i++) {
          const c = start + i * gap, m = rnd() < 0.22 ? 'windowLit' : winMat, o = m === 'windowLit' ? { glow: true } : undefined;
          if (f === 'n') this.decor(c - ww / 2, y, z0 - 0.04, c + ww / 2, y + wh, z0, m, o);
          else if (f === 's') this.decor(c - ww / 2, y, z1, c + ww / 2, y + wh, z1 + 0.04, m, o);
          else if (f === 'w') this.decor(x0 - 0.04, y, c - ww / 2, x0, y + wh, c + ww / 2, m, o);
          else this.decor(x1, y, c - ww / 2, x1 + 0.04, y + wh, c + ww / 2, m, o);
        }
      }
    }
  }

  /** Low railing / parapet along X or Z. */
  railX(x0, x1, z, y0, h = 1.0, mat = 'metalDark', th = 0.12) { this.box(x0, y0, z, x1, y0 + h, z + th, mat); }
  railZ(z0, z1, x, y0, h = 1.0, mat = 'metalDark', th = 0.12) { this.box(x, y0, z0, x + th, y0 + h, z1, mat); }

  spawn(team, x, z, yawDeg = 0, y = 0) { this.spawns[team].push({ x, y, z, yaw: (yawDeg * Math.PI) / 180 }); }

  /**
   * Duplicate everything built so far with 180° rotational symmetry about the origin
   * ((x,z) -> (-x,-z)). Team A spawns become team B spawns. Gives perfectly balanced sides.
   */
  mirror() {
    const n = this.boxes.length;
    for (let i = 0; i < n; i++) {
      const s = this.boxes[i];
      this.boxes.push(Object.assign({}, s, { a: [-s.b[0], s.a[1], -s.b[2]], b: [-s.a[0], s.b[1], -s.a[2]] }));
    }
    const flip = (p) => ({ x: -p.x, y: p.y, z: -p.z, yaw: p.yaw + Math.PI });
    this.spawns.b.push(...this.spawns.a.map(flip));
    this.spawns.ffa.push(...this.spawns.ffa.map(flip));
    this.lights.push(...this.lights.map((l) => Object.assign({}, l, { x: -l.x, z: -l.z })));
  }

  build() {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y1 = -Infinity;
    for (const b of this.boxes) {
      x0 = Math.min(x0, b.a[0]); z0 = Math.min(z0, b.a[2]); x1 = Math.max(x1, b.b[0]); z1 = Math.max(z1, b.b[2]); y1 = Math.max(y1, b.b[1]);
    }
    return {
      id: this.id, name: this.name, desc: this.desc || '', boxes: this.boxes, spawns: this.spawns, env: this.env, lights: this.lights,
      bounds: this.bounds || { x0, z0, x1, z1 }, top: y1,
    };
  }
}
