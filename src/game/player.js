// Deterministic per-tick player step: movement + weapon handling.
// The exact same function runs on the client (prediction / replay) and on the host (authority),
// so given the same state and the same command both sides compute identical results.

import { weaponStats, FRAG, MELEE } from './weapons.js';

export const TICK = 1 / 60;
const READY = 1e-9;
export const BTN = { JUMP: 1, SPRINT: 2, CROUCH: 4, FIRE: 8, ADS: 16, RELOAD: 32, MELEE: 64, NADE: 128 };

export const PM = {
  H_STAND: 1.8, H_CROUCH: 1.15,
  EYE_STAND: 1.62, EYE_CROUCH: 1.0, EYE_SLIDE: 0.78,
  WALK: 5.0, SPRINT: 7.4, CROUCH: 2.6,
  ACCEL: 46, FRICTION: 38, AIR_ACCEL: 9,
  GRAVITY: 19, JUMP_V: 6.4, MAX_FALL: 28,
  SLIDE_TIME: 0.8, SLIDE_BOOST: 1.9, SLIDE_FRICTION: 5.2, SLIDE_MIN_SPEED: 5.4, SLIDE_END_SPEED: 3.2, SLIDE_CD: 1.1,
  SWITCH_TIME: 0.42, EYE_RATE: 4.6, MAX_HP: 100,
};

export function makeWeapon(id, att = []) {
  const st = weaponStats(id, att);
  return { id, att: att.slice(), ammo: st.mag, res: st.reserve };
}

export function makeState() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    ground: 1, crouch: 0, slide: 0, slideCd: 0, sprint: 0, eye: PM.EYE_STAND,
    slot: 0, w: [makeWeapon('kr4'), makeWeapon('p9')],
    fireCd: 0, fq: 0, reload: 0, switchT: 0, sprintLock: 0, ads: 0, meleeT: 0,
    nades: FRAG.count, cook: -1, pb: 0,
    alive: 1, frozen: 0, sp: 0,
  };
}

export function cloneState(s) {
  const c = Object.assign({}, s);
  c.w = s.w.map((w) => ({ id: w.id, att: w.att, ammo: w.ammo, res: w.res }));
  return c;
}

export function copyState(dst, s) {
  const w = dst.w;
  Object.assign(dst, s);
  dst.w = w;
  if (w.length !== s.w.length) w.length = s.w.length;
  for (let i = 0; i < s.w.length; i++) {
    const a = s.w[i];
    if (!w[i]) w[i] = { id: a.id, att: a.att, ammo: a.ammo, res: a.res };
    else { w[i].id = a.id; w[i].att = a.att; w[i].ammo = a.ammo; w[i].res = a.res; }
  }
  return dst;
}

const KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'ground', 'crouch', 'slide', 'slideCd', 'sprint', 'eye',
  'slot', 'fireCd', 'fq', 'reload', 'switchT', 'sprintLock', 'ads', 'meleeT', 'nades', 'cook', 'pb', 'alive', 'frozen', 'sp'];

/** Compact array form for the network. Full float precision is kept so replays stay exact. */
export function packState(s) {
  const a = new Array(KEYS.length + 1);
  for (let i = 0; i < KEYS.length; i++) a[i] = s[KEYS[i]];
  a[KEYS.length] = s.w.map((w) => [w.id, w.att, w.ammo, w.res]);
  return a;
}

export function unpackState(a, s = makeState()) {
  for (let i = 0; i < KEYS.length; i++) s[KEYS[i]] = a[i];
  s.w = a[KEYS.length].map((w) => ({ id: w[0], att: w[1], ammo: w[2], res: w[3] }));
  return s;
}

export function statsOf(w) { return weaponStats(w.id, w.att); }
export function heightOf(s) { return s.crouch ? PM.H_CROUCH : PM.H_STAND; }

/** Current bullet spread cone in degrees (also drives the crosshair). */
export function currentSpread(s, st) {
  if (st.cls === 'melee') return 0;
  const speed = Math.hypot(s.vx, s.vz);
  let hip = st.hip * (1 + Math.min(1.2, speed / PM.WALK) * 0.55);
  if (!s.ground) hip = hip * 1.5 + 1.5;
  else if (s.slide > 0) hip *= 1.25;
  else if (s.crouch) hip *= 0.75;
  const ads = st.adsSpread * (1 + (s.ground ? Math.min(1, speed / PM.WALK) * 0.6 : 3));
  const k = s.ads * s.ads;
  return hip + (ads - hip) * k;
}

/**
 * Advance one player by one fixed tick.
 * cmd: {q: sequence, b: button bits, f: forward(-1..1), s: strafe(-1..1), yaw, pitch, sel: weapon slot or -1}
 * ev: optional array that receives gameplay events ({t:'fire'|'melee'|'nade'|...}); pass null when replaying.
 */
