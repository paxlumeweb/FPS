// HostSession: lobby management + match lifecycle on the hosting player's browser.
// It owns the authoritative Sim and talks to players only through a HostTransport, plus one
// loopback link for the host's own client.

import { CONFIG } from '../config.js';
import { Sim } from '../game/sim.js';
import { TICK } from '../game/player.js';
import { MAP_IDS, getMap } from '../game/maps/index.js';
import { MODES, MAX_PLAYERS, END_SCREEN_TIME, defaultSettings, sanitizeSettings } from '../game/modes.js';
import { sanitizeLoadout } from '../game/weapons.js';
import { BOT_NAMES } from '../game/bots.js';
import { Ticker } from '../core/ticker.js';
import { createLoopback } from './transport.js';

const now = () => performance.now() / 1000;
const SILENCE_TIMEOUT = 10; // seconds without any message before a player is dropped
const cleanName = (n) => (String(n || '').replace(/[^\w \-\.]/g, '').trim().slice(0, 16) || 'Player');

export class HostSession {
  constructor(transport, code) {
    this.transport = transport; this.code = code;
    this.settings = sanitizeSettings(defaultSettings(), MAP_IDS);
    this.players = new Map();   // id -> {id, name, team, peer, loadout, isHost, link}
    this.byPeer = new Map();    // transport peer id -> player
    this.bots = [];
    this.nextId = 1;
    this.sim = null; this.phase = 'lobby';
    this.ticker = new Ticker(120, () => this._tick());
    this.acc = 0; this.last = now(); this.endAt = 0; this.lastSweep = 0;
    this.loop = null;
  }

  async start() {
    const t = this.transport;
    t.onPeer = () => {};                       // players are admitted when their 'hello' arrives
    t.onPeerLeft = (peer) => this._left(peer);
    t.onMessage = (peer, m) => this._recv(peer, m, false);
    await t.start(this.code);
    this.ticker.start();
  }

  /** Client transport for the host's own player (zero-latency in-memory link). */
  localTransport() {
    const lb = createLoopback('local');
    this.loop = lb.host;
    lb.host.onMessage = (peer, m) => this._recv(peer, m, true);
    lb.host.onLeft = (peer) => this._left(peer);
    return lb.client;
  }

  close() {
    this.ticker.stop();
    for (const p of this.players.values()) if (!p.isHost) this._sendTo(p, { t: 'bye', reason: 'The host closed the room.' });
    setTimeout(() => this.transport.close(), 200);
    this.sim = null;
  }

  // ------------------------------------------------------------------ plumbing
  _sendTo(p, m, reliable = true) {
    if (p.isHost) { if (this.loop) this.loop.send(m); } else this.transport.send(p.peer, m, reliable);
  }
  _broadcast(m, reliable = true, exceptId) {
    for (const p of this.players.values()) if (p.id !== exceptId) this._sendTo(p, m, reliable);
  }

  _recv(peer, m, isHost) {
    if (!m || typeof m.t !== 'string') return;
    let p = this.byPeer.get(peer);
    if (!p) { if (m.t === 'hello') this._hello(peer, m, isHost); return; }
    p.last = now();
    switch (m.t) {
      case 'bye': this._drop(peer); break;
      case 'c': if (this.sim) this.sim.onCmds(p.id, m.c, m.rt, m.pg); break;
      case 'pi': this._sendTo(p, { t: 'po', c: m.c }); break;
      case 'lo': p.loadout = sanitizeLoadout(m.lo); if (this.sim) this.sim.setLoadout(p.id, p.loadout); break;
      case 'team': if (this.phase === 'lobby' && (m.team === 0 || m.team === 1)) { p.team = m.team; this._sendLobby(); } break;
      case 'name': p.name = cleanName(m.name); this._sendLobby(); break;
      case 'set': if (p.isHost && this.phase === 'lobby') { this.settings = sanitizeSettings(m.s, MAP_IDS); this._sendLobby(); } break;
      case 'go': if (p.isHost) this.startMatch(); break;
      case 'stop': if (p.isHost) this.toLobby(); break;
      default: break;
    }
  }

