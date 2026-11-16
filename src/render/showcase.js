// Rotating weapon preview for the loadout screen. Drawn with the main renderer into the screen
// rectangle of a placeholder element, so no second WebGL context is needed.

import * as THREE from 'three';
import { buildGun } from './gunmodels.js';

export class Showcase {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 2, 0.05, 10);
    this.camera.position.set(0, 0.05, 1.9);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667080, 2.6));
    const d = new THREE.DirectionalLight(0xfff0d8, 3.4); d.position.set(1.5, 2, 2); this.scene.add(d);
    const r = new THREE.DirectionalLight(0x88aaff, 1.2); r.position.set(-2, 0.5, -1.5); this.scene.add(r);
    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.key = '';
  }

  set(id, att = []) {
    const key = id + ':' + att.join(',');
    if (key === this.key) return;
    this.key = key;
    this.pivot.clear();
    const g = buildGun(id, att);
    // centre the model on its bounding box and scale it to fill the frame
    g.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.group), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    g.group.position.sub(c);
    const holder = new THREE.Group(); holder.add(g.group);
    holder.rotation.y = Math.PI / 2; // show the side profile
    holder.scale.setScalar(1.6 / Math.max(size.z, size.y * 2.2, 0.25));
    this.pivot.add(holder);
  }

  /**
   * Render the weapon and copy it into the 2D canvas inside `el`. The main WebGL canvas is used
   * as scratch space (that area is hidden behind the menu panel anyway), so no second WebGL
   * context is needed.
   */
  render(gl, el, t) {
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10 || r.bottom < 0 || r.top > window.innerHeight) return;
    let cv = el.firstChild;
    const pr = gl.getPixelRatio(), w = Math.floor(r.width), h = Math.floor(r.height);
    if (!cv || cv.tagName !== 'CANVAS') { cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block'; el.appendChild(cv); }
    if (cv.width !== Math.round(w * pr) || cv.height !== Math.round(h * pr)) { cv.width = Math.round(w * pr); cv.height = Math.round(h * pr); }
    this.pivot.rotation.y = Math.sin(t * 0.5) * 0.55 + 0.25;
    this.pivot.rotation.x = Math.sin(t * 0.37) * 0.08;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // scratch area: top-left corner of the main canvas
    const y = window.innerHeight - h;
    gl.setViewport(0, y, w, h); gl.setScissor(0, y, w, h); gl.setScissorTest(true);
    gl.setClearColor(0x10151d, 1); gl.clear(true, true, false);
    gl.render(this.scene, this.camera);
    gl.setScissorTest(false); gl.setViewport(0, 0, window.innerWidth, window.innerHeight);
    const ctx = cv.getContext('2d');
    ctx.drawImage(gl.domElement, 0, 0, Math.round(w * pr), Math.round(h * pr), 0, 0, cv.width, cv.height);
  }
}
