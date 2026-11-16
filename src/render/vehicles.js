// Detailed, render-only replacements for the map builder's vehicle boxes. The boxes themselves
// remain untouched: the simulation continues to use exactly the same collision and cover.
import * as THREE from 'three';

const EPS = 0.002;
const near = (a, b) => Math.abs(a - b) < EPS;
const size = (b, i) => b.b[i] - b.a[i];
const centre = (b, i) => (b.a[i] + b.b[i]) * 0.5;

/** Detect complete builder vehicles without changing or annotating any map definition. */
function findVehicles(boxes) {
  const vehicles = [], used = new Set();
  for (const body of boxes) {
    if (body.mat !== 'paint' || used.has(body) || body.decor) continue;
    const sx = size(body, 0), sz = size(body, 2), h = size(body, 1);
    const width = Math.min(sx, sz), length = Math.max(sx, sz);
    let kind, specs;
    if (near(width, 1.9) && near(length, 4.4) && near(h, 0.7)) {
      kind = 'sedan'; specs = [['rubber', 0, 0.3, 1.9 * 0.92, 4.4 * 0.92], ['glass', 1, 0.55, 1.9 * 0.88, 2.2]];
    } else if (near(width, 2.2) && near(length, 5.6) && near(h, 2.1)) {
      kind = 'van'; specs = [['rubber', 0, 0.35, 2.2 * 0.94, 5.6 * 0.94]];
    } else if (near(width, 2.6) && near(length, 11) && near(h, 1)) {
      kind = 'bus'; specs = [['rubber', 0, 0.4, 2.6 * 0.96, 11 * 0.96], ['glass', 1.4, 1.1, 2.5, 10.9], ['paint', 2.5, 0.5, 2.6, 11]];
    } else continue;
    const base = body.a[1] - (kind === 'sedan' ? 0.3 : kind === 'van' ? 0.35 : 0.4);
    const cx = centre(body, 0), cz = centre(body, 2), parts = [body];
    for (const [mat, y, height, w, l] of specs) {
      const part = boxes.find((b) => !used.has(b) && !b.decor && b.mat === mat &&
        near(centre(b, 0), cx) && near(centre(b, 2), cz) && near(b.a[1], base + y) && near(size(b, 1), height) &&
        near(size(b, 0), sx > sz ? l : w) && near(size(b, 2), sx > sz ? w : l));
      if (!part) break;
      parts.push(part);
    }
    if (parts.length !== specs.length + 1) continue;
    for (const p of parts) used.add(p);
    vehicles.push({ kind, cx, cz, base, alongX: sx > sz, tint: body.tint === undefined ? 0x8a2b22 : body.tint });
  }
  return { vehicles, hiddenBoxes: used };
}

