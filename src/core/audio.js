// All sound is synthesized at runtime with the Web Audio API (no audio files, nothing to license).
// World sounds are positioned in 3D with PannerNodes; the listener follows the camera.

const GUNS = {
  //          noise dur, lowpass, highpass, thump gain, thump Hz, crack gain, tail dur, tail gain, overall
  ar:       { d: 0.11, lp: 5200, hp: 500, th: 0.7, tf: 150, cr: 0.5, td: 0.45, tg: 0.16, g: 0.85 },
  arHeavy:  { d: 0.14, lp: 3800, hp: 300, th: 0.95, tf: 120, cr: 0.5, td: 0.55, tg: 0.2, g: 0.95 },
  smg:      { d: 0.075, lp: 6500, hp: 800, th: 0.45, tf: 190, cr: 0.5, td: 0.3, tg: 0.1, g: 0.7 },
  smgHeavy: { d: 0.09, lp: 5200, hp: 600, th: 0.6, tf: 165, cr: 0.5, td: 0.35, tg: 0.12, g: 0.78 },
  lmg:      { d: 0.13, lp: 3400, hp: 250, th: 0.95, tf: 110, cr: 0.45, td: 0.5, tg: 0.2, g: 0.95 },
  dmr:      { d: 0.16, lp: 4600, hp: 350, th: 1.0, tf: 125, cr: 0.7, td: 0.8, tg: 0.24, g: 1.0 },
  sniper:   { d: 0.24, lp: 3600, hp: 200, th: 1.3, tf: 85, cr: 0.9, td: 1.5, tg: 0.34, g: 1.15 },
  shotgun:  { d: 0.26, lp: 2600, hp: 120, th: 1.3, tf: 75, cr: 0.5, td: 0.9, tg: 0.28, g: 1.1 },
  pistol:   { d: 0.07, lp: 5600, hp: 700, th: 0.5, tf: 200, cr: 0.6, td: 0.3, tg: 0.1, g: 0.7 },
  magnum:   { d: 0.15, lp: 3800, hp: 300, th: 1.1, tf: 105, cr: 0.8, td: 0.8, tg: 0.24, g: 1.0 },
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings; this.ctx = null; this.active = 0;
    this.lx = 0; this.ly = 0; this.lz = 0;
    settings.onChange((k) => { if (k === 'volume' && this.master) this.master.gain.value = settings.get('volume'); });
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain(); this.master.gain.value = this.settings.get('volume');
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    // two seconds of white noise reused by every noise-based sound
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setListener(x, y, z, fx, fy, fz) {
    this.lx = x; this.ly = y; this.lz = z;
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(x, y, z); l.setOrientation(fx, fy, fz, 0, 1, 0); }
  }

  /** Output node for a sound: positioned in the world, or straight to master for the local player / UI. */
  _dest(pos, ref = 5, maxDist = 120) {
    const ctx = this.ctx;
    if (!pos) return { node: this.master, dist: 0 };
    const dist = Math.hypot(pos[0] - this.lx, pos[1] - this.ly, pos[2] - this.lz);
    if (dist > maxDist || this.active > 28) return null;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.1; p.maxDistance = maxDist;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
    // distant sounds lose their highs
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 18000 / (1 + dist / 18));
    lp.connect(p); p.connect(this.master);
    this.active++;
    setTimeout(() => { this.active--; try { p.disconnect(); lp.disconnect(); } catch (e) { /* already gone */ } }, 2500);
    return { node: lp, dist };
  }

  _noise(dest, dur, gain, lp, hp = 0, when = 0, attack = 0.001, rate = 1) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = rate;
    let node = src;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  _tone(dest, f0, f1, dur, gain, type = 'sine', when = 0, attack = 0.002) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- weapons
  gun(kind, pos, suppressed) {
    if (!this.ctx) return;
    const p = GUNS[kind] || GUNS.ar;
    const out = this._dest(pos, suppressed ? 3 : 9, suppressed ? 45 : 160);
    if (!out) return;
    const d = out.node, v = (pos ? 0.9 : 0.8) * p.g, r = 0.94 + Math.random() * 0.12;
    if (suppressed) {
      this._noise(d, 0.07, v * 0.5, 2200, 500, 0, 0.001, r);
      this._tone(d, 320 * r, 120, 0.05, v * 0.25, 'triangle');
      return;
    }
    this._noise(d, p.d, v * 0.9, p.lp, p.hp, 0, 0.001, r);                 // body
    this._noise(d, 0.02, v * p.cr, 12000, 2500, 0, 0.0005, r);              // crack
    this._tone(d, p.tf * 1.6 * r, p.tf * 0.4, p.d * 1.1, v * p.th, 'sine'); // thump
    this._noise(d, p.td, v * p.tg, 1500, 150, 0.02, 0.01, 0.7);             // tail / echo
  }

  dry() { if (this.ctx) { this._tone(this.master, 1400, 900, 0.03, 0.15, 'square'); this._noise(this.master, 0.02, 0.1, 6000, 2000); } }

  reload(stage = 0) {
    if (!this.ctx) return;
    const m = this.master;
    if (stage === 0) { this._noise(m, 0.05, 0.22, 3500, 900); this._tone(m, 500, 260, 0.05, 0.1, 'square'); }          // mag out
    else if (stage === 1) { this._noise(m, 0.06, 0.26, 3000, 600); this._tone(m, 300, 520, 0.05, 0.12, 'square'); }    // mag in
    else { this._noise(m, 0.04, 0.24, 5000, 1500); this._tone(m, 900, 500, 0.04, 0.12, 'square', 0.03); }             // bolt
  }

  switchWeapon() { if (this.ctx) { this._noise(this.master, 0.09, 0.12, 2400, 400); } }
  knife(pos) { if (!this.ctx) return; const o = this._dest(pos, 3, 30); if (o) this._noise(o.node, 0.16, 0.3, 5000, 1200, 0, 0.04, 1.4); }
  knifeHit() { if (this.ctx) { this._noise(this.master, 0.09, 0.4, 1800, 200); this._tone(this.master, 180, 70, 0.1, 0.4); } }
  pin() { if (this.ctx) { this._tone(this.master, 2600, 1900, 0.04, 0.12, 'square'); this._noise(this.master, 0.03, 0.12, 8000, 3000, 0.03); } }
  throwNade() { if (this.ctx) this._noise(this.master, 0.2, 0.2, 2500, 500, 0, 0.06, 1.3); }

  // ---------------------------------------------------------------- movement
  step(pos, vol = 1) {
    if (!this.ctx) return;
    const o = this._dest(pos, 3.5, 35); if (!o) return;
    const r = 0.85 + Math.random() * 0.3;
    this._noise(o.node, 0.08, 0.3 * vol, 650 * r, 60, 0, 0.004, r);
    this._noise(o.node, 0.03, 0.1 * vol, 3200, 1200, 0.005, 0.002, r);
  }
  jump() { if (this.ctx) this._noise(this.master, 0.1, 0.14, 900, 100, 0, 0.02); }
  land(v = 5, pos) {
    if (!this.ctx) return;
    const o = this._dest(pos, 4, 35); if (!o) return;
    const k = Math.min(1, v / 12);
    this._noise(o.node, 0.14, 0.25 + k * 0.35, 500, 40, 0, 0.004); this._tone(o.node, 110, 50, 0.12, 0.2 + k * 0.3);
  }
  slide(pos) { if (!this.ctx) return; const o = this._dest(pos, 4, 35); if (o) this._noise(o.node, 0.7, 0.22, 1800, 300, 0, 0.05, 0.8); }

  // ---------------------------------------------------------------- feedback
  hit(head) {
    if (!this.ctx) return;
    const m = this.master;
    if (head) { this._tone(m, 1900, 2500, 0.07, 0.2, 'triangle'); this._tone(m, 2900, 3300, 0.09, 0.12, 'sine', 0.03); }
    else { this._tone(m, 1250, 900, 0.045, 0.2, 'triangle'); this._noise(m, 0.02, 0.1, 7000, 2500); }
  }
  kill() { if (!this.ctx) return; const m = this.master; this._tone(m, 520, 520, 0.09, 0.18, 'triangle'); this._tone(m, 780, 780, 0.16, 0.18, 'triangle', 0.07); this._tone(m, 150, 70, 0.14, 0.3); }
  hurt() { if (this.ctx) { this._noise(this.master, 0.12, 0.3, 700, 60); this._tone(this.master, 140, 60, 0.14, 0.35); } }
  impact(pos) { if (!this.ctx) return; const o = this._dest(pos, 2.5, 30); if (o) { this._noise(o.node, 0.05, 0.22, 6000, 1500, 0, 0.001, 0.8 + Math.random() * 0.6); } }
  whiz(pos) { if (!this.ctx) return; const o = this._dest(pos, 2, 20); if (o) this._noise(o.node, 0.12, 0.25, 9000, 3000, 0, 0.03, 1.6); }

  explosion(pos) {
    if (!this.ctx) return;
    const o = this._dest(pos, 14, 220); if (!o) return;
    const d = o.node;
    this._noise(d, 1.3, 1.5, 900, 30, 0, 0.004, 0.6);
    this._noise(d, 0.25, 1.1, 5000, 400, 0, 0.001);
    this._tone(d, 95, 28, 0.9, 1.6, 'sine');
    this._noise(d, 2.2, 0.3, 500, 60, 0.15, 0.2, 0.5);
    for (let i = 0; i < 5; i++) this._noise(d, 0.05, 0.15, 4000, 1500, 0.3 + Math.random() * 0.8, 0.002, 1.5);
  }
  bounce(pos) { if (!this.ctx) return; const o = this._dest(pos, 3, 40); if (o) { this._tone(o.node, 1700, 900, 0.05, 0.25, 'triangle'); this._noise(o.node, 0.04, 0.2, 5000, 1800); } }

  // ---------------------------------------------------------------- UI
  ui(kind = 'click') {
    if (!this.ctx) return;
    const m = this.master;
    if (kind === 'hover') this._tone(m, 880, 880, 0.03, 0.04, 'sine');
    else if (kind === 'back') this._tone(m, 520, 380, 0.07, 0.1, 'triangle');
    else if (kind === 'start') { this._tone(m, 440, 440, 0.1, 0.14, 'triangle'); this._tone(m, 660, 660, 0.1, 0.14, 'triangle', 0.09); this._tone(m, 880, 880, 0.22, 0.14, 'triangle', 0.18); }
    else this._tone(m, 660, 820, 0.05, 0.1, 'triangle');
  }
  countdown(final) { if (this.ctx) this._tone(this.master, final ? 1320 : 880, final ? 1320 : 880, final ? 0.4 : 0.12, 0.16, 'triangle'); }
  levelUp() { if (!this.ctx) return; [523, 659, 784, 1047].forEach((f, i) => this._tone(this.master, f, f, 0.28, 0.16, 'triangle', i * 0.09)); }
  xpTick() { if (this.ctx) this._tone(this.master, 1500, 1800, 0.03, 0.05, 'sine'); }
}
