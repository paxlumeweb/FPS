// Detailed procedural soldiers with a walk cycle, crouch / slide poses, aim pitch,
// a simple death fall, team colours and name tags for teammates. Visuals only;
// animated pivots and the authoritative player shapes are unchanged.

import * as THREE from 'three';
import { buildGun } from './gunmodels.js';
import { radialTexture } from './textures.js';
import { bakeGeometry } from './bake.js';

// One shared vertex-coloured material for every baked soldier part and carried gun.
const BAKED = new THREE.MeshLambertMaterial({ vertexColors: true });
const gunCache = new Map(); // weapon id -> {geo, muzzle}
const soldierCache = new Map(); // six shared baked geometries: three parts for each team

/** Replace all the small meshes directly inside `group` with one baked mesh (child groups are kept). */
function bakeInPlace(group, key) {
  const tmp = new THREE.Group();
  for (const c of [...group.children]) if (c.isMesh) tmp.add(c);
  if (!tmp.children.length) return;
  let geo = soldierCache.get(key);
  if (!geo) { geo = bakeGeometry(tmp).geo; soldierCache.set(key, geo); }
  addBakedPart(group, key, geo);
}
function addBakedPart(group, key, geo) {
  const m = new THREE.Mesh(geo, BAKED); m.castShadow = true; m.receiveShadow = true;
  m.name = 'soldier:' + key;
  group.add(m);
}

const geo = new THREE.BoxGeometry(1, 1, 1);
// Bevelled, octagonal cross-section: small hard highlights without subdivision-heavy models.
const bevelShape = new THREE.Shape();
bevelShape.moveTo(-0.35, -0.43);
for (const [x, y] of [[0.35, -0.43], [0.43, -0.35], [0.43, 0.35], [0.35, 0.43], [-0.35, 0.43], [-0.43, 0.35], [-0.43, -0.35]]) bevelShape.lineTo(x, y);
bevelShape.closePath();
const bevelGeo = new THREE.ExtrudeGeometry(bevelShape, { depth: 0.84, steps: 1, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 1 });
bevelGeo.center();
// Normalise the small corner bevels, so dimensions below remain the full outer dimensions.
bevelGeo.computeBoundingBox();
const bevelSize = bevelGeo.boundingBox.getSize(new THREE.Vector3());
bevelGeo.scale(1 / bevelSize.x, 1 / bevelSize.y, 1 / bevelSize.z);
const roundGeo = new THREE.SphereGeometry(0.5, 12, 8);
const domeGeo = new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.61);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const upAxis = new THREE.Vector3(0, 1, 0);
const M = {};
function lam(color) { return M[color] || (M[color] = new THREE.MeshLambertMaterial({ color })); }
const TEAM = { friend: 0x2f7fe0, enemy: 0xd8432f };

function part(parent, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
  parent.add(m); return m;
}

function shaped(parent, shape, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(shape, material);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  parent.add(m); return m;
}
function bevel(parent, w, h, d, x, y, z, material) {
  return shaped(parent, bevelGeo, w, h, d, x, y, z, material);
}
function round(parent, w, h, d, x, y, z, material) {
  return shaped(parent, roundGeo, w, h, d, x, y, z, material);
}
function segment(parent, a, b, width, depth, material) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), dir = to.clone().sub(from);
  const m = bevel(parent, width, dir.length(), depth, 0, 0, 0, material);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(upAxis, dir.normalize());
  return m;
}

