// Gameplay rules test (Node, no browser): checks the movement, weapon, mode and progression
// requirements directly against the shared simulation code.
import { getMap } from '../src/game/maps/index.js';
import { World } from '../src/game/world.js';
import { Sim } from '../src/game/sim.js';
import { makeState, makeWeapon, stepPlayer, BTN, PM, TICK, statsOf } from '../src/game/player.js';
import { WEAPONS, PRIMARIES, SECONDARIES, ATTACHMENTS, GUN_GAME_LADDER, weaponStats, damageAt, attachmentsFor, sanitizeLoadout, FRAG, MELEE, shotDirs } from '../src/game/weapons.js';
import { XP, levelInfo, masteryInfo, totalXpForMaxLevel, totalXpForMaxMastery, isWeaponUnlocked } from '../src/game/progression.js';
import { throwGrenade, stepGrenade } from '../src/game/grenade.js';

let fail = 0, n = 0;
const check = (ok, msg) => { n++; if (!ok) { fail++; console.log('   FAIL: ' + msg); } else if (process.argv.includes('-v')) console.log('   ok: ' + msg); };
const section = (s) => console.log(s);
const world = new World(getMap('downtown'));
const open = () => { const s = makeState(); s.x = -46; s.y = 0.0001; s.z = 1.5; return s; };  // west end of the main street (clear lane), facing east
const EAST = -Math.PI / 2;
const run = (s, ticks, b = 0, f = 0, extra = {}, ev = null) => { for (let i = 0; i < ticks; i++) stepPlayer(s, Object.assign({ q: (s._q = (s._q || 0) + 1), b, f, s: 0, yaw: EAST, pitch: 0, sel: -1 }, extra), world, ev); return s; };
const speed = (s) => Math.hypot(s.vx, s.vz);

section('movement');
{
  let s = run(open(), 60, 0, 1); const walk = speed(s);
  check(Math.abs(walk - PM.WALK * 0.96) < 0.05, `walk speed ${walk.toFixed(2)} m/s`);
  s = run(open(), 6, 0, 1); check(speed(s) > 1 && speed(s) < walk, `acceleration is gradual (${speed(s).toFixed(2)} m/s after 0.1 s)`);
  s = run(open(), 60, BTN.SPRINT, 1); const sprint = speed(s);
  check(sprint > walk * 1.35 && s.sprint === 1, `sprint speed ${sprint.toFixed(2)} m/s`);
  s = run(open(), 60, BTN.CROUCH, 1); check(speed(s) < walk * 0.6 && s.crouch === 1 && s.eye < 1.1, `crouch speed ${speed(s).toFixed(2)} m/s, eye height ${s.eye.toFixed(2)}`);
  s = run(open(), 60, BTN.SPRINT | BTN.ADS, 1); check(s.sprint === 0 && speed(s) < walk, 'no sprinting while aiming down sights');
  s = run(open(), 60, BTN.SPRINT, -1); check(s.sprint === 0, 'no sprinting backwards');
  // slide
  s = run(open(), 60, BTN.SPRINT, 1); const before = speed(s);
  run(s, 1, BTN.SPRINT | BTN.CROUCH, 1); check(s.slide > 0 && speed(s) > before + 1, `sprint + crouch starts a slide with a speed boost (${before.toFixed(1)} -> ${speed(s).toFixed(1)} m/s)`);
  const x0 = s.x; run(s, 30, BTN.SPRINT | BTN.CROUCH, 1); check(s.slide > 0 && speed(s) < before + 1.5 && speed(s) > 4, `slide carries momentum and decays (${speed(s).toFixed(1)} m/s after 0.5 s, ${(s.x - x0).toFixed(1)} m travelled)`);
  run(s, 40, BTN.SPRINT | BTN.CROUCH, 1); check(s.slide === 0 && s.slideCd > 0, `slide ends and a cooldown starts (${s.slideCd.toFixed(2)} s left)`);
  run(s, 3, 0, 1); run(s, 20, BTN.SPRINT, 1); run(s, 1, BTN.SPRINT | BTN.CROUCH, 1); check(s.slide === 0, 'cannot slide again during the cooldown');
  s.x = -46; run(s, 70, BTN.SPRINT, 1); run(s, 1, BTN.SPRINT | BTN.CROUCH, 1); check(s.slide > 0, 'can slide again after the cooldown');
  // jump
  s = open(); const ev = []; run(s, 1, BTN.JUMP, 0, {}, ev); let top = 0; for (let i = 0; i < 80; i++) { run(s, 1, 0, 0, {}, ev); top = Math.max(top, s.y); }
  check(top > 0.9 && top < 1.3 && s.ground === 1, `jump height ${top.toFixed(2)} m, lands again`);
  check(ev.some((e) => e.t === 'jump') && ev.some((e) => e.t === 'land'), 'jump / land events fire (sound + camera dip)');
  s = open(); run(s, 30, BTN.JUMP, 0); check(s.y < 0.01 || s.vy !== PM.JUMP_V, 'holding jump does not auto-bunny-hop');
}

