// First-person weapon view model with procedural animation: sway, bob, recoil, ADS alignment,
// sprint pose, reload / switch / melee / grenade motions and muzzle flash.
// Rendered in its own scene on top of the world so the gun never clips into walls.

import * as THREE from 'three';
import { buildGun, buildGrenadeModel } from './gunmodels.js';
import { bakeGeometry } from './bake.js';
import { radialTexture } from './textures.js';
import { PM } from '../game/player.js';
import { FRAG, MELEE } from '../game/weapons.js';

const HIP = { rifle: [0.19, -0.205, -0.36], pistol: [0.16, -0.17, -0.42], knife: [0.2, -0.2, -0.38] };
const ADS_Z = { rifle: -0.22, pistol: -0.36, knife: -0.38 };
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);

// The four hand rigs share two baked models. Detail follows the original hand origin and
// forearm envelope, so the weapon grips and all action animation continue to line up.
const armGeometry = new Map();
const armMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 });
function buildDetailedArm(side) {
  if (!armGeometry.has(side)) {
    const parts = new THREE.Group(), sourceGeometry = new Set(), sourceMaterial = new Map();
    const unit = new THREE.BoxGeometry(1, 1, 1); sourceGeometry.add(unit);
    const material = (color) => {
      if (!sourceMaterial.has(color)) sourceMaterial.set(color, new THREE.MeshStandardMaterial({ color }));
      return sourceMaterial.get(color);
    };
    const add = (geometry, color, x = 0, y = 0, z = 0) => {
      sourceGeometry.add(geometry);
      const mesh = new THREE.Mesh(geometry, material(color));
      mesh.position.set(x, y, z); parts.add(mesh); return mesh;
    };
    const box = (w, h, d, x, y, z, color) => {
      const mesh = add(unit, color, x, y, z); mesh.scale.set(w, h, d); return mesh;
    };
    // A squared, rounded cross section reads as fabric, with an irregular taper and elbow folds.
    const sleevePositions = [], sleeveIndices = [];
    const rings = [[0.025, 0.036], [0.058, 0.038], [0.075, 0.04], [0.09, 0.037],
      [0.13, 0.041], [0.15, 0.038], [0.22, 0.043], [0.25, 0.04], [0.37, 0.039]];
    for (let j = 0; j < rings.length; j++) {
      const [z, r] = rings[j];
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
        sleevePositions.push(Math.sign(c) * Math.pow(Math.abs(c), 0.65) * r,
          Math.sign(s) * Math.pow(Math.abs(s), 0.65) * r * 0.92, z);
        if (j < rings.length - 1) {
          const a = j * 12 + i, b = j * 12 + (i + 1) % 12, c1 = a + 12, d = b + 12;
          sleeveIndices.push(a, b, c1, b, d, c1);
        }
      }
    }
    const sleeve = new THREE.BufferGeometry();
    sleeve.setAttribute('position', new THREE.Float32BufferAttribute(sleevePositions, 3));
    sleeve.setIndex(sleeveIndices); sleeve.computeVertexNormals();
    add(sleeve, 0x424838);
    // Seams and shallow fabric creases are contained in the sleeve surface.
    box(0.003, 0.004, 0.27, side * 0.027, 0.034, 0.205, 0x59604a);
    for (const z of [0.085, 0.145, 0.245]) {
      const fold = box(0.052, 0.003, 0.006, 0, 0.035, z, 0x2d3428);
      fold.rotation.z = side * 0.1;
    }
    // Compact wrist cuff, fastening strap, stitched edge and small fabric pull tab.
    box(0.079, 0.075, 0.042, 0, 0, 0.035, 0x2d3229);
    box(0.08, 0.009, 0.023, 0, 0.037, 0.034, 0x1d2420);
    box(0.026, 0.004, 0.018, side * 0.017, 0.044, 0.034, 0x646b54);
    box(0.002, 0.002, 0.017, side * 0.027, 0.046, 0.034, 0x92977a);
    box(0.014, 0.006, 0.023, side * 0.033, 0.029, 0.023, 0x222823);
    // Bevelled palm keeps the original hand volume while softening its box silhouette.
    const rounded = (w, h, d, bevel) => {
      const shape = new THREE.Shape(), x = w / 2 - bevel, y = h / 2 - bevel;
      shape.moveTo(-x, -y); shape.lineTo(x, -y); shape.lineTo(x, y); shape.lineTo(-x, y); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d - bevel * 2, bevelEnabled: true,
        bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1, curveSegments: 1 });
      geo.translate(0, 0, -d / 2 + bevel); return geo;
    };
    add(rounded(0.07, 0.082, 0.095, 0.007), 0x24282a, 0, 0.005, -0.028);
    add(rounded(0.056, 0.012, 0.046, 0.003), 0x343b3c, 0, 0.047, -0.03);
    // Four knuckle pads and separated, curled fingers, mirrored for each hand.
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.015;
      add(rounded(0.011, 0.01, 0.018, 0.002), 0x505957, x, 0.052, -0.045);
      add(rounded(0.013, 0.052, 0.022, 0.003), i % 2 ? 0x2a3031 : 0x2e3434, x, -0.002, -0.073);
      box(0.009, 0.002, 0.005, x, 0.027, -0.076, 0x67706a);
    }
    const thumb = add(rounded(0.027, 0.031, 0.058, 0.005), 0x2b3131, side * 0.043, 0.004, -0.048);
    thumb.rotation.set(0.12, side * -0.2, side * -0.15);
    box(0.034, 0.002, 0.004, 0, 0.052, -0.005, 0x71796a);
    const { geo } = bakeGeometry(parts);
    geo.computeBoundingBox();
    armGeometry.set(side, geo);
    for (const geometry of sourceGeometry) geometry.dispose();
    for (const mat of sourceMaterial.values()) mat.dispose();
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(armGeometry.get(side), armMaterial));
  return group;
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x554433, 1.3);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-0.6, 1, 0.5);
    this.scene.add(this.hemi, this.sun);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.rig = new THREE.Group(); this.root.add(this.rig);
    this.armR = buildDetailedArm(1); this.armL = buildDetailedArm(-1);
    this.rig.add(this.armR, this.armL);

    // knife used for quick melee
    this.knifeRig = new THREE.Group(); this.root.add(this.knifeRig);
    this.knife = buildGun('knife').group; this.knifeRig.add(this.knife);
    const ka = buildDetailedArm(-1); ka.position.set(0, -0.02, 0.05); ka.rotation.set(0.5, -0.5, 0); this.knifeRig.add(ka);
    this.knifeRig.visible = false;

    // grenade hand
    this.nadeRig = new THREE.Group(); this.root.add(this.nadeRig);
    this.nadeRig.add(buildGrenadeModel(1));
    const na = buildDetailedArm(-1); na.position.set(0.01, -0.04, 0.06); na.rotation.set(0.6, -0.4, 0); this.nadeRig.add(na);
    this.nadeRig.visible = false;

    // muzzle flash: three additive quads
    const ft = radialTexture('rgba(255,240,200,1)', 'rgba(255,140,30,0)');
    this.flashMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false });
    this.flash = new THREE.Group();
    const q = new THREE.PlaneGeometry(1, 1);
    const f1 = new THREE.Mesh(q, this.flashMat); const f2 = new THREE.Mesh(q, this.flashMat); f2.rotation.y = Math.PI / 2; f2.scale.set(1.6, 0.5, 1);
    const f3 = new THREE.Mesh(q, this.flashMat); f3.rotation.set(Math.PI / 2, 0, Math.PI / 2); f3.scale.set(1.6, 0.5, 1);
    this.flash.add(f1, f2, f3); this.flash.visible = false; this.flash.renderOrder = 5;
    this.rig.add(this.flash);

    this.gun = null; this.key = '';
    this.kickZ = 0; this.kickRot = 0; this.kickRoll = 0; this.swayX = 0; this.swayY = 0; this.flashT = 0; this.cycleT = 9;
    this.landY = 0; this.vyS = 0; this.sprintK = 0; this.throwT = 9; this.meleeHold = 0; this.lastReloadP = 0; this.strafe = 0;
    this.hidden = false; this.ads = 0;
    this._v = new THREE.Vector3();
  }

  setEnv(env) {
    this.hemi.color.setHex(env.hemiSky); this.hemi.groundColor.setHex(env.hemiGround);
    this.sun.color.setHex(env.sunColor);
    this.hemi.intensity = 2.2 * (env.vmLight || 1); this.sun.intensity = 2.6 * (env.vmLight || 1);
  }

  setWeapon(id, att) {
    const key = id + ':' + (att || []).join(',');
    if (key === this.key) return;
    this.key = key;
    if (this.gun) { this.rig.remove(this.gun.group); }
    const gun = this.gun = buildGun(id, att || []);
    this.rig.add(gun.group);
    this.flash.position.copy(gun.muzzle); this.flash.position.z -= 0.06;
    // hands
    if (gun.kind === 'rifle') {
      this.armR.position.set(0.0, -0.055, 0.035); this.armR.rotation.set(0.42, 0.34, 0);
      this.armL.position.set(-0.005, -0.012, gun.gripZ || -0.3); this.armL.rotation.set(0.5, -0.85, 0.2);
      this.armL.visible = true;
    } else if (gun.kind === 'pistol') {
      this.armR.position.set(0.0, -0.06, 0.04); this.armR.rotation.set(0.38, 0.3, 0);
      this.armL.position.set(-0.03, -0.075, 0.035); this.armL.rotation.set(0.42, -0.55, 0.3);
      this.armL.visible = true;
    } else {
      this.armR.position.set(0.0, -0.01, 0.05); this.armR.rotation.set(0.45, 0.3, 0);
      this.armL.visible = false;
    }
    this.cycleT = 9; this.lastReloadP = 0;
  }

  onFire(st, suppressed) {
    const k = st.kick * (1 - this.ads * 0.45);
    this.kickZ += 0.028 * k; this.kickRot += 0.03 * k; this.kickRoll += (Math.random() - 0.5) * 0.03 * k;
    this.kickZ = Math.min(this.kickZ, 0.11); this.kickRot = Math.min(this.kickRot, 0.2);
    this.flashT = suppressed ? 0 : 0.05;
    this.flashScale = (0.1 + Math.random() * 0.06) * (st.cls === 'shotgun' || st.cls === 'sniper' ? 1.7 : st.cls === 'pistol' ? 0.8 : 1);
    this.flash.rotation.z = Math.random() * Math.PI;
    this.cycleT = 0;
  }
  onThrow() { this.throwT = 0; }

  /** World-space muzzle position (approximate: view model space mapped through the main camera). */
  muzzleWorld(mainCamera, out) {
    if (!this.gun) return out.copy(mainCamera.position);
    out.copy(this.gun.muzzle); this.rig.localToWorld(out);
    return out.applyMatrix4(mainCamera.matrixWorld);
  }
  ejectWorld(mainCamera, out) {
    if (!this.gun) return out.copy(mainCamera.position);
    out.copy(this.gun.eject); this.rig.localToWorld(out);
    return out.applyMatrix4(mainCamera.matrixWorld);
  }

  /**
   * c: {s: predicted state, st: weapon stats, mdx, mdy: mouse delta this frame, bob: phase, bobAmt: 0..1,
   *     alive, onStage(stage) callback for reload sounds}
   */
  update(dt, c) {
    const s = c.s, st = c.st, gun = this.gun;
    if (!gun) return;
    const kind = gun.kind;
    const ads = this.ads = smooth(s.ads);
    const hip = HIP[kind];
    this.hidden = !c.alive || (gun.scoped && s.ads > 0.82);
    this.root.visible = !this.hidden;

    // springs
    this.kickZ -= this.kickZ * Math.min(1, dt * 13); this.kickRot -= this.kickRot * Math.min(1, dt * 11); this.kickRoll -= this.kickRoll * Math.min(1, dt * 10);
    this.swayX += (Math.max(-1, Math.min(1, -c.mdx * 0.004)) - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (Math.max(-1, Math.min(1, c.mdy * 0.004)) - this.swayY) * Math.min(1, dt * 9);
    this.vyS += (s.vy - this.vyS) * Math.min(1, dt * 10);
    this.sprintK += ((s.sprint ? 1 : 0) - this.sprintK) * Math.min(1, dt * 9);
    this.strafe += ((c.strafe || 0) - this.strafe) * Math.min(1, dt * 7);
    this.cycleT += dt; this.throwT += dt;

    let px = lerp(hip[0], 0, ads), py = lerp(hip[1], -gun.sightY, ads), pz = lerp(hip[2], ADS_Z[kind], ads);
    let rx = 0, ry = lerp(0.035, 0, ads), rz = 0;
    const hipK = 1 - ads * 0.85;

    // bob + sway + air
    const bob = c.bobAmt * hipK;
    px += Math.sin(c.bob) * 0.008 * bob; py += -Math.abs(Math.cos(c.bob)) * 0.009 * bob + 0.004 * bob;
    rz += Math.sin(c.bob) * 0.012 * bob - this.strafe * 0.035 * hipK;
    ry += this.swayX * 0.07 * hipK + this.swayX * 0.012; rx += this.swayY * 0.05 * hipK + this.swayY * 0.01;
    px += this.swayX * 0.012 * hipK; py += this.swayY * 0.01 * hipK;
    py += Math.max(-0.035, Math.min(0.035, -this.vyS * 0.004)) * hipK;

    // sprint pose
    const sp = smooth(this.sprintK);
    if (sp > 0.001) {
      if (kind === 'rifle') { px += -0.05 * sp; py += -0.045 * sp; pz += 0.05 * sp; ry += 0.75 * sp; rx += -0.22 * sp; rz += 0.18 * sp; }
      else { py += -0.07 * sp; rx += -0.5 * sp; pz += 0.04 * sp; }
      px += Math.sin(c.bob) * 0.012 * sp; py += Math.abs(Math.cos(c.bob)) * 0.014 * sp;
    }
    // slide: tilt the gun
    if (s.slide > 0) { rz += 0.25 * hipK; py -= 0.03 * hipK; }

    // recoil
    pz += this.kickZ; rx += this.kickRot; rz += this.kickRoll; py += this.kickRot * 0.06;

    // reload
    if (s.reload > 0 && st.reload > 0) {
      const p = 1 - s.reload / st.reload, dip = Math.sin(Math.min(1, p * 1.05) * Math.PI);
      py -= 0.09 * dip; rz += 0.55 * dip; rx += 0.25 * dip; px -= 0.03 * dip;
      if (gun.parts.mag) {
        const out = p < 0.18 ? 0 : p < 0.38 ? (p - 0.18) / 0.2 : p < 0.55 ? 1 : p < 0.72 ? 1 - (p - 0.55) / 0.17 : 0;
        gun.parts.mag.position.y = (gun.parts.mag.userData.y0 ?? (gun.parts.mag.userData.y0 = gun.parts.mag.position.y)) - out * 0.22;
        this.armL.position.y = (kind === 'rifle' ? -0.012 : -0.075) - out * 0.2;
      }
      if (c.onStage) {
        if (this.lastReloadP < 0.18 && p >= 0.18) c.onStage(0);
        if (this.lastReloadP < 0.62 && p >= 0.62) c.onStage(1);
        if (this.lastReloadP < 0.86 && p >= 0.86) c.onStage(2);
      }
      this.lastReloadP = p;
    } else {
      this.lastReloadP = 0;
      if (gun.parts.mag && gun.parts.mag.userData.y0 !== undefined) { gun.parts.mag.position.y = gun.parts.mag.userData.y0; this.armL.position.y = kind === 'rifle' ? -0.012 : -0.075; }
    }

    // action cycling (pump / bolt / slide)
    const ct = this.cycleT;
    if (gun.parts.pump) { const k = ct > 0.18 && ct < 0.62 ? Math.sin(((ct - 0.18) / 0.44) * Math.PI) : 0; gun.parts.pump.position.z = (gun.parts.pump.userData.z0 ?? (gun.parts.pump.userData.z0 = gun.parts.pump.position.z)) + k * 0.075; this.armL.position.z = (gun.gripZ || -0.3) + k * 0.075; }
    if (gun.parts.bolt) { const k = ct > 0.25 && ct < 0.95 ? Math.sin(((ct - 0.25) / 0.7) * Math.PI) : 0; gun.parts.bolt.position.z = k * 0.07; gun.parts.bolt.rotation.z = k * 0.9; rz += k * 0.12 * hipK; if (k > 0.01) { py -= 0.012 * k; } }
    if (gun.parts.slide) { const k = ct < 0.09 ? Math.sin((ct / 0.09) * Math.PI) : 0; gun.parts.slide.position.z = (gun.parts.slide.userData.z0 ?? (gun.parts.slide.userData.z0 = gun.parts.slide.position.z)) + k * 0.035; }

    // weapon switch / grenade: lower the gun
    let lower = s.switchT > 0 ? s.switchT / PM.SWITCH_TIME : 0;
    const cooking = s.cook >= 0, throwing = this.throwT < 0.3;
    if (cooking || throwing) lower = Math.max(lower, 0.85);
    // melee
    const mk = s.meleeT > 0 ? 1 - s.meleeT / MELEE.cooldown : -1; // 0..1 through the swing
    if (kind !== 'knife' && mk >= 0 && mk < 0.75) lower = Math.max(lower, 0.6);
    this.lowerK = (this.lowerK || 0) + (lower - (this.lowerK || 0)) * Math.min(1, dt * 16);
    py -= 0.3 * this.lowerK; rx -= 0.7 * this.lowerK;

    // knife swing
    if (kind === 'knife') {
      this.knifeRig.visible = false;
      if (mk >= 0 && mk < 0.6) { const k = Math.sin((mk / 0.6) * Math.PI); px -= 0.3 * k; pz -= 0.14 * k; ry += 1.1 * k; rz += 0.5 * k; py += 0.03 * k; }
    } else if (mk >= 0 && mk < 0.7) {
      const k = mk / 0.7, sw = Math.sin(k * Math.PI);
      this.knifeRig.visible = true;
      this.knifeRig.position.set(lerp(0.28, -0.22, smooth(k)), -0.14 + sw * 0.03, -0.36 - sw * 0.12);
      this.knifeRig.rotation.set(-0.1, lerp(-0.3, 1.3, smooth(k)), 0.9 - sw * 0.3);
    } else this.knifeRig.visible = false;

    // grenade
    if (cooking) {
      this.nadeRig.visible = true;
      const shake = s.cook > FRAG.fuse * 0.6 ? Math.sin(performance.now() * 0.05) * 0.004 : 0;
      this.nadeRig.position.set(-0.13 + shake, -0.15, -0.34); this.nadeRig.rotation.set(0.2, 0.3, 0.2);
    } else if (throwing) {
      const k = this.throwT / 0.3;
      this.nadeRig.visible = k < 0.5;
      this.nadeRig.position.set(-0.13 + k * 0.2, -0.15 + Math.sin(k * Math.PI) * 0.2, -0.34 - k * 0.5);
    } else this.nadeRig.visible = false;

    this.rig.position.set(px, py, pz);
    this.rig.rotation.set(rx, ry, rz);

    // muzzle flash
    // opacity is taken before the timer advances so the first frame is always fully visible,
    // whatever the frame rate
    if (this.flashT > 0) { this.flashMat.opacity = Math.min(1, this.flashT / 0.03); this.flashT -= dt; this.flash.visible = true; const sc = this.flashScale; this.flash.scale.set(sc, sc, sc * 1.4); }
    else this.flash.visible = false;
  }
}
