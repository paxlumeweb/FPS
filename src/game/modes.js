// Game mode definitions and lobby option lists.

import { GUN_GAME_LADDER } from './weapons.js';

export const MODES = {
  tdm: {
    id: 'tdm', name: 'Team Deathmatch', teams: true, progression: true, loadouts: true,
    desc: 'Two teams. First team to the score limit wins.',
    scoreLimits: [25, 50, 75, 100], defaultScore: 50,
  },
  ffa: {
    id: 'ffa', name: 'Free-for-All', teams: false, progression: true, loadouts: true,
    desc: 'Every player for themselves. First to the score limit wins.',
    scoreLimits: [10, 20, 30, 50], defaultScore: 20,
  },
  gungame: {
    id: 'gungame', name: 'Gun Game', teams: false, progression: false, loadouts: false,
    desc: 'Same weapon ladder for everyone; each kill moves you to the next gun. The final kill must be a knife kill. Loadouts and progression are disabled.',
    scoreLimits: [GUN_GAME_LADDER.length], defaultScore: GUN_GAME_LADDER.length,
  },
};

export const TIME_LIMITS = [3, 5, 10, 15, 20]; // minutes
export const BOT_COUNTS = [0, 1, 2, 3, 5, 7];
export const MAX_PLAYERS = 12;
export const RESPAWN_TIME = 3;
export const SPAWN_PROTECTION = 3;
export const COUNTDOWN = 5;
export const END_SCREEN_TIME = 14;

export function defaultSettings() {
  return { mode: 'tdm', map: 'downtown', scoreLimit: 50, timeLimit: 10, bots: 0 };
}

export function sanitizeSettings(s, mapIds) {
  const d = defaultSettings();
  const mode = MODES[s && s.mode] ? s.mode : d.mode;
  const m = MODES[mode];
  return {
    mode,
    map: mapIds.includes(s && s.map) ? s.map : mapIds[0],
    scoreLimit: m.scoreLimits.includes(s && s.scoreLimit) ? s.scoreLimit : m.defaultScore,
    timeLimit: TIME_LIMITS.includes(s && s.timeLimit) ? s.timeLimit : d.timeLimit,
    bots: BOT_COUNTS.includes(s && s.bots) ? s.bots : 0,
  };
}
