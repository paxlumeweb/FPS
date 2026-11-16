// Headless simulation tests: run bot matches in every mode on every map and check invariants.
import { MAP_IDS, getMap } from '../src/game/maps/index.js';
import { Sim } from '../src/game/sim.js';
import { GUN_GAME_LADDER, WEAPONS } from '../src/game/weapons.js';
import { levelInfo, masteryInfo, totalXpForMaxLevel, totalXpForMaxMastery } from '../src/game/progression.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('   FAIL: ' + msg); } };

function run(mapId, mode, scoreLimit, nBots, maxSeconds) {
  const msgs = { k: 0, x: 0, f: 0, end: null, b: 0 };
  const out = {
    send(id, m) { if (m.t === 'x') msgs.x++; },
    broadcast(m) { if (m.t === 'k') msgs.k++; else if (m.t === 'f') msgs.f++; else if (m.t === 'end') msgs.end = m; else if (m.t === 'b') msgs.b++; },
  };
  const sim = new Sim({ mapDef: getMap(mapId), settings: { mode, map: mapId, scoreLimit, timeLimit: 20, bots: nBots }, out });
  for (let i = 0; i < nBots; i++) sim.addPlayer(i + 1, { name: 'Bot' + i, team: i % 2, bot: true });
  // one fake "human" (bot brain, but flagged human) so XP messages are exercised and loadout rules can be checked
  const H = sim.addPlayer(99, { name: 'Human', team: 0, loadout: { primary: 'longbow', primaryAtt: ['suppressor', 'extmag'], secondary: 'magnus', secondaryAtt: [] }, bot: true });
  H.bot = false;
  const t0 = Date.now(); let ticks = 0, wrongWeapon = 0, nan = 0, minY = 0;
  while (sim.phase !== 'ended' && sim.time < maxSeconds) {
    sim.tick(); ticks++;
    if (ticks % 30 === 0) for (const P of sim.players.values()) {
      const s = P.s;
      if (!Number.isFinite(s.x + s.y + s.z + s.vx + s.vy + s.vz)) nan++;
      if (P.alive) minY = Math.min(minY, s.y);
      if (mode === 'gungame') {
        const want = GUN_GAME_LADDER[Math.min(P.tier, GUN_GAME_LADDER.length - 1)];
        if (P.alive && (s.w.length !== 1 || s.w[0].id !== want || s.w[0].att.length || s.nades !== 0)) wrongWeapon++;
      }
    }
  }
  const ms = Date.now() - t0;
  console.log(`[${mapId}/${mode}] simulated ${sim.time.toFixed(0)}s in ${ms}ms (${(ms / ticks * 1000).toFixed(0)}us/tick, ${nBots + 1} players) kills=${msgs.k} shots=${msgs.f} xpMsgs=${msgs.x} phase=${sim.phase} end=${msgs.end ? msgs.end.reason : '-'} teams=${sim.teamScore}`);
  check(nan === 0, 'non-finite player state');
  check(minY > -1, 'a player fell below the ground: minY=' + minY.toFixed(2));
  check(msgs.k > 0, 'no kills happened');
  check(sim.phase === 'ended', 'match did not end');
  if (mode === 'gungame') {
    check(wrongWeapon === 0, 'gun game player held a non-ladder weapon / attachments / grenades');
    check(msgs.x === 0, 'gun game awarded XP');
    const w = [...sim.players.values()].find((p) => p.tier >= GUN_GAME_LADDER.length);
    check(!!w && msgs.end && msgs.end.winPlayer === w.id, 'gun game winner must have completed the ladder with a knife kill');
  } else check(msgs.x > 0, 'no XP awarded in a progression mode');
  return sim;
}

for (const id of MAP_IDS) {
  run(id, 'tdm', 25, 7, 1500);
  run(id, 'ffa', 10, 7, 1500);
  run(id, 'gungame', GUN_GAME_LADDER.length, 5, 3000);
}
console.log(`progression: max level needs ${totalXpForMaxLevel()} XP, max mastery needs ${totalXpForMaxMastery()} weapon XP`);
check(levelInfo(totalXpForMaxLevel()).level === 30 && levelInfo(totalXpForMaxLevel() - 1).level === 29, 'level table');
check(masteryInfo(totalXpForMaxMastery()).level === 12, 'mastery table');
check(Object.values(WEAPONS).every((w) => w.unlock >= 1 && w.unlock <= 30), 'unlock levels');
console.log(fail ? `${fail} FAILED` : 'ALL SIM TESTS PASSED');
process.exit(fail ? 1 : 0);