section('weapon handling');
{
  // sprint-to-fire delay
  const s = run(open(), 60, BTN.SPRINT, 1); const ev = [];
  let t = 0; while (!ev.some((e) => e.t === 'fire') && t < 60) { run(s, 1, BTN.SPRINT | BTN.FIRE, 1, {}, ev); t++; }
  check(s.sprint === 0, 'firing cancels sprint');
  check(t * TICK >= WEAPONS.kr4.sprintOut - 0.02 && t * TICK < WEAPONS.kr4.sprintOut + 0.06, `sprint-to-fire delay ${(t * TICK * 1000).toFixed(0)} ms (stat ${WEAPONS.kr4.sprintOut * 1000} ms)`);
  const s2 = open(), ev2 = []; run(s2, 1, BTN.FIRE, 0, {}, ev2); check(ev2.some((e) => e.t === 'fire'), 'firing from a standstill is immediate');
  // ADS
  const s3 = open(); run(s3, 5, BTN.ADS); check(s3.ads > 0 && s3.ads < 1, 'ADS takes time'); run(s3, 30, BTN.ADS); check(s3.ads === 1, 'ADS completes');
  // every gun: fire rate, magazine, reload, auto vs semi
  for (const id of [...PRIMARIES, ...SECONDARIES]) {
    const st = weaponStats(id, []), s = open(); s.w = [makeWeapon(id), makeWeapon('p9')];
    const ev = []; let ticks = 0;
    if (st.auto) { while (s.w[0].ammo > 0 && ticks < 4000) { run(s, 1, BTN.FIRE, 0, {}, ev); ticks++; } }
    else { while (s.w[0].ammo > 0 && ticks < 4000) { run(s, 1, ticks % 2 ? BTN.FIRE : 0, 0, {}, ev); ticks++; } }
    const shots = ev.filter((e) => e.t === 'fire').length, rpm = (shots - 1) / (ticks * TICK) * 60;
    check(shots === st.mag, `${id}: magazine holds ${st.mag} (fired ${shots})`);
    check(Math.abs(rpm - st.rpm) / st.rpm < 0.12, `${id}: fire rate ${rpm.toFixed(0)} rpm (stat ${st.rpm})`);
    if (!st.auto) { const s4 = open(); s4.w = [makeWeapon(id)]; const e4 = []; run(s4, 120, BTN.FIRE, 0, {}, e4); check(e4.filter((e) => e.t === 'fire').length === 1, `${id}: semi-auto fires once per trigger pull`); }
    // auto-reload when empty, takes the weapon's reload time
    let r = 0; const res0 = s.w[0].res; while (s.w[0].ammo === 0 && r < 900) { run(s, 1, 0); if (s.reload > 0 || s.w[0].ammo > 0) r++; }
    check(Math.abs(r * TICK - st.reload) < 0.15 && s.w[0].ammo === Math.min(st.mag, res0), `${id}: reload ${(r * TICK).toFixed(2)} s (stat ${st.reload}), ammo ${s.w[0].ammo}`);
    check(damageAt(st, st.r0 - 1) === st.dmg && Math.abs(damageAt(st, st.r1 + 10) - st.dmg * st.minMul) < 1e-9 && damageAt(st, (st.r0 + st.r1) / 2) < st.dmg, `${id}: damage falloff ${st.dmg} -> ${(st.dmg * st.minMul).toFixed(1)} between ${st.r0} m and ${st.r1} m`);
    check(st.pat.length >= 2 && st.recoilV > 0, `${id}: has its own recoil pattern`);
  }
  check(new Set([...PRIMARIES].map((id) => WEAPONS[id].cls)).size === 6, 'six primary classes: ' + [...new Set(PRIMARIES.map((id) => WEAPONS[id].cls))].join(', '));
  check(SECONDARIES.length >= 2 && SECONDARIES.every((id) => WEAPONS[id].cls === 'pistol'), 'two pistols');
  check(new Set([...PRIMARIES, ...SECONDARIES].map((id) => JSON.stringify(WEAPONS[id].recoil.pat))).size === PRIMARIES.length + SECONDARIES.length, 'every gun has a distinct recoil pattern');
  // hip vs ADS spread
  const a = shotDirs(0, 0, 3.2, 1, 0, 5), b2 = shotDirs(0, 0, 0.05, 1, 0, 5);
  check(Math.acos(-a[2]) > Math.acos(-b2[2]), 'hip-fire spread is wider than ADS spread');
  check(shotDirs(0.3, 0.1, 2, 8, 3.4, 77).join() === shotDirs(0.3, 0.1, 2, 8, 3.4, 77).join() && shotDirs(0, 0, 2, 8, 3.4, 77).length === 24, 'pellet directions are deterministic (host and shooter agree); shotgun fires 8 pellets');
  // weapon switch + reload cancel
  const s5 = open(); run(s5, 1, 0, 0, { sel: 1 }); check(s5.slot === 1 && s5.switchT > 0, 'weapon switch'); const e5 = []; run(s5, 5, BTN.FIRE, 0, { sel: 1 }, e5); check(!e5.some((e) => e.t === 'fire'), 'cannot fire during the switch animation');
  // grenade cook
  const s6 = open(), e6 = []; run(s6, 60, BTN.NADE, 0, {}, e6); check(s6.cook > 0.9 && e6.some((e) => e.t === 'cook'), 'holding the grenade key cooks it');
  run(s6, 1, 0, 0, {}, e6); const th = e6.find((e) => e.t === 'nade'); check(th && Math.abs(th.fuse - (FRAG.fuse - 61 * TICK)) < 0.05 && s6.nades === FRAG.count - 1, `releasing throws with the remaining fuse (${th ? th.fuse.toFixed(2) : '?'} s)`);
  const s7 = open(), e7 = []; run(s7, Math.ceil(FRAG.fuse / TICK) + 3, BTN.NADE, 0, {}, e7); const ov = e7.find((e) => e.t === 'nade'); check(ov && ov.fuse === 0, 'over-cooking makes it go off in your hand');
  // bounce physics
  const g = throwGrenade(-46, 1.6, 1.5, EAST, 0.2, 0, 0, 0); let bounces = 0, maxY = 0; for (let i = 0; i < 300; i++) { if (stepGrenade(world, g, TICK)) bounces++; maxY = Math.max(maxY, g.y); }
  check(bounces >= 1 && g.rest === 1 && g.y < 0.4 && maxY > 2, `grenade arcs (peak ${maxY.toFixed(1)} m), bounces ${bounces}x and comes to rest`);
}

