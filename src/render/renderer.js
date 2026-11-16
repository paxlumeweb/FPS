// Scene, camera, lights, shadows and quality presets. One Renderer lives for the whole app;
// maps are swapped in and out with setMap().

import * as THREE from 'three';
import { buildWorldMesh, disposeWorldMesh, buildSky } from './worldmesh.js';
import { ViewModel } from './viewmodel.js';

const SHADOW_RANGE = 58;

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings;
    const gl = this.gl = new THREE.WebGLRenderer({ canvas, antialias: settings.get('antialias'), powerPreference: 'high-performance', stencil: false });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.autoClear = false;
    this.maxAniso = gl.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.06, 1200);
    this.camera.rotation.order = 'YXZ';
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.viewModel = new ViewModel();
    this.world = null; this.sky = null; this.mapDef = null;
    this.frame = 0; this.sunDir = new THREE.Vector3(0.5, 0.7, 0.5);
    this.applyQuality();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get quality() { return this.settings.quality; }

  applyQuality() {
    const q = this.quality, gl = this.gl;
    const dpr = window.devicePixelRatio || 1;
    gl.setPixelRatio(q.pixelRatio < 1 ? q.pixelRatio : Math.min(dpr, q.pixelRatio));
    gl.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      const s = this.sun.shadow;
      if (s.mapSize.x !== q.shadowSize) { s.mapSize.set(q.shadowSize, q.shadowSize); if (s.map) { s.map.dispose(); s.map = null; } }
      const c = s.camera; c.left = -SHADOW_RANGE; c.right = SHADOW_RANGE; c.top = SHADOW_RANGE; c.bottom = -SHADOW_RANGE; c.near = 1; c.far = 320; c.updateProjectionMatrix();
      s.bias = -0.0005; s.normalBias = 0.05;
    }
    // materials differ between presets (PBR vs Lambert), so rebuild the world if one is loaded
    if (this.mapDef && this._builtStandard !== q.standard) this.setMap(this.mapDef, true);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.viewModel.camera.aspect = w / h; this.viewModel.camera.updateProjectionMatrix();
  }

  setMap(mapDef, force) {
    if (this.mapDef === mapDef && !force) return;
    if (this.world) { this.scene.remove(this.world); disposeWorldMesh(this.world); }
    if (this.sky) { this.scene.remove(this.sky); this.sky.geometry.dispose(); this.sky.material.dispose(); }
    this.mapDef = mapDef;
    const q = this.quality, env = mapDef.env;
    this._builtStandard = q.standard;
    this.world = buildWorldMesh(mapDef, q, q.standard ? Math.min(8, this.maxAniso) : 2);
    this.sky = buildSky(env);
    this.scene.add(this.world, this.sky);
    // Image-based lighting from the procedural sky: gives PBR materials something to reflect.
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    if (q.standard) {
      const pm = new THREE.PMREMGenerator(this.gl), skyScene = new THREE.Scene(), dome = buildSky(env);
      skyScene.add(dome);
      this.envRT = pm.fromScene(skyScene, 0, 1, 1100);
      dome.geometry.dispose(); dome.material.dispose(); pm.dispose();
      this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = env.envIntensity === undefined ? 0.5 : env.envIntensity;
      this.viewModel.scene.environment = this.envRT.texture; this.viewModel.scene.environmentIntensity = 0.7;
    } else { this.scene.environment = null; this.viewModel.scene.environment = null; }
    this.scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar * (q.viewDist || 1));
    this.scene.background = new THREE.Color(env.fogColor);
    this.hemi.color.setHex(env.hemiSky); this.hemi.groundColor.setHex(env.hemiGround); this.hemi.intensity = env.hemiIntensity * (q.standard ? 0.8 : 1.15);
    this.sun.color.setHex(env.sunColor); this.sun.intensity = env.sunIntensity;
    this.sunDir.set(...env.sunDir).normalize();
    this.gl.toneMappingExposure = env.exposure || 1;
    this.viewModel.setEnv(env);
    this._shadowCenter = null;
  }

  /** Keep the shadow frustum centred near the camera, snapped to a coarse grid to avoid shimmer. */
  _updateShadow() {
    if (!this.quality.shadows) return;
    const p = this.camera.position, snap = 4;
    const cx = Math.round(p.x / snap) * snap, cz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + this.sunDir.x * 150, this.sunDir.y * 150, cz + this.sunDir.z * 150);
    this.sun.target.updateMatrixWorld();
  }

  render(withViewModel) {
    const gl = this.gl;
    this.frame++;
    this._updateShadow();
    gl.clear();
    gl.render(this.scene, this.camera);
    if (withViewModel && this.viewModel.root.visible) {
      gl.clearDepth();
      gl.render(this.viewModel.scene, this.viewModel.camera);
    }
  }

  /** Slow orbit around the map for menu backgrounds. */
  orbit(t) {
    const b = this.mapDef ? this.mapDef.bounds : { x0: -40, x1: 40, z0: -40, z1: 40 };
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.42;
    const a = t * 0.04;
    this.camera.position.set(cx + Math.cos(a) * r, 16 + Math.sin(t * 0.07) * 3, cz + Math.sin(a) * r * 0.8);
    this.camera.lookAt(cx, 3, cz);
    if (this.camera.fov !== 60) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
  }
}
