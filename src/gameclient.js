// GameClient: everything that happens on a player's screen during a match. It turns input into
// commands for the ClientSession (which predicts and talks to the host), and turns game state and
// events into camera motion, view model animation, effects, sound and HUD updates.

import * as THREE from 'three';
import { TICK, BTN, PM, statsOf, currentSpread } from './game/player.js';
import { WEAPONS, shotDirs, weaponStats, FRAG } from './game/weapons.js';
import { MODES } from './game/modes.js';
import { throwGrenade, previewArc } from './game/grenade.js';
import { levelInfo, masteryInfo, unlocksAtLevel } from './game/progression.js';
import { ATTACHMENTS } from './game/weapons.js';
import { Effects } from './render/effects.js';
import { Characters } from './render/characters.js';

const D2R = Math.PI / 180;
const SENS = 0.0022; // radians per mouse count at sensitivity 1.0
const smooth = (k) => k * k * (3 - 2 * k);

export class GameClient {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.effects = null; this.chars = null;
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3(); this._v4 = new THREE.Vector3();
    this._mouse = { dx: 0, dy: 0 };
    this._ev = []; this._arc = [];
    this.fpsT = 0; this.fpsN = 0; this.fps = 0; this.frameMs = 0;
  }

  // ------------------------------------------------------------------ lifecycle
  start(client) {
    const { renderer, hud, profile } = this.app;
    this.client = client;
    this.mode = MODES[client.settings.mode];
    client.mode = this.mode;
    renderer.setMap(client.mapDef);
    if (this.effects) this.effects.dispose();
    if (this.chars) this.chars.clear();
    this.effects = new Effects(renderer.scene, renderer.quality);
    this.chars = new Characters(renderer.scene);
    this.viewYaw = 0; this.viewPitch = 0; this.recP = 0; this.recY = 0; this.recTP = 0; this.recTY = 0;
    this.shotIdx = 0; this.lastShotAt = -9; this.wantSlot = 0; this.acc = 0;
    this.bob = 0; this.bobAmt = 0; this.stepDist = 0; this.stepOff = 0; this.landDip = 0; this.shake = 0; this.flinch = 0; this.roll = 0; this.fovNow = this.app.settings.get('fov');
    this.sprintK = 0; this.crouchToggle = false; this.adsToggle = false; this.paused = false;
    this.pings = new Map(); this.killedBy = ''; this.lastCount = -1; this.time = 0;
    this.deathCam = null;
    // per-match XP tally for the post-match screen
    this.xp = { total: 0, items: new Map(), weapons: new Map(), before: profile.snapshot(), kills: 0, deaths: 0, assists: 0, headshots: 0, startedAt: performance.now() };
    this.ended = false;
    hud.reset(client); hud.show(true);
    this.active = true;
  }

  stop() {
    this.active = false;
    this.app.hud.show(false);
    if (this.effects) { this.effects.dispose(); this.effects = null; }
    if (this.chars) { this.chars.clear(); this.chars = null; }
    this.app.renderer.viewModel.root.visible = false;
  }

  setPaused(p) { this.paused = p; if (p) { this.crouchToggle = false; this.adsToggle = false; } }

  // ------------------------------------------------------------------ session events
  onSpawn(m) {
    this.viewYaw = m.yaw; this.viewPitch = 0; this.recP = this.recY = this.recTP = this.recTY = 0;
    this.wantSlot = 0; this.deathCam = null; this.stepOff = 0; this.landDip = 0;
    this.crouchToggle = false; this.adsToggle = false;
    this.app.input.clear();
  }

  onShot(m) {
    const c = this.client, w = c.world, fx = this.effects;
    if (!fx) return;
    const def = WEAPONS[m.w]; if (!def) return;
    const dirs = shotDirs(m.y, m.p, m.s, m.n, m.ps, m.q);
    const o = this._v1.set(m.o[0], m.o[1], m.o[2]);
    const from = this.chars.muzzle(m.i, this._v2) || this._v2.copy(o);
    const cam = this.app.renderer.camera.position;
    let whiz = false;
    for (let i = 0; i < dirs.length; i += 3) {
      const dx = dirs[i], dy = dirs[i + 1], dz = dirs[i + 2];
      const t = w.raycast(o.x, o.y, o.z, dx, dy, dz, 300);
      const d = t === Infinity ? 150 : t;
      const end = this._v3.set(o.x + dx * d, o.y + dy * d, o.z + dz * d);
      fx.tracer(from, end);
      if (t !== Infinity && cam.distanceToSquared(end) < 70 * 70) fx.impact(end.x, end.y, end.z, w.hit.nx, w.hit.ny, w.hit.nz, w.mats[w.hit.box]);
      // near miss: closest point of the bullet path to the camera
      if (!whiz && c.isEnemy(m.i)) {
        const k = (cam.x - o.x) * dx + (cam.y - o.y) * dy + (cam.z - o.z) * dz;
        if (k > 2 && k < d) { const px = o.x + dx * k, py = o.y + dy * k, pz = o.z + dz * k; if ((px - cam.x) ** 2 + (py - cam.y) ** 2 + (pz - cam.z) ** 2 < 4) { whiz = true; this.app.audio.whiz([px, py, pz]); } }
      }
    }
    this.chars.flash(m.i);
    this.app.audio.gun(def.sound, m.o, m.sup);
    if (!m.sup && c.isEnemy(m.i)) this.pings.set(m.i, { x: m.o[0], z: m.o[2], until: this.time + 2.5 });
  }

  onMelee(m) { const r = this.client.remote.get(m.i); if (r) this.app.audio.knife([r.x, r.y + 1.2, r.z]); }
  onBoom(m) {
    if (!this.effects) return;
    this.effects.explosion(m.x, m.y, m.z);
    this.app.audio.explosion([m.x, m.y, m.z]);
    const d = this.app.renderer.camera.position.distanceTo(this._v1.set(m.x, m.y, m.z));
    if (d < 25) this.shake = Math.max(this.shake, (1 - d / 25) * 1.2);
  }
  onBounce(m) { this.app.audio.bounce([m.x, m.y, m.z]); }

  onHit(m) {
    const { hud, audio } = this.app;
    hud.hitmarker(!!m.hd, !!m.k);
    if (m.k) audio.kill(); else audio.hit(!!m.hd);
    const r = this.client.remote.get(m.v);
    if (r && this.effects) {
      const cam = this.app.renderer.camera.position;
      const dx = r.x - cam.x, dz = r.z - cam.z, l = Math.hypot(dx, dz) || 1;
      this.effects.blood(r.x, r.y + (m.hd ? 1.6 : 1.15), r.z, dx / l, 0, dz / l);
    }
  }

  onDamage(m) {
    const { hud, audio } = this.app, c = this.client;
    hud.damageFrom(m.x, m.z, () => c.state.x, () => c.state.z, m.d);
    audio.hurt();
    this.flinch = Math.min(1, this.flinch + m.d / 60);
  }

  onKill(m) {
    const c = this.client, { hud, profile } = this.app;
    const kn = m.k >= 0 ? c.nameOf(m.k) : '';
    hud.killFeed(kn, c.nameOf(m.v), m.w, { head: m.h, back: m.b, mine: m.k === c.id || m.v === c.id, killerFriend: m.k === c.id || !c.isEnemy(m.k), victimFriend: m.v === c.id || !c.isEnemy(m.v) });
    if (m.v === c.id) {
      this.killedBy = m.k >= 0 && m.k !== c.id ? `Killed by <em>${kn.replace(/[<>&]/g, '')}</em> · ${WEAPONS[m.w] ? WEAPONS[m.w].name : m.w === 'frag' ? 'Frag Grenade' : m.w}` : (m.w === 'fall' ? 'Fell out of the world' : 'Killed yourself');
      this.xp.deaths++;
      if (this.mode.progression) profile.data.stats.deaths++;
    }
    if (m.k === c.id && m.v !== c.id) {
      this.xp.kills++; if (m.h) this.xp.headshots++;
      if (this.mode.progression) { profile.data.stats.kills++; if (m.h) profile.data.stats.headshots++; }
    }
  }

  onXp(m) {
    if (!this.mode.progression) return; // Gun Game never touches progression
    const { profile, hud, audio, ui } = this.app;
    const before = profile.level.level;
    profile.addXp(m.a);
    const x = this.xp;
    x.total += m.a;
    const it = x.items.get(m.r) || { n: 0, xp: 0 }; it.n++; it.xp += m.a; x.items.set(m.r, it);
    if (m.r === 'Assist') { x.assists++; profile.data.stats.assists++; }
    if (m.w && m.wx) {
      const mb = profile.mastery(m.w).level;
      profile.addWeaponXp(m.w, m.wx);
      x.weapons.set(m.w, (x.weapons.get(m.w) || 0) + m.wx);
      const ma = profile.mastery(m.w).level;
      if (ma > mb) {
        const un = Object.values(ATTACHMENTS).filter((a) => a.lvl === ma && !a.not.includes(WEAPONS[m.w].cls)).map((a) => a.name);
        ui.toast(`${WEAPONS[m.w].name} mastery ${ma}` + (un.length ? ` — unlocked ${un.join(', ')}` : ''), 'good');
        audio.levelUp();
      }
    }
    if (m.a > 0) hud.xpPopup(m.a, m.r);
    const after = profile.level.level;
    if (after > before) {
      const un = unlocksAtLevel(after).map((id) => WEAPONS[id].name);
      ui.toast(`Level ${after}!` + (un.length ? ` Unlocked: ${un.join(', ')}` : ''), 'good');
      audio.levelUp();
    }
    this._saveSoon();
  }

  _saveSoon() { if (this._saveT) return; this._saveT = setTimeout(() => { this._saveT = 0; this.app.profile.save(); }, 1500); }

  onPhase(m) { if (m.ph === 'live') this.app.audio.ui('start'); }

  onEnd(m) {
    if (this.ended) return;
    this.ended = true;
    const { profile } = this.app, c = this.client;
    const won = this.mode.teams ? (c.me && m.winTeam === c.me.team) : m.winPlayer === c.id;
    const draw = this.mode.teams ? m.winTeam < 0 : m.winPlayer < 0;
    if (this.mode.progression) {
      profile.data.stats.matches++; if (won) profile.data.stats.wins++;
      profile.data.stats.seconds += Math.round((performance.now() - this.xp.startedAt) / 1000);
    }
    profile.save();
    // give the last XP messages a moment to arrive before showing the summary
    setTimeout(() => { if (this.app.onMatchEnd) this.app.onMatchEnd({ result: m, won, draw, xp: this.xp }); }, 900);
  }

  // ------------------------------------------------------------------ per-frame
  frame(dt) {
    const { renderer, input, settings, audio, hud } = this.app;
    const c = this.client, s = c.state, world = c.world;
    if (!world) return;
    this.time += dt;
    const cam = renderer.camera, vm = renderer.viewModel;
    const playing = input.locked && !this.paused && c.matchPhase !== 'ended';
    const alive = !!s.alive;
    const W = s.w[s.slot] || s.w[0], st = statsOf(W);

    // ---- look ----
    input.takeMouse(this._mouse);
    let mdx = 0, mdy = 0;
    const baseFov = settings.get('fov');
    if (playing && alive) {
      const adsK = smooth(s.ads);
      const zoomFov = 2 * Math.atan(Math.tan((baseFov * D2R) / 2) / st.zoom);
      const fovK = Math.tan(((baseFov * D2R + (zoomFov - baseFov * D2R) * adsK)) / 2) / Math.tan((baseFov * D2R) / 2);
      const sens = SENS * settings.get('sens') * (1 + (settings.get('adsSens') * fovK - 1) * adsK);
      mdx = this._mouse.dx; mdy = this._mouse.dy;
      this.viewYaw -= mdx * sens;
      let dp = -mdy * sens * (settings.get('invertY') ? -1 : 1);
      // pulling down against recoil consumes the recoil instead of dragging the aim below the target later
      if (dp < 0 && this.recP > 0) { const use = Math.min(this.recP, -dp); this.recP -= use; this.recTP = Math.max(0, this.recTP - use); dp += use; }
      this.viewPitch = Math.max(-1.5, Math.min(1.5, this.viewPitch + dp));
    }
    // recoil: approach the target kick quickly, then recover once the trigger is released
    const sinceShot = this.time - this.lastShotAt;
    this.recP += (this.recTP - this.recP) * Math.min(1, dt * 28);
    this.recY += (this.recTY - this.recY) * Math.min(1, dt * 28);
    if (sinceShot > Math.max(0.12, st.interval * 1.4)) { const k = Math.exp(-dt * 7); this.recTP *= k; this.recTY *= k; if (sinceShot > 0.35) this.shotIdx = 0; }

    // ---- fixed-rate prediction ticks ----
    const pressed = input.takePressed();
    if (playing) {
      if (pressed.has('primary')) this.wantSlot = 0;
      if (pressed.has('secondary')) this.wantSlot = 1;
      if (pressed.has('swap') || pressed.has('code:WheelUp') || pressed.has('code:WheelDown')) this.wantSlot = s.slot === 0 ? 1 : 0;
      if (settings.get('toggleCrouch') && pressed.has('crouch')) this.crouchToggle = !this.crouchToggle;
      if (settings.get('toggleAds') && pressed.has('ads')) this.adsToggle = !this.adsToggle;
      if (pressed.has('jump') || pressed.has('sprint')) this.crouchToggle = false;
    }
    if (this.wantSlot >= s.w.length) this.wantSlot = 0;
    let b = 0, f = 0, sd = 0;
    if (playing) {
      if (input.isDown('forward')) f += 1; if (input.isDown('back')) f -= 1;
      if (input.isDown('right')) sd += 1; if (input.isDown('left')) sd -= 1;
      if (input.isDown('jump')) b |= BTN.JUMP;
      if (input.isDown('sprint')) b |= BTN.SPRINT;
      if (settings.get('toggleCrouch') ? this.crouchToggle : input.isDown('crouch')) b |= BTN.CROUCH;
      if (input.isDown('fire')) b |= BTN.FIRE;
      if (settings.get('toggleAds') ? this.adsToggle : input.isDown('ads')) b |= BTN.ADS;
      if (input.isDown('reload')) b |= BTN.RELOAD;
      if (input.isDown('melee')) b |= BTN.MELEE;
      if (input.isDown('grenade')) b |= BTN.NADE;
    }
    this.acc += dt;
    let ticks = 0;
    const ev = this._ev;
    while (this.acc >= TICK && ticks < 6) {
      this.acc -= TICK; ticks++;
      const py = s.y, pg = s.ground;
      ev.length = 0;
      c.predict({ b, f, s: sd, yaw: this.viewYaw + this.recY, pitch: this.viewPitch + this.recP, sel: this.wantSlot }, ev);
      // stairs / kerbs: hide the instant vertical snap, the camera eases over it instead
      const dy = s.y - py;
      if (pg && s.ground && Math.abs(dy) > 0.03 && Math.abs(dy) < 0.7) this.stepOff -= dy;
      for (let i = 0; i < ev.length; i++) this._localEvent(ev[i]);
      // footsteps + bob follow distance travelled
      const sp = Math.hypot(s.vx, s.vz);
      if (s.ground && s.slide <= 0 && sp > 1) {
        const d = sp * TICK;
        this.bob += d * (s.sprint ? 2.5 : 3.0);
        this.stepDist += d;
        if (this.stepDist > (s.sprint ? 2.5 : 2.1)) { this.stepDist = 0; if (!s.crouch) audio.step(null, s.sprint ? 0.9 : 0.6); }
      }
    }
    if (this.acc > TICK * 6) this.acc = 0;
    c.flush();
    c.interpolate();
    c.decayError(dt);

    // ---- camera ----
    const a = Math.min(1, this.acc / TICK), p = c.prev;
    const px = p.x + (s.x - p.x) * a + c.errX, py = p.y + (s.y - p.y) * a + c.errY, pz = p.z + (s.z - p.z) * a + c.errZ;
    const eye = p.eye + (s.eye - p.eye) * a;
    this.stepOff *= Math.exp(-dt * 14);
    this.landDip += (0 - this.landDip) * Math.min(1, dt * 9);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    const speed = Math.hypot(s.vx, s.vz);
    const bobTarget = settings.get('headBob') && s.ground && s.slide <= 0 ? Math.min(1, speed / PM.WALK) * (1 - s.ads * 0.8) : 0;
    this.bobAmt += (bobTarget - this.bobAmt) * Math.min(1, dt * 8);
    this.sprintK += ((s.sprint ? 1 : 0) - this.sprintK) * Math.min(1, dt * 7);
    const bobY = Math.abs(Math.sin(this.bob)) * 0.045 * this.bobAmt * (1 + this.sprintK * 0.5), bobX = Math.cos(this.bob) * 0.02 * this.bobAmt;
    const sh = this.shake * this.shake;
    let camY = py + eye + this.stepOff - this.landDip + bobY;
    let rollT = (s.slide > 0 ? -0.07 : 0) - sd * 0.012 * (alive ? 1 : 0);
    let yaw = this.viewYaw + this.recY, pitch = this.viewPitch + this.recP;
    if (!alive) {
      if (!this.deathCam) this.deathCam = { y: camY, t: 0 };
      this.deathCam.t += dt;
      const k = Math.min(1, this.deathCam.t / 0.5);
      camY = this.deathCam.y - k * (eye - 0.35); rollT = 0.5 * k; pitch = pitch * (1 - k) + 0.15 * k;
    }
    this.roll += (rollT - this.roll) * Math.min(1, dt * 8);
    cam.position.set(px + Math.cos(this.viewYaw) * bobX + (Math.random() - 0.5) * sh * 0.25, camY + (Math.random() - 0.5) * sh * 0.25, pz - Math.sin(this.viewYaw) * bobX);
    cam.rotation.set(Math.max(-1.55, Math.min(1.55, pitch + this.flinch * 0.02 + (Math.random() - 0.5) * sh * 0.03)), yaw, this.roll + (Math.random() - 0.5) * sh * 0.04);
    const adsK = smooth(s.ads);
    const zoomFov = (2 * Math.atan(Math.tan((baseFov * D2R) / 2) / st.zoom)) / D2R;
    const fovT = baseFov + (zoomFov - baseFov) * adsK + this.sprintK * 6 * (1 - adsK) + (s.slide > 0 ? 5 : 0);
    this.fovNow += (fovT - this.fovNow) * Math.min(1, dt * 16);
    if (Math.abs(cam.fov - this.fovNow) > 0.01) { cam.fov = this.fovNow; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    const fw = this._v1.set(0, 0, -1).applyQuaternion(cam.quaternion);
    audio.setListener(cam.position.x, cam.position.y, cam.position.z, fw.x, fw.y, fw.z);

    // ---- world ----
    this.chars.update(dt, c.remote, c, (r, running) => audio.step([r.x, r.y, r.z], running ? 1 : 0.6));
    this.effects.setGrenades(c.nades, this.time);
    if (alive && s.cook >= 0) {
      const g = throwGrenade(s.x, s.y + s.eye, s.z, yaw, pitch, s.vx, s.vy, s.vz);
      previewArc(world, g, Math.min(2.6, Math.max(0.1, FRAG.fuse - s.cook)), this._arc);
      this.effects.setArc(this._arc);
    } else this.effects.setArc(null);
    this.effects.update(dt, cam, renderer.canvas.clientHeight || window.innerHeight);

    // ---- view model ----
    vm.setWeapon(W.id, W.att);
    vm.update(dt, { s, st, mdx, mdy, bob: this.bob, bobAmt: this.bobAmt, alive: alive && c.matchPhase !== 'ended', strafe: sd, onStage: (i) => audio.reload(i) });

    // ---- HUD ----
    this._hud(dt, s, W, st, alive, pressed);
    renderer.render(true);

    this.fpsN++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = this.fpsN / this.fpsT; this.fpsN = 0; this.fpsT = 0; }
  }

  _hud(dt, s, W, st, alive, pressed) {
    const { hud, settings, input, renderer, audio } = this.app, c = this.client;
    hud.tick(dt, this.viewYaw);
    const mode = this.mode, me = c.me, myScore = c.scores.get(c.id);
    let top = 0;
    for (const [id, sc] of c.scores) if (id !== c.id) top = Math.max(top, mode.id === 'gungame' ? sc.tier + 1 : sc.score);
    const otherW = s.w.length > 1 ? s.w[s.slot === 0 ? 1 : 0] : null;
    const scoped = alive && s.ads > 0.82 && (st.sight === 'scope' ? 'full' : st.sight === 'scope2' ? 'lite' : 0);
    const pxPerDeg = (renderer.canvas.clientHeight || window.innerHeight) / renderer.camera.fov;
    hud.update({
      hp: c.hp, prot: c.prot, weapon: WEAPONS[W.id].name, ammo: W.ammo, res: W.res, mag: st.mag, knife: st.cls === 'melee',
      other: otherW ? WEAPONS[otherW.id].name + '  ' + otherW.ammo + '/' + otherW.res : '', nades: s.nades, gungame: mode.id === 'gungame',
      tier: myScore ? myScore.tier : 0, spread: currentSpread(s, st), pxPerDeg, ads: s.ads, alive, reloading: s.reload > 0, cook: s.cook, scoped,
      clock: c.clock(), phase: c.matchPhase, mode: mode.id, teamScore: c.teamScore, myTeam: me ? me.team : 0,
      myScore: myScore ? (mode.id === 'gungame' ? myScore.tier + 1 : myScore.score) : 0, topScore: top,
    });
    // minimap: teammates always, enemies only while they are firing unsuppressed
    const dots = [];
    for (const [id, r] of c.remote) {
      if (!(r.flags & 1)) continue;
      if (!c.isEnemy(id)) dots.push({ x: r.x, z: r.z, kind: 'friend' });
      else { const pg = this.pings.get(id); if (pg && pg.until > this.time) dots.push({ x: pg.x, z: pg.z, kind: 'enemy' }); }
    }
    hud.drawMinimap(s.x, s.z, this.viewYaw, dots);
    hud.drawCompass(this.viewYaw);

    if (c.matchPhase === 'countdown') {
      const n = Math.ceil(c.clock());
      hud.bigMessage(n > 0 ? String(n) : 'GO', mode.name + ' — get ready');
      if (n !== this.lastCount) { this.lastCount = n; if (n > 0 && n <= 5) audio.countdown(false); }
    } else if (c.matchPhase === 'ended') hud.bigMessage('MATCH OVER', '');
    else hud.bigMessage(null);

    hud.death(!alive && c.matchPhase === 'live', `${this.killedBy}<br>Respawning in ${Math.ceil(c.respawnIn)}…`);
    hud.scoreboard(input.isDown('scoreboard') && input.locked, c);
    if (settings.get('showFps') || this.app.debug) {
      hud.stats(`${this.fps.toFixed(0)} fps  ${c.ping.toFixed(0)} ms` + (this.app.debug ? `\ncalls ${renderer.gl.info.render.calls} tris ${renderer.gl.info.render.triangles}\npos ${s.x.toFixed(1)} ${s.y.toFixed(1)} ${s.z.toFixed(1)}\npending ${c.pending.length} mispredict ${c.mispredicts || 0}` : ''));
    } else hud.stats('');
  }

  // ------------------------------------------------------------------ predicted local events
  _localEvent(e) {
    const { renderer, audio } = this.app, c = this.client, s = c.state, fx = this.effects, vm = renderer.viewModel;
    const W = s.w[s.slot] || s.w[0], st = statsOf(W), cam = renderer.camera;
    switch (e.t) {
      case 'fire': {
        // same deterministic spread the host will use, so local decals match the real shots
        const yaw = s.yaw, pitch = s.pitch;
        const dirs = shotDirs(yaw, pitch, e.spread, st.pellets, st.pelletSpread, e.q);
        const ox = s.x, oy = s.y + s.eye, oz = s.z, w = c.world;
        const from = vm.hidden ? this._v2.set(ox, oy - 0.08, oz) : vm.muzzleWorld(cam, this._v2);
        for (let i = 0; i < dirs.length; i += 3) {
          const dx = dirs[i], dy = dirs[i + 1], dz = dirs[i + 2];
          const t = w.raycast(ox, oy, oz, dx, dy, dz, 300), d = t === Infinity ? 150 : t;
          const end = this._v3.set(ox + dx * d, oy + dy * d, oz + dz * d);
          if (i === 0 || st.pellets > 1) fx.tracer(from, end);
          if (t !== Infinity) fx.impact(end.x, end.y, end.z, w.hit.nx, w.hit.ny, w.hit.nz, w.mats[w.hit.box]);
        }
        // recoil pattern
        const idx = this.shotIdx++;
        const k = (idx === 0 ? st.recoilFirst : 1) * (1 - s.ads * 0.12) * (s.crouch ? 0.9 : 1);
        this.recTP += st.recoilV * D2R * k * (0.92 + Math.random() * 0.16);
        this.recTY += st.recoilH * D2R * st.pat[idx % st.pat.length] * k * (0.85 + Math.random() * 0.3);
        this.lastShotAt = this.time;
        vm.onFire(st, st.suppressed);
        audio.gun(st.sound, null, st.suppressed);
        if (!st.suppressed) fx.muzzleLightAt(from);
        if (st.cls !== 'shotgun' || true) {
          const right = this._v3.set(1, 0, 0).applyQuaternion(cam.quaternion), up = this._v4.set(0, 1, 0).applyQuaternion(cam.quaternion);
          fx.shell(vm.hidden ? this._v1.set(ox, oy - 0.1, oz) : vm.ejectWorld(cam, this._v1), right, up, s.y);
        }
        this.shake = Math.max(this.shake, Math.min(0.5, st.kick * 0.09));
        break;
      }
      case 'dry': audio.dry(); break;
      case 'melee': audio.knife(null); break;
      case 'cook': audio.pin(); break;
      case 'nade': vm.onThrow(); audio.throwNade(); break;
      case 'switch': audio.switchWeapon(); this.shotIdx = 0; break;
      case 'jump': audio.jump(); break;
      case 'land': audio.land(e.v, null); this.landDip = Math.min(0.25, e.v * 0.022); break;
      case 'slide': audio.slide(null); break;
      default: break;
    }
  }
}

export { levelInfo, masteryInfo, weaponStats };
