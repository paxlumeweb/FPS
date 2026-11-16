// Host-authoritative match simulation. No DOM / Three.js: it could run unchanged inside a
// Cloudflare Durable Object later. The host feeds it player commands; it decides movement results,
// hits, damage, kills, grenades, scoring, respawns and XP awards, and emits messages through `out`.

import { World } from './world.js';
import { TICK, PM, makeState, makeWeapon, stepPlayer, packState, statsOf, heightOf } from './player.js';
import { weaponStats, damageAt, shotDirs, GUN_GAME_LADDER, MELEE, FRAG, sanitizeLoadout, defaultLoadout, WEAPONS } from './weapons.js';
import { MODES, RESPAWN_TIME, SPAWN_PROTECTION, COUNTDOWN } from './modes.js';
import { XP } from './progression.js';
import { throwGrenade, stepGrenade } from './grenade.js';
import { BotBrain } from './bots.js';

const SNAP_EVERY = 2;        // ticks between snapshots (30 Hz)
const HIST_TIME = 0.6;       // seconds of position history kept for lag compensation
const MAX_REWIND = 0.35;     // never rewind further than this
const MAX_QUEUE = 40;
const REGEN_DELAY = 5, REGEN_RATE = 30;
const r3 = (v) => Math.round(v * 1000) / 1000;

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, t0, t1;
  t0 = (x0 - ox) / dx; t1 = (x1 - ox) / dx; if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
  if (t0 > tmin) tmin = t0; if (t1 < tmax) tmax = t1;
  t0 = (y0 - oy) / dy; t1 = (y1 - oy) / dy; if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
  if (t0 > tmin) tmin = t0; if (t1 < tmax) tmax = t1;
  t0 = (z0 - oz) / dz; t1 = (z1 - oz) / dz; if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
  if (t0 > tmin) tmin = t0; if (t1 < tmax) tmax = t1;
  if (tmin > tmax || tmax < 0) return Infinity;
  return tmin < 0 ? 0 : tmin;
}

export class Sim {
  /**
   * @param opts {mapDef, settings:{mode,scoreLimit,timeLimit}, out:{send(id,msg,reliable), broadcast(msg,reliable,exceptId)}}
   */
  constructor({ mapDef, settings, out }) {
    this.mapDef = mapDef;
    this.world = new World(mapDef);
    this.settings = settings;
    this.mode = MODES[settings.mode];
    this.out = out;
    this.players = new Map();
    this.grenades = [];
    this.nextNade = 1;
    this.time = 0; this.tickN = 0;
    this.phase = 'countdown'; this.phaseEnd = COUNTDOWN;
    this.matchStart = COUNTDOWN;
    this.teamScore = [0, 0];
    this.firstBlood = false;
    this.scoreDirty = true; this.lastScoreSend = -9;
    this.result = null;
    this._ev = [];
    this._pos = [0, 0, 0];
  }

  // ------------------------------------------------------------------ players
  addPlayer(id, { name, team = 0, loadout, bot = false }) {
    const P = {
      id, name, team, bot, loadout: sanitizeLoadout(loadout), s: makeState(), cmds: [], lastSeq: 0, lastQueued: 0,
      renderT: 0, ping: 0, hp: 0, alive: false, respawnAt: this.time, prot: 0, lastDmgT: -99, damagers: new Map(),
      hist: [], streak: 0, lastKiller: -1, tier: 0, spawnYaw: 0, joinTime: this.time, brain: null, nextSel: -1,
      stats: { k: 0, d: 0, a: 0, hs: 0, score: 0 },
    };
    P.s.alive = 0;
    if (bot) { P.brain = new BotBrain(this, P); if (!loadout) P.loadout = P.brain.pickLoadout(); }
    this.players.set(id, P);
    this._spawn(P);
    this.scoreDirty = true;
    return P;
  }

  removePlayer(id) {
    const P = this.players.get(id);
    if (!P) return;
    this.players.delete(id);
    this.scoreDirty = true;
  }

  setLoadout(id, lo) { const P = this.players.get(id); if (P) P.loadout = sanitizeLoadout(lo); }

