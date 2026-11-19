// Saving: one localStorage record with the shape of a career — money, story progress and
// where Marlo was standing. Saving happens at Dee's diner (the gold marker doubles as the
// safehouse) or from the pause menu. Loading mid-mission restarts that mission from its
// first stage, which the missions module handles by re-offering it at the diner.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(S) {
  const data = {
    v: 1,
    money: S.money,
    nextIndex: S.mission.nextIndex,
    storyDone: S.storyDone,
    missionsDone: S.stats.missionsDone,
    earned: S.stats.earned,
    x: Math.round(S.player.x),
    y: Math.round(S.player.y),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.nextIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // A browser that refuses storage refuses it; the game plays on regardless.
  }
}
