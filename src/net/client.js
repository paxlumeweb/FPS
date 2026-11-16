// ClientSession: one player's connection to a host. Handles the lobby protocol and, during a
// match, client-side prediction + server reconciliation for the local player and snapshot
// interpolation for everyone else.

import { CONFIG } from '../config.js';
import { World } from '../game/world.js';
import { getMap } from '../game/maps/index.js';
import { TICK, makeState, cloneState, copyState, stepPlayer, unpackState } from '../game/player.js';

const now = () => performance.now() / 1000;
const HOST_TIMEOUT = 12; // seconds of silence from the host before giving up
export const INTERP_DELAY = 0.1; // seconds: remote players are rendered this far in the past
const lerpAngle = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

export class ClientSession {
  constructor(transport, { name, loadout }) {
    this.transport = transport; this.name = name; this.loadout = loadout;
    this.handlers = {};
    this.id = -1; this.code = ''; this.connected = false;
    this.phase = 'lobby'; this.settings = null;
    this.roster = new Map();  // id -> {id, name, team, bot, isHost}
    this.scores = new Map();  // id -> {k, d, a, score, tier, ping, hs}
    this.teamScore = [0, 0];
    this.ping = 0; this._pingT = 0;
    this._resetMatch();
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, a) { const f = this.handlers[name]; if (f) f(a); }

  async connect(code) {
    this.code = code;
    this.transport.onMessage = (m) => this._recv(m);
    this.transport.onClose = (reason) => { this.connected = false; this.emit('close', reason); };
    await this.transport.connect(code);
    this.connected = true;
    this.send({ t: 'hello', v: CONFIG.protocol, name: this.name, lo: this.loadout });
    this._lastRecv = now();
    this._pingTimer = setInterval(() => {
      this.send({ t: 'pi', c: performance.now() });
      // the host answers every ping; prolonged silence means the connection is dead
      if (this.connected && now() - this._lastRecv > HOST_TIMEOUT) { this.connected = false; this.emit('close', 'Lost connection to the host (timed out).'); }
    }, 1000);
    if (typeof addEventListener === 'function') { this._bye = () => this.send({ t: 'bye' }); addEventListener('pagehide', this._bye); }
  }

  close() {
    clearInterval(this._pingTimer);
    if (this._bye) { removeEventListener('pagehide', this._bye); this._bye = null; }
    if (this.connected) this.send({ t: 'bye' }); // lets the host drop us immediately
    this.connected = false;
    setTimeout(() => this.transport.close(), 60);
  }
  send(m, reliable = true) { this.transport.send(m, reliable); }

  setLoadout(lo) { this.loadout = lo; this.send({ t: 'lo', lo }); }
  setTeam(team) { this.send({ t: 'team', team }); }
  setSettings(s) { this.send({ t: 'set', s }); }
  startMatch() { this.send({ t: 'go' }); }
  stopMatch() { this.send({ t: 'stop' }); }

  get me() { return this.roster.get(this.id); }
  get isHost() { const m = this.me; return !!(m && m.isHost); }
  isEnemy(id) {
    if (id === this.id) return false;
    const m = this.me, o = this.roster.get(id);
    if (!m || !o || !this.mode || !this.mode.teams) return true;
    return m.team !== o.team;
  }
  nameOf(id) { const p = this.roster.get(id); return p ? p.name : '?'; }

  // ------------------------------------------------------------------ match state
  _resetMatch() {
    this.world = null; this.mapDef = null; this.mode = null;
    this.state = makeState(); this.prev = makeState();
    this.pending = []; this.seq = 0; this.unsent = 0; this.lastSend = 0;
    this.snaps = []; this.lastSnapN = -1; this.timeOff = null; this.lastSnapAt = 0;
    this.remote = new Map(); this.nades = [];
    this.hp = 100; this.prot = 0; this.respawnIn = 0; this.spawnCount = -1;
    this.errX = 0; this.errY = 0; this.errZ = 0;
    this.matchPhase = 'countdown'; this.countdown = 0; this.timeLeft = 0; this._clockAt = now();
    this.result = null;
  }

  /** Server time the local view is showing for remote entities. */
  renderTime() { return this.timeOff === null ? 0 : now() + this.timeOff - INTERP_DELAY; }

