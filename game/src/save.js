// Save: one localStorage row — which missions are done and how much cash Rex
// is carrying. Nothing else is kept; the city is rebuilt fresh every visit.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.missionsDone)) return null;
    return { missionsDone: data.missionsDone.slice(0, 5), cash: data.cash | 0 };
  } catch {
    return null;
  }
}

export function writeSave(missionsDone, cash) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ missionsDone, cash }));
  } catch {
    // Storage can be off: the run just lasts this visit.
  }
}
