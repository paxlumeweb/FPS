// Player profile: progression + loadout, saved in localStorage, with an export/import code so
// progress can be backed up or moved between browsers.

import { levelInfo, masteryInfo, isWeaponUnlocked, isAttachmentUnlocked } from '../game/progression.js';
import { WEAPONS, PRIMARIES, SECONDARIES, defaultLoadout, sanitizeLoadout } from '../game/weapons.js';

const KEY = 'breachline.profile.v1';
const CODE_PREFIX = 'BL1';

function fresh() {
  return { v: 1, gen: 0, xp: 0, weapons: {}, loadout: defaultLoadout(), stats: { kills: 0, deaths: 0, assists: 0, headshots: 0, matches: 0, wins: 0, seconds: 0 } };
}

function checksum(str) { // FNV-1a, enough to catch typos / truncated codes
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Coerce arbitrary parsed JSON into a valid profile (never trust storage or pasted codes). */
function normalize(raw) {
  const p = fresh();
  if (!raw || typeof raw !== 'object') return p;
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  p.xp = Math.min(n(raw.xp), 10_000_000);
  p.gen = n(raw.gen);
  if (raw.weapons && typeof raw.weapons === 'object') for (const id of [...PRIMARIES, ...SECONDARIES]) if (raw.weapons[id]) p.weapons[id] = Math.min(n(raw.weapons[id]), 10_000_000);
  if (raw.stats && typeof raw.stats === 'object') for (const k of Object.keys(p.stats)) p.stats[k] = n(raw.stats[k]);
  p.loadout = sanitizeLoadout(raw.loadout);
  return p;
}

export class Profile {
  constructor() {
    this.data = fresh();
    this.storageOk = true;
    try { this.data = normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { this.storageOk = false; }
    this.fixLoadout();
  }

  /**
   * Save. Several tabs of one browser share this storage (e.g. when testing two players on one
   * machine), so instead of blindly overwriting we merge with what is stored: progress only ever
   * goes up. `gen` changes on reset/import so those deliberately replace everything.
   */
  save() {
    try {
      const stored = normalize(JSON.parse(localStorage.getItem(KEY) || 'null')), d = this.data;
      if (stored.gen > d.gen) { this.data = stored; this.fixLoadout(); return; }
      if (stored.gen === d.gen) {
        d.xp = Math.max(d.xp, stored.xp);
        for (const id of Object.keys(stored.weapons)) d.weapons[id] = Math.max(d.weapons[id] || 0, stored.weapons[id]);
        for (const k of Object.keys(d.stats)) d.stats[k] = Math.max(d.stats[k], stored.stats[k]);
      }
      localStorage.setItem(KEY, JSON.stringify(d));
      this.storageOk = true;
    } catch (e) { this.storageOk = false; }
  }
  _replace(data) { let gen = 0; try { gen = normalize(JSON.parse(localStorage.getItem(KEY) || 'null')).gen; } catch (e) { /* ignore */ } data.gen = Math.max(gen, this.data.gen) + 1; this.data = data; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { this.storageOk = false; } }

  get level() { return levelInfo(this.data.xp); }
  mastery(weaponId) { return masteryInfo(this.data.weapons[weaponId] || 0); }
  weaponUnlocked(id) { return isWeaponUnlocked(id, this.level.level); }
  attachmentUnlocked(weaponId, attId) { return isAttachmentUnlocked(attId, this.mastery(weaponId).level); }

  addXp(amount) { this.data.xp += Math.max(0, Math.floor(amount)); }
  addWeaponXp(id, amount) { if (WEAPONS[id] && WEAPONS[id].cls !== 'melee') this.data.weapons[id] = (this.data.weapons[id] || 0) + Math.max(0, Math.floor(amount)); }

  /** Drop anything from the loadout that is not actually unlocked. */
  fixLoadout() {
    const lo = sanitizeLoadout(this.data.loadout), d = defaultLoadout();
    if (!this.weaponUnlocked(lo.primary)) { lo.primary = d.primary; lo.primaryAtt = []; }
    if (!this.weaponUnlocked(lo.secondary)) { lo.secondary = d.secondary; lo.secondaryAtt = []; }
    lo.primaryAtt = lo.primaryAtt.filter((a) => this.attachmentUnlocked(lo.primary, a));
    lo.secondaryAtt = lo.secondaryAtt.filter((a) => this.attachmentUnlocked(lo.secondary, a));
    this.data.loadout = lo;
    return lo;
  }

  setLoadout(lo) { this.data.loadout = sanitizeLoadout(lo); this.fixLoadout(); this.save(); return this.data.loadout; }

  /** Snapshot used to show "before -> after" progress on the post-match screen. */
  snapshot() { return { xp: this.data.xp, weapons: { ...this.data.weapons } }; }

  exportCode() {
    const json = JSON.stringify(this.data);
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${CODE_PREFIX}.${b64}.${checksum(b64)}`;
  }

  /** Returns {ok, error}. Replaces the current profile on success. */
  importCode(code) {
    try {
      const parts = String(code || '').trim().replace(/\s+/g, '').split('.');
      if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return { ok: false, error: 'That does not look like a Breachline progress code.' };
      if (checksum(parts[1]) !== parts[2]) return { ok: false, error: 'The code is damaged or incomplete (checksum mismatch).' };
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4))));
      this._replace(normalize(JSON.parse(json)));
      this.fixLoadout(); this.save();
      return { ok: true };
    } catch (e) { return { ok: false, error: 'Could not read that code.' }; }
  }

  reset() { this._replace(fresh()); }
}