/** Equipment is baked into the existing three animated parts, never into collision geometry. */
function buildSoldierParts(legL, legR, up, friendly) {
  const key = friendly ? 'friend:' : 'enemy:';
  const groups = [[legL, 'legL'], [legR, 'legR'], [up, 'upper']];
  if (groups.every(([, name]) => soldierCache.has(key + name))) {
    for (const [grp, name] of groups) addBakedPart(grp, key + name, soldierCache.get(key + name));
    return;
  }
  const cloth = lam(0x58604d), clothLight = lam(0x6d7259), clothDark = lam(0x3e473b);
  const armor = lam(0x303930), web = lam(0x7d7c61), seams = lam(0x202822);
  const boot = lam(0x252823), rubber = lam(0x141915), steel = lam(0x9caa9c);
  const skin = lam(0xbc9677), team = lam(friendly ? TEAM.friend : TEAM.enemy);
  const lens = lam(0x294c58), glint = lam(0x9fbcc1);

  for (const [l, side] of [[legL, -1], [legR, 1]]) {
    bevel(l, 0.175, 0.34, 0.205, 0, -0.18, 0.008, cloth);
    bevel(l, 0.15, 0.33, 0.17, 0, -0.535, 0.005, clothDark);
    // Cargo pockets, stitched flaps, fabric folds and a layered knee cup.
    bevel(l, 0.043, 0.17, 0.15, side * 0.087, -0.215, 0.012, clothLight);
    part(l, 0.047, 0.025, 0.16, side * 0.09, -0.15, 0.012, web);
    part(l, 0.016, 0.03, 0.012, side * 0.115, -0.185, -0.043, seams);
    bevel(l, 0.16, 0.16, 0.055, 0, -0.39, -0.088, seams);
    bevel(l, 0.135, 0.115, 0.048, 0, -0.384, -0.118, armor);
    part(l, 0.105, 0.012, 0.006, 0, -0.383, -0.145, web);
    part(l, 0.158, 0.027, 0.18, 0, -0.42, 0.005, web);
    bevel(l, 0.13, 0.027, 0.018, 0, -0.57, -0.084, clothLight).rotation.z = side * 0.14;
    bevel(l, 0.15, 0.018, 0.027, 0, -0.305, -0.09, clothDark).rotation.z = -side * 0.12;
    // High ankle, separate toe cap, sole and laces retain the original ground contact.
    bevel(l, 0.16, 0.2, 0.18, 0, -0.69, 0.005, boot);
    bevel(l, 0.18, 0.125, 0.265, 0, -0.76, -0.035, boot);
    bevel(l, 0.178, 0.065, 0.1, 0, -0.773, -0.12, armor);
    bevel(l, 0.182, 0.035, 0.274, 0, -0.817, -0.035, rubber);
    for (const y of [-0.68, -0.711, -0.742]) {
      part(l, 0.089, 0.008, 0.009, 0, y, -0.091, web).rotation.z = side * 0.09;
    }
    part(l, 0.075, 0.032, 0.008, 0, -0.8, 0.1, web);
  }
  // Hip section and utility belt, under a shaped combat shirt and plate carrier.
  bevel(up, 0.36, 0.135, 0.235, 0, 0.015, 0.006, clothDark);
  bevel(up, 0.4, 0.53, 0.235, 0, 0.3, 0, cloth);
  bevel(up, 0.4, 0.06, 0.26, 0, 0.082, 0, seams);
  bevel(up, 0.067, 0.041, 0.018, 0, 0.08, -0.14, steel);
  part(up, 0.041, 0.023, 0.008, 0, 0.08, -0.153, seams);
  for (const x of [-0.145, 0.145]) {
    bevel(up, 0.065, 0.08, 0.065, x, 0.075, -0.14, web);
    bevel(up, 0.065, 0.13, 0.08, x, 0.11, 0.145, armor);
  }
  bevel(up, 0.42, 0.35, 0.292, 0, 0.37, 0, armor);
  bevel(up, 0.35, 0.29, 0.047, 0, 0.395, -0.157, team);
  bevel(up, 0.35, 0.29, 0.04, 0, 0.395, 0.155, team);
  // Padded shoulder straps, buckles and rows of MOLLE webbing.
  for (const x of [-0.142, 0.142]) {
    bevel(up, 0.065, 0.13, 0.29, x, 0.535, 0.0, web);
    part(up, 0.048, 0.033, 0.014, x, 0.53, -0.151, seams);
    part(up, 0.028, 0.014, 0.019, x, 0.53, -0.161, steel);
  }
  for (const y of [0.348, 0.392, 0.436]) {
    part(up, 0.325, 0.012, 0.009, 0, y, -0.184, web);
    for (const x of [-0.108, 0, 0.108]) part(up, 0.009, 0.021, 0.012, x, y, -0.19, seams);
  }
  // Three individual magazine pouches with top flaps and pull tabs.
  for (const x of [-0.105, 0, 0.105]) {
    bevel(up, 0.09, 0.14, 0.065, x, 0.267, -0.19, clothDark);
    bevel(up, 0.092, 0.035, 0.069, x, 0.327, -0.193, web);
    part(up, 0.014, 0.055, 0.009, x, 0.28, -0.228, web);
  }
  // Small rank / identification panel keeps both teams immediately legible.
  bevel(up, 0.13, 0.046, 0.011, 0.065, 0.488, -0.184, seams);
  for (const x of [0.03, 0.058, 0.086]) part(up, 0.017, 0.019, 0.004, x, 0.488, -0.192, web);
  bevel(up, 0.055, 0.11, 0.055, -0.19, 0.415, -0.15, seams);
  part(up, 0.008, 0.13, 0.008, -0.204, 0.53, -0.13, seams);
  // Compact hydration pack with gusset, compression straps and a medical patch.
  bevel(up, 0.28, 0.32, 0.125, 0, 0.34, 0.218, clothDark);
  bevel(up, 0.225, 0.18, 0.035, 0, 0.285, 0.285, clothLight);
  for (const x of [-0.083, 0.083]) part(up, 0.023, 0.275, 0.012, x, 0.345, 0.289, web);
  part(up, 0.055, 0.052, 0.01, 0, 0.39, 0.284, team);
  part(up, 0.034, 0.009, 0.012, 0, 0.39, 0.292, web);
  part(up, 0.009, 0.034, 0.012, 0, 0.39, 0.292, web);
  bevel(up, 0.065, 0.1, 0.08, 0.22, 0.17, 0.07, clothLight);

  // Sleeves and bent forearms reach the same, unchanged weapon holder.
  segment(up, [-0.235, 0.49, 0], [-0.272, 0.305, -0.145], 0.13, 0.145, cloth);
  segment(up, [0.235, 0.49, 0], [0.275, 0.315, -0.13], 0.13, 0.145, cloth);
  round(up, 0.123, 0.12, 0.12, -0.27, 0.307, -0.145, armor);
  round(up, 0.123, 0.12, 0.12, 0.273, 0.315, -0.13, armor);
  segment(up, [-0.27, 0.307, -0.145], [0.045, 0.377, -0.505], 0.095, 0.1, clothLight);
  segment(up, [0.273, 0.315, -0.13], [0.1, 0.365, -0.304], 0.095, 0.1, clothLight);
  for (const side of [-1, 1]) {
    bevel(up, 0.025, 0.085, 0.105, side * 0.293, 0.456, -0.027, team);
    part(up, 0.006, 0.014, 0.073, side * 0.308, 0.459, -0.027, web);
  }
  bevel(up, 0.082, 0.095, 0.09, 0.1, 0.363, -0.312, seams).rotation.x = -0.2;
  bevel(up, 0.09, 0.075, 0.11, 0.048, 0.382, -0.505, seams).rotation.z = 0.4;
  for (const x of [0.074, 0.096, 0.118]) part(up, 0.013, 0.015, 0.015, x, 0.396, -0.347, armor);
  bevel(up, 0.035, 0.035, 0.035, 0.067, 0.397, -0.292, armor);

  // Rounded head, neck gaiter, brow and a low-profile tactical helmet.
  shaped(up, cylGeo, 0.135, 0.09, 0.135, 0, 0.615, 0, skin);
  round(up, 0.22, 0.25, 0.213, 0, 0.735, -0.002, skin);
  round(up, 0.226, 0.135, 0.22, 0, 0.672, -0.002, clothDark);
  bevel(up, 0.16, 0.045, 0.035, 0, 0.687, -0.106, clothDark);
  bevel(up, 0.033, 0.048, 0.041, 0, 0.738, -0.107, skin);
  shaped(up, domeGeo, 0.29, 0.23, 0.314, 0, 0.82, 0.008, armor);
  shaped(up, cylGeo, 0.28, 0.027, 0.3, 0, 0.79, 0.008, clothDark);
  bevel(up, 0.264, 0.025, 0.092, 0, 0.801, -0.118, armor);
  // Team crown stripe and rear IFF patch on an otherwise subdued helmet.
  bevel(up, 0.055, 0.017, 0.135, 0, 0.934, 0.0, team);
  bevel(up, 0.095, 0.038, 0.014, 0, 0.833, 0.159, team);
  bevel(up, 0.04, 0.055, 0.025, 0, 0.864, -0.135, seams);
  part(up, 0.018, 0.018, 0.01, 0, 0.869, -0.151, steel);
  // Ear protection, mounting rails and a chin strap.
  for (const side of [-1, 1]) {
    bevel(up, 0.04, 0.085, 0.076, side * 0.123, 0.744, 0.012, seams);
    bevel(up, 0.028, 0.057, 0.06, side * 0.147, 0.744, 0.012, clothDark);
    bevel(up, 0.02, 0.031, 0.1, side * 0.141, 0.824, 0.018, web);
    segment(up, [side * 0.107, 0.762, 0.036], [side * 0.076, 0.663, -0.048], 0.012, 0.013, seams);
  }
  // Two distinct lenses, bridge and reflected sky strips read at mid-range.
  bevel(up, 0.23, 0.066, 0.04, 0, 0.785, -0.114, rubber);
  for (const x of [-0.056, 0.056]) {
    bevel(up, 0.092, 0.041, 0.015, x, 0.787, -0.139, lens);
    part(up, 0.063, 0.007, 0.003, x, 0.798, -0.148, glint);
  }
  part(up, 0.02, 0.023, 0.01, 0, 0.787, -0.148, armor);
  segment(up, [-0.154, 0.736, -0.012], [-0.103, 0.7, -0.121], 0.008, 0.008, seams);
  bevel(up, 0.034, 0.014, 0.016, -0.087, 0.7, -0.13, seams);

  for (const [grp, partName] of groups) bakeInPlace(grp, key + partName);
}

