// Progression tables and math (pure functions). Storage lives in core/profile.js.
//
// Pacing targets:
//   Player level: 30 levels, 60,900 XP total. A typical 10-minute match yields ~2,300-2,800 XP
//   (15 kills, a few assists/bonuses, completion + win bonus) => max level in roughly 3.5-4.5 hours.
//   Weapon mastery: 12 levels, 12,650 weapon XP total. ~100-125 weapon XP per kill at ~90 kills/hour
//   with one gun => max mastery in roughly 1.2-1.6 hours of use.

import { WEAPONS, ATTACHMENTS, MAX_MASTERY, PRIMARIES, SECONDARIES } from './weapons.js';

export const MAX_LEVEL = 30;

export const XP = {
  kill: 100, headshot: 25, longshot: 25, backstab: 50, melee: 25, firstBlood: 50, revenge: 25,
  assist: 40, streak: 25, // per streak milestone (3, 5, 7, ...)
  matchComplete: 250, win: 250, topThree: 100,
  wKill: 100, wHeadshot: 25, wLongshot: 15, wAssist: 20,
};

export function xpForLevel(level) { return 700 + 100 * (level - 1); } // XP needed to go from `level` to `level+1`
export function masteryXpForLevel(level) { return 400 + 150 * (level - 1); }

function resolve(total, max, fn) {
  let level = 1, rem = Math.max(0, total);
  while (level < max && rem >= fn(level)) { rem -= fn(level); level++; }
  const need = level >= max ? 0 : fn(level);
  return { level, into: level >= max ? 0 : rem, need, frac: level >= max ? 1 : rem / need, max: level >= max };
}

export function levelInfo(totalXp) { return resolve(totalXp, MAX_LEVEL, xpForLevel); }
export function masteryInfo(weaponXp) { return resolve(weaponXp, MAX_MASTERY, masteryXpForLevel); }

export function totalXpForMaxLevel() { let t = 0; for (let l = 1; l < MAX_LEVEL; l++) t += xpForLevel(l); return t; }
export function totalXpForMaxMastery() { let t = 0; for (let l = 1; l < MAX_MASTERY; l++) t += masteryXpForLevel(l); return t; }

export function isWeaponUnlocked(weaponId, level) { const w = WEAPONS[weaponId]; return !!w && level >= w.unlock; }
export function isAttachmentUnlocked(attId, masteryLevel) { const a = ATTACHMENTS[attId]; return !!a && masteryLevel >= a.lvl; }

/** Weapons that unlock exactly at `level` (for the "unlocked" banner). */
export function unlocksAtLevel(level) {
  return [...PRIMARIES, ...SECONDARIES].filter((id) => WEAPONS[id].unlock === level);
}
