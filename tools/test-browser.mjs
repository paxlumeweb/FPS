// End-to-end two-player test in a real browser (needs Playwright + Chromium):
//   node tools/test-browser.mjs                 two tabs over the 'local' backend
//   node tools/test-browser.mjs --net=peerjs    two tabs over real WebRTC, using a local PeerJS
//                                               server (start it first: npm run peer-server)
//   node tools/test-browser.mjs --net=cloudflare --relay=ws://127.0.0.1:8787
//                                               two tabs through the Worker relay (wrangler dev)
// Start the static server first: npm start
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const net = arg('net', 'local'), base = arg('url', 'http://localhost:8080/'), lag = arg('lag', '0');
const q = net === 'cloudflare' ? `?net=cloudflare&relay=${encodeURIComponent(arg('relay', 'ws://127.0.0.1:8787'))}&debug` : net === 'peerjs' ? `?net=peerjs&peerhost=${arg('peerhost', 'localhost')}&peerport=${arg('peerport', '9000')}&peerpath=/&debug` : '?net=local&debug';
let fail = 0;
const check = (ok, msg) => { console.log((ok ? '   ok: ' : '   FAIL: ') + msg); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('breachline.settings.v1')) localStorage.setItem('breachline.settings.v1', JSON.stringify({ quality: 'low', antialias: false, name: 'P' + Math.floor(Math.random() * 1000) })); } catch (e) {} });
const logs = [];
const open = async (tag, url) => {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') logs.push(tag + ' console.error: ' + m.text()); });
  p.on('pageerror', (e) => logs.push(tag + ' PAGE ERROR: ' + e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.BL && window.BL.ui.current);
  return p;
};
// drive input directly (headless tabs cannot both hold pointer lock)
const control = (p) => p.evaluate(() => { const B = window.BL; B.input.locked = true; B.game.setPaused(false); if (B.ui.current === 'pause') B.ui.show(null); });
const hold = (p, code, on = true) => p.evaluate(([c, on]) => { const d = window.BL.input.down; on ? d.add(c) : d.delete(c); }, [code, on]);
const look = (p, yawDeg, pitchDeg = 0) => p.evaluate(([y, pt]) => { window.BL.game.viewYaw = y * Math.PI / 180; window.BL.game.viewPitch = pt * Math.PI / 180; }, [yawDeg, pitchDeg]);
const st = (p) => p.evaluate(() => { window._dd = Math.max(window._dd || 0, document.querySelectorAll('.dd').length); const B = window.BL, c = B.client, s = c.state; return { id: c.id, phase: c.matchPhase, x: s.x, y: s.y, z: s.z, alive: s.alive, hp: c.hp, ammo: s.w[s.slot].ammo, weapon: s.w[s.slot].id, nades: s.nades, misp: c.mispredicts || 0, ping: c.ping, remote: [...c.remote.values()].map((r) => ({ id: r.id, x: r.x, z: r.z, flags: r.flags })), scores: Object.fromEntries(c.scores), team: c.teamScore, xp: B.profile.data.xp, wxp: B.profile.data.weapons, screen: B.ui.current, feed: document.querySelectorAll('.kf').length, dd: window._dd, hit: document.getElementById('hitmarker').className }; });

console.log(`two-tab test over '${net}'` + (lag !== '0' ? ` with ${lag}ms simulated latency on the joining tab` : ''));
const A = await open('[host]', base + q);
await A.click('[data-act="nav"][data-arg="play"]');
await A.click('[data-act="host"]');
await A.waitForFunction(() => window.BL.ui.current === 'lobby' && window.BL.client && window.BL.client.settings, null, { timeout: 20000 });
const code = await A.evaluate(() => window.BL.client.code);
check(/^[A-Z0-9]{5}$/.test(code), `host created room ${code}`);

const B = await open('[join]', base + q + (lag !== '0' ? `&lag=${lag}&jitter=15` : ''));
await B.click('[data-act="nav"][data-arg="play"]');
await B.fill('#joincode', code);
await B.click('[data-act="join"]');
await B.waitForFunction(() => window.BL.ui.current === 'lobby' && window.BL.client && window.BL.client.roster.size === 2, null, { timeout: 30000 });
check(true, 'second tab joined the lobby with the room code');
check(await A.evaluate(() => window.BL.client.roster.size === 2), 'host sees both players in the lobby');
check(await B.evaluate(() => !window.BL.client.isHost && !document.querySelector('[data-act="start"]')), 'joining player has no start button');

// wrong code is refused cleanly
const C = await open('[bad]', base + q);
await C.click('[data-act="nav"][data-arg="play"]'); await C.fill('#joincode', 'ZZZZ9'); await C.click('[data-act="join"]');
await C.waitForFunction(() => !window.BL.ui.busy && window.BL.ui.playError, null, { timeout: 30000 });
check(true, 'joining a non-existent room shows an error: "' + (await C.evaluate(() => window.BL.ui.playError)).slice(0, 60) + '…"');
await C.close();

await A.evaluate(() => { const c = window.BL.client; c.setSettings(Object.assign({}, c.settings, { mode: 'tdm', map: 'downtown', scoreLimit: 25, timeLimit: 5, bots: 0 })); });
await B.waitForFunction(() => window.BL.client.settings.timeLimit === 5);
check(true, 'lobby settings chosen by the host appear on the other tab');
await A.click('[data-act="start"]');
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.BL.inMatch && window.BL.client.snaps.length > 3, null, { timeout: 20000 })));
check(true, 'match started on both tabs');
await control(A); await control(B);
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.BL.client.matchPhase === 'live', null, { timeout: 30000 })));
let a = await st(A), b = await st(B);
check(a.remote.length === 1 && b.remote.length === 1, 'each tab sees the other player');
check(a.scores[a.id] && b.scores[a.id], 'scoreboard rows present on both tabs');