// A few material buckets for every vehicle in a map, rather than a draw call for every detail.
class VehicleBatch {
  constructor(standard) {
    this.group = new THREE.Group(); this.group.name = 'vehicle-details';
    this.buckets = new Map(); this.standard = standard;
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, standard ? 24 : 16);
    this.ringGeo = new THREE.TorusGeometry(1, 0.07, 6, standard ? 24 : 16);
    this.local = new THREE.Matrix4(); this.world = new THREE.Matrix4(); this.matrix = new THREE.Matrix4();
    this.normal = new THREE.Matrix3(); this.q = new THREE.Quaternion(); this.euler = new THREE.Euler();
    this.v = new THREE.Vector3(); this.col = new THREE.Color();
  }
  setVehicle(v) {
    const yaw = (v.alongX ? Math.PI / 2 : 0) + (v.cx > 0 ? Math.PI : 0);
    this.world.makeRotationY(yaw); this.world.setPosition(v.cx, v.base, v.cz);
  }
  add(geo, key, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    let b = this.buckets.get(key);
    if (!b) { b = { p: [], n: [], c: [], i: [] }; this.buckets.set(key, b); }
    this.euler.set(rx, ry, rz); this.q.setFromEuler(this.euler);
    this.local.compose(this.v.set(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    this.matrix.multiplyMatrices(this.world, this.local); this.normal.getNormalMatrix(this.matrix);
    const p = geo.attributes.position, n = geo.attributes.normal, offset = b.p.length / 3;
    this.col.setHex(color);
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i).applyMatrix4(this.matrix); b.p.push(this.v.x, this.v.y, this.v.z);
      this.v.fromBufferAttribute(n, i).applyMatrix3(this.normal).normalize(); b.n.push(this.v.x, this.v.y, this.v.z);
      b.c.push(this.col.r, this.col.g, this.col.b);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) b.i.push(offset + geo.index.getX(i));
    else for (let i = 0; i < p.count; i++) b.i.push(offset + i);
  }
  box(key, color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) { this.add(this.boxGeo, key, color, x, y, z, w, h, d, rx, ry, rz); }
  cylinder(key, color, x, y, z, radius, depth, rx = 0, ry = 0, rz = 0) { this.add(this.cylinderGeo, key, color, x, y, z, radius, depth, radius, rx, ry, rz); }
  ring(key, color, x, y, z, radius) { this.add(this.ringGeo, key, color, x, y, z, radius, radius, radius, 0, Math.PI / 2, 0); }
  finish() {
    const props = {
      paint: { roughness: 0.34, metalness: 0.55 }, glass: { roughness: 0.16, metalness: 0.62 },
      rubber: { roughness: 0.94, metalness: 0 }, trim: { roughness: 0.65, metalness: 0.14 },
      metal: { roughness: 0.31, metalness: 0.8 }, lens: { roughness: 0.24, metalness: 0.2 },
      plate: { roughness: 0.8, metalness: 0.1 },
    };
    for (const [key, b] of this.buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      geo.setIndex(b.i); geo.computeBoundingSphere();
      const settings = { vertexColors: true, ...(this.standard ? props[key] : {}) };
      const mat = this.standard ? new THREE.MeshStandardMaterial(settings) : new THREE.MeshLambertMaterial(settings);
      const mesh = new THREE.Mesh(geo, mat); mesh.name = 'vehicles:' + key;
      mesh.castShadow = key !== 'lens'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    this.boxGeo.dispose(); this.cylinderGeo.dispose(); this.ringGeo.dispose();
    return this.group;
  }
}

/** Chamfered body with horizontal rings. z points toward the rear of the vehicle. */
function shell(batch, key, color, rings) {
  const p = [], indices = [];
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r], b = rings[r + 1];
    const loop = ([y, w, front, rear, bevel]) => [[-w + bevel, y, front], [w - bevel, y, front], [w, y, front + bevel], [w, y, rear - bevel], [w - bevel, y, rear], [-w + bevel, y, rear], [-w, y, rear - bevel], [-w, y, front + bevel]];
    const low = loop(a), high = loop(b);
    for (let i = 0; i < 8; i++) {
      const k = (i + 1) % 8, offset = p.length / 3;
      p.push(...low[i], ...low[k], ...high[k], ...high[i]);
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
    if (r === 0) { const offset = p.length / 3; for (const v of low) p.push(...v); for (let i = 1; i < 7; i++) indices.push(offset, offset + i + 1, offset + i); }
    if (r === rings.length - 2) { const offset = p.length / 3; for (const v of high) p.push(...v); for (let i = 1; i < 7; i++) indices.push(offset, offset + i, offset + i + 1); }
  }
  // Ring points wind clockwise when seen from above; reverse every triangle to face outward.
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setIndex(indices); geo.computeVertexNormals();
  batch.add(geo, key, color, 0, 0, 0); geo.dispose();
}

