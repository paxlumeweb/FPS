// Application bootstrap and top-level flow: menus <-> lobby <-> match.

import { CONFIG } from './config.js';
import { Settings } from './core/settings.js';
import { Profile } from './core/profile.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { Renderer } from './render/renderer.js';
import { Showcase } from './render/showcase.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/screens.js';
import { GameClient } from './gameclient.js';
import { HostSession } from './net/host.js';
import { ClientSession } from './net/client.js';
import { createHostTransport, createClientTransport } from './net/transport.js';
import { getMap, MAP_IDS } from './game/maps/index.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I)
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');

class App {
  constructor() {
    this.debug = CONFIG.debug;
    this.settings = new Settings();
    this.profile = new Profile();
    if (!this.settings.get('name')) this.settings.set('name', 'Player' + ((Math.random() * 900 + 100) | 0));
    this.audio = new AudioEngine(this.settings);
    const canvas = document.getElementById('game');
    this.input = new Input(this.settings, canvas);
    this.renderer = new Renderer(canvas, this.settings);
    this.showcase = new Showcase();
    this.hud = new HUD(document.getElementById('hud'));
    this.ui = new UI(this);
    this.game = new GameClient(this);
    this.client = null; this.hostSession = null; this.inMatch = false;
    this.time = 0; this.last = performance.now();

    this.renderer.setMap(getMap(MAP_IDS[0]));
    this.input.onLockChange = (locked) => this._onLock(locked);
    canvas.addEventListener('click', () => { this.audio.init(); if (this.inMatch && !this.ui.current) this.input.lock(); });
    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || this.input.capture) return;
      if (this.inMatch && this.ui.current === 'pause') this.resume();
      else if (this.ui.current === 'loadout' || this.ui.current === 'settings' || this.ui.current === 'career' || this.ui.current === 'play') this.ui.back();
    });
    addEventListener('pointerdown', () => this.audio.init(), { once: true });
    addEventListener('beforeunload', () => { this.profile.save(); if (this.hostSession) this.hostSession.close(); });
    this.settings.onChange((k) => { if (k === 'fov' && !this.inMatch) this.renderer.camera.updateProjectionMatrix(); });

    const params = new URLSearchParams(location.search);
    const join = (params.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (join) { this.ui.joinCode = join; this.ui.show('play'); } else this.ui.show('main');
    document.getElementById('boot').classList.add('done');
    requestAnimationFrame(() => this._loop());
  }

  // ------------------------------------------------------------------ session management
  _newClient(transport) {
    const c = new ClientSession(transport, { name: this.settings.get('name') || 'Player', loadout: this.profile.fixLoadout() });
    c.on('lobby', () => {
      if (!this.inMatch) { if (c.settings && this.renderer.mapDef.id !== c.settings.map) this.renderer.setMap(getMap(c.settings.map)); }
      if (this.ui.current === 'lobby' || this.ui.current === 'play') this.ui.show('lobby');
    });
    c.on('refused', (reason) => { this.ui.playError = reason; this._teardown(); this.ui.busy = false; this.ui.show('play'); });
    c.on('close', (reason) => { this.ui.toast(reason || 'Disconnected.', 'bad'); this._teardown(); this.ui.show('main'); });
    c.on('start', () => this._startMatch());
    c.on('tolobby', () => this._endMatchToLobby());
    c.on('spawn', (m) => this.game.onSpawn(m));
    c.on('shot', (m) => this.game.active && this.game.onShot(m));
    c.on('melee', (m) => this.game.active && this.game.onMelee(m));
    c.on('boom', (m) => this.game.active && this.game.onBoom(m));
    c.on('bounce', (m) => this.game.active && this.game.onBounce(m));
    c.on('hit', (m) => this.game.active && this.game.onHit(m));
    c.on('damage', (m) => this.game.active && this.game.onDamage(m));
    c.on('kill', (m) => this.game.active && this.game.onKill(m));
    c.on('xp', (m) => this.game.active && this.game.onXp(m));
    c.on('phase', (m) => this.game.active && this.game.onPhase(m));
    c.on('end', (m) => this.game.active && this.game.onEnd(m));
    return c;
  }

  async host() {
    if (this.ui.busy) return;
    this.ui.busy = 'host'; this.ui.playError = ''; this.ui.refresh('play');
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeCode();
      const hs = new HostSession(createHostTransport(), code);
      try {
        await hs.start();
        this.hostSession = hs;
        this.client = this._newClient(hs.localTransport());
        await this.client.connect(code);
        this.ui.busy = false;
        this.ui.show('lobby');
        return;
      } catch (e) { lastErr = e; hs.close(); if (!/in use/.test(e.message)) break; }
    }
    this.ui.busy = false; this.ui.playError = (lastErr && lastErr.message) || 'Could not create a room.'; this.ui.refresh('play');
  }

  async join(code) {
    if (this.ui.busy) return;
    if (!/^[A-Z0-9]{5}$/.test(code)) { this.ui.playError = 'Room codes are 5 letters/numbers.'; this.ui.refresh('play'); return; }
    this.ui.busy = 'join'; this.ui.playError = ''; this.ui.refresh('play');
    const c = this._newClient(createClientTransport());
    try {
      await c.connect(code);
      this.client = c;
      this.ui.busy = false;
      if (this.ui.current === 'play') this.ui.show('lobby');
    } catch (e) {
      this.ui.busy = false; this.ui.playError = e.message || 'Could not join.'; this.ui.refresh('play');
    }
  }

  leave() { this._teardown(); this.ui.show('main'); }

  _teardown() {
    if (this.inMatch) { this.game.stop(); this.inMatch = false; this.input.enabled = false; this.input.unlock(); }
    this.profile.save();
    if (this.client) { const c = this.client; this.client = null; c.handlers = {}; c.close(); }
    if (this.hostSession) { this.hostSession.close(); this.hostSession = null; }
  }

  onProfileChanged() { if (this.client) this.client.setLoadout(this.profile.data.loadout); }

  // ------------------------------------------------------------------ match flow
  _startMatch() {
    this.inMatch = true; this.input.enabled = true; this.input.clear();
    this.game.start(this.client);
    this.ui.show(null);
    this.input.lock();
    // browsers only grant pointer lock after a click; if it did not engage, show the pause menu
    setTimeout(() => { if (this.inMatch && !this.input.locked && !this.ui.current) { this.game.setPaused(true); this.ui.show('pause'); } }, 400);
  }

  _endMatchToLobby() {
    if (this.inMatch) { this.game.stop(); this.inMatch = false; }
    this.input.enabled = false; this.input.unlock();
    this.profile.save();
    this.ui.show('lobby');
  }

  onMatchEnd(data) { this.input.unlock(); this.ui.showPost(data); }

  resume() { this.ui.show(null); this.input.lock(); setTimeout(() => { if (this.inMatch && !this.input.locked && !this.ui.current) { this.ui.show('pause'); } }, 400); }

  _onLock(locked) {
    if (!this.inMatch) return;
    if (locked) { this.game.setPaused(false); if (this.ui.current === 'pause') this.ui.show(null); }
    else { this.game.setPaused(true); if (!this.ui.current && !this.game.ended) this.ui.show('pause'); }
  }

  onScreen() {}
  onShowcase() {
    const lo = this.profile.data.loadout, id = this.ui.viewWeapon || lo.primary;
    const att = id === lo.primary ? lo.primaryAtt : id === lo.secondary ? lo.secondaryAtt : [];
    this.showcase.set(id, att);
  }

  // ------------------------------------------------------------------ main loop
  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now; this.time += dt;
    // The weapon preview uses a corner of the main canvas as scratch space, so draw it first and
    // let the normal frame paint over it.
    if (this.ui.current === 'loadout') { const el = document.getElementById('showcase'); if (el) this.showcase.render(this.renderer.gl, el, this.time); }
    if (this.inMatch && this.game.active) this.game.frame(dt);
    else { this.renderer.orbit(this.time); this.renderer.viewModel.root.visible = false; this.renderer.render(false); }
  }
}

function boot() {
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) throw new Error('WebGL is not available in this browser.');
    window.BL = new App();
  } catch (e) {
    console.error(e);
    const m = document.getElementById('boot-msg');
    if (m) m.textContent = 'Could not start: ' + (e && e.message ? e.message : e);
  }
}
boot();