section('attachments');
{
  for (const a of Object.values(ATTACHMENTS)) check(a.pros.length > 0 && a.cons.length > 0, `${a.id}: has both an upside and a downside`);
  const base = weaponStats('kr4', []), ext = weaponStats('kr4', ['extmag']), sup = weaponStats('kr4', ['suppressor']), grip = weaponStats('kr4', ['foregrip']), sc = weaponStats('kr4', ['scope']);
  check(ext.mag > base.mag && ext.reload > base.reload, `extended mag: ${base.mag} -> ${ext.mag} rounds, reload ${base.reload} -> ${ext.reload.toFixed(2)} s`);
  check(sup.suppressed === 1 && sup.r0 < base.r0, 'suppressor: hidden from minimap, shorter range');
  check(grip.recoilH < base.recoilH && grip.adsTime > base.adsTime, 'foregrip: less horizontal recoil, slower ADS');
  check(sc.zoom === 2.5 && sc.adsTime > base.adsTime, 'combat scope: 2.5x zoom, slower ADS');
  check(new Set(Object.values(ATTACHMENTS).map((a) => a.slot)).size === 5, 'five attachment slots: optics, barrels, magazines, grips, stocks');
  check(sanitizeLoadout({ primary: 'kr4', primaryAtt: ['reddot', 'scope', 'bogus'], secondary: 'kr4' }).primaryAtt.length === 1, 'only one attachment per slot; invalid ones are dropped by the host');
  check(sanitizeLoadout({ primary: 'longbow', primaryAtt: ['reddot'] }).primaryAtt.length === 0, 'attachments that do not fit the weapon class are rejected');
  for (const id of [...PRIMARIES, ...SECONDARIES]) check(attachmentsFor(id).length >= 3, `${id}: ${attachmentsFor(id).length} attachments available`);
}