function nameSprite(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = '600 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6; ctx.fillStyle = color; ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: true }));
  s.scale.set(1.5, 0.375, 1); s.position.y = 2.1; s.renderOrder = 4;
  return s;
}

class Soldier {
  constructor(scene, friendly, name, showName) {
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); root.add(body);
    // Keep the original hip/waist pivots for all existing animation states.
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.legL.position.set(-0.11, 0.84, 0); this.legR.position.set(0.11, 0.84, 0);
    body.add(this.legL, this.legR);
    const up = this.upper = new THREE.Group(); up.position.set(0, 0.84, 0); body.add(up);
    buildSoldierParts(this.legL, this.legR, up, friendly);
    this.gunHolder = new THREE.Group(); this.gunHolder.position.set(0.1, 0.42, -0.34); up.add(this.gunHolder);
    this.weapon = '';
    // muzzle flash sprite
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: Soldier.flashTex || (Soldier.flashTex = radialTexture('rgba(255,235,190,1)', 'rgba(255,130,20,0)')), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.flash.scale.set(0.5, 0.5, 1); this.flash.visible = false; this.gunHolder.add(this.flash);
    if (showName) { this.tag = nameSprite(name, friendly ? '#8cc4ff' : '#ff9a8c'); root.add(this.tag); }
    scene.add(root);
    this.phase = Math.random() * 6; this.deathT = -1; this.flashT = 0; this.stepDist = 0; this.lx = null; this.lz = 0; this.crouchK = 0;
    this.friendly = friendly;
  }

  setWeapon(id) {
    if (id === this.weapon) return;
    this.weapon = id;
    if (this.gunMesh) this.gunHolder.remove(this.gunMesh);
    let g = gunCache.get(id);
    if (!g) { const built = buildGun(id); g = { geo: bakeGeometry(built.group).geo, muzzle: built.muzzle.clone() }; gunCache.set(id, g); }
    this.gunMesh = new THREE.Mesh(g.geo, BAKED); this.gunMesh.castShadow = true;
    this.gunHolder.add(this.gunMesh);
    this.flash.position.copy(g.muzzle); this.flash.position.z -= 0.1;
    this.muzzleLocal = g.muzzle;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse((o) => { if (o.isMesh && o.geometry.userData.own) o.geometry.dispose(); });
    this.flash.material.dispose();
    if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); }
  }
}