export function stepPlayer(s, cmd, world, ev) {
  const dt = TICK;
  s.yaw = cmd.yaw;
  s.pitch = cmd.pitch > 1.55 ? 1.55 : cmd.pitch < -1.55 ? -1.55 : cmd.pitch;
  if (!s.alive) { s.pb = cmd.b; return; }
  const frozen = s.frozen;
  const b = frozen ? 0 : cmd.b, pb = s.pb;
  let W = s.w[s.slot] || s.w[0];
  let st = statsOf(W);

  const wantCrouch = (b & BTN.CROUCH) !== 0;
  const wantFire = (b & BTN.FIRE) !== 0;
  const wantAds = (b & BTN.ADS) !== 0;
  const f = frozen ? 0 : cmd.f, sd = frozen ? 0 : cmd.s;
  let speed = Math.hypot(s.vx, s.vz);
  const wasGround = s.ground;

  // ---- slide ----
  if (wantCrouch && !(pb & BTN.CROUCH) && s.sprint && s.ground && s.slide <= 0 && s.slideCd <= 0 && speed > PM.SLIDE_MIN_SPEED) {
    s.slide = PM.SLIDE_TIME;
    const ns = Math.max(speed, PM.SPRINT * st.moveMul) + PM.SLIDE_BOOST;
    s.vx = (s.vx / speed) * ns; s.vz = (s.vz / speed) * ns;
    speed = ns;
    if (ev) ev.push({ t: 'slide' });
  }

  if (s.slide > 0) {
    s.slide -= dt;
    s.crouch = 1; s.sprint = 0;
    if (s.ground && speed > 0) {
      const ns = Math.max(0, speed - PM.SLIDE_FRICTION * dt);
      s.vx *= ns / speed; s.vz *= ns / speed; speed = ns;
    }
    if (s.slide <= 0 || !wantCrouch || speed < PM.SLIDE_END_SPEED) { s.slide = 0; s.slideCd = PM.SLIDE_CD; }
  } else {
    if (s.slideCd > 0) s.slideCd = Math.max(0, s.slideCd - dt);
    if (wantCrouch) s.crouch = 1;
    else if (s.crouch && world.isFree(s.x, s.y, s.z, PM.H_STAND)) s.crouch = 0;

    // No sprinting while aiming, firing, cooking a grenade or crouching.
    s.sprint = ((b & BTN.SPRINT) && f > 0 && !s.crouch && !wantAds && !wantFire && s.cook < 0 && s.meleeT <= 0) ? 1 : 0;

    let max = s.crouch ? PM.CROUCH : s.sprint ? PM.SPRINT : PM.WALK;
    max *= st.moveMul;
    if (s.ads > 0) max *= 1 - s.ads * (1 - st.adsMove);
    if (f < 0) max *= 0.85;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    let wx = -sy * f + cy * sd, wz = -cy * f - sy * sd;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx = (wx / wl) * max; wz = (wz / wl) * max; }
    if (s.ground) {
      const acc = (wl > 0 ? PM.ACCEL : PM.FRICTION) * dt;
      const dx = wx - s.vx, dz = wz - s.vz, dl = Math.hypot(dx, dz);
      if (dl <= acc) { s.vx = wx; s.vz = wz; } else { s.vx += (dx / dl) * acc; s.vz += (dz / dl) * acc; }
    } else if (wl > 0) {
      // air control: steer toward the wish direction without exceeding it
      const acc = PM.AIR_ACCEL * dt;
      const dx = wx - s.vx, dz = wz - s.vz, dl = Math.hypot(dx, dz);
      if (dl > 0) { const k = Math.min(1, acc / dl); s.vx += dx * k; s.vz += dz * k; }
    }
  }

  // ---- jump / gravity ----
  if ((b & BTN.JUMP) && !(pb & BTN.JUMP) && s.ground) {
    if (!s.crouch || s.slide > 0 || world.isFree(s.x, s.y, s.z, PM.H_STAND)) {
      if (s.slide > 0) { s.slide = 0; s.slideCd = PM.SLIDE_CD; }
      if (world.isFree(s.x, s.y, s.z, PM.H_STAND)) s.crouch = wantCrouch ? 1 : 0;
      s.vy = PM.JUMP_V; s.ground = 0;
      if (ev) ev.push({ t: 'jump' });
    }
  }
  s.vy -= PM.GRAVITY * dt;
  if (s.vy < -PM.MAX_FALL) s.vy = -PM.MAX_FALL;
  const fallV = s.vy;
  world.move(s, dt, heightOf(s));
  if (s.ground && !wasGround && ev && fallV < -3) ev.push({ t: 'land', v: -fallV });

  const eyeT = s.slide > 0 ? PM.EYE_SLIDE : s.crouch ? PM.EYE_CROUCH : PM.EYE_STAND;
  const de = eyeT - s.eye, me = PM.EYE_RATE * dt;
  s.eye += de > me ? me : de < -me ? -me : de;

  // ---- weapons ----
  // The cooldown keeps its sub-tick remainder (it may dip slightly below zero) so sustained fire
  // averages the exact rate instead of rounding every shot up to a whole tick.
  if (s.fireCd > READY) s.fireCd -= dt;
  if (s.switchT > 0) s.switchT = Math.max(0, s.switchT - dt);
  if (s.meleeT > 0) s.meleeT = Math.max(0, s.meleeT - dt);
  if (s.sprint) s.sprintLock = st.sprintOut; else if (s.sprintLock > 0) s.sprintLock = Math.max(0, s.sprintLock - dt);

  if (!frozen && cmd.sel >= 0 && cmd.sel < s.w.length && cmd.sel !== s.slot && s.cook < 0) {
    s.slot = cmd.sel; s.switchT = PM.SWITCH_TIME; s.reload = 0; s.ads = 0; s.fq = 0;
    W = s.w[s.slot]; st = statsOf(W);
    if (ev) ev.push({ t: 'switch' });
  }
  const isKnife = st.cls === 'melee';
  const firePressed = wantFire && !(pb & BTN.FIRE);

  // melee (quick melee key, or primary fire while holding the knife)
  if ((((b & BTN.MELEE) && !(pb & BTN.MELEE)) || (isKnife && firePressed)) && s.meleeT <= 0 && s.cook < 0 && s.switchT <= 0) {
    s.meleeT = MELEE.cooldown; s.reload = 0;
    if (ev) ev.push({ t: 'melee' });
  }

  // frag grenade: hold to cook, release to throw
  if (s.cook >= 0) {
    s.cook += dt;
    if (!(b & BTN.NADE) || s.cook >= FRAG.fuse) {
      if (ev) ev.push({ t: 'nade', fuse: Math.max(0, FRAG.fuse - s.cook) });
      s.nades--; s.cook = -1; s.switchT = Math.max(s.switchT, 0.3);
    }
  } else if ((b & BTN.NADE) && !(pb & BTN.NADE) && s.nades > 0 && s.meleeT <= 0 && s.switchT <= 0) {
    s.cook = 0; s.reload = 0;
    if (ev) ev.push({ t: 'cook' });
  }

  const busy = s.switchT > 0 || s.meleeT > 0 || s.cook >= 0;

  if (s.reload > 0) {
    s.reload -= dt;
    if (s.reload <= 0) {
      const n = Math.min(st.mag - W.ammo, W.res);
      W.ammo += n; W.res -= n; s.reload = 0;
    }
  } else if (!busy && !isKnife && W.ammo < st.mag && W.res > 0 &&
             (((b & BTN.RELOAD) && !(pb & BTN.RELOAD)) || (W.ammo === 0 && s.fireCd <= READY))) {
    s.reload = st.reload; s.fq = 0;
    if (ev) ev.push({ t: 'reload' });
  }

  const adsWant = wantAds && !busy && s.reload <= 0 && !s.sprint && !isKnife;
  s.ads += adsWant ? dt / st.adsTime : -dt / (st.adsTime * 0.8);
  if (s.ads > 1) s.ads = 1; else if (s.ads < 0) s.ads = 0;

  if (!isKnife) {
    // small input buffer so fast semi-auto clicks are not swallowed
    if (firePressed && !st.auto && s.fireCd > READY && s.fireCd < 0.12) s.fq = 1;
    if (!busy && s.reload <= 0 && s.fireCd <= READY && s.sprintLock <= 0) {
      const trigger = st.auto ? wantFire : (firePressed || s.fq);
      if (trigger) {
        s.fq = 0;
        if (W.ammo > 0) {
          W.ammo--;
          s.fireCd = Math.max(s.fireCd, -dt) + st.interval;
          if (ev) ev.push({ t: 'fire', q: cmd.q, spread: currentSpread(s, st) });
        } else if (firePressed && ev) ev.push({ t: 'dry' });
      }
    }
  }
  s.pb = cmd.b;
}

/** World-space position a shot / throw originates from. */
export function eyePos(s, out) {
  out[0] = s.x; out[1] = s.y + s.eye; out[2] = s.z;
  return out;
}

export function forwardOf(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * cp; out[1] = Math.sin(pitch); out[2] = -Math.cos(yaw) * cp;
  return out;
}