  /** Queue commands from a client. list = [[q,b,f,s,yaw,pitch,sel], ...] oldest first. */
  onCmds(id, list, renderT, ping) {
    const P = this.players.get(id);
    if (!P || !Array.isArray(list)) return;
    if (list.length > 64) list = list.slice(-64); // a real client sends a handful per packet
    if (Number.isFinite(renderT)) P.renderT = renderT;
    if (Number.isFinite(ping)) P.ping = Math.max(0, Math.min(999, ping | 0));
    for (const c of list) {
      if (!Array.isArray(c)) continue;
      const q = c[0] | 0;
      if (q <= P.lastQueued) continue; // duplicate (clients resend recent commands for loss protection)
      const yaw = +c[4], pitch = +c[5];
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) continue;
      P.lastQueued = q;
      P.cmds.push({
        q, b: c[1] & 0xff, f: Math.max(-1, Math.min(1, c[2] | 0)), s: Math.max(-1, Math.min(1, c[3] | 0)),
        yaw, pitch, sel: c[6] === 0 || c[6] === 1 ? c[6] : -1,
      });
    }
    // A client can never run faster than real time: excess input is dropped (they get corrected).
    if (P.cmds.length > MAX_QUEUE) P.cmds.splice(0, P.cmds.length - MAX_QUEUE);
  }

  // ------------------------------------------------------------------ main tick
  tick() {
    this.time += TICK; this.tickN++;
    const world = this.world;

    if (this.phase === 'countdown' && this.time >= this.phaseEnd) {
      this.phase = 'live'; this.matchStart = this.time;
      for (const P of this.players.values()) { P.s.frozen = 0; P.prot = SPAWN_PROTECTION; }
      this.out.broadcast({ t: 'ph', ph: 'live', tm: this.settings.timeLimit * 60 }, true);
    }

    for (const P of this.players.values()) {
      if (P.brain) P.cmds.push(P.brain.think());
      // consume input: one command per tick, a second one when the queue is backing up
      let n = P.cmds.length > 3 ? 2 : 1;
      while (n-- > 0 && P.cmds.length) {
        const cmd = P.cmds.shift();
        const ev = this._ev; ev.length = 0;
        stepPlayer(P.s, cmd, world, ev);
        P.lastSeq = cmd.q;
        for (let i = 0; i < ev.length; i++) this._handleEvent(P, ev[i]);
      }
      if (P.alive) {
        const h = P.hist;
        h.push({ t: this.time, x: P.s.x, y: P.s.y, z: P.s.z, c: P.s.crouch });
        while (h.length && h[0].t < this.time - HIST_TIME) h.shift();
        if (P.s.y < -15) this._damage(P, null, 9999, { w: 'fall' });
        if (P.prot > 0) P.prot = Math.max(0, P.prot - TICK);
        if (P.hp < PM.MAX_HP && this.time - P.lastDmgT > REGEN_DELAY) P.hp = Math.min(PM.MAX_HP, P.hp + REGEN_RATE * TICK);
      } else if (this.phase !== 'ended' && this.time >= P.respawnAt) {
        this._spawn(P);
      }
    }

    this._stepGrenades();

    if (this.phase === 'live') {
      const left = this.settings.timeLimit * 60 - (this.time - this.matchStart);
      if (left <= 0) this._endMatch('time');
    }

    if (this.tickN % SNAP_EVERY === 0) this._sendSnapshots();
    if (this.scoreDirty || this.time - this.lastScoreSend > 1) this._sendScores();
  }

  timeLeft() {
    if (this.phase === 'countdown') return this.settings.timeLimit * 60;
    if (this.phase === 'ended') return 0;
    return Math.max(0, this.settings.timeLimit * 60 - (this.time - this.matchStart));
  }

  // ------------------------------------------------------------------ spawning
  _spawn(P) {
    const sp = this._pickSpawn(P);
    const old = P.s;
    const s = makeState();
    s.x = sp.x; s.y = sp.y + 0.02; s.z = sp.z; s.yaw = sp.yaw; s.pitch = 0;
    s.sp = (old.sp | 0) + 1; s.pb = old.pb;
    s.frozen = this.phase === 'countdown' || this.phase === 'ended' ? 1 : 0;
    if (this.mode.id === 'gungame') {
      this._gunGameWeapons(P, s);
    } else {
      const lo = P.loadout;
      s.w = [makeWeapon(lo.primary, lo.primaryAtt), makeWeapon(lo.secondary, lo.secondaryAtt)];
      s.nades = FRAG.count;
    }
    P.s = s; P.hp = PM.MAX_HP; P.alive = true; P.prot = SPAWN_PROTECTION; P.spawnYaw = sp.yaw;
    P.damagers.clear(); P.hist.length = 0; P.lastDmgT = -99;
    if (P.brain) P.brain.onSpawn();
  }

  _gunGameWeapons(P, s) {
    const id = GUN_GAME_LADDER[Math.min(P.tier, GUN_GAME_LADDER.length - 1)];
    const w = makeWeapon(id, []);
    if (id !== 'knife') w.res = weaponStats(id, []).mag * 8;
    s.w = [w]; s.slot = 0; s.nades = 0; s.reload = 0; s.ads = 0; s.fq = 0; s.cook = -1;
    s.switchT = 0.35; s.fireCd = 0;
  }

  _pickSpawn(P) {
    const sp = this.mapDef.spawns;
    let list = this.mode.teams ? (P.team === 0 ? sp.a : sp.b) : sp.ffa;
    if (!list || !list.length) list = sp.ffa.length ? sp.ffa : sp.a;
    if (P.bot) { const low = list.filter((c) => c.y < 1); if (low.length) list = low; } // bots navigate on the ground floor
    const scored = [];
    for (const c of list) {
      let nearest = 1e9, blocked = false;
      for (const o of this.players.values()) {
        if (o === P || !o.alive) continue;
        const d = Math.hypot(o.s.x - c.x, o.s.y - c.y, o.s.z - c.z);
        if (d < 1.2) blocked = true;
        if (!this.mode.teams || o.team !== P.team) nearest = Math.min(nearest, d);
      }
      if (!blocked) scored.push({ c, score: Math.min(nearest, 60) + Math.random() * 12 });
    }
    if (!scored.length) return list[(Math.random() * list.length) | 0];
    scored.sort((a, b) => b.score - a.score);
    return scored[0].c;
  }

  // ------------------------------------------------------------------ events from the player step
  _handleEvent(P, e) {
    if (this.phase !== 'live' && e.t !== 'jump' && e.t !== 'land') {
      if (this.phase === 'ended') return;
    }
    switch (e.t) {
      case 'fire': this._fire(P, e); break;
      case 'melee': this._melee(P); break;
      case 'nade': this._throw(P, e.fuse); break;
      default: break;
    }
  }

  _rewindTime(P) {
    if (P.bot) return this.time;
    return Math.max(this.time - MAX_REWIND, Math.min(this.time, P.renderT || this.time));
  }

  /** Position of player T at time t (interpolated from history) into this._pos; returns crouch flag. */
  _posAt(T, t) {
    const h = T.hist, out = this._pos;
    if (!h.length || t >= h[h.length - 1].t) { out[0] = T.s.x; out[1] = T.s.y; out[2] = T.s.z; return T.s.crouch; }
    for (let i = h.length - 2; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i], b = h[i + 1], k = (t - a.t) / (b.t - a.t || 1);
        out[0] = a.x + (b.x - a.x) * k; out[1] = a.y + (b.y - a.y) * k; out[2] = a.z + (b.z - a.z) * k;
        return k < 0.5 ? a.c : b.c;
      }
    }
    out[0] = h[0].x; out[1] = h[0].y; out[2] = h[0].z;
    return h[0].c;
  }

  _isEnemy(A, B) { return A !== B && (!this.mode.teams || A.team !== B.team); }

  _fire(P, e) {
    const s = P.s, W = s.w[s.slot], st = statsOf(W), world = this.world;
    P.prot = 0;
    const ox = s.x, oy = s.y + s.eye, oz = s.z;
    const dirs = shotDirs(s.yaw, s.pitch, e.spread, st.pellets, st.pelletSpread, e.q);
    const tR = this._rewindTime(P);
    const hits = new Map(); // victim -> {dmg, head}
    let maxDist = 0;
    for (let i = 0; i < dirs.length; i += 3) {
      const dx = dirs[i] || 1e-9, dy = dirs[i + 1] || 1e-9, dz = dirs[i + 2] || 1e-9;
      const wallT = world.raycast(ox, oy, oz, dx, dy, dz, 400);
      let best = wallT, bestT = null, zone = 0;
      for (const T of this.players.values()) {
        if (!T.alive || !this._isEnemy(P, T)) continue;
        const c = this._posAt(T, tR), px = this._pos[0], py = this._pos[1], pz = this._pos[2];
        const hT = c ? PM.H_CROUCH : PM.H_STAND;
        const legTop = c ? 0.45 : 0.8, torsoTop = hT - 0.3;
        // quick reject on the whole body
        if (rayBox(ox, oy, oz, dx, dy, dz, px - 0.36, py, pz - 0.36, px + 0.36, py + hT + 0.04, pz + 0.36) >= best) continue;
        let t = rayBox(ox, oy, oz, dx, dy, dz, px - 0.18, py + torsoTop, pz - 0.18, px + 0.18, py + hT + 0.04, pz + 0.18);
        if (t < best) { best = t; bestT = T; zone = 2; }
        t = rayBox(ox, oy, oz, dx, dy, dz, px - 0.34, py + legTop, pz - 0.34, px + 0.34, py + torsoTop, pz + 0.34);
        if (t < best) { best = t; bestT = T; zone = 1; }
        t = rayBox(ox, oy, oz, dx, dy, dz, px - 0.28, py, pz - 0.28, px + 0.28, py + legTop, pz + 0.28);
        if (t < best) { best = t; bestT = T; zone = 0; }
      }
      if (bestT) {
        const mul = zone === 2 ? st.headMul : zone === 0 ? st.legMul : 1;
        const d = damageAt(st, best) * mul;
        const h = hits.get(bestT) || { dmg: 0, head: false };
        h.dmg += d; if (zone === 2) h.head = true;
        hits.set(bestT, h);
        if (best > maxDist) maxDist = best;
      }
    }
    this.out.broadcast({ t: 'f', i: P.id, w: W.id, o: [r3(ox), r3(oy), r3(oz)], y: r3(s.yaw), p: r3(s.pitch), s: r3(e.spread), q: e.q, n: st.pellets, ps: st.pelletSpread, sup: st.suppressed }, false, P.id);
    for (const [T, h] of hits) this._damage(T, P, h.dmg, { w: W.id, head: h.head, dist: maxDist });
  }

  _melee(P) {
    const s = P.s, world = this.world;
    P.prot = 0;
    this.out.broadcast({ t: 'm', i: P.id }, false, P.id);
    const ox = s.x, oy = s.y + s.eye, oz = s.z;
    const cp = Math.cos(s.pitch);
    const fx = -Math.sin(s.yaw) * cp, fy = Math.sin(s.pitch), fz = -Math.cos(s.yaw) * cp;
    const tR = this._rewindTime(P);
    let best = null, bestD = MELEE.range;
    for (const T of this.players.values()) {
      if (!T.alive || !this._isEnemy(P, T)) continue;
      const c = this._posAt(T, tR);
      const tx = this._pos[0], ty = this._pos[1] + (c ? 0.7 : 1.1), tz = this._pos[2];
      const dx = tx - ox, dy = ty - oy, dz = tz - oz, d = Math.hypot(dx, dy, dz);
      if (d > bestD) continue;
      if (d > 0.6 && (dx * fx + dy * fy + dz * fz) / d < 0.55) continue;
      if (!world.los(ox, oy, oz, tx, ty, tz)) continue;
      best = T; bestD = d;
    }
    if (!best) return;
    // back stab: attacker is behind the victim (both facing roughly the same way)
    const back = Math.sin(s.yaw) * Math.sin(best.s.yaw) + Math.cos(s.yaw) * Math.cos(best.s.yaw) > MELEE.backDot;
    this._damage(best, P, back ? 9999 : MELEE.dmg, { w: 'knife', melee: true, back });
  }

  _throw(P, fuse) {
    const s = P.s;
    P.prot = 0;
    const g = throwGrenade(s.x, s.y + s.eye, s.z, s.yaw, s.pitch, s.vx, s.vy, s.vz);
    // never start a grenade inside geometry
    if (!this.world.los(s.x, s.y + s.eye, s.z, g.x, g.y, g.z)) { g.x = s.x; g.y = s.y + s.eye - 0.1; g.z = s.z; }
    this.grenades.push({ id: this.nextNade++, owner: P.id, team: P.team, g, fuse });
  }

  _stepGrenades() {
    const list = this.grenades;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      n.fuse -= TICK;
      if (n.fuse > 0) {
        if (stepGrenade(this.world, n.g, TICK)) this.out.broadcast({ t: 'nb', x: r3(n.g.x), y: r3(n.g.y), z: r3(n.g.z) }, false);
        if (n.g.y < -20) list.splice(i, 1);
        continue;
      }
      list.splice(i, 1);
      this._explode(n);
    }
  }

  _explode(n) {
    const g = n.g, world = this.world;
    this.out.broadcast({ t: 'b', x: r3(g.x), y: r3(g.y), z: r3(g.z) }, true);
    if (this.phase !== 'live') return;
    const owner = this.players.get(n.owner) || null;
    const ex = g.x, ey = g.y + 0.15, ez = g.z;
    for (const T of this.players.values()) {
      if (!T.alive) continue;
      const self = T.id === n.owner;
      if (!self && this.mode.teams && T.team === n.team) continue;
      const h = heightOf(T.s);
      const cx = T.s.x, cy = T.s.y + h * 0.55, cz = T.s.z;
      const d = Math.hypot(cx - ex, cy - ey, cz - ez);
      if (d > FRAG.radius) continue;
      if (!world.los(ex, ey, ez, cx, cy, cz) && !world.los(ex, ey, ez, cx, T.s.y + h - 0.1, cz) && !world.los(ex, ey, ez, cx, T.s.y + 0.2, cz)) continue;
      const k = d / FRAG.radius;
      this._damage(T, owner, FRAG.maxDmg + (FRAG.minDmg - FRAG.maxDmg) * k, { w: 'frag', x: ex, z: ez, self });
    }
  }

  // ------------------------------------------------------------------ damage / kills
  _damage(T, A, dmg, info) {
    if (!T.alive || this.phase !== 'live') return;
    if (info.w !== 'fall' && T.prot > 0) return;
    dmg = Math.max(1, Math.round(dmg));
    T.hp -= dmg; T.lastDmgT = this.time;
    const killed = T.hp <= 0;
    if (A && A !== T) {
      const rec = T.damagers.get(A.id) || { dmg: 0, t: 0 };
      rec.dmg += dmg; rec.t = this.time;
      T.damagers.set(A.id, rec);
      if (!A.bot) this.out.send(A.id, { t: 'h', d: dmg, hd: info.head ? 1 : 0, k: killed ? 1 : 0, v: T.id }, true);
    }
    if (!T.bot) {
      const sx = info.x !== undefined ? info.x : A ? A.s.x : T.s.x, sz = info.z !== undefined ? info.z : A ? A.s.z : T.s.z;
      this.out.send(T.id, { t: 'd', x: r3(sx), z: r3(sz), d: dmg }, true);
    }
    if (T.brain && A) T.brain.onDamaged(A);
    if (killed) this._kill(T, A && A !== T ? A : null, info);
  }

  _xp(P, amount, reason, weaponId, weaponXp) {
    if (!this.mode.progression || P.bot || amount + (weaponXp || 0) <= 0) return;
    const m = { t: 'x', a: amount, r: reason };
    if (weaponId && weaponXp && WEAPONS[weaponId] && WEAPONS[weaponId].cls !== 'melee') { m.w = weaponId; m.wx = weaponXp; }
    this.out.send(P.id, m, true);
  }

  _kill(T, A, info) {
    const s = T.s;
    // a cooked grenade is dropped on death
    if (s.cook >= 0) {
      this.grenades.push({ id: this.nextNade++, owner: T.id, team: T.team, fuse: Math.max(0.05, FRAG.fuse - s.cook),
        g: { x: s.x, y: s.y + 1, z: s.z, vx: 0, vy: 0, vz: 0, rest: 0 } });
    }
    T.alive = false; T.hp = 0; s.alive = 0; s.cook = -1; s.vx = s.vz = 0;
    T.respawnAt = this.time + RESPAWN_TIME;
    T.stats.d++; T.streak = 0;
    const gg = this.mode.id === 'gungame';
    const weapon = info.w;

    if (A) {
      A.stats.k++; A.streak++;
      if (info.head) A.stats.hs++;
      T.lastKiller = A.id;
      if (this.mode.teams) { this.teamScore[A.team]++; A.stats.score += 100; }
      else if (!gg) A.stats.score = A.stats.k;

      if (gg) {
        const last = GUN_GAME_LADDER.length - 1;
        if (info.melee) {
          if (A.tier >= last) { A.tier = GUN_GAME_LADDER.length; }      // final knife kill: win
          else { A.tier++; if (T.tier > 0) T.tier--; }                 // humiliation: victim is set back
        } else if (A.tier < last) A.tier++;
        A.stats.score = A.tier; T.stats.score = T.tier;
        if (A.alive && A.tier <= last) this._gunGameWeapons(A, A.s);
      } else {
        // XP awards (TDM / FFA only; _xp() ignores other modes)
        const wid = weapon;
        this._xp(A, XP.kill, 'Kill', wid, XP.wKill);
        if (info.head) this._xp(A, XP.headshot, 'Headshot', wid, XP.wHeadshot);
        if (info.dist > 40 && !info.melee && weapon !== 'frag') this._xp(A, XP.longshot, 'Longshot', wid, XP.wLongshot);
        if (info.back) this._xp(A, XP.backstab, 'Back Stab');
        else if (info.melee) this._xp(A, XP.melee, 'Melee Kill');
        if (!this.firstBlood) this._xp(A, XP.firstBlood, 'First Blood');
        if (A.lastKiller === T.id) { this._xp(A, XP.revenge, 'Revenge'); A.lastKiller = -1; }
        if (A.streak >= 3 && A.streak % 2 === 1) this._xp(A, XP.streak * ((A.streak - 1) / 2), A.streak + ' Kill Streak');
        for (const [aid, rec] of T.damagers) {
          const H = this.players.get(aid);
          if (!H || H === A || rec.dmg < 20 || this.time - rec.t > 10) continue;
          H.stats.a++;
          if (this.mode.teams) H.stats.score += 40;
          const hw = H.s.w[H.s.slot];
          this._xp(H, XP.assist, 'Assist', hw ? hw.id : null, XP.wAssist);
        }
      }
      this.firstBlood = true;
    }
    T.damagers.clear();
    this.out.broadcast({ t: 'k', k: A ? A.id : -1, v: T.id, w: weapon, h: info.head ? 1 : 0, b: info.back ? 1 : 0 }, true);
    this.scoreDirty = true;
    if (T.brain) T.brain.onDeath();
    this._checkScoreLimit();
  }

  _checkScoreLimit() {
    if (this.phase !== 'live') return;
    const lim = this.settings.scoreLimit;
    if (this.mode.id === 'tdm') { if (this.teamScore[0] >= lim || this.teamScore[1] >= lim) this._endMatch('score'); }
    else if (this.mode.id === 'ffa') { for (const P of this.players.values()) if (P.stats.k >= lim) { this._endMatch('score'); break; } }
    else { for (const P of this.players.values()) if (P.tier >= GUN_GAME_LADDER.length) { this._endMatch('score'); break; } }
  }

  _ranking() {
    return [...this.players.values()].sort((a, b) => (b.stats.score - a.stats.score) || (b.stats.k - a.stats.k) || (a.stats.d - b.stats.d));
  }

  _endMatch(reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const rank = this._ranking();
    let winTeam = -1, winPlayer = -1;
    if (this.mode.teams) winTeam = this.teamScore[0] === this.teamScore[1] ? -1 : this.teamScore[0] > this.teamScore[1] ? 0 : 1;
    else if (rank.length && (rank.length === 1 || rank[0].stats.score > rank[1].stats.score || rank[0].stats.k > rank[1].stats.k)) winPlayer = rank[0].id;
    const dur = Math.max(1, this.time - this.matchStart);
    for (const P of this.players.values()) {
      P.s.frozen = 1;
      if (!this.mode.progression || P.bot) continue;
      const part = Math.max(0, Math.min(1, (this.time - Math.max(P.joinTime, this.matchStart)) / dur));
      // completion bonus scales with how much of the match you played (and how long the match was)
      const lenK = Math.min(1, dur / 300);
      this._xp(P, Math.round(XP.matchComplete * part * lenK), 'Match Complete');
      const won = this.mode.teams ? P.team === winTeam : P.id === winPlayer;
      if (won) this._xp(P, Math.round(XP.win * part * lenK), 'Victory');
      if (!this.mode.teams && rank.indexOf(P) < 3 && rank.length >= 4) this._xp(P, Math.round(XP.topThree * lenK), 'Top Three');
    }
    this.result = { reason, winTeam, winPlayer, teams: this.teamScore.slice(), pl: this._scoreRows() };
    this._sendScores();
    this.out.broadcast({ t: 'end', reason, winTeam, winPlayer, teams: this.teamScore.slice(), pl: this.result.pl }, true);
  }

  // ------------------------------------------------------------------ outgoing state
  _scoreRows() {
    const rows = [];
    for (const P of this.players.values()) rows.push([P.id, P.stats.k, P.stats.d, P.stats.a, P.stats.score, P.tier, P.ping, P.stats.hs]);
    return rows;
  }

  _sendScores() {
    this.scoreDirty = false; this.lastScoreSend = this.time;
    this.out.broadcast({ t: 'sc', teams: this.teamScore, pl: this._scoreRows(), tl: r3(this.timeLeft()), ph: this.phase, cd: this.phase === 'countdown' ? r3(this.phaseEnd - this.time) : 0 }, true);
  }

  _sendSnapshots() {
    const pl = [];
    for (const P of this.players.values()) {
      const s = P.s, W = s.w[s.slot];
      const flags = (P.alive ? 1 : 0) | (s.crouch ? 2 : 0) | (s.slide > 0 ? 4 : 0) | (s.sprint ? 8 : 0) | (s.ads > 0.5 ? 16 : 0) |
        (s.ground ? 32 : 0) | (P.prot > 0 ? 64 : 0) | (s.reload > 0 ? 128 : 0) | (s.cook >= 0 ? 256 : 0) | (s.meleeT > 0.3 ? 512 : 0);
      pl.push([P.id, r3(s.x), r3(s.y), r3(s.z), r3(s.yaw), r3(s.pitch), flags, Math.ceil(P.hp), W ? W.id : 'knife']);
    }
    const gr = this.grenades.map((n) => [n.id, r3(n.g.x), r3(n.g.y), r3(n.g.z)]);
    const base = { t: 's', n: this.tickN, tm: this.time, p: pl, g: gr, y: null };
    for (const P of this.players.values()) {
      if (P.bot) continue;
      base.y = [P.lastSeq, packState(P.s), Math.ceil(P.hp), r3(P.prot), P.alive ? 0 : r3(Math.max(0, P.respawnAt - this.time)), r3(P.spawnYaw)];
      this.out.send(P.id, base, false);
    }
  }

  /** Everything a (late-)joining client needs to enter the running match. */
  startInfo() {
    return { map: this.mapDef.id, settings: this.settings, ph: this.phase, tm: this.time, cd: Math.max(0, this.phaseEnd - this.time), tl: this.timeLeft() };
  }
}

export { defaultLoadout };