export class Characters {
  constructor(scene) { this.scene = scene; this.map = new Map(); this._v = new THREE.Vector3(); }

  clear() { for (const s of this.map.values()) s.dispose(this.scene); this.map.clear(); }

  /** Position (world) of a player's muzzle, for tracers. */
  muzzle(id, out) {
    const s = this.map.get(id);
    if (!s || !s.muzzleLocal) return null;
    out.copy(s.muzzleLocal); s.gunHolder.localToWorld(out);
    return out;
  }
  flash(id) { const s = this.map.get(id); if (s) s.flashT = 0.06; }

  /**
   * remote: Map id -> {x,y,z,yaw,pitch,flags,w,speed}; client gives names/teams.
   * onStep(pos, running) is called when a remote player's foot lands (for positional footsteps).
   */
  update(dt, remote, client, onStep) {
    for (const [id, s] of this.map) if (!remote.has(id)) { s.dispose(this.scene); this.map.delete(id); }
    for (const [id, r] of remote) {
      let s = this.map.get(id);
      const friendly = !client.isEnemy(id);
      if (s && s.friendly !== friendly) { s.dispose(this.scene); this.map.delete(id); s = null; }
      if (!s) { s = new Soldier(this.scene, friendly, client.nameOf(id), friendly); this.map.set(id, s); }
      s.setWeapon(r.w);
      const alive = (r.flags & 1) !== 0, crouch = (r.flags & 2) !== 0, slide = (r.flags & 4) !== 0, ground = (r.flags & 32) !== 0;
      s.root.position.set(r.x, r.y, r.z);
      s.root.rotation.y = r.yaw;
      if (!alive) {
        if (s.deathT < 0) s.deathT = 0;
        s.deathT += dt;
        const k = Math.min(1, s.deathT / 0.4), e = k * k;
        s.body.rotation.x = e * 1.5; s.body.position.y = e * 0.2; s.upper.rotation.x = 0;
        s.legL.rotation.x = e * 0.2; s.legR.rotation.x = -e * 0.3;
        s.root.visible = s.deathT < 6;
        if (s.tag) s.tag.visible = false;
        continue;
      }
      if (s.deathT >= 0) { s.deathT = -1; s.body.rotation.x = 0; s.root.visible = true; if (s.tag) s.tag.visible = true; }
      s.root.visible = true;
      s.crouchK += ((crouch ? 1 : 0) - s.crouchK) * Math.min(1, dt * 12);
      const ck = s.crouchK;
      const k = Math.min(1, r.speed / 5);
      s.phase += r.speed * dt * 2.3;
      const sw = ground ? Math.sin(s.phase) * 0.75 * k : 0.35;
      if (slide) {
        s.body.rotation.x = 0.9; s.body.position.y = -0.25; s.legL.rotation.x = -1.2; s.legR.rotation.x = -0.9; s.upper.rotation.x = -0.6;
      } else {
        s.body.rotation.x = 0; s.body.position.y = -0.5 * ck;
        s.legL.rotation.x = sw * (1 - ck) - ck * 1.25; s.legR.rotation.x = -sw * (1 - ck) + ck * 1.3;
        s.legL.position.y = 0.84; s.legR.position.y = 0.84;
        s.upper.rotation.x = Math.max(-0.9, Math.min(0.9, r.pitch)) * 0.75 - ck * 0.15;
        s.upper.position.y = 0.84 - Math.abs(Math.sin(s.phase)) * 0.03 * k;
      }
      if (s.tag) s.tag.position.y = 2.1 - 0.55 * ck;
      if (s.flashT > 0) { s.flashT -= dt; s.flash.visible = true; s.flash.material.rotation = Math.random() * 6; } else s.flash.visible = false;
      // footsteps
      if (s.lx !== null && ground && !crouch && r.speed > 3.2) {
        s.stepDist += Math.hypot(r.x - s.lx, r.z - s.lz);
        if (s.stepDist > 2.3) { s.stepDist = 0; if (onStep) onStep(r, r.speed > 6); }
      }
      s.lx = r.x; s.lz = r.z;
    }
  }
}
