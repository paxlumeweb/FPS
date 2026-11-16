// Headless networking test (Node): a HostSession with the host's loopback client plus a remote
// client behind simulated latency/jitter/loss. Verifies the lobby protocol, that prediction and
// the host agree (no mispredictions while moving, jumping, sliding and shooting), that remote
// players are interpolated, and that host-side hit detection damages a target the client aims at.
import { HostSession } from '../src/net/host.js';
import { ClientSession } from '../src/net/client.js';
import { LagTransport } from '../src/net/transport.js';
import { TICK, BTN } from '../src/game/player.js';

let fail = 0;
const check = (ok, msg) => { console.log((ok ? '   ok: ' : '   FAIL: ') + msg); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// in-memory transport pair
class MemHost {
  constructor() { this.peers = new Map(); }
  async start() {}
  send(id, obj) { const c = this.peers.get(id); if (c) { const s = JSON.stringify(obj); setImmediate(() => c.onMessage && c.onMessage(JSON.parse(s))); } }
  close() {}
}
class MemClient {
  constructor(host, id) { this.host = host; this.id = id; }
  async connect() { this.host.peers.set(this.id, this); this.host.onPeer(this.id); }
  send(obj) { const s = JSON.stringify(obj); setImmediate(() => this.host.onMessage(this.id, JSON.parse(s))); }
  close() { this.host.peers.delete(this.id); this.host.onPeerLeft(this.id); }
}

const lag = +(process.argv[2] || 120);
const mem = new MemHost();
const host = new HostSession(mem, 'TEST1');
await host.start();
const lo = { primary: 'kr4', primaryAtt: [], secondary: 'p9', secondaryAtt: [] };
const c1 = new ClientSession(host.localTransport(), { name: 'Hosty', loadout: lo });
const c2 = new ClientSession(new LagTransport(new MemClient(mem, 'remote-1'), { lag, jitter: 20, loss: 2 }), { name: 'Remote', loadout: lo });
let started = 0, hits = 0, kills = 0;
for (const c of [c1, c2]) c.on('start', () => started++);
c1.on('hit', () => hits++); c1.on('kill', () => kills++);
await c1.connect('TEST1'); await c2.connect('TEST1');
await sleep(lag + 150);
check(c1.id > 0 && c2.id > 0 && c1.id !== c2.id, `both clients welcomed (ids ${c1.id}, ${c2.id})`);
check(c1.roster.size === 2 && c2.roster.size === 2, 'lobby roster synced to both clients');
check(c1.isHost && !c2.isHost, 'host flag');
c2.setSettings({ mode: 'ffa', map: 'downtown', scoreLimit: 10, timeLimit: 3, bots: 0 });
await sleep(lag + 100);
check(c1.settings.mode === 'tdm', 'non-host cannot change lobby settings');
c1.setSettings({ mode: 'ffa', map: 'downtown', scoreLimit: 10, timeLimit: 3, bots: 0 });
await sleep(lag + 100);
check(c2.settings.mode === 'ffa', 'host settings reach the remote client');
c1.startMatch();
await sleep(lag + 200);
check(started === 2, 'match started on both clients');

// drive both clients at 60 Hz
const input = [{ b: 0, f: 0, s: 0, yaw: 0, pitch: 0, sel: -1 }, { b: 0, f: 0, s: 0, yaw: 0, pitch: 0, sel: -1 }];
let script = null, shots = 0;
const evs = [];
const timer = setInterval(() => {
  [c1, c2].forEach((c, i) => {
    if (!c.world) return;
    if (script) script(i, input[i], c);
    evs.length = 0;
    c.predict(input[i], evs);
    for (const e of evs) if (e.t === 'fire') shots++;
    c.flush(); c.interpolate(); c.decayError(TICK);
  });
}, 1000 * TICK);

await sleep(5600); // countdown
check(c2.matchPhase === 'live', 'remote client saw the match go live');
c2.mispredicts = 0; c1.mispredicts = 0;
// phase 1: remote client runs around: sprint, jump, slide, strafe, turn
let t = 0;
script = (i, inp) => {
  if (i !== 1) return;
  t++;
  inp.f = 1; inp.s = (t % 90) < 45 ? 1 : -1; inp.yaw += 0.013; inp.b = BTN.SPRINT;
  if (t % 70 === 0) inp.b |= BTN.JUMP;
  if (t % 110 > 100) inp.b |= BTN.CROUCH;
};
await sleep(4000);
const hostP2 = host.sim.players.get(c2.id);
check(Math.hypot(c2.state.x - hostP2.s.x, c2.state.z - hostP2.s.z) < 3, 'remote client and host roughly agree on position while moving');
check(c2.mispredicts === 0, `no mispredictions for the remote client at ${lag}ms (+20 jitter, 2% loss): ${c2.mispredicts}`);
check(c2.pending.length > 0 && c2.pending.length < 40, `unacked inputs in flight: ${c2.pending.length}`);
const r = c1.remote.get(c2.id);
check(!!r && r.speed > 2, `host sees the remote player moving (interpolated speed ${r ? r.speed.toFixed(1) : '-'} m/s)`);
script = (i, inp) => { inp.f = 0; inp.s = 0; inp.b = 0; };
await sleep(lag + 600);
check(Math.hypot(c2.state.x - hostP2.s.x, c2.state.y - hostP2.s.y, c2.state.z - hostP2.s.z) < 1e-6, 'positions converge exactly once inputs stop');

// phase 2: host-side hit detection. Teleport both (on the host) to face each other on the main street.
const hostP1 = host.sim.players.get(c1.id);
Object.assign(hostP1.s, { x: -44, y: 0.1, z: 3, vx: 0, vy: 0, vz: 0 });
Object.assign(hostP2.s, { x: -44, y: 0.1, z: -3, vx: 0, vy: 0, vz: 0 });
hostP1.prot = 0; hostP2.prot = 0;
await sleep(lag + 300);
check(Math.abs(c2.state.x + 44) < 0.01 && Math.abs(c2.state.z + 3) < 0.01, 'remote client accepted the authoritative position correction');
shots = 0; hits = 0;
// c1 looks toward -z (yaw 0) at c2, 6 m away, and holds fire
script = (i, inp, c) => { if (i === 0) { inp.yaw = 0; inp.pitch = -0.05; inp.b = BTN.FIRE | BTN.ADS; } };
await sleep(1500);
script = (i, inp) => { inp.b = 0; };
await sleep(lag + 300);
check(shots > 5, `host client fired (${shots} shots predicted locally)`);
check(hits >= 3, `host-authoritative hit detection registered hits (${hits})`);
check(kills >= 1 || hostP2.hp < 100 || !hostP2.alive, `victim took damage / died on the host (hp ${hostP2.hp}, alive ${hostP2.alive}, kill events ${kills})`);
check(c2.hp < 100 || c2.respawnIn > 0 || c2.spawnCount > 1, 'victim client was told about it');
const sc = c2.scores.get(c1.id);
check(!!sc && sc.k >= 1, `scoreboard synced to the remote client (killer has ${sc ? sc.k : '?'} kills)`);
check(c2.ping > lag * 0.6 && c2.ping < lag * 2 + 60, `measured ping ${c2.ping.toFixed(0)}ms for simulated ${lag}ms`);

clearInterval(timer);
c2.close(); await sleep(100);
check(host.players.size === 1, 'host removed the disconnected player');
host.close(); c1.close();
console.log(fail ? `${fail} FAILED` : 'ALL NET TESTS PASSED');
setTimeout(() => process.exit(fail ? 1 : 0), 300);
