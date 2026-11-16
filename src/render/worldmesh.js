// Turns a map definition (list of boxes) into a handful of merged meshes: one per material.
// A whole map is ~15-25 draw calls no matter how many boxes it has.

import * as THREE from 'three';
import { makeMaterial, FIT_UV, UV_SCALE, GLOW } from './textures.js';
import { buildVehicleVisuals } from './vehicles.js';
import { buildPropDetails } from './props.js';

// face: normal, 4 corner selectors (0 = min, 1 = max per axis), uv axes
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], u: 2, v: 1, flip: -1 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u: 2, v: 1, flip: 1 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], u: 0, v: 2, flip: 1 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], u: 0, v: 2, flip: 1 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: 0, v: 1, flip: 1 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: 0, v: 1, flip: -1 },
];

export function buildWorldMesh(mapDef, quality, aniso) {
  const group = new THREE.Group();
  // Replace only the display of known vehicle assemblies. The map data used for movement,
  // bullets, grenades and bot navigation is left exactly as authored.
  const vehicles = buildVehicleVisuals(mapDef, quality);
  const buckets = new Map();
  const bucket = (key) => { let b = buckets.get(key); if (!b) { b = { pos: [], nor: [], uv: [], col: [], idx: [] }; buckets.set(key, b); } return b; };
  const col = new THREE.Color();
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  for (const box of mapDef.boxes) {
    if (vehicles.hiddenBoxes.has(box)) continue;
    const key = box.mat + (box.decor ? '|d' : '');
    const b = bucket(key);
    const lo = box.a, hi = box.b;
    const fit = FIT_UV.has(box.mat), scale = UV_SCALE[box.mat] || 3;
    if (box.tint !== undefined) col.setHex(box.tint, THREE.SRGBColorSpace); else col.setRGB(1, 1, 1);
    const jitter = 0.94 + rnd() * 0.12; // subtle per-box brightness variation so repeated shapes do not look cloned
    const r = col.r * jitter, g = col.g * jitter, bl = col.b * jitter;
    const tall = hi[1] - lo[1] > 0.5;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      if (f === 3 && lo[1] <= 0.02) continue; // underside on/below the ground is never visible
      const base = b.pos.length / 3;
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        const x = c[0] ? hi[0] : lo[0], y = c[1] ? hi[1] : lo[1], z = c[2] ? hi[2] : lo[2];
        b.pos.push(x, y, z); b.nor.push(F.n[0], F.n[1], F.n[2]);
        if (fit) b.uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1);
        else { const p = [x, y, z]; b.uv.push((p[F.u] * F.flip) / scale, p[F.v] / scale); }
        // cheap ambient occlusion: walls darken toward their base, undersides are darker
        let ao = 1;
        if (F.n[1] === 0 && tall && !box.decor) ao = c[1] ? 1 : 0.78;
        else if (f === 3) ao = 0.6;
        b.col.push(r * ao, g * ao, bl * ao);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  for (const [key, b] of buckets) {
    const [mat, decor] = key.split('|');
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.setIndex(b.idx);
    geo.computeBoundingSphere();
    const material = makeMaterial(mat, quality.standard, aniso);
    if (decor) { material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2; }
    const mesh = new THREE.Mesh(geo, material);
    const glow = GLOW.has(mat);
    mesh.castShadow = !decor && !glow;
    mesh.receiveShadow = !glow;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'world:' + key;
    group.add(mesh);
  }
  group.add(vehicles.group, buildPropDetails(mapDef, quality));
  return group;
}

export function disposeWorldMesh(group) {
  group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}

/** Gradient sky dome with a sun glow. */
export function buildSky(env) {
  const geo = new THREE.SphereGeometry(900, 24, 12);
  const sun = new THREE.Vector3(...env.sunDir).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(env.skyTop) }, horizon: { value: new THREE.Color(env.skyHorizon) },
      sunDir: { value: sun }, sunColor: { value: new THREE.Color(env.sunColor) }, haze: { value: new THREE.Color(env.fogColor) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 haze; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.55));
        c = mix(haze, c, smoothstep(-0.02, 0.12, d.y));
        float s = max(dot(d, sunDir), 0.0);
        c += sunColor * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.5 + smoothstep(0.9993, 0.9997, s) * 3.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return mesh;
}
