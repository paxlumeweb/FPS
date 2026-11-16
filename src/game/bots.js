// Simple practice bots. They run on the host and feed the simulation the same command structure
// human clients do, so they obey exactly the same movement and weapon rules.
// Navigation is a 2D grid A* over ground-level walkable cells (bots stay on the ground floor).

import { TICK, BTN, statsOf } from './player.js';

export const BOT_NAMES = ['Viper', 'Mako', 'Ghost', 'Rook', 'Jinx', 'Onyx', 'Echo', 'Talon', 'Blitz', 'Nova', 'Hex', 'Kilo'];
const BOT_GUNS = ['kr4', 'hornet', 'breacher', 'ranger', 'bulldog', 'kr4', 'hornet'];

export class NavGrid {
  constructor(world, def) {
    const b = def.bounds;
    this.x0 = Math.floor(b.x0); this.z0 = Math.floor(b.z0);
    this.nx = Math.ceil(b.x1) - this.x0; this.nz = Math.ceil(b.z1) - this.z0;
    const n = this.nx * this.nz;
    this.walk = new Uint8Array(n);
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const cx = this.x0 + ix + 0.5, cz = this.z0 + iz + 0.5;
        const free = world.isFree(cx, 0.3, cz, 1.6, 0.44);
        const ground = world.collect(cx - 0.2, -0.6, cz - 0.2, cx + 0.2, 0.29, cz + 0.2) > 0;
        this.walk[ix + iz * this.nx] = free && ground ? 1 : 0;
      }
    }
    // keep only the largest connected region so every target is reachable
    const label = new Int32Array(n).fill(-1);
    let bestLabel = -1, bestSize = 0, cur = 0;
    for (let i = 0; i < n; i++) {
      if (!this.walk[i] || label[i] >= 0) continue;
      let size = 0; const st = [i]; label[i] = cur;
      while (st.length) {
        const c = st.pop(); size++;
        const cx = c % this.nx, cz = (c / this.nx) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) continue;
          const k = x + z * this.nx;
          if (this.walk[k] && label[k] < 0) { label[k] = cur; st.push(k); }
        }
      }
      if (size > bestSize) { bestSize = size; bestLabel = cur; }
      cur++;
    }
    this.cells = [];
    for (let i = 0; i < n; i++) { if (label[i] !== bestLabel) this.walk[i] = 0; else this.cells.push(i); }
    this.g = new Float32Array(n); this.from = new Int32Array(n); this.state = new Uint8Array(n);
  }

  idx(x, z) {
    const ix = Math.floor(x - this.x0), iz = Math.floor(z - this.z0);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return ix + iz * this.nx;
  }

  nearest(x, z) {
    const i = this.idx(x, z);
    if (i >= 0 && this.walk[i]) return i;
    const ix = Math.floor(x - this.x0), iz = Math.floor(z - this.z0);
    for (let r = 1; r < 8; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const X = ix + dx, Z = iz + dz;
        if (X < 0 || Z < 0 || X >= this.nx || Z >= this.nz) continue;
        if (this.walk[X + Z * this.nx]) return X + Z * this.nx;
      }
    }
    return -1;
  }

  randomCell() { return this.cells[(Math.random() * this.cells.length) | 0]; }
  cx(i) { return this.x0 + (i % this.nx) + 0.5; }
  cz(i) { return this.z0 + ((i / this.nx) | 0) + 0.5; }

  /** A* from a to b (cell indices). Returns array of cell indices or null. */
  path(a, b) {
    if (a < 0 || b < 0) return null;
    const nx = this.nx, nz = this.nz, walk = this.walk, g = this.g, from = this.from, state = this.state;
    state.fill(0);
    const bx = b % nx, bz = (b / nx) | 0;
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
      return top[1];
    };
    g[a] = 0; from[a] = -1; state[a] = 1; push(a, 0);
    while (heap.length) {
      const c = pop();
      if (state[c] === 2) continue;
      state[c] = 2;
      if (c === b) { const out = []; for (let k = b; k >= 0; k = from[k]) out.push(k); return out.reverse(); }
      const cx = c % nx, cz = (c / nx) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
        const k = x + z * nx;
        if (!walk[k] || state[k] === 2) continue;
        if (dx && dz && (!walk[cx + dx + cz * nx] || !walk[cx + z * nx])) continue;
        const ng = g[c] + (dx && dz ? 1.414 : 1);
        if (state[k] === 1 && ng >= g[k]) continue;
        g[k] = ng; from[k] = c; state[k] = 1;
        const hx = Math.abs(x - bx), hz = Math.abs(z - bz);
        push(k, ng + Math.max(hx, hz) + 0.414 * Math.min(hx, hz));
      }
    }
    return null;
  }
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class BotBrain {
  constructor(sim, P) {
    this.sim = sim; this.P = P;
    if (!sim.nav) sim.nav = new NavGrid(sim.world, sim.mapDef);
    this.nav = sim.nav;
    this.seq = 0; this.yaw = 0; this.pitch = 0;
    this.skill = 0.75 + Math.random() * 0.5;
    this.onSpawn();
  }

  pickLoadout() { return { primary: BOT_GUNS[(Math.random() * BOT_GUNS.length) | 0], primaryAtt: [], secondary: 'p9', secondaryAtt: [] }; }

  onSpawn() {
    this.yaw = this.P.s.yaw; this.pitch = 0;
    this.path = null; this.pi = 0; this.target = null; this.seen = 0; this.senseIn = (Math.random() * 10) | 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0; this.burstT = 0; this.pauseT = 0;
    this.errY = 0; this.errP = 0; this.errT = 0; this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.jumpT = 0;
    this.alert = null; this.alertT = 0;
  }
  onDeath() { this.target = null; }
  onDamaged(A) { if (!this.target) { this.alert = A; this.alertT = 2.5; } }

  _findTarget() {
    const { sim, P } = this, s = P.s, w = sim.world;
    let best = null, bestD = 75;
    const ex = s.x, ey = s.y + s.eye, ez = s.z;
    for (const T of sim.players.values()) {
      if (!T.alive || !sim._isEnemy(P, T)) continue;
      const dx = T.s.x - ex, dz = T.s.z - ez, d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const toYaw = Math.atan2(-dx, -dz);
      if (d > 9 && Math.abs(angDiff(toYaw, this.yaw)) > 1.15 && T !== this.alert) continue;
      if (!w.los(ex, ey, ez, T.s.x, T.s.y + (T.s.crouch ? 0.8 : 1.3), T.s.z)) continue;
      best = T; bestD = d;
    }
    return best;
  }

  think() {
    const { sim, P } = this, s = P.s;
    const cmd = { q: ++this.seq, b: 0, f: 0, s: 0, yaw: this.yaw, pitch: this.pitch, sel: -1 };
    if (!P.alive || sim.phase !== 'live') return cmd;
    const st = statsOf(s.w[s.slot]);
    const knife = st.cls === 'melee';

    if (--this.senseIn <= 0) {
      this.senseIn = 9;
      const t = this._findTarget();
      if (t !== this.target) { this.target = t; this.seen = 0; }
    }
    if (this.alertT > 0) { this.alertT -= TICK; if (this.alertT <= 0) this.alert = null; }
    const T = this.target && this.target.alive ? this.target : null;

    let wantYaw = this.yaw, wantPitch = 0, turn = 5;
    if (T) {
      this.seen += TICK;
      const dx = T.s.x - s.x, dz = T.s.z - s.z, d = Math.hypot(dx, dz);
      const dy = (T.s.y + (T.s.crouch ? 0.75 : 1.2)) - (s.y + s.eye);
      this.errT -= TICK;
      if (this.errT <= 0) {
        this.errT = 0.35 + Math.random() * 0.3;
        const mag = (0.035 + Math.min(0.03, d * 0.0006)) / this.skill;
        this.errY = (Math.random() * 2 - 1) * mag; this.errP = (Math.random() * 2 - 1) * mag * 0.7;
      }
      wantYaw = Math.atan2(-dx, -dz) + this.errY;
      wantPitch = Math.atan2(dy, d) + this.errP;
      turn = 7 * this.skill;
      const aimed = Math.abs(angDiff(wantYaw, this.yaw)) < 0.09;
      if (knife) {
        cmd.f = 1; cmd.b |= BTN.SPRINT;
        if (d < 2.0 && aimed) cmd.b |= (this.seq % 20 < 2 ? BTN.FIRE : 0);
      } else {
        // strafe while fighting, close distance if outside effective range
        this.strafeT -= TICK;
        if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 0.9; this.strafe = -this.strafe; }
        cmd.s = this.strafe;
        if (d > st.r0 * 1.1 + 4) cmd.f = 1; else if (d < 3) cmd.f = -1;
        if (this.seen > 0.3 / this.skill && aimed) {
          if (this.pauseT > 0) this.pauseT -= TICK;
          else {
            this.burstT += TICK;
            // semi-autos need the trigger released between shots
            if (st.auto || this.seq % 12 < 6) cmd.b |= BTN.FIRE;
            if (this.burstT > 0.5 + Math.random() * 0.5) { this.burstT = 0; this.pauseT = 0.15 + Math.random() * 0.3; }
          }
        }
        if (d > 18 && d < 60) cmd.b |= BTN.ADS;
      }
    } else {
      // roam: follow an A* path to a random place
      if (!this.path || this.pi >= this.path.length) {
        const a = this.nav.nearest(s.x, s.z);
        let goal = this.nav.randomCell();
        if (this.alert && this.alert.alive) goal = this.nav.nearest(this.alert.s.x, this.alert.s.z);
        this.path = this.nav.path(a, goal); this.pi = 1;
        if (!this.path) { this.path = null; }
      }
      if (this.path && this.pi < this.path.length) {
        const c = this.path[this.pi], tx = this.nav.cx(c), tz = this.nav.cz(c);
        const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
        if (d < 0.55) this.pi++;
        else {
          wantYaw = Math.atan2(-dx, -dz);
          const off = Math.abs(angDiff(wantYaw, this.yaw));
          if (off < 0.9) { cmd.f = 1; if (off < 0.3 && this.path.length - this.pi > 6) cmd.b |= BTN.SPRINT; }
        }
      }
      turn = 6;
      const W = s.w[s.slot];
      if (!knife && W.ammo < st.mag * 0.4 && s.reload <= 0 && this.seq % 30 === 0) cmd.b |= BTN.RELOAD;
      // unstick: if we have not moved, hop and re-plan
      this.stuckT += TICK;
      if (this.stuckT > 0.8) {
        if (Math.hypot(s.x - this.lastX, s.z - this.lastZ) < 0.35) { this.jumpT = 0.1; this.path = null; cmd.s = Math.random() < 0.5 ? 1 : -1; }
        this.stuckT = 0; this.lastX = s.x; this.lastZ = s.z;
      }
      if (this.jumpT > 0) { this.jumpT -= TICK; if (this.seq % 2) cmd.b |= BTN.JUMP; cmd.f = 1; }
    }

    const dyaw = angDiff(wantYaw, this.yaw), maxTurn = turn * TICK;
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, dyaw));
    this.pitch += Math.max(-maxTurn, Math.min(maxTurn, wantPitch - this.pitch));
    cmd.yaw = this.yaw; cmd.pitch = this.pitch;
    return cmd;
  }
}