function wheels(b, width, axles, radius = 0.35) {
  for (const z of axles) for (const side of [-1, 1]) {
    const x = side * (width * 0.5 - 0.035), y = radius + 0.015;
    b.cylinder('rubber', 0x121719, x, y, z, radius, 0.12, 0, 0, Math.PI / 2);
    b.ring('trim', 0x252b2d, side * (width * 0.5 + 0.027), y, z, radius * 0.94);
    b.cylinder('metal', 0x697279, side * (width * 0.5 + 0.029), y, z, radius * 0.66, 0.015, 0, 0, Math.PI / 2);
    b.cylinder('trim', 0x252c30, side * (width * 0.5 + 0.039), y, z, radius * 0.51, 0.015, 0, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      b.box('metal', 0xa0a9aa, side * (width * 0.5 + 0.05), y + Math.sin(a) * radius * 0.31, z + Math.cos(a) * radius * 0.31, 0.015, radius * 0.11, radius * 0.52, -a);
    }
    b.cylinder('metal', 0xb9bebe, side * (width * 0.5 + 0.059), y, z, radius * 0.16, 0.017, 0, 0, Math.PI / 2);
  }
}

function plate(b, z, y, index = 0) {
  b.box('trim', 0x20272b, 0, y, z, 0.48, 0.15, 0.025);
  b.box('plate', 0xd4d7cc, 0, y, z + Math.sign(z) * 0.018, 0.425, 0.102, 0.012);
  b.box('plate', 0x3b6484, -0.19, y, z + Math.sign(z) * 0.027, 0.035, 0.102, 0.008);
  for (let i = 0; i < 6; i++) {
    const x = -0.137 + i * 0.055;
    b.box('trim', 0x26333b, x, y, z + Math.sign(z) * 0.027, 0.012, i % 3 === index % 3 ? 0.038 : 0.058, 0.009);
    b.box('trim', 0x26333b, x + 0.012, y + 0.023, z + Math.sign(z) * 0.027, 0.026, 0.008, 0.009);
  }
}

