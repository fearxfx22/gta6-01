// Save/load for Solmar Bay: one small JSON record in localStorage, written
// after every mission (and on quit). It holds the mission index, cash,
// health and the player's last position — enough to pick up where the
// player left off. Nothing else is persisted; the city is rebuilt from
// the fixed seed on every load.

const KEY = 'solmarbay-save-v1';

export function saveGame(state) {
  try {
    const record = {
      version: 1,
      missionIndex: state.missionIndex,
      cash: state.cash,
      health: state.health,
      x: state.x,
      z: state.z,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== 1) return null;
    return record;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable — the game still plays, it just won't persist.
  }
}