// movement: B walks; A must see B's interpolated position change; B must not mispredict
const b0 = b;
await B.evaluate(() => { window.BL.client.mispredicts = 0; });
await hold(B, 'KeyW'); await hold(B, 'ShiftLeft'); await sleep(1500); await hold(B, 'Space'); await sleep(200); await hold(B, 'Space', false); await sleep(800);
await hold(B, 'KeyW', false); await hold(B, 'ShiftLeft', false); await sleep(700);
b = await st(B); a = await st(A);
const moved = Math.hypot(b.x - b0.x, b.z - b0.z);
check(moved > 1.5, `joining player moved ${moved.toFixed(1)} m with prediction`);
check(b.misp === 0, `no mispredictions while sprinting and jumping (${b.misp})`);
const seen = a.remote.find((r) => r.id === b.id);
check(seen && Math.hypot(seen.x - b.x, seen.z - b.z) < 0.6, `host sees the other player at the right place (off by ${seen ? Math.hypot(seen.x - b.x, seen.z - b.z).toFixed(2) : '?'} m)`);

// combat: put them face to face (host authority), A shoots B
await A.evaluate(([ia, ib]) => { const sim = window.BL.hostSession.sim, PA = sim.players.get(ia), PB = sim.players.get(ib); Object.assign(PA.s, { x: -44, y: 0.1, z: 4, vx: 0, vy: 0, vz: 0 }); Object.assign(PB.s, { x: -44, y: 0.1, z: -4, vx: 0, vy: 0, vz: 0 }); PA.prot = 0; PB.prot = 0; }, [a.id, b.id]);
await sleep(600);
await look(A, 0, -7); await look(B, 180, 0); // aim low: recoil walks the burst up through the chest
const xp0 = (await st(A)).xp;
await hold(A, 'Mouse2'); await sleep(500); await hold(A, 'Mouse0');
for (let i = 0; i < 9; i++) { await sleep(200); await st(B); } // poll the victim's damage indicators while under fire
await hold(A, 'Mouse0', false); await hold(A, 'Mouse2', false); await sleep(800);
a = await st(A); b = await st(B);
check(a.ammo < 30, `host fired (${30 - a.ammo} rounds)`);
check(b.scores[a.id].k >= 1 && a.scores[a.id].k >= 1, `kill registered and synced to both scoreboards (killer has ${b.scores[a.id].k})`);
check(b.scores[b.id].d >= 1, 'victim death counted');
check(a.team[0] + a.team[1] >= 1 && b.team[0] + b.team[1] >= 1, `team score synced (${a.team})`);
check(a.feed >= 1 && b.feed >= 1, 'kill feed shown on both tabs');
check(/kill|show/.test(a.hit), 'shooter got a hit marker');
check(b.dd >= 1, 'victim saw a damage direction indicator');
check(a.xp > xp0, `killer earned XP (+${a.xp - xp0}) and weapon XP (${JSON.stringify(a.wxp)})`);
await B.waitForFunction(() => window.BL.client.state.alive === 1, null, { timeout: 15000 });
check(true, 'victim respawned');