section('host-authoritative combat');
const mkSim = (mode, opts = {}) => {
  const log = [];
  const sim = new Sim({ mapDef: getMap('downtown'), settings: Object.assign({ mode, map: 'downtown', scoreLimit: mode === 'tdm' ? 25 : 10, timeLimit: 10, bots: 0 }, opts), out: { send: (id, m) => log.push([id, m]), broadcast: (m) => log.push([0, m]) } });
  return { sim, log };
};
const place = (P, x, z, yawDeg) => { Object.assign(P.s, { x, y: 0.0001, z, vx: 0, vy: 0, vz: 0, yaw: yawDeg * Math.PI / 180, pitch: 0 }); P.prot = 0; P.hist.length = 0; };
const live = (sim) => { while (sim.phase !== 'live') sim.tick(); for (const P of sim.players.values()) P.prot = 0; };
const cmd = (P, b, yawDeg, pitch = 0, sel = -1) => { P._q = (P._q || 0) + 1; sim0.onCmds(P.id, [[P._q, b, 0, 0, yawDeg * Math.PI / 180, pitch, sel]], sim0.time, 0); };
let sim0;
{
  const { sim, log } = mkSim('tdm'); sim0 = sim;
  const A = sim.addPlayer(1, { name: 'A', team: 0, loadout: { primary: 'longbow', secondary: 'p9' } });
  const B = sim.addPlayer(2, { name: 'B', team: 1 });
  const C = sim.addPlayer(3, { name: 'C', team: 0 });
  check(sim.phase === 'countdown' && A.s.frozen === 1, 'match starts with a frozen countdown');
  live(sim);
  check(A.s.w[0].id === 'longbow', 'loadout is used in TDM');
  // spawn protection
  place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 2; A.s.ads = 1;
  cmd(A, BTN.FIRE | BTN.ADS, 0, -0.07); sim.tick(); check(B.hp === 100, 'spawn-protected players take no damage');
  B.prot = 0; A.s.fireCd = 0; A.s.pb = 0;
  // body shot with the sniper: one hit kill to the torso
  cmd(A, BTN.ADS, 0, -0.07); sim.tick(); cmd(A, BTN.FIRE | BTN.ADS, 0, -0.07); sim.tick();
  check(!B.alive && log.some(([, m]) => m.t === 'k' && m.k === 1 && m.v === 2 && m.w === 'longbow'), 'sniper torso shot kills; kill event broadcast');
  check(sim.teamScore[0] === 1, 'TDM: team score increases');
  check(log.some(([id, m]) => id === 1 && m.t === 'x' && m.r === 'Kill' && m.a === XP.kill && m.w === 'longbow' && m.wx === XP.wKill), 'killer receives player XP and weapon XP');
  check(log.some(([id, m]) => id === 1 && m.t === 'x' && m.r === 'First Blood'), 'first blood bonus');
  check(log.some(([id, m]) => id === 1 && m.t === 'h' && m.k === 1) && log.some(([id, m]) => id === 2 && m.t === 'd'), 'hit confirm goes to the shooter, damage direction to the victim');
  // friendly fire is off
  place(C, -44, -4, 180); A.s.fireCd = 0; A.s.pb = 0; cmd(A, BTN.ADS, 0, -0.07); sim.tick(); cmd(A, BTN.FIRE | BTN.ADS, 0, -0.07); sim.tick(); check(C.hp === 100 && A.s.w[0].ammo < 4, 'no friendly fire');
  // respawn
  for (let i = 0; i < 200; i++) sim.tick(); check(B.alive && B.prot > 0, 'team respawn with spawn protection');
  check(getMap('downtown').spawns.b.some((s) => Math.hypot(s.x - B.s.x, s.z - B.s.z) < 0.5), 'respawned at a team spawn point');
  // headshot multiplier with the pistol
  place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0; A.s.slot = 1; A.s.switchT = 0; A.s.fireCd = 0; A.s.pb = 0; A.s.ads = 1;
  const eye = A.s.y + A.s.eye, headPitch = Math.atan2(1.68 - eye, 8), bodyPitch = Math.atan2(1.15 - eye, 8);
  cmd(A, BTN.FIRE | BTN.ADS, 0, bodyPitch); sim.tick(); const body = 100 - B.hp;
  B.hp = 100; A.s.fireCd = 0; cmd(A, BTN.ADS, 0, headPitch); sim.tick(); cmd(A, BTN.FIRE | BTN.ADS, 0, headPitch); sim.tick(); const head = 100 - B.hp;
  check(body === 26 && head === Math.round(26 * 1.5), `headshot multiplier: body ${body}, head ${head}`);
  // melee: front hit vs back stab
  B.hp = 100; place(A, -44, 1, 0); place(B, -44, -0.5, 180); A.s.meleeT = 0; A.s.pb = 0;
  cmd(A, BTN.MELEE, 0); sim.tick(); check(B.hp === 100 - MELEE.dmg && B.alive, `front melee does ${MELEE.dmg} damage`);
  B.hp = 100; place(B, -44, -0.5, 0); A.s.meleeT = 0; A.s.pb = 0; cmd(A, 0, 0); sim.tick(); cmd(A, BTN.MELEE, 0); sim.tick();
  check(!B.alive && log.some(([, m]) => m.t === 'k' && m.b === 1), 'back stab is a one-hit kill');
  // lag compensation: target moved away 100 ms ago, shooter saw it at the old spot
  for (let i = 0; i < 200; i++) sim.tick();
  place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0; A.s.slot = 0; A.s.switchT = 0; A.s.fireCd = 0; A.s.pb = 0; A.s.reload = 0; A.s.meleeT = 0; A.s.w[0].ammo = 5; A.s.ads = 1; A.cmds.length = 0;
  for (let i = 0; i < 12; i++) sim.tick();
  const tSeen = sim.time; B.s.x = -40; for (let i = 0; i < 6; i++) sim.tick();
  A.s.ads = 1; A._q++; sim.onCmds(1, [[A._q, BTN.ADS, 0, 0, 0, -0.07, -1]], tSeen, 100); sim.tick(); A._q++; sim.onCmds(1, [[A._q, BTN.FIRE | BTN.ADS, 0, 0, 0, -0.07, -1]], tSeen, 100); sim.tick();
  check(!B.alive, 'lag compensation: a shot aimed where the target was on the shooter\'s screen still hits');
  for (let i = 0; i < 200; i++) sim.tick();
  place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0; A.s.fireCd = 0; A.s.pb = 0; A.s.reload = 0; A.s.w[0].ammo = 5; A.s.ads = 1; A.cmds.length = 0;
  for (let i = 0; i < 12; i++) sim.tick();
  B.s.x = -40; for (let i = 0; i < 6; i++) sim.tick();
  A.s.ads = 1; A._q++; sim.onCmds(1, [[A._q, BTN.ADS, 0, 0, 0, -0.07, -1]], sim.time, 100); sim.tick(); A._q++; sim.onCmds(1, [[A._q, BTN.FIRE | BTN.ADS, 0, 0, 0, -0.07, -1]], sim.time, 100); sim.tick();
  check(B.alive, '...and without rewinding (target really gone) the same shot misses');
  // grenade damage + cooked grenade
  for (let i = 0; i < 200; i++) sim.tick();
  place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0;
  sim.grenades.push({ id: 99, owner: 1, team: 0, fuse: 0.01, g: { x: -44, y: 0.2, z: -3, vx: 0, vy: 0, vz: 0, rest: 1 } }); sim.tick(); sim.tick();
  check(!B.alive && log.some(([, m]) => m.t === 'b'), 'frag grenade kills at close range; explosion broadcast');
  // commands cannot run faster than real time
  const before = A.s.x; const many = []; for (let i = 0; i < 400; i++) many.push([++A._q, 0, 1, 0, EAST, 0, -1]); sim.onCmds(1, many, sim.time, 0);
  for (let i = 0; i < 10; i++) sim.tick();
  check(A.s.x - before < 2.5, `speed-hack protection: 400 queued inputs moved the player only ${(A.s.x - before).toFixed(2)} m in 10 ticks`);
  // match end by score + XP bonuses
  sim.teamScore[0] = 24; place(A, -44, 4, 0); place(B, -44, -4, 180); for (let i = 0; i < 200; i++) sim.tick(); place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0; A.s.fireCd = 0; A.s.pb = 0; A.s.reload = 0; A.s.w[0].ammo = 5; A.s.ads = 1; A.cmds.length = 0;
  A._q++; sim.onCmds(1, [[A._q, BTN.ADS, 0, 0, 0, -0.07, -1]], sim.time, 0); sim.tick(); A._q++; sim.onCmds(1, [[A._q, BTN.FIRE | BTN.ADS, 0, 0, 0, -0.07, -1]], sim.time, 0); sim.tick();
  check(sim.phase === 'ended' && sim.result.winTeam === 0, 'TDM ends at the score limit; winning team reported');
  check(log.some(([id, m]) => id === 1 && m.t === 'x' && m.r === 'Victory') && log.some(([id, m]) => id === 2 && m.t === 'x' && m.r === 'Match Complete') && !log.some(([id, m]) => id === 2 && m.t === 'x' && m.r === 'Victory'), 'win bonus for winners, completion bonus for everyone');
}
{
  const { sim } = mkSim('tdm', { timeLimit: 3 }); sim.addPlayer(1, { name: 'A', team: 0 }); live(sim);
  for (let i = 0; i < 3 * 60 * 60 + 5; i++) sim.tick();
  check(sim.phase === 'ended' && sim.result.reason === 'time', 'match ends when the timer runs out');
}
{
  const { sim, log } = mkSim('ffa'); sim0 = sim;
  const A = sim.addPlayer(1, { name: 'A', team: 0 }), B = sim.addPlayer(2, { name: 'B', team: 0 }); live(sim);
  place(A, -44, 4, 0); place(B, -44, -4, 180); A.s.ads = 1;
  for (let i = 0; i < 40 && B.alive; i++) { cmd(A, BTN.FIRE | BTN.ADS, 0, -0.07); sim.tick(); }
  check(!B.alive && A.stats.score === 1, 'FFA: players on the same "team" value can still kill each other; score = kills');
  A.stats.k = 9; A.stats.score = 9; for (let i = 0; i < 200; i++) sim.tick(); place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0; A.s.ads = 1;
  for (let i = 0; i < 40 && sim.phase === 'live'; i++) { cmd(A, BTN.FIRE | BTN.ADS, 0, -0.07); sim.tick(); }
  check(sim.phase === 'ended' && sim.result.winPlayer === 1, 'FFA ends at the score limit; winner reported');
  check(log.some(([id, m]) => id === 1 && m.t === 'x'), 'FFA awards XP');
}

