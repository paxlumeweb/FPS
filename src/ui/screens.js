// Menu screens: main, play (host/join), lobby, loadout, career (progress + export/import),
// settings, pause and post-match. Plain DOM built from template strings; clicks are handled with
// one delegated listener using data-act attributes.

import { WEAPONS, PRIMARIES, SECONDARIES, CLASS_NAMES, ATTACHMENTS, SLOT_NAMES, MAX_MASTERY, GUN_GAME_LADDER, attachmentsFor, slotsFor, weaponStats, FRAG, MELEE } from '../game/weapons.js';
import { MODES, TIME_LIMITS, BOT_COUNTS, MAX_PLAYERS } from '../game/modes.js';
import { MAP_LIST } from '../game/maps/index.js';
import { MAX_LEVEL, levelInfo, masteryInfo, unlocksAtLevel } from '../game/progression.js';
import { ACTIONS, QUALITY, codeLabel } from '../core/settings.js';
import { CONFIG } from '../config.js';
import { scoreboardHTML } from './hud.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SCREENS = ['main', 'play', 'lobby', 'loadout', 'career', 'settings', 'pause', 'post'];

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('screens');
    this.toasts = document.getElementById('toasts');
    this.el = {};
    for (const n of SCREENS) {
      const s = document.createElement('section');
      s.className = 'screen' + (n === 'pause' || n === 'post' ? ' center' : ''); s.id = 's-' + n;
      this.root.appendChild(s); this.el[n] = s;
    }
    this.current = null; this.returnTo = 'main';
    this.loadoutTab = 'primary'; this.viewWeapon = null; this.playError = ''; this.busy = false; this.post = null;
    this.root.addEventListener('click', (e) => this._click(e));
    this.root.addEventListener('input', (e) => this._input(e));
    this.root.addEventListener('change', (e) => this._input(e));
    this.root.addEventListener('mouseover', (e) => { const t = e.target.closest('.btn,.card,.witem,.att,.chip'); if (t && t !== this._hover) { this._hover = t; } });
  }

  // ------------------------------------------------------------ basics
  show(name) {
    for (const n of SCREENS) { this.el[n].classList.toggle('active', n === name); if (n !== name) this.el[n].innerHTML = ''; }
    this.current = name;
    if (name) this.render(name);
    this.app.onScreen && this.app.onScreen(name);
  }
  open(name, returnTo) { this.returnTo = returnTo || this.current || 'main'; this.show(name); }
  back() { this.app.audio.ui('back'); this.show(this.returnTo === this.current ? 'main' : this.returnTo); }
  render(name = this.current) { if (name && this['_' + name]) this.el[name].innerHTML = this['_' + name](); if (name === 'loadout') this.app.onShowcase && this.app.onShowcase(); }
  refresh(name) { if (this.current === name) this.render(name); }

  toast(msg, kind = '') {
    const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = msg;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 4200);
  }

  _levelBar(xp = this.app.profile.data.xp, gainFrom) {
    const l = levelInfo(xp);
    let gain = '';
    if (gainFrom !== undefined) { const b = levelInfo(gainFrom); const from = b.level === l.level ? b.frac * 100 : 0; gain = `<i class="gain" style="width:${l.frac * 100}%"></i><i style="width:${from}%"></i>`; }
    else gain = `<i style="width:${l.frac * 100}%"></i>`;
    return `<div class="lvl"><div class="badge">${l.level}</div><div class="meta"><span><b>Level ${l.level}${l.max ? ' · MAX' : ''}</b><em style="font-style:normal">${l.max ? xp.toLocaleString() + ' XP' : l.into.toLocaleString() + ' / ' + l.need.toLocaleString() + ' XP'}</em></span><div class="bar">${gain}</div></div></div>`;
  }

  // ------------------------------------------------------------ main
  _main() {
    const { settings, profile } = this.app;
    return `<div class="wrap">
      <div class="logo">BREACHLINE<small>PEER-TO-PEER MULTIPLAYER FPS</small></div>
      <div class="panel playercard"><h2>Callsign</h2><input id="name" maxlength="16" placeholder="Enter a name" value="${esc(settings.get('name'))}" spellcheck="false">${this._levelBar()}</div>
      <div class="menu">
        <button class="btn primary" data-act="nav" data-arg="play">Play</button>
        <button class="btn" data-act="nav" data-arg="loadout">Loadout</button>
        <button class="btn" data-act="nav" data-arg="career">Career &amp; Backup</button>
        <button class="btn" data-act="nav" data-arg="settings">Settings</button>
      </div>
      <div class="footer-note">v${CONFIG.version} · Host a room and share the 5-letter code with friends, or add bots in the lobby to play solo.${profile.storageOk ? '' : '<br><b style="color:var(--bad)">Browser storage is unavailable — progress will not be saved in this tab.</b>'}</div>
    </div>`;
  }

  // ------------------------------------------------------------ play
  _play() {
    const be = CONFIG.net.backend;
    const beName = { peerjs: 'Internet (peer-to-peer via PeerJS)', cloudflare: 'Internet (Cloudflare relay)', local: 'This browser only (tabs on this computer)' };
    const opts = ['peerjs', 'local'].concat(CONFIG.net.cloudflare.url ? ['cloudflare'] : []).map((k) => `<option value="${k}" ${k === be ? 'selected' : ''}>${beName[k]}</option>`).join('');
    return `<div class="wrap">
      <div class="topbar"><button class="btn ghost small" data-act="back">← Back</button><h1>Play</h1></div>
      <div class="row" style="align-items:stretch;max-width:920px">
        <div class="panel grow"><h2>Host a match</h2>
          <p class="hint">Creates a room and gives you a code to share. Your browser runs the match, so keep this tab open. You can add bots in the lobby.</p>
          <div class="field"><label>Connection</label><select id="backend">${opts}</select></div>
          <button class="btn primary" data-act="host" ${this.busy ? 'disabled' : ''}>${this.busy === 'host' ? 'Creating…' : 'Create room'}</button>
        </div>
        <div class="panel grow"><h2>Join a match</h2>
          <p class="hint">Enter the room code your host shared with you.</p>
          <div class="field"><input id="joincode" class="codeinput" type="text" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" value="${esc(this.joinCode || '')}"></div>
          <button class="btn primary" data-act="join" ${this.busy ? 'disabled' : ''}>${this.busy === 'join' ? 'Connecting…' : 'Join'}</button>
        </div>
      </div>
      <div class="error" style="margin-top:14px">${esc(this.playError)}</div>
    </div>`;
  }

  // ------------------------------------------------------------ lobby
  _lobby() {
    const c = this.app.client;
    if (!c || !c.settings) return '<div class="wrap"><h1>Connecting…</h1></div>';
    const host = c.isHost, s = c.settings, mode = MODES[s.mode], ro = host ? '' : ' ro';
    const players = [...c.roster.values()];
    const modeCards = Object.values(MODES).map((m) => `<div class="card${ro}${m.id === s.mode ? ' sel' : ''}" data-act="set" data-k="mode" data-v="${m.id}"><b>${m.name}</b><span>${m.desc}</span></div>`).join('');
    const mapCards = MAP_LIST.map((m) => `<div class="card${ro}${m.id === s.map ? ' sel' : ''}" data-act="set" data-k="map" data-v="${m.id}"><b>${m.name}</b><span>${m.desc}</span></div>`).join('');
    const chips = (k, list, cur, fmt) => list.map((v) => `<div class="chip${ro}${v === cur ? ' sel' : ''}" data-act="set" data-k="${k}" data-v="${v}">${fmt ? fmt(v) : v}</div>`).join('');
    const prow = (p) => `<div class="prow ${mode.teams ? 't' + p.team : ''}${p.id === c.id ? ' me' : ''}"><span class="grow">${esc(p.name)}</span>${p.isHost ? '<span class="tag">Host</span>' : ''}${p.bot ? '<span class="tag">Bot</span>' : ''}</div>`;
    let roster;
    if (mode.teams) {
      const my = c.me ? c.me.team : 0;
      const col = (t, label) => `<div class="grow"><div class="teamhead t${t}"><span>${label}</span>${my !== t ? `<button class="btn small" data-act="team" data-arg="${t}">Join</button>` : ''}</div><div class="plist">${players.filter((p) => p.team === t).map(prow).join('') || '<div class="hint">Empty</div>'}</div></div>`;
      roster = `<div class="row">${col(0, 'Team Blue')}${col(1, 'Team Red')}</div>`;
    } else roster = `<div class="plist">${players.map(prow).join('')}</div>`;
    const link = location.origin + location.pathname + '?join=' + c.code + (CONFIG.net.backend !== 'peerjs' ? '&net=' + CONFIG.net.backend : '');
    const inMatch = c.phase === 'match';
    return `<div class="wrap">
      <div class="topbar"><button class="btn ghost small danger" data-act="leave">← Leave</button><h1>Lobby</h1>
        <button class="btn" data-act="nav" data-arg="loadout">Loadout</button><button class="btn" data-act="nav" data-arg="settings">Settings</button></div>
      <div class="row" style="align-items:flex-start">
        <div class="col grow" style="flex:1.6">
          <div class="panel"><h2>Mode</h2><div class="cards">${modeCards}</div></div>
          <div class="panel"><h2>Map</h2><div class="cards">${mapCards}</div></div>
          <div class="panel"><div class="row">
            <div class="grow"><h2>Score limit</h2><div class="chips">${s.mode === 'gungame' ? `<div class="chip sel ro">${GUN_GAME_LADDER.length} tiers (fixed ladder)</div>` : chips('scoreLimit', mode.scoreLimits, s.scoreLimit)}</div></div>
            <div class="grow"><h2>Time limit</h2><div class="chips">${chips('timeLimit', TIME_LIMITS, s.timeLimit, (v) => v + ' min')}</div></div>
            <div class="grow"><h2>Bots</h2><div class="chips">${chips('bots', BOT_COUNTS, s.bots)}</div></div>
          </div>${s.mode === 'gungame' ? '<p class="hint" style="margin:12px 0 0">Gun Game: everyone uses the same weapon ladder. Loadouts, attachments, grenades and progression are disabled.</p>' : ''}</div>
        </div>
        <div class="col grow">
          <div class="panel"><h2>Room code</h2><div class="roomcode"><span class="code">${esc(c.code)}</span><button class="btn small" data-act="copy" data-arg="${esc(c.code)}">Copy code</button><button class="btn small" data-act="copy" data-arg="${esc(link)}">Copy invite link</button></div>
            <p class="hint" style="margin:10px 0 0">Friends: open the game, choose Play → Join, and enter this code (or just open the invite link).</p></div>
          <div class="panel"><h2>Players ${players.length} / ${MAX_PLAYERS}</h2>${roster}</div>
          ${host ? `<button class="btn primary" data-act="start" style="padding:16px">${inMatch ? 'Match in progress…' : 'Start match'}</button>` : `<div class="panel hint">${inMatch ? 'Joining the match in progress…' : 'Waiting for the host to start the match…'}</div>`}
        </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ loadout
  _statRows(id, att) {
    const b = weaponStats(id, []), s = weaponStats(id, att), w = WEAPONS[id];
    const rows = [
      ['Damage', s.dmg * s.pellets, b.dmg * b.pellets, 110, (v) => (w.pellets > 1 ? `${w.dmg}×${w.pellets}` : Math.round(v)), 1],
      ['Fire rate', s.rpm, b.rpm, 950, (v) => Math.round(v) + ' rpm', 1],
      ['Range', s.r0, b.r0, 85, (v) => Math.round(v) + ' m', 1],
      ['Hip accuracy', 9 - s.hip - s.pelletSpread, 9 - b.hip - b.pelletSpread, 8, () => (s.hip + s.pelletSpread).toFixed(1) + '°', 1],
      ['Recoil control', 5.2 - s.recoilV - s.recoilH, 5.2 - b.recoilV - b.recoilH, 4.7, () => (s.recoilV + s.recoilH).toFixed(2), 1],
      ['ADS speed', 0.5 - s.adsTime, 0.5 - b.adsTime, 0.4, () => Math.round(s.adsTime * 1000) + ' ms', 1],
      ['Mobility', s.moveMul - 0.8, b.moveMul - 0.8, 0.3, () => Math.round(s.moveMul * 100) + '%', 1],
      ['Magazine', s.mag, b.mag, 105, (v) => String(v), 1],
      ['Reload', 5 - s.reload, 5 - b.reload, 4, () => s.reload.toFixed(1) + ' s', 1],
    ];
    return rows.map(([k, v, bv, max, fmt]) => {
      const pv = Math.max(2, Math.min(100, (v / max) * 100)), pb = Math.max(2, Math.min(100, (bv / max) * 100));
      const d = Math.abs(v - bv) < 1e-6 ? '' : v > bv ? 'up' : 'down';
      const bar = d === 'up' ? `<i class="up" style="width:${pv}%"></i><i style="width:${pb}%"></i>` : d === 'down' ? `<i class="down" style="width:${pb}%"></i><i style="width:${pv}%"></i>` : `<i style="width:${pv}%"></i>`;
      return `<div class="k">${k}</div><div class="statbar">${bar}</div><div class="v ${d}">${fmt(v)}</div>`;
    }).join('');
  }

  _loadout() {
    const { profile } = this.app, lo = profile.data.loadout, lvl = profile.level.level;
    const tab = this.loadoutTab, list = tab === 'primary' ? PRIMARIES : SECONDARIES;
    const equipped = tab === 'primary' ? lo.primary : lo.secondary;
    if (!this.viewWeapon || !list.includes(this.viewWeapon)) this.viewWeapon = equipped;
    const vid = this.viewWeapon, w = WEAPONS[vid], unlocked = profile.weaponUnlocked(vid);
    const isEq = vid === equipped;
    const att = isEq ? (tab === 'primary' ? lo.primaryAtt : lo.secondaryAtt) : [];
    const m = profile.mastery(vid);
    const items = list.map((id) => {
      const d = WEAPONS[id], un = profile.weaponUnlocked(id), mm = profile.mastery(id);
      return `<div class="witem${id === vid ? ' sel' : ''}${un ? '' : ' locked'}" data-act="viewweapon" data-arg="${id}"><div class="n"><b>${d.name}</b><span>${CLASS_NAMES[d.cls]}</span></div>
        <div class="m">${id === equipped ? '<div class="eq">EQUIPPED</div>' : ''}${un ? 'Mastery ' + mm.level : '🔒 Level ' + d.unlock}</div></div>`;
    }).join('');
    const slots = slotsFor(vid).map((slot) => {
      const opts = attachmentsFor(vid, slot).sort((a, b) => a.lvl - b.lvl).map((a) => {
        const un = m.level >= a.lvl, sel = att.includes(a.id);
        return `<div class="att${sel ? ' sel' : ''}${un && isEq ? '' : ' locked'}" data-act="att" data-arg="${a.id}"><b>${a.name}<em>${un ? (sel ? 'EQUIPPED' : '') : '🔒 Mastery ' + a.lvl}</em></b>
          <div class="pro">${a.pros.map((p) => '+ ' + p).join('<br>')}</div><div class="con">${a.cons.map((p) => '− ' + p).join('<br>')}</div></div>`;
      }).join('');
      return `<div class="slot"><h3>${SLOT_NAMES[slot]}</h3>${opts}</div>`;
    }).join('');
    const gg = this.app.client && this.app.client.settings && this.app.client.settings.mode === 'gungame';
    return `<div class="wrap">
      <div class="topbar"><button class="btn ghost small" data-act="back">← Back</button><h1>Loadout</h1><span class="hint">Player level ${lvl}</span></div>
      ${gg ? '<div class="unlock" style="border-color:var(--accent);background:rgba(245,165,36,.1);margin:0 0 14px">The lobby is set to Gun Game: loadouts are ignored in that mode. Changes here apply to Team Deathmatch and Free-for-All.</div>' : ''}
      <div class="loadout">
        <div class="panel"><div class="tabs"><div class="tab${tab === 'primary' ? ' sel' : ''}" data-act="lotab" data-arg="primary">Primary</div><div class="tab${tab === 'secondary' ? ' sel' : ''}" data-act="lotab" data-arg="secondary">Secondary</div></div>
          <div class="wlist">${items}</div>
          <div class="fixedgear"><div><b>Combat Knife</b>Quick melee · ${MELEE.dmg} dmg · back stab is a one-hit kill</div><div><b>Frag ×${FRAG.count}</b>Hold to cook · ${FRAG.fuse}s fuse</div></div>
        </div>
        <div class="col">
          <div class="panel"><div class="row" style="align-items:flex-start">
            <div class="grow"><h2>${CLASS_NAMES[w.cls]}</h2><h1 style="letter-spacing:.08em">${w.name}</h1><p class="sub" style="margin-bottom:12px">${w.desc}</p>
              ${unlocked ? (isEq ? '<span class="eq">EQUIPPED</span>' : `<button class="btn primary" data-act="equip" data-arg="${vid}">Equip</button>`) : `<span class="hint">🔒 Unlocks at player level ${w.unlock}</span>`}
              <div style="margin-top:16px"><div class="mrow"><span><b>Weapon mastery ${m.level}${m.max ? ' · MAX' : ' / ' + MAX_MASTERY}</b><em>${m.max ? 'Complete' : m.into + ' / ' + m.need + ' XP'}</em></span><div class="bar blue"><i style="width:${m.frac * 100}%"></i></div></div></div>
            </div>
            <div id="showcase" style="width:44%;height:210px;flex:none"></div>
          </div><div class="stats" style="margin-top:14px">${this._statRows(vid, att)}</div></div>
          <div class="panel"><h2>Attachments ${isEq ? '— one per slot, each with trade-offs' : '— equip this weapon to customise it'}</h2><div class="slots">${slots}</div></div>
        </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ career
  _career() {
    const { profile } = this.app, d = profile.data, st = d.stats;
    const kd = st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills.toFixed(2);
    const hrs = (st.seconds / 3600).toFixed(1);
    const next = [];
    for (let l = profile.level.level + 1; l <= MAX_LEVEL && next.length < 3; l++) for (const id of unlocksAtLevel(l)) next.push(`Level ${l}: ${WEAPONS[id].name}`);
    const mrows = [...PRIMARIES, ...SECONDARIES].map((id) => {
      const m = masteryInfo(d.weapons[id] || 0), un = profile.weaponUnlocked(id);
      return `<div class="mrow"><span><b>${WEAPONS[id].name}${un ? '' : ' 🔒'}</b><em>${un ? `Mastery ${m.level}${m.max ? ' · MAX' : ''}` : 'Level ' + WEAPONS[id].unlock}</em></span><div class="bar blue"><i style="width:${m.frac * 100}%"></i></div></div>`;
    }).join('');
    return `<div class="wrap">
      <div class="topbar"><button class="btn ghost small" data-act="back">← Back</button><h1>Career &amp; Backup</h1></div>
      <div class="row" style="align-items:flex-start">
        <div class="col grow">
          <div class="panel"><h2>Player level</h2>${this._levelBar()}<p class="hint" style="margin:12px 0 0">${next.length ? 'Next unlocks — ' + next.join(' · ') : 'Every weapon is unlocked.'}</p>
            <div class="statline" style="margin-top:16px"><div><b>${st.kills}</b><span>Kills</span></div><div><b>${kd}</b><span>K/D</span></div><div><b>${st.headshots}</b><span>Headshots</span></div><div><b>${st.assists}</b><span>Assists</span></div><div><b>${st.wins} / ${st.matches}</b><span>Wins / Matches</span></div><div><b>${hrs}h</b><span>Played</span></div></div></div>
          <div class="panel"><h2>Weapon mastery</h2><div class="mgrid">${mrows}</div><p class="hint" style="margin:12px 0 0">Mastery is earned per weapon by using it in Team Deathmatch and Free-for-All. Each mastery level unlocks an attachment.</p></div>
        </div>
        <div class="col grow">
          <div class="panel"><h2>Back up progress</h2><p class="hint">Progress is stored in this browser only. Copy this code somewhere safe; paste it below on any browser to restore it.</p>
            <textarea id="exportcode" readonly>${esc(profile.exportCode())}</textarea><div style="margin-top:8px"><button class="btn small" data-act="copyexport">Copy code</button></div></div>
          <div class="panel"><h2>Restore progress</h2><textarea id="importcode" placeholder="Paste a progress code (BL1.…)" spellcheck="false"></textarea>
            <div class="error" id="importerr"></div><div class="row"><button class="btn small primary" data-act="import">Import (replaces current progress)</button><span class="spacer"></span><button class="btn small danger" data-act="resetprofile">Reset progress</button></div></div>
        </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ settings
  _settings() {
    const s = this.app.settings, d = s.data;
    const range = (k, label, min, max, step, fmt) => `<div class="setrow"><span>${label}</span><input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${d[k]}"><span class="val" id="val-${k}">${fmt(d[k])}</span></div>`;
    const toggle = (k, label, note = '') => `<div class="setrow"><span>${label}</span><div class="switch${d[k] ? ' on' : ''}" data-act="toggle" data-arg="${k}"></div><span class="hint">${note}</span></div>`;
    const binds = ACTIONS.map(([a, label]) => `<div class="bindrow"><span>${label}</span><div class="keycap${this.listening === a ? ' listening' : ''}" data-act="rebind" data-arg="${a}">${this.listening === a ? 'Press a key…' : codeLabel(d.binds[a])}</div></div>`).join('');
    const quality = Object.entries(QUALITY).map(([k, q]) => `<div class="chip${d.quality === k ? ' sel' : ''}" data-act="quality" data-arg="${k}">${q.label}</div>`).join('');
    return `<div class="wrap">
      <div class="topbar"><button class="btn ghost small" data-act="back">← Back</button><h1>Settings</h1></div>
      <div class="setgrid">
        <div class="col">
          <div class="panel"><h2>Mouse &amp; view</h2>
            ${range('sens', 'Mouse sensitivity', 0.1, 4, 0.05, (v) => (+v).toFixed(2))}
            ${range('adsSens', 'ADS sensitivity multiplier', 0.3, 2, 0.05, (v) => (+v).toFixed(2))}
            ${range('fov', 'Field of view (vertical)', 60, 105, 1, (v) => Math.round(v) + '°')}
            ${toggle('invertY', 'Invert Y axis')}${toggle('toggleCrouch', 'Toggle crouch')}${toggle('toggleAds', 'Toggle aim')}${toggle('headBob', 'Head bob')}
            <p class="hint" style="margin:10px 0 0">Mouse look uses Pointer Lock with raw (unaccelerated) input where the browser supports it.</p></div>
          <div class="panel"><h2>Graphics</h2><div class="chips" style="margin-bottom:10px">${quality}</div>
            <p class="hint" style="margin:0 0 6px">Low: no shadows, simple materials, 75% resolution. Medium: shadows + PBR materials. High / Ultra: sharper shadows and higher resolution.</p>
            ${toggle('antialias', 'Anti-aliasing', 'reload to apply')}${toggle('showFps', 'Show FPS / ping')}</div>
          <div class="panel"><h2>Audio</h2>${range('volume', 'Master volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}</div>
        </div>
        <div class="panel"><h2>Key bindings</h2>${binds}
          <div class="row" style="margin-top:12px"><button class="btn small" data-act="resetbinds">Reset to defaults</button><span class="hint">Click a binding, then press a key or mouse button. Esc cancels. Esc (pause) is fixed.</span></div>
          <p class="hint">Tip: avoid Ctrl for crouch — browsers reserve Ctrl+W (close tab) and it cannot be blocked.</p></div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ pause
  _pause() {
    const c = this.app.client, host = c && c.isHost;
    const gg = c && c.settings && c.settings.mode === 'gungame';
    return `<div class="wrap" style="max-width:420px;justify-content:center"><div class="panel">
      <h1 style="margin-bottom:16px">Paused</h1>
      <div class="menu" style="width:auto;margin:0">
        <button class="btn primary" data-act="resume">Resume</button>
        <button class="btn" data-act="nav" data-arg="loadout" ${gg ? 'disabled title="Loadouts are disabled in Gun Game"' : ''}>Loadout${gg ? ' (disabled in Gun Game)' : ''}</button>
        <button class="btn" data-act="nav" data-arg="settings">Settings</button>
        ${host ? '<button class="btn danger" data-act="endmatch">End match (back to lobby)</button>' : ''}
        <button class="btn danger" data-act="leave">Leave ${host ? '& close room' : 'match'}</button>
      </div>
      <p class="hint" style="margin:14px 0 0">The match keeps running while this menu is open. Loadout changes apply on your next spawn.</p>
    </div></div>`;
  }

  // ------------------------------------------------------------ post-match
  showPost(data) { this.post = data; this.show('post'); }
  _post() {
    const p = this.post; if (!p) return '';
    const { profile } = this.app, c = this.app.client, mode = MODES[c.settings.mode];
    const title = p.draw ? 'DRAW' : p.won ? 'VICTORY' : 'DEFEAT';
    let prog;
    if (!mode.progression) prog = '<div class="panel"><h2>Progression</h2><p class="hint">Gun Game does not use loadouts and awards no XP. Play Team Deathmatch or Free-for-All to level up.</p></div>';
    else {
      const x = p.xp, before = x.before;
      const items = [...x.items.entries()].sort((a, b) => b[1].xp - a[1].xp).map(([k, v]) => `<div><span>${esc(k)}${v.n > 1 ? ' ×' + v.n : ''}</span><b>+${v.xp}</b></div>`).join('') || '<div><span>No XP earned</span><b>+0</b></div>';
      const lb = levelInfo(before.xp), la = profile.level;
      const unlocks = [];
      for (let l = lb.level + 1; l <= la.level; l++) for (const id of unlocksAtLevel(l)) unlocks.push(`<div class="unlock">Level ${l} — unlocked <b>${WEAPONS[id].name}</b></div>`);
      if (la.level > lb.level && !unlocks.length) unlocks.push(`<div class="unlock">Reached level ${la.level}</div>`);
      const wrows = [...x.weapons.entries()].map(([id, gain]) => {
        const mb = masteryInfo(before.weapons[id] || 0), ma = profile.mastery(id);
        const un = Object.values(ATTACHMENTS).filter((a) => a.lvl > mb.level && a.lvl <= ma.level && !a.not.includes(WEAPONS[id].cls)).map((a) => a.name);
        return `<div class="mrow" style="margin-bottom:10px"><span><b>${WEAPONS[id].name} · Mastery ${ma.level}${ma.max ? ' MAX' : ''}</b><em>+${gain} weapon XP</em></span><div class="bar blue"><i class="gain" style="width:${ma.frac * 100}%"></i><i style="width:${mb.level === ma.level ? mb.frac * 100 : 0}%"></i></div>${un.length ? `<div class="unlock">Unlocked ${un.join(', ')}</div>` : ''}</div>`;
      }).join('') || '<p class="hint">No weapon XP this match.</p>';
      prog = `<div class="panel"><h2>XP earned · +${x.total.toLocaleString()}</h2><div class="xplist">${items}</div></div>
        <div class="panel"><h2>Player level</h2>${this._levelBar(profile.data.xp, before.xp)}${unlocks.join('')}</div>
        <div class="panel"><h2>Weapon mastery</h2>${wrows}</div>`;
    }
    return `<div class="wrap">
      <div class="banner ${p.draw ? '' : p.won ? 'win' : 'loss'}">${title}</div>
      <p class="sub" style="text-align:center">${esc(mode.name)} · ${esc(c.mapDef.name)} · ${p.result.reason === 'time' ? 'Time limit reached' : 'Score limit reached'}</p>
      <div class="row" style="align-items:flex-start"><div class="panel grow" style="flex:1.4">${scoreboardHTML(c, p.result)}</div><div class="col grow">${prog}</div></div>
      <p class="hint" style="text-align:center;margin-top:16px">Returning to the lobby shortly…</p>
    </div>`;
  }

  // ------------------------------------------------------------ events
  _input(e) {
    const t = e.target, app = this.app;
    if (t.id === 'name') { app.settings.set('name', t.value.slice(0, 16)); return; }
    if (t.id === 'joincode') { t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); this.joinCode = t.value; return; }
    if (t.id === 'backend') { CONFIG.net.backend = t.value; return; }
    if (t.dataset.set) {
      const k = t.dataset.set, v = +t.value;
      app.settings.set(k, v);
      const lab = document.getElementById('val-' + k);
      if (lab) lab.textContent = k === 'fov' ? Math.round(v) + '°' : k === 'volume' ? Math.round(v * 100) + '%' : v.toFixed(2);
      if (k === 'volume' && e.type === 'change') app.audio.ui('click');
    }
  }

  _click(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const app = this.app, act = t.dataset.act, arg = t.dataset.arg;
    if (t.disabled || t.classList.contains('ro')) return;
    app.audio.init();
    if (act !== 'back') app.audio.ui('click');
    switch (act) {
      case 'nav': this.open(arg, this.current); break;
      case 'back': this.back(); break;
      case 'host': app.host(); break;
      case 'join': app.join((document.getElementById('joincode').value || '').trim().toUpperCase()); break;
      case 'leave': app.leave(); break;
      case 'start': app.client && app.client.startMatch(); break;
      case 'endmatch': app.client && app.client.stopMatch(); break;
      case 'resume': app.resume(); break;
      case 'team': app.client && app.client.setTeam(+arg); break;
      case 'set': {
        const c = app.client; if (!c || !c.isHost) break;
        const s = Object.assign({}, c.settings), k = t.dataset.k, v = t.dataset.v;
        s[k] = k === 'mode' || k === 'map' ? v : +v;
        if (k === 'mode') s.scoreLimit = MODES[v].defaultScore;
        c.setSettings(s);
        break;
      }
      case 'copy': this._copy(arg); break;
      case 'copyexport': this._copy(document.getElementById('exportcode').value); break;
      case 'import': {
        const r = app.profile.importCode(document.getElementById('importcode').value);
        if (r.ok) { this.toast('Progress restored.', 'good'); app.onProfileChanged(); this.render('career'); }
        else document.getElementById('importerr').textContent = r.error;
        break;
      }
      case 'resetprofile':
        if (t.dataset.sure) { app.profile.reset(); app.onProfileChanged(); this.toast('Progress reset.'); this.render('career'); }
        else { t.dataset.sure = '1'; t.textContent = 'Click again to confirm'; }
        break;
      case 'lotab': this.loadoutTab = arg; this.viewWeapon = null; this.render('loadout'); break;
      case 'viewweapon': this.viewWeapon = arg; this.render('loadout'); break;
      case 'equip': {
        const lo = Object.assign({}, app.profile.data.loadout);
        if (!app.profile.weaponUnlocked(arg)) break;
        if (this.loadoutTab === 'primary') { lo.primary = arg; lo.primaryAtt = []; } else { lo.secondary = arg; lo.secondaryAtt = []; }
        app.profile.setLoadout(lo); app.onProfileChanged(); this.render('loadout');
        break;
      }
      case 'att': {
        const lo = JSON.parse(JSON.stringify(app.profile.data.loadout)), prim = this.loadoutTab === 'primary';
        const wid = prim ? lo.primary : lo.secondary;
        if (wid !== this.viewWeapon || !app.profile.attachmentUnlocked(wid, arg)) break;
        let list = prim ? lo.primaryAtt : lo.secondaryAtt;
        const slot = ATTACHMENTS[arg].slot;
        if (list.includes(arg)) list = list.filter((a) => a !== arg);
        else list = list.filter((a) => ATTACHMENTS[a].slot !== slot).concat(arg);
        if (prim) lo.primaryAtt = list; else lo.secondaryAtt = list;
        app.profile.setLoadout(lo); app.onProfileChanged(); this.render('loadout');
        break;
      }
      case 'toggle': app.settings.set(arg, !app.settings.get(arg)); this.render('settings'); break;
      case 'quality': app.settings.set('quality', arg); app.renderer.applyQuality(); this.render('settings'); break;
      case 'rebind':
        this.listening = arg; this.render('settings');
        // defer so the click that opened the prompt is not captured as the new binding
        setTimeout(() => { app.input.capture = (code) => { if (code) app.settings.bind(arg, code); this.listening = null; this.refresh('settings'); }; }, 0);
        break;
      case 'resetbinds': app.settings.resetBinds(); this.render('settings'); break;
      default: break;
    }
  }

  _copy(text) {
    const done = () => this.toast('Copied to clipboard.', 'good');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => this._copyFallback(text, done));
    else this._copyFallback(text, done);
  }
  _copyFallback(text, done) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { this.toast('Copy failed — select the text and copy it manually.', 'bad'); }
    ta.remove();
  }
}
