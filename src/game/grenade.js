// Frag grenade physics: ballistic point with bounce. Used by the host (authoritative) and by the
// client for the throw-arc preview, so the preview matches what the host will simulate.

import { FRAG } from './weapons.js';

export const NADE = { gravity: 19, restitution: 0.42, friction: 0.72, radius: 0.1 };

/** Initial grenade state for a throw from eye position along (yaw, pitch), inheriting some velocity. */
export function throwGrenade(ex, ey, ez, yaw, pitch, pvx, pvy, pvz) {
  const p = pitch + 0.12; // slight upward bias so level throws arc
  const cp = Math.cos(p);
  const dx = -Math.sin(yaw) * cp, dy = Math.sin(p), dz = -Math.cos(yaw) * cp;
  const sp = FRAG.throwSpeed;
  return {
    x: ex + dx * 0.4, y: ey - 0.1 + dy * 0.4, z: ez + dz * 0.4,
    vx: dx * sp + pvx * 0.6, vy: dy * sp + Math.max(0, pvy) * 0.4, vz: dz * sp + pvz * 0.6,
    rest: 0,
  };
}

/** Advance a grenade by dt. Returns true if it bounced this step (for sound). */
export function stepGrenade(world, g, dt) {
  if (g.rest) return false;
  g.vy -= NADE.gravity * dt;
  let remaining = dt, bounced = false;
  for (let iter = 0; iter < 3 && remaining > 1e-6; iter++) {
    const sp = Math.hypot(g.vx, g.vy, g.vz);
    if (sp < 1e-5) break;
    const dist = sp * remaining;
    const dx = g.vx / sp, dy = g.vy / sp, dz = g.vz / sp;
    const t = world.raycast(g.x, g.y, g.z, dx, dy, dz, dist + NADE.radius);
    if (t === Infinity) {
      g.x += dx * dist; g.y += dy * dist; g.z += dz * dist;
      break;
    }
    const h = world.hit;
    const travel = Math.max(0, t - NADE.radius);
    g.x += dx * travel; g.y += dy * travel; g.z += dz * travel;
    remaining -= travel / sp;
    // reflect about the surface normal, lose energy
    const vn = g.vx * h.nx + g.vy * h.ny + g.vz * h.nz;
    g.vx = (g.vx - (1 + NADE.restitution) * vn * h.nx);
    g.vy = (g.vy - (1 + NADE.restitution) * vn * h.ny);
    g.vz = (g.vz - (1 + NADE.restitution) * vn * h.nz);
    // tangential friction
    const vn2 = g.vx * h.nx + g.vy * h.ny + g.vz * h.nz;
    g.vx = h.nx * vn2 + (g.vx - h.nx * vn2) * NADE.friction;
    g.vy = h.ny * vn2 + (g.vy - h.ny * vn2) * NADE.friction;
    g.vz = h.nz * vn2 + (g.vz - h.nz * vn2) * NADE.friction;
    if (Math.abs(vn) > 1.2) bounced = true;
    // come to rest on floors when slow
    if (h.ny > 0.5 && Math.hypot(g.vx, g.vy, g.vz) < 0.9) { g.vx = g.vy = g.vz = 0; g.rest = 1; break; }
  }
  return bounced;
}

/** Sample the predicted trajectory (for the arc preview). Returns flat xyz array. */
export function previewArc(world, g0, maxTime, out) {
  const g = Object.assign({}, g0);
  out.length = 0;
  const dt = 1 / 30;
  out.push(g.x, g.y, g.z);
  for (let t = 0; t < maxTime; t += dt) {
    stepGrenade(world, g, dt);
    out.push(g.x, g.y, g.z);
    if (g.rest) break;
  }
  return out;
}
