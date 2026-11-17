// Juice: one shared particle pool (sparks, smoke, blood, dust) plus a muzzle
// flash sprite. The pool is fixed-size and ring-buffered, so a burst never
// allocates — it just overwrites the oldest live particle. Dead particles are
// parked far underground so they never render.
//
// Particles are plain data (life, velocity); positions live in one
// BufferAttribute that the GPU draws as Points. Only the position attribute
// is re-uploaded when something moved.
import * as THREE from 'three';

const MAX_PARTICLES = 240;
const GRAVITY = 9;

export function createEffects(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);

  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
  }
  let cursor = 0;

  // Muzzle flash: a small additive sprite that lives one frame.
  const flashMat = new THREE.SpriteMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(1.6);
  scene.add(flash);
  let flashTime = 0;

  /** Spray `count` particles from (x, y, z) in a flat ring with an upward bias. */
  function burst(x, y, z, colorHex, count, speed, up = 2.5, life = 0.7) {
    const c = new THREE.Color(colorHex);
    for (let n = 0; n < count; n += 1) {
      const p = parts[cursor];
      const i3 = cursor * 3;
      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * (0.4 + Math.random() * 0.8);
      p.life = p.max = life * (0.6 + Math.random() * 0.7);
      cursor = (cursor + 1) % MAX_PARTICLES;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return {
    burst,
    sparks(x, y, z) {
      burst(x, y, z, 0xffc24b, 14, 7, 3, 0.5);
    },
    smoke(x, y, z) {
      burst(x, y, z, 0x555555, 10, 2, 2, 1.1);
    },
    blood(x, y, z) {
      burst(x, y, z, 0xaa2211, 10, 4, 2, 0.6);
    },
    // Dust kicked up by tyres on sand or a handbrake slide: pale, slow, long.
    dust(x, y, z) {
      burst(x, y, z, 0xc9b18a, 6, 1.6, 1.2, 1.2);
    },
    muzzle(x, y, z) {
      flash.position.set(x, y, z);
      flashMat.opacity = 0.95;
      flashTime = 0.05;
    },
    update(dt) {
      let dirty = false;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const p = parts[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        dirty = true;
        const i3 = i * 3;
        if (p.life <= 0) {
          positions[i3 + 1] = -100; // park it underground, out of sight
          continue;
        }
        p.vy -= GRAVITY * dt;
        positions[i3] += p.vx * dt;
        positions[i3 + 1] += p.vy * dt;
        positions[i3 + 2] += p.vz * dt;
      }
      if (dirty) geo.attributes.position.needsUpdate = true;
      if (flashTime > 0) {
        flashTime -= dt;
        if (flashTime <= 0) flashMat.opacity = 0;
      }
    },
  };
}
