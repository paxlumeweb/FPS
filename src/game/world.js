// Static collision world made of axis-aligned boxes. Pure math (no DOM / Three.js) so the same
// code runs for client prediction, the host simulation and the Node map validator.

export const PLAYER_RADIUS = 0.35;
export const STEP_HEIGHT = 0.55;
const AIR_STEP = 0.3;
const SNAP_DOWN = 0.45;
const EPS = 1e-4;
const CELL = 8;

export class World {
  /** @param def {boxes:[{a:[x0,y0,z0], b:[x1,y1,z1], mat, decor?}], spawns, bounds, ...} */
  constructor(def) {
    this.def = def;
    const solid = def.boxes.filter((b) => !b.decor);
    this.n = solid.length;
    this.b = new Float32Array(this.n * 6);
    this.mats = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const s = solid[i];
      this.b.set([s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2]], i * 6);
      this.mats[i] = s.mat;
    }
    // uniform XZ grid for overlap queries
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      x0 = Math.min(x0, this.b[o]); z0 = Math.min(z0, this.b[o + 2]);
      x1 = Math.max(x1, this.b[o + 3]); z1 = Math.max(z1, this.b[o + 5]);
    }
    this.gx0 = x0; this.gz0 = z0;
    this.gnx = Math.max(1, Math.ceil((x1 - x0) / CELL));
    this.gnz = Math.max(1, Math.ceil((z1 - z0) / CELL));
    const lists = Array.from({ length: this.gnx * this.gnz }, () => []);
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      const cx0 = this._cx(this.b[o]), cx1 = this._cx(this.b[o + 3]);
      const cz0 = this._cz(this.b[o + 2]), cz1 = this._cz(this.b[o + 5]);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) lists[cx + cz * this.gnx].push(i);
    }
    this.cells = lists.map((l) => Int32Array.from(l));
    this.hits = new Int32Array(256);
    this.nh = 0;
    this.hit = { t: Infinity, nx: 0, ny: 0, nz: 0, box: -1 };
  }

  _cx(x) { return Math.min(this.gnx - 1, Math.max(0, Math.floor((x - this.gx0) / CELL))); }
  _cz(z) { return Math.min(this.gnz - 1, Math.max(0, Math.floor((z - this.gz0) / CELL))); }

  /** Collect boxes overlapping the given AABB into this.hits; returns the count. */
  collect(x0, y0, z0, x1, y1, z1) {
    const b = this.b, hits = this.hits;
    let n = 0;
    const cx0 = this._cx(x0), cx1 = this._cx(x1), cz0 = this._cz(z0), cz1 = this._cz(z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells[cx + cz * this.gnx];
        for (let k = 0; k < list.length; k++) {
          const i = list[k], o = i * 6;
          if (x0 < b[o + 3] - EPS && x1 > b[o] + EPS && y0 < b[o + 4] - EPS && y1 > b[o + 1] + EPS &&
              z0 < b[o + 5] - EPS && z1 > b[o + 2] + EPS) {
            let dup = false;
            for (let j = 0; j < n; j++) if (hits[j] === i) { dup = true; break; }
            if (!dup && n < 256) hits[n++] = i;
          }
        }
      }
    }
    this.nh = n;
    return n;
  }

  /** True if a player-sized box with feet at (x,y,z) and the given height is free. */
  isFree(x, y, z, height, r = PLAYER_RADIUS) {
    return this.collect(x - r, y, z - r, x + r, y + height, z + r) === 0;
  }

  /**
   * Ray vs world. Returns distance (Infinity if nothing within maxT); details in this.hit.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT = 1e9) {
    const b = this.b, n = this.n;
    if (dx === 0) dx = 1e-9;
    if (dy === 0) dy = 1e-9;
    if (dz === 0) dz = 1e-9;
    let best = maxT, bi = -1, bAxis = 0;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    for (let i = 0, o = 0; i < n; i++, o += 6) {
      let t0 = (b[o] - ox) * ix, t1 = (b[o + 3] - ox) * ix, axis = 0;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      let tmin = t0, tmax = t1;
      if (tmin > best || tmax < 0) continue;
      t0 = (b[o + 1] - oy) * iy; t1 = (b[o + 4] - oy) * iy;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t0 > tmin) { tmin = t0; axis = 1; }
      if (t1 < tmax) tmax = t1;
      if (tmin > tmax || tmin > best || tmax < 0) continue;
      t0 = (b[o + 2] - oz) * iz; t1 = (b[o + 5] - oz) * iz;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t0 > tmin) { tmin = t0; axis = 2; }
      if (t1 < tmax) tmax = t1;
      if (tmin > tmax || tmax < 0 || tmin > best) continue;
      if (tmin < 0) continue; // origin inside the box: ignore (lets shots leave a wall the muzzle touches)
      best = tmin; bi = i; bAxis = axis;
    }
    const h = this.hit;
    h.box = bi; h.nx = 0; h.ny = 0; h.nz = 0;
    if (bi < 0) { h.t = Infinity; return Infinity; }
    h.t = best;
    if (bAxis === 0) h.nx = dx > 0 ? -1 : 1; else if (bAxis === 1) h.ny = dy > 0 ? -1 : 1; else h.nz = dz > 0 ? -1 : 1;
    return best;
  }

  /** True if the straight segment between two points is unobstructed. */
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) return true;
    return this.raycast(ax, ay, az, dx / l || 1e-9, dy / l || 1e-9, dz / l || 1e-9, l) === Infinity;
  }

  /**
   * Move a player box (state s with x,y,z,vx,vy,vz,ground) by its velocity for dt, resolving
   * collisions one axis at a time, with step-up for stairs and snap-down when walking off steps.
   */
  move(s, dt, height) {
    const r = PLAYER_RADIUS, b = this.b;
    const wasGround = s.ground;

    // Safety net: if something ever leaves us inside geometry, pop up onto it.
    if (this.collect(s.x - r, s.y, s.z - r, s.x + r, s.y + height, s.z + r)) {
      let top = -Infinity;
      for (let k = 0; k < this.nh; k++) top = Math.max(top, b[this.hits[k] * 6 + 4]);
      if (top - s.y < 2.5 && this.isFree(s.x, top + EPS, s.z, height)) { s.y = top + EPS; s.vy = 0; }
    }

    // X axis
    if (s.vx !== 0) {
      let nx = s.x + s.vx * dt;
      if (this.collect(nx - r, s.y, s.z - r, nx + r, s.y + height, s.z + r)) {
        let top = -Infinity, lim = s.vx > 0 ? Infinity : -Infinity;
        for (let k = 0; k < this.nh; k++) {
          const o = this.hits[k] * 6;
          top = Math.max(top, b[o + 4]);
          lim = s.vx > 0 ? Math.min(lim, b[o] - r - EPS) : Math.max(lim, b[o + 3] + r + EPS);
        }
        const rise = top - s.y, maxStep = wasGround ? STEP_HEIGHT : AIR_STEP;
        if (rise > 0 && rise <= maxStep && (wasGround || s.vy <= 0.5) && this.isFree(nx, top + EPS, s.z, height)) {
          s.y = top + EPS;
          if (s.vy < 0) s.vy = 0;
        } else {
          nx = s.vx > 0 ? Math.max(s.x, lim) : Math.min(s.x, lim);
          s.vx = 0;
        }
      }
      s.x = nx;
    }

    // Z axis
    if (s.vz !== 0) {
      let nz = s.z + s.vz * dt;
      if (this.collect(s.x - r, s.y, nz - r, s.x + r, s.y + height, nz + r)) {
        let top = -Infinity, lim = s.vz > 0 ? Infinity : -Infinity;
        for (let k = 0; k < this.nh; k++) {
          const o = this.hits[k] * 6;
          top = Math.max(top, b[o + 4]);
          lim = s.vz > 0 ? Math.min(lim, b[o + 2] - r - EPS) : Math.max(lim, b[o + 5] + r + EPS);
        }
        const rise = top - s.y, maxStep = wasGround ? STEP_HEIGHT : AIR_STEP;
        if (rise > 0 && rise <= maxStep && (wasGround || s.vy <= 0.5) && this.isFree(s.x, top + EPS, nz, height)) {
          s.y = top + EPS;
          if (s.vy < 0) s.vy = 0;
        } else {
          nz = s.vz > 0 ? Math.max(s.z, lim) : Math.min(s.z, lim);
          s.vz = 0;
        }
      }
      s.z = nz;
    }

    // Y axis
    s.ground = 0;
    let ny = s.y + s.vy * dt;
    if (this.collect(s.x - r, ny, s.z - r, s.x + r, ny + height, s.z + r)) {
      if (s.vy <= 0) {
        let top = -Infinity;
        for (let k = 0; k < this.nh; k++) top = Math.max(top, b[this.hits[k] * 6 + 4]);
        ny = top - s.y < 0.6 ? top + EPS : s.y;
        s.ground = 1;
      } else {
        let bot = Infinity;
        for (let k = 0; k < this.nh; k++) bot = Math.min(bot, b[this.hits[k] * 6 + 1]);
        ny = Math.min(s.y + s.vy * dt, Math.max(s.y, bot - height - EPS));
      }
      s.vy = 0;
    }
    s.y = ny;

    // Stick to stairs / small drops instead of going airborne for a frame.
    if (!s.ground && wasGround && s.vy <= 0) {
      if (this.collect(s.x - r, s.y - SNAP_DOWN, s.z - r, s.x + r, s.y, s.z + r)) {
        let top = -Infinity;
        for (let k = 0; k < this.nh; k++) top = Math.max(top, b[this.hits[k] * 6 + 4]);
        if (top <= s.y + EPS && this.isFree(s.x, top + EPS, s.z, height)) { s.y = top + EPS; s.vy = 0; s.ground = 1; }
      }
    }
  }
}
