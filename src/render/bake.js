// Bakes a group of small meshes into one geometry with vertex colours, so a whole object is a
// single draw call instead of one per part.

import * as THREE from 'three';

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _c = new THREE.Color();

/**
 * Merge every lit mesh under `root` (transforms relative to root). Unlit helper meshes (e.g. the
 * glowing red dot) are left out and returned in `extras` so the caller can keep them as-is.
 */
export function bakeGeometry(root) {
  const pos = [], nor = [], col = [], idx = [], extras = [];
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.isMeshBasicMaterial || o.material.transparent) { extras.push(o); return; }
    const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, base = pos.length / 3;
    _m.multiplyMatrices(inv, o.matrixWorld); _n.getNormalMatrix(_m);
    _c.copy(o.material.color);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(_m); pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(n, i).applyMatrix3(_n).normalize(); nor.push(_v.x, _v.y, _v.z);
      col.push(_c.r, _c.g, _c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return { geo, extras };
}
