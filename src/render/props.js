// Flush, renderer-only construction details. The authored boxes remain the source of collision.
// Everything is baked by finish so additional detail costs at most three draw calls per map.
import * as THREE from 'three';
import { bakeGeometry } from './bake.js';

const near = (a, b) => Math.abs(a - b) < 0.015;

export function buildPropDetails(mapDef, quality) {
  const result = new THREE.Group(); result.name = 'prop-details';
  const bins = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sourceMaterials = new Map();
  const detailed = !!quality.standard;
  function material(color) {
    if (!sourceMaterials.has(color)) sourceMaterials.set(color, new THREE.MeshLambertMaterial({ color }));
    return sourceMaterials.get(color);
  }
  function block(bin, parent, w, h, d, x, y, z, color, roll = 0) {
    const mesh = new THREE.Mesh(boxGeo, material(color));
    mesh.scale.set(w, h, d); mesh.position.set(x, y, z); mesh.rotation.z = roll;
    parent.add(mesh); return mesh;
  }
  function shade(color, multiplier) { return new THREE.Color(color).multiplyScalar(multiplier).getHex(); }
  function face(bin, x, y, z, yaw) {
    const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.y = yaw; bins[bin].add(f); return f;
  }

  function crate(box, size) {
    const cx = (box.a[0] + box.b[0]) / 2, cz = (box.a[2] + box.b[2]) / 2, cy = (box.a[1] + box.b[1]) / 2;
    const wood = box.mat === 'woodDark' ? 0x80603b : 0xaf8b57;
    const edge = Math.max(0.055, size * 0.075), span = size - edge;
    for (let side = 0; side < 4; side++) {
      const angle = side * Math.PI / 2, sn = Math.sin(angle), cs = Math.cos(angle);
      const f = face(0, cx + sn * size / 2, cy, cz + cs * size / 2, angle);
      // Thin battens sit almost entirely inside the existing wood surface.
      for (const v of [-1, 1]) {
        block(0, f, span, edge, 0.026, 0, v * (size - edge) / 2, 0, wood);
        block(0, f, edge, span - edge, 0.026, v * (size - edge) / 2, 0, 0, wood);
      }
      const diag = size * 0.76;
      block(0, f, edge * 0.8, diag * Math.SQRT2, 0.024, 0, 0, -0.001, shade(wood, 0.84), -Math.PI / 4);
      const metalFace = face(2, cx + sn * size / 2, cy, cz + cs * size / 2, angle);
      for (const u of [-1, 1]) for (const v of [-1, 1]) {
        const px = u * (size / 2 - edge * 0.67), py = v * (size / 2 - edge * 0.67);
        block(2, metalFace, edge * 0.8, edge * 0.8, 0.006, px, py, 0.016, 0x43484a);
        if (detailed) block(2, metalFace, 0.015, 0.015, 0.005, px, py, 0.021, 0xa5a29a);
      }
      // Two restrained stencilled handling marks, flush against the planks.
      if (side === 0 || side === 2) {
        block(0, f, size * 0.18, 0.02, 0.005, -size * 0.17, -size * 0.13, 0.015, 0x3e3429);
        for (const u of [-1, 1]) {
          block(0, f, 0.018, size * 0.13, 0.005, -size * 0.17 + u * size * 0.05, -size * 0.06, 0.015, 0x3e3429);
          block(0, f, 0.015, size * 0.045, 0.005, -size * 0.17 + u * size * 0.05 - 0.009, size * 0.002, 0.015, 0x3e3429, -0.65);
          block(0, f, 0.015, size * 0.045, 0.005, -size * 0.17 + u * size * 0.05 + 0.009, size * 0.002, 0.015, 0x3e3429, 0.65);
        }
      }
    }
    const top = new THREE.Group(); top.position.set(cx, box.b[1], cz); top.rotation.x = -Math.PI / 2; bins[0].add(top);
    for (const u of [-1, 1]) block(0, top, edge, size, 0.022, u * (size - edge) / 2, 0, 0, wood);
  }

  const digits = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
  function stencil(parent, number, x, y) {
    const code = String(number).padStart(6, '0');
    const segments = [[0, 0.08, 0.042, 0.009], [0.023, 0.041, 0.009, 0.068], [0.023, -0.041, 0.009, 0.068], [0, -0.08, 0.042, 0.009], [-0.023, -0.041, 0.009, 0.068], [-0.023, 0.041, 0.009, 0.068], [0, 0, 0.042, 0.009]];
    for (let n = 0; n < code.length; n++) for (let j = 0; j < segments.length; j++) if (digits[+code[n]] & (1 << j)) {
      const [u, v, w, h] = segments[j]; block(1, parent, w, h, 0.003, x + n * 0.073 + u, y + v, 0.020, 0xe4dfc4);
    }
  }

  function container(box, alongX) {
    const cx = (box.a[0] + box.b[0]) / 2, cz = (box.a[2] + box.b[2]) / 2, cy = box.a[1] + 1.3;
    const tint = box.tint === undefined ? 0x858c83 : box.tint, trim = shade(tint, 0.62);
    // Local container length is Z. A quarter turn handles the X-oriented originals and mirrors.
    const yaw = alongX ? Math.PI / 2 : 0;
    const localFace = (bin, x, y, z, rotation) => {
      const f = face(bin, cx + Math.cos(yaw) * x + Math.sin(yaw) * z, cy + y, cz - Math.sin(yaw) * x + Math.cos(yaw) * z, yaw + rotation);
      return f;
    };
    for (const side of [-1, 1]) {
      const f = localFace(1, side * 1.22, 0, 0, side * Math.PI / 2);
      for (const v of [-1, 1]) block(1, f, 6.1, 0.11, 0.028, 0, v * 1.245, 0, trim);
      for (const u of [-1, 1]) {
        block(1, f, 0.13, 2.6, 0.028, u * 2.985, 0, 0, trim);
        // ISO corner castings with dark lifting holes, at the existing silhouette.
        for (const v of [-1, 1]) {
          block(1, f, 0.16, 0.15, 0.032, u * 2.97, v * 1.225, 0, 0x686b66);
          block(1, f, 0.066, 0.052, 0.004, u * 2.97, v * 1.225, 0.018, 0x252b2c);
        }
      }
      if (detailed) stencil(f, Math.abs(Math.round(cx * 87 + cz * 191 + box.a[1] * 101)) % 1000000, 1.55, 0.86);
      // A small dark maker panel below the identification stencil.
      block(1, f, 0.29, 0.13, 0.008, 1.65, 0.58, 0.011, 0x303b3e);
      block(1, f, 0.20, 0.018, 0.003, 1.65, 0.59, 0.018, 0xc8c7b0);
    }
    // Closed boxes alone get doors. Hollow walk-through containers are never detected here.
    for (const end of [-1, 1]) {
      const f = localFace(1, 0, 0, end * 3.05, end < 0 ? Math.PI : 0);
      const hardware = localFace(2, 0, 0, end * 3.05, end < 0 ? Math.PI : 0);
      for (const v of [-1, 1]) block(1, f, 2.44, 0.10, 0.026, 0, v * 1.25, 0, trim);
      for (const u of [-1, 1]) block(1, f, 0.10, 2.6, 0.026, u * 1.17, 0, 0, trim);
      block(1, f, 0.022, 2.38, 0.010, 0, 0, 0.013, 0x263033);
      for (const u of [-1, 1]) {
        // Lock rods and broad hinge straps remain within 2.3 cm of the solid door.
        block(2, hardware, 0.035, 2.23, 0.026, u * 0.53, 0, 0.005, 0x9b9f99);
        for (const v of [-0.91, 0, 0.91]) {
          block(2, hardware, 0.13, 0.062, 0.016, u * 0.53, v, 0.014, 0x555e61);
          block(2, hardware, 0.24, 0.075, 0.018, u * 1.04, v, 0.009, 0x808983);
          if (detailed) block(2, hardware, 0.025, 0.037, 0.008, u * 0.98, v, 0.019, 0x343d40);
        }
        block(2, hardware, 0.22, 0.038, 0.016, u * 0.42, -0.38, 0.014, 0xb0b2a3);
        block(2, hardware, 0.09, 0.09, 0.018, u * 0.53, -0.38, 0.014, 0x5a6262);
      }
    }
  }

  for (const box of mapDef.boxes) {
    if (box.decor) continue;
    const w = box.b[0] - box.a[0], h = box.b[1] - box.a[1], d = box.b[2] - box.a[2];
    if ((box.mat === 'wood' || box.mat === 'woodDark') && w >= 0.6 && w <= 1.65 && near(w, h) && near(w, d)) crate(box, w);
    if (box.mat === 'container' && near(h, 2.6) && ((near(w, 6.1) && near(d, 2.44)) || (near(w, 2.44) && near(d, 6.1)))) container(box, w > d);
  }

  const finishes = [[0.93, 0], [0.70, 0.25], [0.48, 0.65]];
  for (let i = 0; i < bins.length; i++) if (bins[i].children.length) {
    const geometry = bakeGeometry(bins[i]).geo;
    const [roughness, metalness] = finishes[i];
    const mat = quality.standard ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness }) : new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = 'prop-finish:' + i;
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    result.add(mesh);
  }
  boxGeo.dispose();
  for (const mat of sourceMaterials.values()) mat.dispose();
  return result;
}