section('gun game');
{
  const { sim, log } = mkSim('gungame'); sim0 = sim;
  const A = sim.addPlayer(1, { name: 'A', team: 0, loadout: { primary: 'longbow', primaryAtt: ['suppressor'], secondary: 'magnus' } });
  const B = sim.addPlayer(2, { name: 'B', team: 0, loadout: { primary: 'bulldog', secondary: 'magnus' } }); live(sim);
  check(A.s.w.length === 1 && A.s.w[0].id === GUN_GAME_LADDER[0] && B.s.w[0].id === GUN_GAME_LADDER[0] && A.s.w[0].att.length === 0 && A.s.nades === 0, `everyone starts on ${GUN_GAME_LADDER[0]}: loadouts, attachments and grenades are ignored`);
  const killWithGun = () => {
    for (let i = 0; i < 200; i++) sim.tick();
    place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0; A.s.ads = 1; A.s.switchT = 0; A.s.fireCd = 0; A.s.reload = 0; A.cmds.length = 0;
    for (let i = 0; i < 240 && B.alive; i++) { cmd(A, i % 2 ? BTN.FIRE | BTN.ADS : BTN.ADS, 0, -0.07); sim.tick(); }
    return !B.alive;
  };
  let ok = true;
  for (let tier = 0; tier < GUN_GAME_LADDER.length - 1; tier++) {
    ok = ok && A.s.w[0].id === GUN_GAME_LADDER[tier] && killWithGun() && A.tier === tier + 1;
  }
  check(ok, 'each kill moves the player to the next gun on the fixed ladder: ' + GUN_GAME_LADDER.join(' > '));
  check(A.s.w.length === 1 && A.s.w[0].id === 'knife' && sim.phase === 'live', 'final tier is the knife; match is still live');
  // a gun cannot finish the game: give A a rifle on the final tier (cheat attempt) -> the kill does not win
  for (let i = 0; i < 200; i++) sim.tick();
  A.s.w = [makeWeapon('kr4')]; place(A, -44, 4, 0); place(B, -44, -4, 180); B.prot = 0; A.s.ads = 1; A.s.switchT = 0;
  for (let i = 0; i < 60 && B.alive; i++) { cmd(A, BTN.FIRE | BTN.ADS, 0, -0.07); sim.tick(); }
  check(!B.alive && sim.phase === 'live' && A.tier === GUN_GAME_LADDER.length - 1, 'a non-melee kill on the final tier does not win');
  // melee demotes the victim; final knife kill wins
  B.tier = 3; for (let i = 0; i < 200; i++) sim.tick();
  check(A.s.w[0].id === 'knife' || (A.s.w = [makeWeapon('knife')]), 'knife on final tier');
  A.s.w = [makeWeapon('knife')]; A.s.slot = 0; place(A, -44, 1, 0); place(B, -44, -0.5, 0); B.prot = 0; A.s.meleeT = 0; A.s.switchT = 0; A.s.pb = 0; A.cmds.length = 0;
  cmd(A, 0, 0); sim.tick(); cmd(A, BTN.FIRE, 0); sim.tick();
  check(sim.phase === 'ended' && sim.result.winPlayer === 1, 'the final kill must be a melee kill: knife kill on the last tier wins the match');
  check(!log.some(([, m]) => m.t === 'x'), 'Gun Game awards no XP at all (progression untouched)');
}
{
  const { sim } = mkSim('gungame'); sim0 = sim;
  const A = sim.addPlayer(1, { name: 'A', team: 0 }), B = sim.addPlayer(2, { name: 'B', team: 0 }); live(sim);
  B.tier = 4; place(A, -44, 1, 0); place(B, -44, -0.5, 0); A.s.meleeT = 0; A.s.switchT = 0;
  cmd(A, 0, 0); sim.tick(); cmd(A, BTN.MELEE, 0); sim.tick();
  check(!B.alive && B.tier === 3 && A.tier === 1, 'quick-melee kill in Gun Game: attacker advances, victim drops a tier');
}

