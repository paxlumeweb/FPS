// Procedural weapon models built from primitives (no model files). The same builder is used for
// the first-person view model and the simplified gun carried by other players.
// Convention: the gun points down -Z, +Y is up, origin sits at the top of the pistol grip.

import * as THREE from 'three';
import { WEAPONS } from '../game/weapons.js';

const matCache = new Map();
function mat(color, rough = 0.5, metal = 0.6, emissive = 0) {
  const k = color + '|' + rough + '|' + metal + '|' + emissive;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive || 0, emissiveIntensity: emissive ? 2.5 : 0 }); matCache.set(k, m); }
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);

function box(parent, w, h, d, x, y, z, material, rx = 0) {
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(w, h, d); m.position.set(x, y, z); if (rx) m.rotation.x = rx;
  parent.add(m); return m;
}
/** Cylinder along Z from z0 to z1. */
function tube(parent, r, z0, z1, x, y, material) {
  const m = new THREE.Mesh(cylGeo, material);
  m.scale.set(r, Math.abs(z1 - z0), r); m.rotation.x = Math.PI / 2; m.position.set(x, y, (z0 + z1) / 2);
  parent.add(m); return m;
}

export function buildGun(id, att = []) {
  const def = WEAPONS[id] || WEAPONS.kr4, m = def.model;
  const g = new THREE.Group();
  const out = { group: g, muzzle: new THREE.Vector3(0, 0.045, -0.5), eject: new THREE.Vector3(0.03, 0.06, -0.05), sightY: 0.09, parts: {}, kind: 'rifle', len: 0.6 };
  const body = mat(m.color, 0.6, 0.25), accent = mat(m.accent, 0.65, 0.2), steel = mat(0x34373c, 0.45, 0.45), wood = mat(0x7a5230, 0.75, 0.05);
  const has = (a) => att.includes(a);

  if (m.knife) {
    out.kind = 'knife';
    box(g, 0.004, 0.032, 0.17, 0, 0.01, -0.12, mat(m.color, 0.25, 0.9));
    box(g, 0.004, 0.012, 0.05, 0, 0.032, -0.06, mat(m.color, 0.25, 0.9));
    box(g, 0.012, 0.05, 0.012, 0, 0.005, -0.03, steel);
    box(g, 0.022, 0.03, 0.105, 0, 0.005, 0.03, accent);
    out.muzzle.set(0, 0.01, -0.2); out.sightY = 0.04; out.len = 0.3;
    return out;
  }

  if (m.pistol) {
    out.kind = 'pistol';
    const L = m.len, big = m.big ? 1.25 : 1;
    const slide = box(g, 0.028 * big, 0.032 * big, L, 0, 0.046 * big, 0.04 - L / 2, body);
    box(g, 0.026 * big, 0.022 * big, L * 0.82, 0, 0.022 * big, 0.04 - L * 0.45, accent);
    box(g, 0.028 * big, 0.1, 0.042 * big, 0, -0.035, 0.03, accent, 0.22);
    box(g, 0.006, 0.03, 0.045, 0, -0.002, -0.025, accent); // trigger guard
    box(g, 0.02, 0.008, 0.006, 0, 0.066 * big, 0.03, steel);  // rear sight
    box(g, 0.005, 0.008, 0.006, 0, 0.066 * big, 0.045 - L, steel); // front sight
    out.sightY = 0.07 * big;
    const mz = 0.04 - L;
    out.muzzle.set(0, 0.046 * big, mz);
    out.eject.set(0.02, 0.06 * big, 0);
    out.parts.slide = slide;
    out.parts.mag = box(g, 0.02 * big, 0.09, 0.03 * big, 0, -0.04, 0.032, steel, 0.22);
    if (has('extmag')) box(g, 0.022 * big, 0.035, 0.032 * big, 0, -0.1, 0.045, steel, 0.22);
    if (has('suppressor')) { tube(g, 0.016, mz, mz - 0.13, 0, 0.046 * big, steel); out.muzzle.z = mz - 0.13; }
    if (has('reddot')) { addRedDot(g, 0.062 * big, 0.02, 0.8); out.sightY = 0.062 * big + 0.02; }
    if (has('laser')) addLaser(g, 0, 0.012, -0.06);
    out.len = L + 0.05;
    return out;
  }

  // ---------------- long guns ----------------
  const recv = m.len * 0.45, hand = m.hand, w = m.heavy ? 0.06 : m.boxy ? 0.056 : 0.05;
  box(g, w, 0.072, recv + 0.05, 0, 0.036, (0.05 - recv) / 2, body);                 // receiver
  const hgMat = m.wood ? wood : accent;
  const hg = box(g, w * 0.9, 0.052, hand, 0, 0.038, -recv - hand / 2, hgMat);        // handguard / pump
  if (m.pump) out.parts.pump = hg;
  let exposed = m.barrel * 0.4;
  if (has('longbarrel')) exposed *= 1.6;
  const br = m.barrelR || 0.011, bz0 = -recv - hand * 0.2, bz1 = -recv - hand - exposed;
  tube(g, br, bz0, bz1, 0, 0.046, steel);
  if (m.pump) tube(g, br * 0.9, -recv, bz1 + 0.04, 0, 0.022, steel);                 // magazine tube
  let mz = bz1;
  if (has('suppressor')) { tube(g, 0.02, mz, mz - 0.17, 0, 0.046, mat(0x18191b, 0.6, 0.6)); mz -= 0.17; }
  else if (has('compensator')) { box(g, 0.03, 0.03, 0.05, 0, 0.046, mz - 0.02, steel); mz -= 0.045; }
  else tube(g, br * 1.5, mz + 0.03, mz, 0, 0.046, steel);                            // flash hider
  out.muzzle.set(0, 0.046, mz);

  // stock
  const sMat = m.wood ? wood : accent;
  if (has('lightstock')) {
    box(g, 0.012, 0.012, m.stock, 0, 0.055, 0.05 + m.stock / 2, steel);
    box(g, 0.012, 0.012, m.stock, 0, 0.0, 0.05 + m.stock / 2, steel);
    box(g, 0.026, 0.085, 0.015, 0, 0.027, 0.05 + m.stock, steel);
  } else {
    const fat = has('heavystock') ? 1.3 : 1;
    box(g, 0.032 * fat, 0.04 * fat, m.stock, 0, 0.04, 0.05 + m.stock / 2, sMat);
    box(g, 0.038 * fat, 0.11, 0.045, 0, 0.015, 0.05 + m.stock - 0.02, sMat);
    if (has('heavystock')) box(g, 0.042, 0.115, 0.018, 0, 0.015, 0.05 + m.stock + 0.008, mat(0x0d0d0d, 0.95, 0));
  }
  box(g, 0.032, 0.095, 0.04, 0, -0.04, 0.025, m.wood ? wood : accent, 0.3);          // pistol grip
  box(g, 0.006, 0.028, 0.06, 0, -0.012, -0.03, steel);                               // trigger guard

  if (m.mag) {
    const [mw, mh0, md, tilt] = m.mag;
    const mh = mh0 * (has('extmag') ? 1.35 : has('fastmag') ? 0.9 : 1);
    const mag = box(g, mw, mh, md, 0, -mh / 2 + 0.005, -recv * 0.42, m.heavy ? mat(0x3a4033, 0.8, 0.2) : steel, -tilt);
    mag.position.z -= Math.sin(tilt) * mh * 0.5;
    out.parts.mag = mag;
    if (has('fastmag')) box(g, mw + 0.006, 0.02, md + 0.006, 0, -mh * 0.6, -recv * 0.42 - Math.sin(tilt) * mh * 0.6, mat(0xb5651d, 0.9, 0));
  }
  box(g, 0.02, 0.008, recv + 0.03, 0, 0.076, (0.04 - recv) / 2, steel);              // top rail
  if (m.heavy) { box(g, 0.012, 0.03, 0.14, 0, 0.1, -recv * 0.3, steel); box(g, 0.01, 0.12, 0.01, 0.02, -0.01, bz1 + 0.1, steel, 0.5); box(g, 0.01, 0.12, 0.01, -0.02, -0.01, bz1 + 0.1, steel, 0.5); }
  if (m.bolt) { out.parts.bolt = box(g, 0.05, 0.012, 0.012, 0.045, 0.05, 0.0, steel); box(g, 0.016, 0.016, 0.016, 0.07, 0.05, 0.0, steel); }

  // sights / optics
  const sight = has('scope') ? 'scope2' : has('reddot') ? 'reddot' : (def.sight || 'iron');
  if (sight === 'reddot') { addRedDot(g, 0.08, -0.03, 1); out.sightY = 0.104; }
  else if (sight === 'scope2' || sight === 'scope') {
    const big = sight === 'scope' ? 1.35 : 1, y = 0.108;
    tube(g, 0.017 * big, 0.04, -0.14 * big, 0, y, steel);
    tube(g, 0.023 * big, -0.14 * big, -0.19 * big, 0, y, steel);
    tube(g, 0.021 * big, 0.07, 0.04, 0, y, steel);
    box(g, 0.02, 0.02, 0.02, 0, 0.088, 0.0, steel); box(g, 0.02, 0.02, 0.02, 0, 0.088, -0.1, steel);
    box(g, 0.012, 0.012, 0.012, 0, y + 0.022 * big, -0.05, steel);
    out.sightY = y; out.scoped = true;
  } else {
    box(g, 0.03, 0.02, 0.012, 0, 0.09, 0.02, steel);
    box(g, 0.01, 0.008, 0.014, 0, 0.096, 0.02, mat(0x0a0a0a, 1, 0));
    box(g, 0.005, 0.03, 0.006, 0, 0.09, -recv - hand + 0.02, steel);
    box(g, 0.022, 0.006, 0.006, 0, 0.076, -recv - hand + 0.02, steel);
    out.sightY = 0.1;
  }
  if (has('foregrip')) box(g, 0.026, 0.09, 0.028, 0, -0.03, -recv - hand * 0.55, steel, -0.12);
  if (has('laser')) addLaser(g, w * 0.5 + 0.012, 0.04, -recv - hand * 0.7);
  out.eject.set(w / 2 + 0.005, 0.06, -recv * 0.35);
  out.len = 0.05 + m.stock - mz;
  out.gripZ = -recv - hand * 0.5;
  return out;
}