function sedan(b, tint) {
  // Full undertray retains the original low cover; wheels are surface detail, not cut-outs.
  b.box('rubber', 0x171c1e, 0, 0.15, 0, 1.748, 0.3, 4.048);
  shell(b, 'paint', tint, [[0.3, 0.9, -2.15, 2.15, 0.1], [0.42, 0.95, -2.2, 2.2, 0.12], [0.88, 0.95, -2.18, 2.18, 0.1], [1, 0.87, -2.12, 2.12, 0.12]]);
  shell(b, 'trim', 0x1b252b, [[0.99, 0.837, -1.1, 1.1, 0.035], [1.48, 0.795, -0.94, 0.98, 0.04]]);
  // Opaque reflective windows keep the cabin readable as solid cover.
  b.box('glass', 0x324d5c, 0, 1.253, -1.026, 1.56, 0.474, 0.018, 0.317);
  b.box('glass', 0x304551, 0, 1.25, 1.045, 1.55, 0.465, 0.018, -0.24);
  for (const side of [-1, 1]) {
    b.box('glass', 0x293f4b, side * 0.821, 1.245, -0.51, 0.016, 0.40, 0.89, 0, 0, side * 0.084);
    b.box('glass', 0x293f4b, side * 0.821, 1.245, 0.50, 0.016, 0.40, 0.84, 0, 0, side * 0.084);
    b.box('trim', 0x172329, side * 0.831, 1.247, -0.002, 0.026, 0.48, 0.065);
    b.box('metal', 0x839294, side * 0.85, 1.023, 0, 0.022, 0.026, 2.15);
    b.box('trim', 0x21292c, side * 0.951, 0.51, 0.0, 0.014, 0.055, 3.38);
    for (const z of [-1.07, 0.03, 1.12]) b.box('trim', 0x30383a, side * 0.951, 0.745, z, 0.009, 0.43, 0.013);
    for (const z of [-0.15, 0.91]) {
      b.box('trim', 0x202a2e, side * 0.957, 0.889, z, 0.018, 0.058, 0.19);
      b.box('metal', 0xa0a6a4, side * 0.97, 0.901, z, 0.018, 0.025, 0.145);
    }
    b.box('trim', 0x1f282d, side * 0.902, 1.04, -0.93, 0.12, 0.035, 0.085, 0, -side * 0.3);
    b.box('paint', tint, side * 0.979, 1.085, -0.94, 0.13, 0.092, 0.18);
    b.box('glass', 0x8ca5ad, side * 0.98, 1.089, -0.841, 0.105, 0.066, 0.013);
    // Thin body-coloured lip above each wheel gives an arch without changing solid cover.
    for (const z of [-1.4, 1.4]) b.ring('trim', 0x242d30, side * 0.953, 0.365, z, 0.385);
    b.box('lens', 0xdba44b, side * 0.95, 0.81, -1.64, 0.014, 0.05, 0.09);
  }
  shell(b, 'paint', tint, [[1.465, 0.801, -0.96, 1.00, 0.055], [1.55, 0.775, -0.90, 0.94, 0.065]]);
  // Hood and boot shut lines, wiper blades and subtly raised hood stamping.
  b.box('trim', 0x354044, 0, 1.004, -1.15, 1.69, 0.012, 0.017);
  b.box('trim', 0x354044, 0, 1.004, 1.15, 1.69, 0.012, 0.017);
  for (const x of [-0.46, 0.46]) b.box('paint', tint, x, 1.005, -1.62, 0.026, 0.014, 0.77);
  for (const x of [-0.36, 0.35]) b.box('trim', 0x1c2529, x, 1.041, -1.104, 0.60, 0.015, 0.024, 0, -0.08);
  b.box('trim', 0x222a2d, 0, 0.54, -2.185, 1.71, 0.16, 0.035);
  b.box('trim', 0x222a2d, 0, 0.53, 2.185, 1.71, 0.15, 0.035);
  b.box('trim', 0x172127, 0, 0.805, -2.181, 0.70, 0.20, 0.032);
  for (let i = 0; i < 4; i++) b.box('metal', 0x8d9697, 0, 0.744 + i * 0.042, -2.202, 0.65, 0.014, 0.014);
  b.cylinder('metal', 0xd0d3c9, 0, 0.857, -2.218, 0.043, 0.012, Math.PI / 2);
  for (const side of [-1, 1]) {
    b.box('trim', 0x172127, side * 0.688, 0.834, -2.17, 0.41, 0.172, 0.041);
    b.box('lens', 0xcbd8d6, side * 0.685, 0.844, -2.194, 0.352, 0.116, 0.025);
    b.box('lens', 0xdda74e, side * 0.852, 0.838, -2.198, 0.049, 0.105, 0.026);
    b.box('trim', 0x32292a, side * 0.675, 0.837, 2.173, 0.43, 0.165, 0.039);
    b.box('lens', 0xa22f27, side * 0.675, 0.841, 2.199, 0.37, 0.114, 0.024);
    b.box('lens', 0xd4cbb0, side * 0.543, 0.834, 2.215, 0.065, 0.064, 0.008);
  }
  plate(b, -2.213, 0.573); plate(b, 2.213, 0.686, 1);
  b.cylinder('metal', 0x686e6b, -0.64, 0.29, 2.143, 0.055, 0.22, Math.PI / 2);
  wheels(b, 1.9, [-1.4, 1.4]);
}

