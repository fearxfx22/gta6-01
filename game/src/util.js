// Shared helpers for Solmar Bay: a seeded random generator, small math
// helpers, and the world constants every system agrees on. Everything
// procedural in the game draws from one fixed seed so the city looks the
// same on every load (a ?seed= query can override it for screenshots).

// mulberry32: a tiny deterministic PRNG. Seed it once, then every call
// returns the next value in a fixed sequence.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent exponential smoothing factor (camera-systems
// pattern): the same feel at any FPS. rate ~ 4..10.
export function smoothFactor(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Shortest signed turn from angle `from` toward angle `to`.
export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// --- World layout -------------------------------------------------------
// North is -Z, south is +Z, east is +X. The city is a 7x7 grid of blocks.
// Roads run on a 36-unit pitch; road centre lines sit at -126, -90, ... 126.
export const WORLD = {
  seed: 1337,
  grid: 7,
  pitch: 36,
  roadWidth: 10,
  blockSize: 26,
  halfCity: 126, // roads span -126..126
  beachStart: 126, // sand strip south of the city
  seaStart: 152, // water from here south
  dockStart: -126, // container yard north of the city
  dockEnd: -168,
  marinaStart: 126, // piers east of the city
  marinaEnd: 172,
  halfWorld: 190, // playable bounds
};

// Road centre-line coordinate for road index i (0..7).
export function roadCoord(i) {
  return -WORLD.halfCity + i * WORLD.pitch;
}

// Block centre coordinate for block index i (0..6).
export function blockCoord(i) {
  return -WORLD.halfCity + WORLD.pitch / 2 + i * WORLD.pitch;
}

// Named places (all original names). Used by missions, HUD and the minimap.
export const PLACES = {
  veraGarage: { x: -96, z: 96, name: "Vera's Garage" },
  marinaCafe: { x: 102, z: 42, name: 'Marina Cafe' },
  containerYard: { x: 42, z: -146, name: 'Container Yard' },
  palmCourt: { x: -60, z: 102, name: 'Palm Court' },
  lighthouse: { x: -142, z: 140, name: 'Lighthouse Point' },
  downtown: { x: 0, z: 0, name: 'Old Town' },
  theStrip: { x: 0, z: 108, name: 'The Strip' },
  dockGate: { x: 0, z: -126, name: 'Dock Gate' },
};

// District names per block column/row, for the HUD location label.
export const DISTRICTS = [
  ['Dockside', 'Dockside', 'Harbor View', 'Old Town', 'Old Town', 'Marina Row', 'Marina Row'],
  ['Dockside', 'Harbor View', 'Harbor View', 'Old Town', 'Old Town', 'Marina Row', 'Marina Row'],
  ['Harbor View', 'Harbor View', 'Old Town', 'Old Town', 'Old Town', 'Marina Row', 'Marina Row'],
  ['Harbor View', 'Palm Court', 'Old Town', 'Old Town', 'Old Town', 'The Strip', 'The Strip'],
  ['Palm Court', 'Palm Court', 'Old Town', 'Old Town', 'The Strip', 'The Strip', 'The Strip'],
  ['Palm Court', 'Palm Court', 'Palm Court', 'The Strip', 'The Strip', 'The Strip', 'Sunset Beach'],
  ['Palm Court', 'Palm Court', 'Palm Court', 'The Strip', 'Sunset Beach', 'Sunset Beach', 'Sunset Beach'],
];

export function districtAt(x, z) {
  const col = clamp(Math.floor((x + WORLD.halfCity) / WORLD.pitch), 0, 6);
  const row = clamp(Math.floor((z + WORLD.halfCity) / WORLD.pitch), 0, 6);
  return DISTRICTS[row][col];
}

// Warm sunset palette for the whole city.
export const PALETTE = {
  sky: 0xffd9a0,
  fog: 0xf2b879,
  sun: 0xffd9a8,
  hemiSky: 0x9fc4e8,
  hemiGround: 0x8a6a4a,
  asphalt: 0x333338,
  sidewalk: 0x9a938a,
  sand: 0xe8c98f,
  sea: 0x2e6f8e,
  building: [0xe8dcc8, 0xd8b48f, 0xc98a6b, 0x9fc4c8, 0xe8a87c, 0xb8a88f, 0x8fb8a8],
  glass: 0x2a3a4a,
};
