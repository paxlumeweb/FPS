// Headless map validation using the real collision + movement code.
//   - every spawn is in free space and standing on ground
//   - flood fill (walk + jump) from the first spawn: every spawn must be reachable
//   - trap detection: places you can get into but not out of
// Usage: node tools/validate-maps.mjs [mapId] [--dump]
import { MAP_IDS, getMap } from '../src/game/maps/index.js';
import { World } from '../src/game/world.js';
import { makeState, stepPlayer, PM, BTN } from '../src/game/player.js';

const G = 0.5;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
let failed = false;

function settle(world, x, y, z) {
  const s = makeState(); s.x = x; s.y = y; s.z = z; s.ground = 0;
  for (let i = 0; i < 240; i++) { stepPlayer(s, { q: i, b: 0, f: 0, s: 0, yaw: 0, pitch: 0, sel: -1 }, world, null); if (s.ground) break; }
  return s;
}
const key = (x, y, z) => Math.round(x / G) + ',' + Math.round(z / G) + ',' + Math.round(y * 2);

function tryMove(world, from, tx, tz, jump) {
  const s = makeState(); s.x = from.x; s.y = from.y; s.z = from.z; s.ground = 1;
  const yaw = Math.atan2(-(tx - s.x), -(tz - s.z));
  const maxT = jump ? 70 : 26;
  for (let i = 0; i < maxT; i++) {
    const d = Math.hypot(tx - s.x, tz - s.z);
    const b = (jump && i === 0) ? BTN.JUMP : 0;
    const y2 = Math.atan2(-(tx - s.x), -(tz - s.z));
    stepPlayer(s, { q: i, b, f: d > 0.06 ? 1 : 0, s: 0, yaw: d > 0.06 ? y2 : yaw, pitch: 0, sel: -1 }, world, null);
    if (s.y < -5) return null;
    if (Math.hypot(tx - s.x, tz - s.z) < 0.08 && s.ground && Math.hypot(s.vx, s.vz) < 0.6) break;
  }
  // let it come to rest / land
  for (let i = 0; i < 90 && (!s.ground || Math.hypot(s.vx, s.vz) > 0.01); i++) {
    stepPlayer(s, { q: 1000 + i, b: 0, f: 0, s: 0, yaw, pitch: 0, sel: -1 }, world, null);
    if (s.y < -5) return null;
  }
  if (!s.ground) return null;
  // Nodes keep the real resting position (always valid); they are keyed by the nearest grid cell.
  // Landing somewhere other than the target (e.g. after dropping off a ledge) is still a valid edge.
  return { x: s.x, y: s.y, z: s.z };
}

for (const id of MAP_IDS) {
  if (only && id !== only) continue;
  const def = getMap(id);
  const world = new World(def);
  const t0 = Date.now();
  const problems = [];
  const all = [...def.spawns.a.map((s) => ['a', s]), ...def.spawns.b.map((s) => ['b', s]), ...def.spawns.ffa.map((s) => ['ffa', s])];
  const spawnNodes = [];
  for (const [team, sp] of all) {
    if (!world.isFree(sp.x, sp.y, sp.z, PM.H_STAND)) { problems.push(`spawn ${team} (${sp.x},${sp.y},${sp.z}) is inside geometry`); continue; }
    const s = settle(world, sp.x, sp.y, sp.z);
    if (!s.ground || sp.y - s.y > 0.6) problems.push(`spawn ${team} (${sp.x},${sp.y},${sp.z}) floats ${(sp.y - s.y).toFixed(2)}m above ground`);
    spawnNodes.push([team, sp, s]);
  }
  // flood fill
  const start = spawnNodes[0][2];
  const sx = Math.round(start.x / G) * G, sz = Math.round(start.z / G) * G;
  const st0 = settle(world, sx, start.y + 0.05, sz);
  const nodes = new Map(); const edges = new Map(); const queue = [];
  const add = (n) => { const k = key(n.x, n.y, n.z); if (!nodes.has(k)) { nodes.set(k, n); queue.push(k); } return k; };
  add({ x: st0.x, y: st0.y, z: st0.z });
  while (queue.length) {
    const k = queue.pop(); const n = nodes.get(k); const out = [];
    for (const [dx, dz] of DIRS) {
      for (const [mul, jump] of [[1, false], [2, true], [3, true]]) {
        const tx = (Math.round(n.x / G) + dx * mul) * G, tz = (Math.round(n.z / G) + dz * mul) * G;
        const r = tryMove(world, n, tx, tz, jump);
        if (r) { const k2 = add(r); if (k2 !== k) out.push(k2); if (!jump && Math.hypot(r.x - tx, r.z - tz) < 0.12) break; }
      }
    }
    edges.set(k, out);
  }
  // reverse reachability for traps
  const rev = new Map();
  for (const [k, outs] of edges) for (const o of outs) { if (!rev.has(o)) rev.set(o, []); rev.get(o).push(k); }
  const startKey = key(sx, st0.y, sz);
  const canReturn = new Set([startKey]); const q2 = [startKey];
  while (q2.length) { const k = q2.pop(); for (const p of rev.get(k) || []) if (!canReturn.has(p)) { canReturn.add(p); q2.push(p); } }
  const traps = [...nodes.keys()].filter((k) => !canReturn.has(k)).map((k) => nodes.get(k));
  for (const [team, sp, s] of spawnNodes) {
    const k = key(Math.round(s.x / G) * G, s.y, Math.round(s.z / G) * G);
    let ok = nodes.has(k);
    if (!ok) { // try neighbours (spawn may not sit on a grid node)
      for (const [dx, dz] of [[0, 0], ...DIRS]) for (const dy of [0, 0.5, -0.5]) if (nodes.has(key(s.x + dx * G, s.y + dy, s.z + dz * G))) ok = true;
    }
    if (!ok) problems.push(`spawn ${team} (${sp.x},${sp.y},${sp.z}) is not reachable from the first spawn`);
  }
  if (traps.length) {
    const sample = traps.slice(0, 12).map((t) => `(${t.x},${t.y.toFixed(2)},${t.z})`).join(' ');
    problems.push(`${traps.length} trap nodes (reachable but no way back), e.g. ${sample}`);
  }
  const levels = {};
  for (const n of nodes.values()) { const l = Math.round(n.y); levels[l] = (levels[l] || 0) + 1; }
  console.log(`[${id}] boxes=${def.boxes.length} solid=${world.n} spawns a/b/ffa=${def.spawns.a.length}/${def.spawns.b.length}/${def.spawns.ffa.length} ` +
    `walkable nodes=${nodes.size} (~${Math.round(nodes.size * G * G)} m2) by height=${JSON.stringify(levels)} in ${Date.now() - t0}ms`);
  if (problems.length) { failed = true; for (const p of problems) console.log('   FAIL: ' + p); } else console.log('   OK: all spawns free, grounded and mutually reachable; no traps');
  if (process.argv.includes('--dump')) {
    // ASCII top-down of walkable nodes (max height per cell)
    const b = def.bounds; const rows = [];
    for (let z = b.z0; z <= b.z1; z += 1) { let row = ''; for (let x = b.x0; x <= b.x1; x += 1) { let best = -1; for (const n of nodes.values()) if (Math.abs(n.x - x) < 0.26 && Math.abs(n.z - z) < 0.26) best = Math.max(best, Math.round(n.y)); row += best < 0 ? '#' : best === 0 ? '.' : String(Math.min(9, best)); } rows.push(row); }
    console.log(rows.join('\n'));
  }
}
process.exit(failed ? 1 : 0);