// grenade: B cooks and throws; both tabs get the explosion
await B.evaluate(() => { window._booms = 0; const h = window.BL.client.handlers.boom; window.BL.client.handlers.boom = (m) => { window._booms++; h(m); }; });
await A.evaluate(() => { window._booms = 0; const h = window.BL.client.handlers.boom; window.BL.client.handlers.boom = (m) => { window._booms++; h(m); }; });
await hold(B, 'KeyG'); await sleep(900); await hold(B, 'KeyG', false); await sleep(4200);
check((await st(B)).nades === 1, 'grenade thrown (1 left)');
check(await A.evaluate(() => window._booms) >= 1 && await B.evaluate(() => window._booms) >= 1, 'explosion received on both tabs');

// late join: a third player joins while the match is running
const D = await open('[late]', base + q);
await D.click('[data-act="nav"][data-arg="play"]'); await D.fill('#joincode', code); await D.click('[data-act="join"]');
await D.waitForFunction(() => window.BL.inMatch && window.BL.client.snaps.length > 3 && window.BL.client.state.alive === 1, null, { timeout: 30000 });
check(await D.evaluate(() => window.BL.client.remote.size === 2 && window.BL.client.matchPhase === 'live'), 'a third player can join mid-match and sees both others');
check(await A.evaluate(() => window.BL.client.roster.size === 3 && window.BL.client.scores.size === 3), 'the late joiner appears on the host scoreboard');
await D.close();
const gone = await A.waitForFunction(() => window.BL.hostSession.players.size === 2, null, { timeout: 16000 }).then(() => true, () => false);
check(gone, 'a player who closes the tab is removed from the match');

// end the match from the host: both get the post-match screen, then return to the lobby
await A.evaluate(() => window.BL.hostSession.sim._endMatch('time'));
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.BL.ui.current === 'post', null, { timeout: 15000 })));
check(true, 'post-match screen on both tabs');
check(await A.evaluate(() => /XP earned/.test(document.getElementById('s-post').textContent)), 'post-match screen lists XP earned');
await A.evaluate(() => window.BL.hostSession.toLobby());
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.BL.ui.current === 'lobby' && !window.BL.inMatch, null, { timeout: 15000 })));
check(true, 'both tabs returned to the lobby');
const saved = await A.evaluate(() => JSON.parse(localStorage.getItem('breachline.profile.v1')).xp);
check(saved >= (await st(A)).xp && saved >= 150, `progress saved to localStorage (${saved} XP; both tabs share one profile here)`);

// host leaves: the other tab is told
await A.click('[data-act="leave"]');
await B.waitForFunction(() => window.BL.ui.current === 'main', null, { timeout: 15000 });
check(true, 'when the host leaves, the other player is returned to the main menu');
check(logs.length === 0, 'no console errors' + (logs.length ? ':\n      ' + logs.join('\n      ') : ''));
console.log(fail ? `${fail} FAILED` : 'ALL BROWSER TESTS PASSED');
await browser.close();
process.exit(fail ? 1 : 0);