function van(b, tint) {
  b.box('rubber', 0x1b2022, 0, 0.175, 0, 2.068, 0.35, 5.264);
  shell(b, 'paint', tint, [[0.35, 1.06, -2.75, 2.75, 0.10], [0.63, 1.1, -2.8, 2.8, 0.12], [2.28, 1.1, -2.8, 2.8, 0.12], [2.45, 1.01, -2.70, 2.70, 0.13]]);
  b.box('trim', 0x1b262c, 0, 1.858, -2.801, 1.92, 0.90, 0.027);
  b.box('glass', 0x354f5d, 0, 1.882, -2.823, 1.78, 0.77, 0.012);
  b.box('trim', 0x152128, 0, 1.87, -2.835, 0.045, 0.78, 0.015);
  for (const side of [-1, 1]) {
    b.box('trim', 0x202d32, side * 1.102, 1.87, -1.99, 0.025, 0.86, 1.15);
    b.box('glass', 0x2a434f, side * 1.121, 1.883, -2.0, 0.012, 0.71, 1.0);
    b.box('trim', 0x2d373a, side * 1.105, 1.40, -1.37, 0.012, 1.6, 0.016);
    b.box('trim', 0x2d373a, side * 1.105, 1.40, 1.30, 0.012, 1.6, 0.016);
    b.box('trim', 0x394346, side * 1.107, 2.25, 0.07, 0.014, 0.018, 2.70);
    b.box('trim', 0x20292c, side * 1.111, 0.70, 0, 0.022, 0.10, 5.3);
    b.box('metal', 0x939b98, side * 1.125, 1.35, -1.54, 0.025, 0.035, 0.22);
    b.box('trim', 0x263034, side * 1.13, 1.38, 1.06, 0.026, 0.07, 0.24);
    b.box('trim', 0x20292c, side * 1.14, 1.65, -2.46, 0.12, 0.05, 0.12);
    b.box('trim', 0x20292c, side * 1.20, 1.75, -2.44, 0.095, 0.23, 0.22);
    b.box('glass', 0x93a9ad, side * 1.199, 1.755, -2.321, 0.071, 0.18, 0.012);
    b.box('lens', 0xc5d3d0, side * 0.83, 0.98, -2.813, 0.35, 0.20, 0.023);
    b.box('lens', 0xb0422d, side * 0.95, 1.02, 2.813, 0.17, 0.49, 0.023);
    b.box('lens', 0xddb25a, side * 0.95, 1.16, 2.827, 0.14, 0.10, 0.009);
    b.box('trim', 0x454b4b, side * 0.66, 2.483, 0, 0.055, 0.044, 4.3);
  }
  b.box('trim', 0x2a3336, 0, 0.56, -2.80, 2.03, 0.25, 0.08);
  b.box('trim', 0x2a3336, 0, 0.55, 2.80, 2.03, 0.22, 0.08);
  b.box('trim', 0x17242a, 0, 1.09, -2.81, 1.07, 0.32, 0.025);
  for (let i = 0; i < 4; i++) b.box('metal', 0x858f90, 0, 0.98 + i * 0.069, -2.831, 0.99, 0.018, 0.012);
  b.box('trim', 0x384245, 0, 1.54, 2.803, 0.015, 1.76, 0.016);
  b.box('trim', 0x263034, -0.13, 1.27, 2.82, 0.05, 0.25, 0.028);
  for (const side of [-1, 1]) for (const y of [0.91, 2.01]) b.box('metal', 0x727e7d, side * 0.91, y, 2.82, 0.15, 0.065, 0.028);
  plate(b, -2.854, 0.66); plate(b, 2.854, 0.83, 1);
  wheels(b, 2.2, [-1.91, 1.86], 0.41);
}