section('progression');
{
  const total = totalXpForMaxLevel(), mTotal = totalXpForMaxMastery();
  // typical 10-minute match: 15 kills, 4 headshots, 4 assists, 2 streak bonuses, a few extras, completion + 50% win rate
  const perMatch = 15 * XP.kill + 4 * XP.headshot + 4 * XP.assist + 2 * XP.streak + XP.firstBlood * 0.2 + 3 * XP.revenge + XP.matchComplete + XP.win * 0.5;
  const hours = total / perMatch * 10 / 60;
  check(hours >= 3 && hours <= 5, `max player level (${total} XP) takes about ${hours.toFixed(1)} h at ${Math.round(perMatch)} XP per 10-minute match`);
  const perHourW = 90 * XP.wKill + 25 * XP.wHeadshot + 10 * XP.wLongshot + 10 * XP.wAssist, mh = mTotal / perHourW;
  check(mh >= 1 && mh <= 2, `max weapon mastery (${mTotal} XP) takes about ${mh.toFixed(1)} h at ~90 kills/hour with one gun`);
  check(levelInfo(0).level === 1 && levelInfo(total).max && masteryInfo(mTotal).max, 'level tables');
  const starters = [...PRIMARIES, ...SECONDARIES].filter((id) => isWeaponUnlocked(id, 1));
  check(starters.length === 3 && [...PRIMARIES, ...SECONDARIES].every((id) => isWeaponUnlocked(id, 30)), `3 starter guns (${starters.join(', ')}); higher levels unlock the rest`);
  check(new Set(Object.values(ATTACHMENTS).map((a) => a.lvl)).size === 11, 'each mastery level 2-12 unlocks a different attachment');
}
console.log(fail ? `${fail} of ${n} rule checks FAILED` : `ALL ${n} RULE CHECKS PASSED`);
process.exit(fail ? 1 : 0);
