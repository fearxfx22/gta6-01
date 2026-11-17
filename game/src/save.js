// Save: one localStorage row — which missions are done and how much cash
// Rex is carrying. Nothing else is kept; the city is rebuilt fresh on every
// visit, and the run starts from the first unfinished job.
//
// The loader is deliberately paranoid: a damaged, hand-edited or
// half-written save must never read as "everything done" or crash the boot.
// Anything it cannot make sense of degrades to "no save".
import { SAVE_KEY } from './config.js';

const JOB_COUNT = 5;

/** Normalise a parsed save object, or return null when it is unusable. */
function normaliseSave(data) {
  if (!data || !Array.isArray(data.missionsDone)) return null;
  // A short array (older or damaged save) must not read as "all done":
  // pad missing jobs with false, drop anything past the fifth.
  const missionsDone = data.missionsDone.slice(0, JOB_COUNT);
  while (missionsDone.length < JOB_COUNT) missionsDone.push(false);
  const cash = Number.isFinite(data.cash) ? data.cash | 0 : 0;
  return { missionsDone, cash };
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return normaliseSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSave(missionsDone, cash) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ missionsDone, cash }));
  } catch {
    // Storage can be off (private mode, quota): the run just lasts this visit.
  }
}
