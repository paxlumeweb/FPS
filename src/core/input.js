// Keyboard + mouse input with rebindable actions and raw (unaccelerated) mouse look via Pointer Lock.

export class Input {
  constructor(settings, element) {
    this.settings = settings; this.el = element;
    this.down = new Set();      // codes currently held
    this.pressedQ = [];         // codes pressed since last poll (edge events)
    this.dx = 0; this.dy = 0;
    this.locked = false; this.enabled = false;
    this.capture = null;        // when set, the next key/button goes to this callback (rebinding UI)
    this.onLockChange = null;

    addEventListener('keydown', (e) => this._key(e, true));
    addEventListener('keyup', (e) => this._key(e, false));
    addEventListener('mousedown', (e) => this._mouse(e, true));
    addEventListener('mouseup', (e) => this._mouse(e, false));
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } });
    addEventListener('wheel', (e) => { if (this.locked) { this.pressedQ.push(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); } }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.locked || this.enabled) e.preventDefault(); });
    addEventListener('blur', () => this.down.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.down.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; if (this.onLockChange) this.onLockChange(false); });
  }

  /** Request pointer lock with raw input (no OS acceleration) when the browser supports it. */
  lock() {
    if (this.locked || !this.el.requestPointerLock) return;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = this.el.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* needs a user gesture */ } });
    } catch (e) { try { this.el.requestPointerLock(); } catch (e2) { /* needs a user gesture */ } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _key(e, isDown) {
    if (this.capture) {
      if (isDown) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code === 'Escape' ? null : e.code); }
      return;
    }
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) return;
    if (this.enabled) {
      // keep the browser from scrolling / switching focus / opening menus while playing
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'AltLeft' || (e.ctrlKey && this.locked)) e.preventDefault();
    }
    if (isDown) { if (!e.repeat) { this.down.add(e.code); this.pressedQ.push(e.code); } } else this.down.delete(e.code);
  }

  _mouse(e, isDown) {
    const code = 'Mouse' + e.button;
    if (this.capture) {
      if (isDown) { e.preventDefault(); e.stopPropagation(); const c = this.capture; this.capture = null; c(code); }
      return;
    }
    if (!this.locked) return;
    if (isDown) { this.down.add(code); this.pressedQ.push(code); } else this.down.delete(code);
    if (e.button === 3 || e.button === 4) e.preventDefault();
  }

  isDown(action) { const c = this.settings.data.binds[action]; return !!c && this.down.has(c); }

  /** Drain edge-triggered presses; returns the set of actions pressed since the last call. */
  takePressed() {
    const binds = this.settings.data.binds, out = this._out || (this._out = new Set());
    out.clear();
    for (const code of this.pressedQ) {
      for (const a in binds) if (binds[a] === code) out.add(a);
      out.add('code:' + code);
    }
    this.pressedQ.length = 0;
    return out;
  }

  takeMouse(out) { out.dx = this.dx; out.dy = this.dy; this.dx = 0; this.dy = 0; return out; }
  clear() { this.down.clear(); this.pressedQ.length = 0; this.dx = this.dy = 0; }
}