function addRedDot(g, y, z, s) {
  const frame = mat(0x151617, 0.5, 0.7);
  box(g, 0.034 * s, 0.01, 0.05 * s, 0, y + 0.005, z, frame);
  box(g, 0.004, 0.034 * s, 0.03 * s, 0.017 * s, y + 0.027 * s, z, frame);
  box(g, 0.004, 0.034 * s, 0.03 * s, -0.017 * s, y + 0.027 * s, z, frame);
  box(g, 0.038 * s, 0.004, 0.03 * s, 0, y + 0.044 * s, z, frame);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
  dot.position.set(0, y + 0.024, z);
  g.add(dot);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.03 * s, 0.03 * s), new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.08, depthWrite: false }));
  lens.position.set(0, y + 0.026 * s, z);
  g.add(lens);
}

function addLaser(g, x, y, z) {
  box(g, 0.018, 0.018, 0.05, x, y, z, mat(0x151617, 0.5, 0.7));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
  dot.position.set(x, y, z - 0.027);
  g.add(dot);
}

export function buildGrenadeModel(scale = 1) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045 * scale, 1), mat(0x3d4a2f, 0.8, 0.2));
  b.scale.y = 1.25; g.add(b);
  box(g, 0.025 * scale, 0.02 * scale, 0.025 * scale, 0, 0.062 * scale, 0, mat(0x777a7d, 0.4, 0.8));
  box(g, 0.01 * scale, 0.05 * scale, 0.012 * scale, 0.03 * scale, 0.03 * scale, 0, mat(0x777a7d, 0.4, 0.8));
  return g;
}

/** First-person arm: forearm + glove, pointing from the hand back toward the body. */
export function buildArm(side) {
  const g = new THREE.Group();
  const sleeve = mat(0x3b4034, 0.95, 0), glove = mat(0x1a1b1c, 0.85, 0.05);
  box(g, 0.075, 0.075, 0.34, 0, 0, 0.2, sleeve);
  box(g, 0.085, 0.085, 0.06, 0, 0, 0.04, mat(0x2a2d25, 0.95, 0));
  box(g, 0.07, 0.085, 0.1, 0, 0.005, -0.03, glove);
  box(g, 0.03, 0.035, 0.06, side * 0.045, 0.0, -0.05, glove); // thumb
  return g;
}