  /**
   * Run one predicted tick for the local player. cmdIn: {b,f,s,yaw,pitch,sel}. Returns nothing;
   * gameplay events (fire, melee, ...) are pushed to `events`.
   */
  predict(cmdIn, events) {
    // Angles are rounded here so the host simulates with bit-identical inputs (keeps replays exact).
    const cmd = { q: ++this.seq, b: cmdIn.b, f: cmdIn.f, s: cmdIn.s, yaw: Math.round(cmdIn.yaw * 1e5) / 1e5, pitch: Math.round(cmdIn.pitch * 1e5) / 1e5, sel: cmdIn.sel };
    copyState(this.prev, this.state);
    stepPlayer(this.state, cmd, this.world, events);
    this.pending.push(cmd);
    if (this.pending.length > 120) this.pending.shift(); // host silent for 2 s: stop growing
    this.unsent++;
  }

  /** Send queued inputs (called every frame). Recent commands are repeated to survive packet loss. */
  flush() {
    const t = now();
    if (this.unsent < 2 && t - this.lastSend < 0.05) return;
    if (!this.unsent) return;
    const n = Math.min(this.pending.length, this.unsent + 3);
    const list = [];
    for (let i = this.pending.length - n; i < this.pending.length; i++) {
      const c = this.pending[i];
      list.push([c.q, c.b, c.f, c.s, c.yaw, c.pitch, c.sel]);
    }
    this.send({ t: 'c', c: list, rt: Math.round(this.renderTime() * 1000) / 1000, pg: Math.round(this.ping) }, false);
    this.unsent = 0; this.lastSend = t;
  }

  _snapshot(m) {
    if (!this.world || m.n <= this.lastSnapN) return; // stale or out of order
    this.lastSnapN = m.n;
    const t = now();
    this.lastSnapAt = t;
    const off = m.tm - t;
    this.timeOff = this.timeOff === null || off > this.timeOff || Math.abs(off - this.timeOff) > 1 ? off : this.timeOff + (off - this.timeOff) * 0.02;

    const players = new Map();
    for (const p of m.p) players.set(p[0], p);
    this.snaps.push({ tm: m.tm, players, g: m.g });
    if (this.snaps.length > 60) this.snaps.shift();

    // --- reconcile the local player ---
    const y = m.y;
    if (!y) return;
    const ack = y[0];
    const st = this.state;
    const ox = st.x, oy = st.y, oz = st.z;
    const auth = unpackState(y[1], this._auth || (this._auth = makeState()));
    this.hp = y[2]; this.prot = y[3]; this.respawnIn = y[4];
    let i = 0;
    while (i < this.pending.length && this.pending[i].q <= ack) i++;
    if (i) this.pending.splice(0, i);
    const respawned = auth.sp !== this.spawnCount;
    copyState(st, auth);
    for (let k = 0; k < this.pending.length; k++) {
      if (k === this.pending.length - 1) copyState(this.prev, st);
      stepPlayer(st, this.pending[k], this.world, null);
    }
    if (!this.pending.length) copyState(this.prev, st);
    if (respawned) {
      this.spawnCount = auth.sp;
      this.errX = this.errY = this.errZ = 0;
      copyState(this.prev, st);
      this.emit('spawn', { yaw: y[5] });
    } else {
      // keep the camera where it was and bleed the correction off smoothly
      const ex = ox - st.x, ey = oy - st.y, ez = oz - st.z, e2 = ex * ex + ey * ey + ez * ez;
      if (e2 > 6.25) { this.errX = this.errY = this.errZ = 0; copyState(this.prev, st); }
      else if (e2 > 1e-10) { this.errX += ex; this.errY += ey; this.errZ += ez; this.mispredicts = (this.mispredicts || 0) + (e2 > 1e-4 ? 1 : 0); }
    }
  }

  /** Decay the visual correction offset; call once per frame. */
  decayError(dt) {
    const k = Math.exp(-dt * 12);
    this.errX *= k; this.errY *= k; this.errZ *= k;
  }

