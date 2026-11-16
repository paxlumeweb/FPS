// Visual effects: tracers, impact particles, bullet-hole decals, ejected shells, explosions,
// grenade models and the throw-arc preview. Everything is pooled; nothing allocates per shot.

import * as THREE from 'three';
import { radialTexture, decalTexture } from './textures.js';
import { buildGrenadeModel } from './gunmodels.js';

const SURFACE_COLORS = {
  asphalt: [0.25, 0.25, 0.26], concrete: [0.6, 0.6, 0.58], concreteDark: [0.4, 0.4, 0.4], brick: [0.55, 0.3, 0.24], brickDark: [0.4, 0.26, 0.22],
  plaster: [0.8, 0.76, 0.68], wood: [0.55, 0.42, 0.28], woodDark: [0.4, 0.3, 0.2], sand: [0.8, 0.66, 0.44], sandDark: [0.7, 0.56, 0.36], sandstone: [0.78, 0.66, 0.48],
  mudbrick: [0.7, 0.56, 0.38], mudDark: [0.56, 0.44, 0.3], rock: [0.56, 0.5, 0.42], grass: [0.3, 0.4, 0.2], leaves: [0.25, 0.4, 0.18], stone: [0.64, 0.62, 0.58],
  floorIndustrial: [0.48, 0.48, 0.5], sidewalk: [0.56, 0.55, 0.53], paving: [0.6, 0.56, 0.5],
};
const METALS = new Set(['metal', 'metalDark', 'metalGreen', 'metalYellow', 'rust', 'container', 'paint', 'glass']);

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.alpha = new Float32Array(max); this.grow = new Float32Array(max);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } }, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vColor; uniform float scale; void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vColor; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vColor.rgb, vColor.a * smoothstep(0.5, 0.15, d)); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }',
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 3;
    g.setDrawRange(0, 0);
    scene.add(this.points);
  }
  add(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav = 9, drag = 1, grow = 0) {
    let i = this.n;
    if (i >= this.max) i = (Math.random() * this.max) | 0; else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = a; this.grow[i] = grow;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }
  update(dt) {
    const { pos, vel, life, col, size } = this;
    for (let i = 0; i < this.n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { // swap-remove
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { pos[i * 3 + k] = pos[l * 3 + k]; vel[i * 3 + k] = vel[l * 3 + k]; }
          for (let k = 0; k < 4; k++) col[i * 4 + k] = col[l * 4 + k];
          life[i] = life[l]; this.maxLife[i] = this.maxLife[l]; size[i] = size[l]; this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.alpha[i] = this.alpha[l]; this.grow[i] = this.grow[l];
        }
        i--; continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - this.grav[i] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] += this.grow[i] * dt;
      col[i * 4 + 3] = this.alpha[i] * Math.min(1, (life[i] / this.maxLife[i]) * 1.6);
    }
    const g = this.geo;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    g.setDrawRange(0, this.n);
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    const pk = quality.particles;
    this.dust = new Particles(scene, Math.round(500 * pk), false);
    this.sparks = new Particles(scene, Math.round(400 * pk), true);
    this.pk = pk;

    // tracers
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1), tm = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, t: 0, dist: 0, len: 0, o: new THREE.Vector3(), d: new THREE.Vector3() }); }
    this.tracerI = 0;

    // decals
    this.maxDecals = quality.decals;
    const dm = new THREE.MeshBasicMaterial({ map: decalTexture('hole'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dm, this.maxDecals);
    this.decals.count = 0; this.decals.frustumCulled = false; this.decals.renderOrder = 1; scene.add(this.decals);
    this.decalI = 0;
    const sm = new THREE.MeshBasicMaterial({ map: decalTexture('scorch'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.scorch = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), sm, 10);
    this.scorch.count = 0; this.scorch.frustumCulled = false; this.scorch.renderOrder = 1; scene.add(this.scorch);
    this.scorchI = 0;

    // shells
    this.shellMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.009, 0.009, 0.024), new THREE.MeshStandardMaterial({ color: 0xc9a23f, metalness: 0.9, roughness: 0.3 }), 28);
    this.shellMesh.count = 28; this.shellMesh.frustumCulled = false; scene.add(this.shellMesh);
    this.shells = [];
    for (let i = 0; i < 28; i++) this.shells.push({ p: new THREE.Vector3(0, -100, 0), v: new THREE.Vector3(), r: new THREE.Euler(), rv: new THREE.Vector3(), life: 0, floor: 0 });
    this.shellI = 0;

    // explosion fireballs + light, muzzle light (lights always exist so shaders never recompile)
    this.balls = [];
    const bt = radialTexture('rgba(255,230,170,1)', 'rgba(255,90,10,0)');
    for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); s.visible = false; scene.add(s); this.balls.push({ s, t: 9 }); }
    this.boomLight = new THREE.PointLight(0xffa040, 0, 30, 1.6); scene.add(this.boomLight);
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 14, 1.8); scene.add(this.muzzleLight);
    this.boomT = 9; this.muzzleT = 9;

    // grenades
    this.nades = [];
    for (let i = 0; i < 6; i++) { const g = buildGrenadeModel(1.5); g.visible = false; g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(g); this.nades.push(g); }

    // throw arc preview
    this.arcGeo = new THREE.BufferGeometry();
    this.arcPos = new Float32Array(120 * 3);
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.arc = new THREE.Line(this.arcGeo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.arc.frustumCulled = false; this.arc.visible = false; this.arc.renderOrder = 6; scene.add(this.arc);
    this.arcDots = new THREE.Points(this.arcGeo, new THREE.PointsMaterial({ color: 0xffe2a8, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.arcDots.frustumCulled = false; this.arcDots.visible = false; this.arcDots.renderOrder = 6; scene.add(this.arcDots);
    this.arcRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, toneMapped: false }));
    this.arcRing.rotation.x = -Math.PI / 2; this.arcRing.visible = false; this.arcRing.renderOrder = 6; scene.add(this.arcRing);

    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }

  dispose() {
    const sc = this.scene;
    for (const o of [this.dust.points, this.sparks.points, this.decals, this.scorch, this.shellMesh, this.boomLight, this.muzzleLight, this.arc, this.arcDots, this.arcRing, ...this.tracers.map((t) => t.m), ...this.balls.map((b) => b.s), ...this.nades]) sc.remove(o);
    this.dust.geo.dispose(); this.sparks.geo.dispose(); this.arcGeo.dispose();
  }

  tracer(from, to) {
    const dist = from.distanceTo(to);
    if (dist < 3) return;
    const t = this.tracers[this.tracerI = (this.tracerI + 1) % this.tracers.length];
    t.o.copy(from); t.d.copy(to).sub(from).divideScalar(dist); t.dist = dist; t.t = 0; t.len = Math.min(7, dist * 0.5);
    t.m.visible = true; t.m.quaternion.setFromUnitVectors(this._z, t.d);
  }

  /** Bullet hits a surface: decal + debris. n = surface normal. */
  impact(x, y, z, nx, ny, nz, matName) {
    // decal
    const i = this.decalI; this.decalI = (this.decalI + 1) % this.maxDecals;
    this._v.set(nx, ny, nz);
    this._q.setFromUnitVectors(this._z, this._v);
    this._q2.setFromAxisAngle(this._z, Math.random() * 6.28); this._q.multiply(this._q2);
    const sc = 0.13 + Math.random() * 0.07;
    this._m.compose(this._v.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012), this._q, this._s.set(sc, sc, sc));
    this.decals.setMatrixAt(i, this._m);
    this.decals.count = Math.max(this.decals.count, i + 1); this.decals.instanceMatrix.needsUpdate = true;
    // debris
    const metal = METALS.has(matName), c = SURFACE_COLORS[matName] || [0.5, 0.5, 0.5];
    const n = Math.round((metal ? 3 : 5) * Math.min(1.5, this.pk));
    for (let k = 0; k < n; k++) {
      const sp = 1 + Math.random() * 3;
      this.dust.add(x, y, z, nx * sp + (Math.random() - 0.5) * 2.5, ny * sp + Math.random() * 2, nz * sp + (Math.random() - 0.5) * 2.5, 0.35 + Math.random() * 0.4, 0.05 + Math.random() * 0.07, c[0], c[1], c[2], 0.8, 7, 2.5, 0.25);
    }
    this.dust.add(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * 0.6, ny * 0.6 + 0.3, nz * 0.6, 0.7, 0.16, c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, 0.35, -0.3, 2, 0.6);
    if (metal || Math.random() < 0.3) for (let k = 0; k < (metal ? 5 : 2); k++) {
      const sp = 3 + Math.random() * 6;
      this.sparks.add(x, y, z, nx * sp + (Math.random() - 0.5) * 5, ny * sp + (Math.random() - 0.3) * 5, nz * sp + (Math.random() - 0.5) * 5, 0.12 + Math.random() * 0.2, 0.035, 1, 0.75, 0.35, 1, 12, 1);
    }
  }

  blood(x, y, z, dx, dy, dz) {
    const n = Math.round(7 * Math.min(1.5, this.pk));
    for (let k = 0; k < n; k++) this.dust.add(x, y, z, -dx * 1.5 + (Math.random() - 0.5) * 3, -dy + Math.random() * 2, -dz * 1.5 + (Math.random() - 0.5) * 3, 0.3 + Math.random() * 0.3, 0.06 + Math.random() * 0.06, 0.55, 0.03, 0.03, 0.9, 9, 2, 0.1);
  }

  shell(pos, right, up, floorY) {
    const s = this.shells[this.shellI = (this.shellI + 1) % this.shells.length];
    s.p.copy(pos); s.v.copy(right).multiplyScalar(1.6 + Math.random() * 0.8).addScaledVector(up, 1.6 + Math.random() * 0.8);
    s.rv.set(Math.random() * 20, Math.random() * 20, Math.random() * 20); s.life = 1.6; s.floor = floorY + 0.012;
  }

  muzzleLightAt(pos) { this.muzzleLight.position.copy(pos); this.muzzleT = 0; }

  explosion(x, y, z) {
    const b = this.balls.find((o) => o.t > 0.4) || this.balls[0];
    b.t = 0; b.s.position.set(x, y + 0.4, z); b.s.visible = true;
    this.boomLight.position.set(x, y + 1, z); this.boomT = 0;
    const pk = Math.min(1.5, this.pk);
    for (let k = 0; k < 40 * pk; k++) { const a = Math.random() * 6.28, e = Math.random() * 1.4, sp = 6 + Math.random() * 16; this.sparks.add(x, y + 0.2, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 0.3 + Math.random() * 0.6, 0.07, 1, 0.6 + Math.random() * 0.3, 0.2, 1, 14, 0.8); }
    for (let k = 0; k < 22 * pk; k++) { const a = Math.random() * 6.28, sp = 1 + Math.random() * 4; this.dust.add(x + Math.cos(a) * 0.5, y + 0.3 + Math.random() * 0.8, z + Math.sin(a) * 0.5, Math.cos(a) * sp, 1 + Math.random() * 2.5, Math.sin(a) * sp, 1.6 + Math.random() * 1.4, 0.7 + Math.random() * 0.7, 0.14, 0.13, 0.12, 0.55, -0.6, 1.4, 1.1); }
    for (let k = 0; k < 26 * pk; k++) { const a = Math.random() * 6.28, sp = 3 + Math.random() * 9; this.dust.add(x, y + 0.2, z, Math.cos(a) * sp, 3 + Math.random() * 8, Math.sin(a) * sp, 0.8 + Math.random() * 0.8, 0.06 + Math.random() * 0.06, 0.2, 0.17, 0.14, 1, 16, 0.4); }
    // scorch mark on the ground below
    const i = this.scorchI; this.scorchI = (this.scorchI + 1) % 10;
    this._q.setFromAxisAngle(this._v.set(1, 0, 0), -Math.PI / 2);
    this._m.compose(this._v.set(x, y - 0.08, z), this._q, this._s.set(4.2, 4.2, 4.2));
    this.scorch.setMatrixAt(i, this._m); this.scorch.count = Math.max(this.scorch.count, i + 1); this.scorch.instanceMatrix.needsUpdate = true;
  }

  setGrenades(list, time) {
    for (let i = 0; i < this.nades.length; i++) {
      const g = this.nades[i], n = list[i];
      if (!n) { g.visible = false; continue; }
      g.visible = true; g.position.set(n.x, n.y, n.z); g.rotation.set(time * 9 + n.id, time * 7, 0);
    }
  }

  /** pts: flat xyz array of the predicted throw path, or null to hide. */
  setArc(pts) {
    if (!pts || pts.length < 6) { this.arc.visible = this.arcDots.visible = this.arcRing.visible = false; return; }
    // skip the first samples: they sit right in front of the camera and would fill the screen
    const skip = Math.min(3, Math.max(0, pts.length / 3 - 2));
    const n = Math.min(120, pts.length / 3 - skip);
    for (let i = 0; i < n * 3; i++) this.arcPos[i] = pts[i + skip * 3];
    this.arcGeo.attributes.position.needsUpdate = true; this.arcGeo.setDrawRange(0, n);
    this.arc.visible = this.arcDots.visible = this.arcRing.visible = true;
    const e = pts.length - 3; this.arcRing.position.set(pts[e], pts[e + 1] + 0.03, pts[e + 2]);
  }

  update(dt, camera, viewportH) {
    const scale = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.dust.mat.uniforms.scale.value = scale; this.sparks.mat.uniforms.scale.value = scale;
    this.dust.update(dt); this.sparks.update(dt);

    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.t += dt * 260;
      const head = Math.min(t.dist, t.t), tail = Math.max(0, t.t - t.len);
      if (tail >= t.dist) { t.m.visible = false; continue; }
      const len = Math.max(0.01, head - tail);
      t.m.position.copy(t.o).addScaledVector(t.d, (head + tail) / 2);
      t.m.scale.set(0.018, 0.018, len);
    }

    let any = false;
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i];
      if (s.life > 0) {
        any = true; s.life -= dt;
        s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
        if (s.p.y < s.floor) { s.p.y = s.floor; s.v.y = Math.abs(s.v.y) * 0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.rv.multiplyScalar(0.4); }
        s.r.x += s.rv.x * dt; s.r.y += s.rv.y * dt; s.r.z += s.rv.z * dt;
        if (s.life <= 0) s.p.y = -100;
        this._q.setFromEuler(s.r); this._m.compose(s.p, this._q, this._s.set(1, 1, 1));
        this.shellMesh.setMatrixAt(i, this._m);
      }
    }
    if (any) this.shellMesh.instanceMatrix.needsUpdate = true;

    for (const b of this.balls) {
      if (!b.s.visible) continue;
      b.t += dt;
      const k = b.t / 0.35;
      if (k >= 1) { b.s.visible = false; continue; }
      const sc = 1.5 + k * 8; b.s.scale.set(sc, sc, 1); b.s.material.opacity = 1 - k * k;
    }
    this.boomT += dt; this.boomLight.intensity = this.boomT < 0.4 ? 900 * (1 - this.boomT / 0.4) : 0;
    this.muzzleT += dt; this.muzzleLight.intensity = this.muzzleT < 0.06 ? 28 * (1 - this.muzzleT / 0.06) : 0;
  }
}