  _hello(peer, m, isHost) {
    const refuse = (reason) => { if (isHost) this.loop.send({ t: 'no', reason }); else { this.transport.send(peer, { t: 'no', reason }, true); if (this.transport.kick) this.transport.kick(peer); } };
    if (m.v !== CONFIG.protocol) return refuse('Version mismatch: host and player are running different builds. Reload the page on both sides.');
    if (this.players.size >= MAX_PLAYERS) return refuse('The room is full.');
    const p = { id: this.nextId++, name: cleanName(m.name), team: 0, peer, loadout: sanitizeLoadout(m.lo), isHost, last: now() };
    p.team = this._smallerTeam();
    this.players.set(p.id, p); this.byPeer.set(peer, p);
    this._sendTo(p, { t: 'welcome', id: p.id, code: this.code });
    this._sendLobby();
    if (this.sim && this.phase === 'match') {
      // late join: drop bots if the room is over capacity, then enter the running match
      this.sim.addPlayer(p.id, { name: p.name, team: p.team, loadout: p.loadout });
      this._sendTo(p, Object.assign({ t: 'start' }, this.sim.startInfo()));
      this._sendLobby();
    }
  }

  /** Remove a player and close their connection (they left, or went silent). */
  _drop(peer) {
    this._left(peer);
    if (peer !== 'local' && this.transport.kick) this.transport.kick(peer);
  }

  _left(peer) {
    const p = this.byPeer.get(peer);
    if (!p) return;
    this.byPeer.delete(peer); this.players.delete(p.id);
    if (this.sim) this.sim.removePlayer(p.id);
    this._sendLobby();
  }

  _smallerTeam() {
    let a = 0, b = 0;
    for (const p of this.players.values()) (p.team === 0 ? a++ : b++);
    for (const bt of this.bots) (bt.team === 0 ? a++ : b++);
    return a <= b ? 0 : 1;
  }

  _sendLobby() {
    const pl = [];
    for (const p of this.players.values()) pl.push([p.id, p.name, p.team, 0, p.isHost ? 1 : 0]);
    for (const b of this.bots) pl.push([b.id, b.name, b.team, 1, 0]);
    this._broadcast({ t: 'lobby', phase: this.phase, settings: this.settings, pl, code: this.code });
  }

  // ------------------------------------------------------------------ match lifecycle
  startMatch() {
    if (this.phase !== 'lobby') return;
    const settings = this.settings = sanitizeSettings(this.settings, MAP_IDS);
    const mode = MODES[settings.mode];
    const out = {
      send: (id, m, reliable) => { const p = this.players.get(id); if (p) this._sendTo(p, m, reliable); },
      broadcast: (m, reliable, exceptId) => this._broadcast(m, reliable, exceptId),
    };
    this.sim = new Sim({ mapDef: getMap(settings.map), settings, out });
    this.bots = [];
    // keep lobby teams, but fix a lopsided split
    if (mode.teams) {
      const list = [...this.players.values()];
      let a = list.filter((p) => p.team === 0).length, b = list.length - a;
      for (const p of list) {
        if (a - b > 1 && p.team === 0) { p.team = 1; a--; b++; }
        else if (b - a > 1 && p.team === 1) { p.team = 0; a++; b--; }
      }
    }
    const nBots = Math.max(0, Math.min(settings.bots, MAX_PLAYERS - this.players.size));
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < nBots; i++) {
      const b = { id: 100 + i, name: names[i % names.length] + ' [bot]', team: 0 };
      b.team = this._smallerTeam();
      this.bots.push(b);
    }
    for (const p of this.players.values()) this.sim.addPlayer(p.id, { name: p.name, team: p.team, loadout: p.loadout });
    for (const b of this.bots) this.sim.addPlayer(b.id, { name: b.name, team: b.team, bot: true });
    this.phase = 'match'; this.endAt = 0;
    this.acc = 0; this.last = now();
    this._sendLobby();
    this._broadcast(Object.assign({ t: 'start' }, this.sim.startInfo()));
  }

  toLobby() {
    if (this.phase === 'lobby') return;
    this.phase = 'lobby'; this.sim = null; this.bots = [];
    this._broadcast({ t: 'tolobby' });
    this._sendLobby();
  }

  _tick() {
    const t = now();
    let dt = t - this.last; this.last = t;
    // Clients ping once a second even when idle or in a background tab. A WebRTC channel can take
    // a long time to notice that the other side vanished, so drop anyone silent for too long.
    if (t - this.lastSweep > 1) {
      this.lastSweep = t;
      for (const p of [...this.players.values()]) if (!p.isHost && t - p.last > SILENCE_TIMEOUT) this._drop(p.peer);
    }
    if (!this.sim) return;
    if (dt > 0.25) dt = 0.25; // long stall (e.g. machine sleep): do not try to catch up
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK && n < 12) { this.sim.tick(); this.acc -= TICK; n++; }
    if (this.sim.phase === 'ended') {
      if (!this.endAt) this.endAt = t + END_SCREEN_TIME;
      else if (t >= this.endAt) this.toLobby();
    }
  }
}