  /** Interpolate remote players and grenades for render time t. Results in this.remote / this.nades. */
  interpolate() {
    const t = this.renderTime(), snaps = this.snaps, remote = this.remote;
    if (!snaps.length) return;
    let a = snaps[0], b = snaps[0];
    if (t >= snaps[snaps.length - 1].tm) { a = snaps[snaps.length - 2] || snaps[snaps.length - 1]; b = snaps[snaps.length - 1]; }
    else for (let i = snaps.length - 2; i >= 0; i--) if (snaps[i].tm <= t) { a = snaps[i]; b = snaps[i + 1]; break; }
    const span = b.tm - a.tm;
    // allow a little extrapolation (max 100 ms) when snapshots are late
    const k = span > 0 ? Math.min(1 + 0.1 / span, Math.max(0, (t - a.tm) / span)) : 1;
    for (const r of remote.values()) r.seen = false;
    for (const [id, pb] of b.players) {
      if (id === this.id) continue;
      const pa = a.players.get(id) || pb;
      let r = remote.get(id);
      if (!r) { r = { id, x: pb[1], y: pb[2], z: pb[3], yaw: 0, pitch: 0, flags: 0, hp: 100, w: 'kr4', speed: 0, fresh: true }; remote.set(id, r); }
      const teleport = Math.abs(pb[1] - pa[1]) + Math.abs(pb[2] - pa[2]) + Math.abs(pb[3] - pa[3]) > 6 || !(pa[6] & 1);
      const kk = teleport ? 1 : k;
      const nx = pa[1] + (pb[1] - pa[1]) * kk, ny = pa[2] + (pb[2] - pa[2]) * kk, nz = pa[3] + (pb[3] - pa[3]) * kk;
      r.speed = span > 0 && !teleport ? Math.hypot(pb[1] - pa[1], pb[3] - pa[3]) / span : 0;
      r.x = nx; r.y = ny; r.z = nz;
      r.yaw = lerpAngle(pa[4], pb[4], Math.min(1, kk)); r.pitch = pa[5] + (pb[5] - pa[5]) * Math.min(1, kk);
      r.flags = pb[6]; r.hp = pb[7]; r.w = pb[8]; r.seen = true;
    }
    for (const [id, r] of remote) if (!r.seen) remote.delete(id);
    const nades = this.nades; nades.length = 0;
    for (const g of b.g) {
      let ga = null;
      for (const o of a.g) if (o[0] === g[0]) { ga = o; break; }
      if (!ga) ga = g;
      nades.push({ id: g[0], x: ga[1] + (g[1] - ga[1]) * k, y: ga[2] + (g[2] - ga[2]) * k, z: ga[3] + (g[3] - ga[3]) * k });
    }
  }

  /** Match clock in seconds (counts down locally between score messages). */
  clock() {
    if (this.matchPhase === 'live') return Math.max(0, this.timeLeft - (now() - this._clockAt));
    if (this.matchPhase === 'countdown') return Math.max(0, this.countdown - (now() - this._clockAt));
    return 0;
  }

  // ------------------------------------------------------------------ messages
  _recv(m) {
    this._lastRecv = now();
    switch (m.t) {
      case 's': this._snapshot(m); break;
      case 'welcome': this.id = m.id; this.code = m.code; this.emit('welcome'); break;
      case 'no': this.emit('refused', m.reason); break;
      case 'bye': this.emit('close', m.reason); break;
      case 'lobby': {
        this.settings = m.settings; this.phase = m.phase; if (m.code) this.code = m.code;
        this.roster.clear();
        for (const p of m.pl) this.roster.set(p[0], { id: p[0], name: p[1], team: p[2], bot: !!p[3], isHost: !!p[4] });
        this.emit('lobby');
        break;
      }
      case 'start': {
        this._resetMatch();
        this.settings = m.settings;
        this.mapDef = getMap(m.map);
        this.world = new World(this.mapDef);
        this.matchPhase = m.ph; this.countdown = m.cd; this.timeLeft = m.tl; this._clockAt = now();
        this.phase = 'match';
        this.emit('start', m);
        break;
      }
      case 'tolobby': this.phase = 'lobby'; this.emit('tolobby'); break;
      case 'sc': {
        this.teamScore = m.teams;
        this.scores.clear();
        for (const r of m.pl) this.scores.set(r[0], { k: r[1], d: r[2], a: r[3], score: r[4], tier: r[5], ping: r[6], hs: r[7] });
        this.matchPhase = m.ph; this.timeLeft = m.tl; this.countdown = m.cd; this._clockAt = now();
        this.emit('scores');
        break;
      }
      case 'ph': this.matchPhase = m.ph; this.timeLeft = m.tm; this._clockAt = now(); this.emit('phase', m); break;
      case 'end': this.matchPhase = 'ended'; this.result = m; this.emit('end', m); break;
      case 'po': { const rtt = performance.now() - m.c; this.ping = this.ping ? this.ping * 0.7 + rtt * 0.3 : rtt; break; }
      case 'k': this.emit('kill', m); break;
      case 'h': this.emit('hit', m); break;
      case 'd': this.emit('damage', m); break;
      case 'x': this.emit('xp', m); break;
      case 'f': this.emit('shot', m); break;
      case 'm': this.emit('melee', m); break;
      case 'b': this.emit('boom', m); break;
      case 'nb': this.emit('bounce', m); break;
      default: break;
    }
  }
}

export { TICK, cloneState };
