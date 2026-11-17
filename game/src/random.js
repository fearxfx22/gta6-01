// Seeded randomness and the small math helpers every system shares.
//
// The city layout is seeded (mulberry32) so ?seed=N always builds the same
// streets and buildings; moment-to-moment gameplay randomness uses
// Math.random directly. Everything here is pure and side-effect free, so any
// module can import it without worrying about load order.

/** mulberry32 — a tiny fast PRNG with a good distribution for a 32-bit seed. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A friendly wrapper around a seeded stream: ranges, ints, picks, chances. */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    /** Uniform float in [a, b). */
    range: (a, b) => a + (b - a) * next(),
    /** Uniform integer in [a, b], inclusive on both ends. */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    /** A random element of a non-empty array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** True with probability p (0..1). */
    chance: (p) => next() < p,
  };
}

/** Clamp v into [a, b]. */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Linear interpolation between a and b. */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Frame-rate independent exponential smoothing factor: dampFactor(rate, dt)
 * is the fraction of the remaining gap to close this frame.
 */
export const dampFactor = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Interpolate angle a toward angle b along the shortest arc. */
export const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;

/** 2D distance on the ground plane (x, z). */
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/**
 * Smallest signed angle from a to b, wrapped to [-PI, PI]. The traffic,
 * police and pedestrian steering all used to inline this loop.
 */
export const angleDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