function bus(b, tint) {
  b.box('rubber', 0x1c2326, 0, 0.2, 0, 2.496, 0.4, 10.56);
  shell(b, 'paint', tint, [[0.4, 1.25, -5.45, 5.45, 0.12], [0.6, 1.3, -5.5, 5.5, 0.15], [1.40, 1.3, -5.5, 5.5, 0.15]]);
  shell(b, 'glass', 0x2b424d, [[1.4, 1.25, -5.45, 5.45, 0.08], [2.5, 1.25, -5.45, 5.45, 0.08]]);
  shell(b, 'paint', tint, [[2.5, 1.3, -5.5, 5.5, 0.15], [2.87, 1.3, -5.5, 5.5, 0.16], [3.0, 1.2, -5.4, 5.4, 0.16]]);
  for (const side of [-1, 1]) {
    b.box('trim', 0x253238, side * 1.26, 1.45, 0, 0.025, 0.06, 10.55);
    for (const z of [-5.17, -3.85, -2.52, -1.19, 0.14, 1.47, 2.8, 4.13, 5.17]) b.box('paint', tint, side * 1.267, 1.965, z, 0.025, 1.06, 0.095);
    for (const z of [-4.5, -3.16, -1.83, -0.50, 0.83, 2.16, 3.49, 4.67]) b.box('trim', 0x172930, side * 1.273, 2.25, z, 0.012, 0.028, 1.13);
    b.box('trim', 0x2a3437, side * 1.307, 0.65, 0, 0.021, 0.10, 10.62);
    b.box('plate', 0xd2d0bb, side * 1.31, 1.22, 0, 0.012, 0.048, 10.61);
    for (const z of [-3.94, 0.13, 3.37]) b.box('trim', 0x4a4d44, side * 1.303, 1.0, z, 0.012, 0.58, 0.016);
    b.box('trim', 0x1d2a30, side * 1.36, 2.11, -5.10, 0.13, 0.08, 0.15);
    b.box('trim', 0x1e2b31, side * 1.40, 2.11, -4.98, 0.10, 0.30, 0.22);
    for (let i = 0; i < 5; i++) b.box('trim', 0x3b4547, side * 1.311, 0.90 + i * 0.045, 4.61, 0.012, 0.014, 0.61);
  }
  // Paired front entry panels and steps are a visual treatment of the original solid shell.
  for (const z of [-4.92, -4.36]) {
    b.box('trim', 0x172a32, 1.316, 1.43, z, 0.017, 1.78, 0.50);
    b.box('glass', 0x294450, 1.329, 1.81, z, 0.012, 0.92, 0.42);
    b.box('metal', 0x768886, 1.338, 1.24, z + 0.16, 0.012, 0.33, 0.023);
  }
  b.box('trim', 0x14272f, 0, 2.34, -5.462, 1.72, 0.23, 0.027);
  for (let i = 0; i < 8; i++) b.box('plate', 0xc7be83, -0.57 + i * 0.16, 2.35, -5.485, 0.076, 0.087, 0.012);
  b.box('trim', 0x17282f, 0, 1.95, -5.458, 0.06, 0.79, 0.02);
  for (const x of [-0.57, 0.57]) b.box('trim', 0x182a31, x, 1.48, -5.473, 0.73, 0.018, 0.024, 0, 0.22);
  b.box('trim', 0x293237, 0, 0.57, -5.49, 2.34, 0.24, 0.08);
  b.box('trim', 0x293237, 0, 0.57, 5.49, 2.34, 0.24, 0.08);
  for (const side of [-1, 1]) {
    for (const x of [0.83, 1.04]) b.cylinder('lens', 0xd3d9c7, side * x, 0.94, -5.505, 0.074, 0.034, Math.PI / 2);
    for (const y of [0.98, 1.16, 1.34]) b.cylinder('lens', y > 1.3 ? 0xdb9c45 : 0xa93628, side * 1.03, y, 5.505, 0.069, 0.025, Math.PI / 2);
  }
  b.box('paint', tint, 0, 3.054, 1.5, 1.55, 0.10, 2.15);
  for (let i = 0; i < 9; i++) b.box('trim', 0x5c635e, 0, 3.113, 0.65 + i * 0.19, 1.28, 0.014, 0.032);
  plate(b, -5.55, 0.63); plate(b, 5.55, 0.79, 1);
  wheels(b, 2.6, [-3.52, 3.45], 0.49);
}

export function buildVehicleVisuals(mapDef, quality) {
  const { vehicles, hiddenBoxes } = findVehicles(mapDef.boxes);
  const batch = new VehicleBatch(!!quality.standard);
  for (const v of vehicles) {
    batch.setVehicle(v);
    if (v.kind === 'sedan') sedan(batch, v.tint);
    else if (v.kind === 'van') van(batch, v.tint);
    else bus(batch, v.tint);
  }
  return { group: batch.finish(), hiddenBoxes };
}
