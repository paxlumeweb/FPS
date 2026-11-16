// User settings (controls, graphics, audio), persisted in localStorage.

const KEY = 'breachline.settings.v1';

export const ACTIONS = [
  ['forward', 'Move Forward'], ['back', 'Move Back'], ['left', 'Strafe Left'], ['right', 'Strafe Right'],
  ['jump', 'Jump'], ['sprint', 'Sprint'], ['crouch', 'Crouch / Slide'],
  ['fire', 'Fire'], ['ads', 'Aim Down Sights'], ['reload', 'Reload'], ['melee', 'Quick Melee'], ['grenade', 'Frag Grenade (hold to cook)'],
  ['primary', 'Primary Weapon'], ['secondary', 'Secondary Weapon'], ['swap', 'Swap Weapon'], ['scoreboard', 'Scoreboard'],
];

export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC',
  fire: 'Mouse0', ads: 'Mouse2', reload: 'KeyR', melee: 'KeyV', grenade: 'KeyG',
  primary: 'Digit1', secondary: 'Digit2', swap: 'KeyQ', scoreboard: 'Tab',
};

export const QUALITY = {
  low: { label: 'Low', shadows: false, shadowSize: 0, pixelRatio: 0.75, standard: false, particles: 0.5, decals: 60, viewDist: 0.8 },
  medium: { label: 'Medium', shadows: true, shadowSize: 1024, pixelRatio: 1, standard: true, particles: 1, decals: 120, viewDist: 1 },
  high: { label: 'High', shadows: true, shadowSize: 2048, pixelRatio: 1.5, standard: true, particles: 1.5, decals: 200, viewDist: 1 },
  ultra: { label: 'Ultra', shadows: true, shadowSize: 4096, pixelRatio: 2, standard: true, particles: 2, decals: 300, viewDist: 1 },
};

const DEFAULTS = {
  name: '', sens: 1.0, adsSens: 1.0, invertY: false, fov: 78, quality: 'medium', antialias: true,
  volume: 0.8, showFps: false, toggleCrouch: false, toggleAds: false, headBob: true, binds: { ...DEFAULT_BINDS },
};

export class Settings {
  constructor() {
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    this.listeners = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        for (const k of Object.keys(DEFAULTS)) if (k !== 'binds' && typeof raw[k] === typeof DEFAULTS[k]) this.data[k] = raw[k];
        if (raw.binds && typeof raw.binds === 'object') for (const a of Object.keys(DEFAULT_BINDS)) if (typeof raw.binds[a] === 'string') this.data.binds[a] = raw.binds[a];
      }
    } catch (e) { /* corrupt or unavailable storage: use defaults */ }
    if (!QUALITY[this.data.quality]) this.data.quality = 'medium';
    this.data.sens = Math.min(5, Math.max(0.05, this.data.sens));
    this.data.fov = Math.min(105, Math.max(60, this.data.fov));
  }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); for (const f of this.listeners) f(k, v); }
  bind(action, code) {
    // a key can only do one thing: unbind it elsewhere first
    for (const a of Object.keys(this.data.binds)) if (this.data.binds[a] === code && a !== action) this.data.binds[a] = '';
    this.data.binds[action] = code; this.save(); for (const f of this.listeners) f('binds');
  }
  resetBinds() { this.data.binds = { ...DEFAULT_BINDS }; this.save(); for (const f of this.listeners) f('binds'); }
  onChange(f) { this.listeners.push(f); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage full/blocked */ } }
  get quality() { return QUALITY[this.data.quality]; }
}

/** Human-readable name for a key/mouse code. */
export function codeLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const map = { Mouse0: 'Left Mouse', Mouse1: 'Middle Mouse', Mouse2: 'Right Mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Space: 'Space',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', WheelUp: 'Wheel Up', WheelDown: 'Wheel Down' };
  return map[code] || code;
}
