// In-match HUD (DOM overlay). Values are cached so the DOM is only touched when something changes.

import { WEAPONS, GUN_GAME_LADDER, FRAG } from '../game/weapons.js';
import { MODES } from '../game/modes.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const WEAPON_LABEL = (w) => (w === 'frag' ? 'Frag' : w === 'fall' ? 'Fell' : WEAPONS[w] ? WEAPONS[w].name : w);

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="dmg"></div>
      <div id="scope"><i></i></div>
      <div class="tl"><canvas id="minimap" width="176" height="176"></canvas></div>
      <div id="stat"></div>
      <div class="tc">
        <div class="scorebox"><div class="s a"><b id="sA">0</b><span id="lA">You</span></div><div class="t" id="clock">0:00</div><div class="s b"><b id="sB">0</b><span id="lB">Enemy</span></div></div>
        <canvas id="compass" width="340" height="22"></canvas>
        <div class="modeline" id="modeline"></div>
      </div>
      <div id="killfeed"></div>
      <div class="bl"><div class="prot" id="prot"></div><div class="hp"><b id="hpn">100</b><div class="hpbar"><i id="hpb" style="width:100%"></i></div></div></div>
      <div class="br"><div class="ggtier" id="ggtier"></div><div class="wname" id="wname"></div><div class="ammo" id="ammo"><b id="am">0</b><span id="ar">0</span></div><div class="other" id="other"></div><div class="nades" id="nades"></div></div>
      <div id="crosshair"><i class="l"></i><i class="r"></i><i class="u"></i><i class="d"></i><i class="dot"></i></div>
      <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
      <div id="center-msg"></div>
      <div id="cookbar" class="hidden"><i></i></div>
      <div id="xpfeed"></div>
      <div id="dmgdirs"></div>
      <div id="bigmsg"><b></b><span></span></div>
      <div id="death"><b>YOU DIED</b><span id="deathmsg"></span></div>
      <div id="scoreboard"></div>`;
    const $ = (id) => root.querySelector('#' + id);
    this.el = {
      dmg: $('dmg'), scope: $('scope'), minimap: $('minimap'), stat: $('stat'), sA: $('sA'), sB: $('sB'), lA: $('lA'), lB: $('lB'), clock: $('clock'),
      compass: $('compass'), modeline: $('modeline'), killfeed: $('killfeed'), prot: $('prot'), hpn: $('hpn'), hpb: $('hpb'), ggtier: $('ggtier'),
      wname: $('wname'), ammo: $('ammo'), am: $('am'), ar: $('ar'), other: $('other'), nades: $('nades'), cross: $('crosshair'), hit: $('hitmarker'),
      msg: $('center-msg'), cook: $('cookbar'), xp: $('xpfeed'), dirs: $('dmgdirs'), big: $('bigmsg'), death: $('death'), deathmsg: $('deathmsg'), sb: $('scoreboard'),
    };
    this.ch = { l: root.querySelector('#crosshair .l'), r: root.querySelector('#crosshair .r'), u: root.querySelector('#crosshair .u'), d: root.querySelector('#crosshair .d'), dot: root.querySelector('#crosshair .dot') };
    this.mctx = this.el.minimap.getContext('2d');
    this.cctx = this.el.compass.getContext('2d');
    this.cache = {};
    this.dirs = [];
    this.dmgAlpha = 0;
    this.mapImg = null;
    this.sbVisible = false;
  }

  show(v) { this.root.classList.toggle('hidden', !v); }
  _set(key, el, prop, v) { if (this.cache[key] !== v) { this.cache[key] = v; el[prop] = v; } }

  reset(client) {
    this.cache = {}; this.el.killfeed.innerHTML = ''; this.el.xp.innerHTML = ''; this.el.dirs.innerHTML = ''; this.dirs = [];
    this.el.death.classList.remove('show'); this.el.big.style.display = 'none'; this.dmgAlpha = 0; this.el.dmg.style.opacity = 0;
    this.el.sb.style.display = 'none'; this.sbVisible = false;
    const mode = MODES[client.settings.mode];
    this.el.modeline.textContent = mode.name + ' · ' + client.mapDef.name;
    this._buildMapImage(client.mapDef);
  }

  // ------------------------------------------------------------ minimap
  _buildMapImage(def) {
    const S = 3, b = def.bounds, pad = 6;
    const w = Math.ceil((b.x1 - b.x0 + pad * 2) * S), h = Math.ceil((b.z1 - b.z0 + pad * 2) * S);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(70,78,90,0.55)';
    ctx.fillRect(pad * S, pad * S, (b.x1 - b.x0) * S, (b.z1 - b.z0) * S);
    const boxes = def.boxes.filter((x) => !x.decor && x.b[1] > 0.7 && x.b[1] - x.a[1] > 0.3).sort((p, q) => p.b[1] - q.b[1]);
    for (const x of boxes) {
      const t = Math.min(1, x.b[1] / 9), floating = x.a[1] > 2.2;
      const l = Math.round(105 + t * 110);
      ctx.fillStyle = floating ? `rgba(${l},${l},${l + 10},0.55)` : `rgb(${l},${l},${l + 8})`;
      ctx.fillRect((x.a[0] - b.x0 + pad) * S, (x.a[2] - b.z0 + pad) * S, Math.max(1, (x.b[0] - x.a[0]) * S), Math.max(1, (x.b[2] - x.a[2]) * S));
    }
    this.mapImg = { cv, S, ox: b.x0 - pad, oz: b.z0 - pad };
  }

  /** dots: [{x,z,kind:'friend'|'enemy'}] */
  drawMinimap(px, pz, yaw, dots) {
    const ctx = this.mctx, W = 176, m = this.mapImg;
    ctx.clearRect(0, 0, W, W);
    if (!m) return;
    const zoom = 0.62;
    ctx.save();
    ctx.translate(W / 2, W / 2); ctx.rotate(yaw); ctx.scale(zoom, zoom);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(m.cv, -(px - m.ox) * m.S, -(pz - m.oz) * m.S);
    ctx.globalAlpha = 1;
    for (const d of dots) {
      ctx.fillStyle = d.kind === 'friend' ? '#4da3ff' : '#ff5a4d';
      ctx.beginPath(); ctx.arc((d.x - px) * m.S, (d.z - pz) * m.S, 4.5 / zoom * 0.62, 0, 6.3); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#f5a524'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2, W / 2 - 8); ctx.lineTo(W / 2 + 5.5, W / 2 + 6); ctx.lineTo(W / 2, W / 2 + 3); ctx.lineTo(W / 2 - 5.5, W / 2 + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  drawCompass(yaw) {
    const ctx = this.cctx, W = 340, H = 22;
    const heading = ((-yaw * 180) / Math.PI % 360 + 360) % 360;
    const key = Math.round(heading * 2);
    if (this.cache.compass === key) return;
    this.cache.compass = key;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '700 11px system-ui, sans-serif';
    const pxPerDeg = 2.3, names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -75; d <= 75; d++) {
      const a = Math.round(heading + d), deg = ((a % 360) + 360) % 360;
      if (deg % 15 !== 0) continue;
      const x = W / 2 + (a - heading) * pxPerDeg, fade = 1 - Math.abs(a - heading) / 80;
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = names[deg] ? '#fff' : 'rgba(255,255,255,0.6)';
      if (names[deg]) ctx.fillText(names[deg], x, 8); else ctx.fillRect(x - 0.5, 12, 1, 6);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#f5a524';
    ctx.beginPath(); ctx.moveTo(W / 2 - 4, 0); ctx.lineTo(W / 2 + 4, 0); ctx.lineTo(W / 2, 5); ctx.fill();
  }

  // ------------------------------------------------------------ per-frame state
  /**
   * v: {hp, prot, weapon, ammo, res, mag, other, nades, spread(deg), fovScale(px per degree), ads, alive, reloading,
   *     cook, scoped: 0 | 'full' | 'lite', clock, mode, teamScore, myTeam, myScore, topScore, tier, phase}
   */
  update(v) {
    const e = this.el;
    this._set('hp', e.hpn, 'textContent', String(Math.max(0, v.hp)));
    this._set('hpw', e.hpb.style, 'width', Math.max(0, v.hp) + '%');
    this._set('hpl', e.hpb, 'className', v.hp <= 35 ? 'low' : '');
    this._set('prot', e.prot, 'textContent', v.alive && v.prot > 0 ? 'Spawn protection ' + v.prot.toFixed(1) : '');
    this._set('wn', e.wname, 'textContent', v.weapon);
    this._set('am', e.am, 'textContent', v.knife ? '—' : String(v.ammo));
    this._set('ar', e.ar, 'textContent', v.knife ? '' : String(v.res));
    this._set('aml', e.ammo, 'className', 'ammo' + (!v.knife && v.ammo <= v.mag * 0.25 ? ' low' : ''));
    this._set('ot', e.other, 'textContent', v.other || '');
    const nk = v.gungame ? -1 : v.nades;
    if (this.cache.nades !== nk) {
      this.cache.nades = nk;
      e.nades.innerHTML = nk < 0 ? '' : 'FRAG ' + Array.from({ length: FRAG.count }, (_, i) => `<i class="${i < nk ? '' : 'off'}"></i>`).join('');
    }
    this._set('gg', e.ggtier, 'textContent', v.gungame ? `Tier ${Math.min(v.tier + 1, GUN_GAME_LADDER.length)} / ${GUN_GAME_LADDER.length}` : '');

    // crosshair: gap follows the real spread cone; hidden when aiming, sprinting is still shown
    const showCross = v.alive && v.ads < 0.6 && !v.knife && !v.scoped;
    this._set('chv', e.cross.style, 'display', showCross || (v.alive && v.knife) ? 'block' : 'none');
    if (showCross) {
      const gap = Math.round(4 + v.spread * v.pxPerDeg);
      if (this.cache.gap !== gap) {
        this.cache.gap = gap;
        this.ch.l.style.left = -gap - 9 + 'px'; this.ch.r.style.left = gap + 'px'; this.ch.u.style.top = -gap - 9 + 'px'; this.ch.d.style.top = gap + 'px';
      }
      this._set('cho', e.cross.style, 'opacity', String(1 - v.ads));
      this._set('chl', this.ch.l.style, 'display', 'block'); this._set('chr', this.ch.r.style, 'display', 'block'); this._set('chu', this.ch.u.style, 'display', 'block'); this._set('chd', this.ch.d.style, 'display', 'block');
    } else if (v.knife) {
      this._set('chl', this.ch.l.style, 'display', 'none'); this._set('chr', this.ch.r.style, 'display', 'none'); this._set('chu', this.ch.u.style, 'display', 'none'); this._set('chd', this.ch.d.style, 'display', 'none');
      this._set('cho', e.cross.style, 'opacity', '1');
    }
    this._set('sc', e.scope.style, 'display', v.scoped ? 'block' : 'none');
    this._set('scl', e.scope, 'className', v.scoped === 'lite' ? 'lite' : '');

    let msg = '';
    if (v.alive) {
      if (v.reloading) msg = 'Reloading';
      else if (!v.knife && v.ammo === 0 && v.res === 0) msg = 'No ammo';
      else if (!v.knife && v.ammo <= v.mag * 0.25 && v.res > 0) msg = 'Reload';
    }
    this._set('msg', e.msg, 'textContent', msg);
    const cooking = v.cook >= 0;
    this._set('ck', e.cook, 'className', cooking ? '' : 'hidden');
    if (cooking) e.cook.firstChild.style.width = Math.min(100, (v.cook / FRAG.fuse) * 100) + '%';

    // scores
    const clock = fmtTime(v.clock);
    this._set('clk', e.clock, 'textContent', v.phase === 'countdown' ? '—' : clock);
    this._set('clkc', e.clock, 'className', 't' + (v.phase === 'live' && v.clock < 30 ? ' low' : ''));
    if (v.mode === 'tdm') {
      this._set('sA', e.sA, 'textContent', String(v.teamScore[v.myTeam])); this._set('sB', e.sB, 'textContent', String(v.teamScore[1 - v.myTeam]));
      this._set('lA', e.lA, 'textContent', 'Your team'); this._set('lB', e.lB, 'textContent', 'Enemy');
    } else {
      this._set('sA', e.sA, 'textContent', String(v.myScore)); this._set('sB', e.sB, 'textContent', String(v.topScore));
      this._set('lA', e.lA, 'textContent', v.mode === 'gungame' ? 'Your tier' : 'You'); this._set('lB', e.lB, 'textContent', v.mode === 'gungame' ? 'Top rival' : 'Top rival');
    }

    // damage vignette + low health tint
    const base = v.alive ? Math.max(0, (40 - v.hp) / 40) * 0.5 : 0;
    const a = Math.min(1, this.dmgAlpha + base);
    this._set('dmg', e.dmg.style, 'opacity', a.toFixed(2));
  }

  tick(dt, viewYaw) {
    if (this.dmgAlpha > 0) this.dmgAlpha = Math.max(0, this.dmgAlpha - dt * 1.6);
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const d = this.dirs[i];
      d.t -= dt;
      if (d.t <= 0) { d.el.remove(); this.dirs.splice(i, 1); continue; }
      // angle from view direction to the damage source, clockwise
      const ang = Math.atan2(d.x - d.px(), -(d.z - d.pz())) + viewYaw;
      d.el.style.transform = `rotate(${ang}rad)`; d.el.style.opacity = Math.min(1, d.t / 0.5);
    }
  }

  damageFrom(x, z, getX, getZ, amount) {
    this.dmgAlpha = Math.min(0.9, this.dmgAlpha + 0.25 + amount / 120);
    if (this.dirs.length > 5) { const o = this.dirs.shift(); o.el.remove(); }
    const el = document.createElement('div'); el.className = 'dd'; this.el.dirs.appendChild(el);
    this.dirs.push({ el, x, z, px: getX, pz: getZ, t: 1.6 });
  }

  hitmarker(head, kill) {
    const h = this.el.hit;
    h.className = (kill ? 'kill ' : head ? 'head ' : '');
    void h.offsetWidth; // restart the animation
    h.className += 'show';
  }

  killFeed(killer, victim, weapon, opts) {
    const kf = this.el.killfeed, d = document.createElement('div');
    d.className = 'kf' + (opts.mine ? ' mine' : '');
    const tag = (opts.head ? ' · HS' : '') + (opts.back ? ' · BACK STAB' : '');
    d.innerHTML = (killer ? `<span class="${opts.killerFriend ? 'f' : 'e'}">${esc(killer)}</span>` : '') + `<span class="w">${esc(WEAPON_LABEL(weapon))}${tag}</span><span class="${opts.victimFriend ? 'f' : 'e'}">${esc(victim)}</span>`;
    kf.appendChild(d);
    while (kf.children.length > 6) kf.firstChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  xpPopup(amount, reason) {
    const d = document.createElement('div'); d.className = 'xp';
    d.innerHTML = `<b>+${amount}</b>${esc(reason)}`;
    this.el.xp.appendChild(d);
    while (this.el.xp.children.length > 5) this.el.xp.firstChild.remove();
    setTimeout(() => d.remove(), 2300);
  }

  bigMessage(title, sub) {
    const b = this.el.big;
    if (!title) { if (this.cache.big) { b.style.display = 'none'; this.cache.big = ''; } return; }
    const k = title + '|' + sub;
    if (this.cache.big === k) return;
    this.cache.big = k; b.style.display = 'block'; b.firstChild.textContent = title; b.lastChild.textContent = sub || '';
  }

  death(show, text) {
    this._set('dth', this.el.death, 'className', show ? 'show' : '');
    if (show) this._set('dtm', this.el.deathmsg, 'innerHTML', text);
  }

  stats(text) { this._set('stat', this.el.stat, 'textContent', text); }

  // ------------------------------------------------------------ scoreboard
  scoreboard(show, client) {
    if (!show) { if (this.sbVisible) { this.el.sb.style.display = 'none'; this.sbVisible = false; } return; }
    this.sbVisible = true; this.el.sb.style.display = 'block';
    this.el.sb.innerHTML = scoreboardHTML(client);
  }
}

/** Scoreboard markup shared by the Tab overlay and the post-match screen. */
export function scoreboardHTML(client, result) {
  const mode = MODES[client.settings.mode];
  const rows = [];
  const src = result ? result.pl : null;
  if (src) for (const r of src) rows.push({ id: r[0], k: r[1], d: r[2], a: r[3], score: r[4], tier: r[5], ping: r[6] });
  else for (const [id, s] of client.scores) rows.push({ id, ...s });
  rows.sort((a, b) => (b.score - a.score) || (b.k - a.k) || (a.d - b.d));
  const head = `<tr><th>Player</th><th>${mode.id === 'gungame' ? 'Tier' : 'Score'}</th><th>K</th><th>D</th><th>A</th><th>Ping</th></tr>`;
  const row = (r) => {
    const p = client.roster.get(r.id); if (!p) return '';
    const rem = client.remote.get(r.id), dead = r.id === client.id ? !client.state.alive : rem ? !(rem.flags & 1) : false;
    const sc = mode.id === 'gungame' ? Math.min(r.tier + 1, GUN_GAME_LADDER.length) : r.score;
    return `<tr class="${r.id === client.id ? 'me ' : ''}${mode.teams ? 't' + p.team : ''}${dead && !result ? ' dead' : ''}"><td>${esc(p.name)}${p.isHost ? ' <em style="color:var(--accent);font-style:normal;font-size:10px">HOST</em>' : ''}</td><td>${sc}</td><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td><td>${p.bot ? '—' : r.ping}</td></tr>`;
  };
  const teams = result ? result.teams : client.teamScore;
  let body;
  if (mode.teams) {
    const my = client.me ? client.me.team : 0;
    const t = (team) => `<div><h4><span style="color:var(${team === my ? '--friend' : '--enemy'})">${team === my ? 'Your team' : 'Enemy team'}</span><span>${teams[team]}</span></h4><table class="sb">${head}${rows.filter((r) => client.roster.get(r.id) && client.roster.get(r.id).team === team).map(row).join('')}</table></div>`;
    body = `<div class="cols">${t(my)}${t(1 - my)}</div>`;
  } else body = `<div class="cols one"><table class="sb">${head}${rows.map(row).join('')}</table></div>`;
  return `<div class="sbx"><h4><span>${esc(mode.name)} · ${esc(client.mapDef ? client.mapDef.name : '')}</span><span>${mode.id === 'gungame' ? 'Knife kill on the final tier wins' : 'First to ' + client.settings.scoreLimit}</span></h4>${body}</div>`;
}
