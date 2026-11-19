// Traffic and pedestrians for Solmar Bay. Traffic cars follow rectangular
// loops around city blocks (game-ai steering: seek the next waypoint, arrive
// at corners, slow for the car ahead). Pedestrians run a small FSM — walk
// along a sidewalk, wait at a corner, walk on — and flee when the player
// shoots or drives at them. All of it is seeded, so the same streets look
// the same every load.

import * as THREE from 'three';
import { makeCar, driveCar, coastToStop } from './vehicles.js';
import { makeRng, pick, range, rangeInt, clamp, angleDelta, dist2D, WORLD, roadCoord, blockCoord } from './util.js';

const PED_COLORS = [0xd8a03a, 0x3a7db8, 0xb83a5a, 0x4a8a4a, 0x8a5ac8, 0xd8d0c0, 0x2a2d33];
const PED_SHIRTS = [0xe8e8e8, 0xc23a2e, 0x2e6fb8, 0x3a8a5a, 0xe8a83a, 0x8a5ac8];

// A rectangular loop around one block, on the roads that border it.
function blockLoop(bx, bz, dir) {
  const x0 = roadCoord(bx);
  const x1 = roadCoord(bx + 1);
  const z0 = roadCoord(bz);
  const z1 = roadCoord(bz + 1);
  const pts = [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
  if (dir < 0) pts.reverse();
  return pts;
}

export function buildTraffic(scene, rng, colliders) {
  const cars = [];
  const usedBlocks = new Set();
  for (let i = 0; i < 12; i++) {
    let bx = rangeInt(rng, 0, 6);
    let bz = rangeInt(rng, 0, 6);
    let guard = 0;
    while (usedBlocks.has(bx + ',' + bz) && guard++ < 20) {
      bx = rangeInt(rng, 0, 6);
      bz = rangeInt(rng, 0, 6);
    }
    usedBlocks.add(bx + ',' + bz);
    const loop = blockLoop(bx, bz, rng() < 0.5 ? 1 : -1);
    const start = loop[rangeInt(rng, 0, 3)];
    const car = makeCar(pick(rng, [0xc23a2e, 0x2e6fb8, 0xe8a83a, 0x3a8a5a, 0xe8e8e8, 0x222226]), {
      x: start.x, z: start.z, maxSpeed: range(rng, 9, 13), accel: 8,
    });
    scene.add(car);
    cars.push({
      mesh: car,
      loop,
      wp: rangeInt(rng, 0, 3),
      cruise: range(rng, 8, 12),
      stopped: 0,
    });
  }
  return cars;
}

// One traffic step: steer toward the next loop waypoint, slow for the car
// ahead, and keep a polite gap at intersections.
export function updateTraffic(cars, playerCar, dt, time) {
  for (const t of cars) {
    const m = t.mesh;
    if (m.userData.isPlayer) continue; // the player's car is driven by input
    const target = t.loop[t.wp];
    const dx = target.x - m.position.x;
    const dz = target.z - m.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 3) {
      t.wp = (t.wp + 1) % t.loop.length;
      continue;
    }
    // Slow for the car ahead (any car within 7 units in front).
    let ahead = false;
    for (const o of cars) {
      if (o === t) continue;
      const om = o.mesh;
      const d = dist2D(m.position.x, m.position.z, om.position.x, om.position.z);
      if (d < 7 && d > 0.01) {
        const toOther = Math.atan2(om.position.x - m.position.x, om.position.z - m.position.z);
        if (Math.abs(angleDelta(m.userData.heading, toOther)) < 0.7) { ahead = true; break; }
      }
    }
    if (playerCar) {
      const d = dist2D(m.position.x, m.position.z, playerCar.position.x, playerCar.position.z);
      if (d < 8) {
        const toPlayer = Math.atan2(playerCar.position.x - m.position.x, playerCar.position.z - m.position.z);
        if (Math.abs(angleDelta(m.userData.heading, toPlayer)) < 0.8) ahead = true;
      }
    }
    const wantHeading = Math.atan2(dx, dz);
    const steer = clamp(angleDelta(m.userData.heading, wantHeading) * 1.6, -1, 1);
    const throttle = ahead ? 0 : (Math.abs(m.userData.speed) < t.cruise ? 0.7 : 0.15);
    driveCar(m, throttle, steer, dt);
  }
}

// --- Pedestrians ------------------------------------------------------------

function makePedestrian(color, shirt) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 }));
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.13);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.34, 1.1, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.34, 1.1, 0);
  g.add(armR);
  g.userData = { armL, armR, walkPhase: Math.random() * 6 };
  return g;
}

export function buildPedestrians(scene, rng) {
  const peds = [];
  for (let i = 0; i < 22; i++) {
    const bx = rangeInt(rng, 0, 6);
    const bz = rangeInt(rng, 0, 6);
    // Walk along a sidewalk edge of the block.
    const side = rangeInt(rng, 0, 3);
    const cx = blockCoord(bx);
    const cz = blockCoord(bz);
    let x, z, axis, from, to;
    if (side === 0) { x = cx; z = cz - 15; axis = 'x'; from = cx - 13; to = cx + 13; }
    else if (side === 1) { x = cx; z = cz + 15; axis = 'x'; from = cx - 13; to = cx + 13; }
    else if (side === 2) { x = cx - 15; z = cz; axis = 'z'; from = cz - 13; to = cz + 13; }
    else { x = cx + 15; z = cz; axis = 'z'; from = cz - 13; to = cz + 13; }
    const mesh = makePedestrian(pick(rng, PED_COLORS), pick(rng, PED_SHIRTS));
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh,
      axis, from, to,
      dir: rng() < 0.5 ? 1 : -1,
      speed: range(rng, 1.1, 2.1),
      state: 'walk',
      wait: 0,
      fleeX: 0, fleeZ: 0,
    });
  }
  return peds;
}

// Pedestrian FSM: walk -> wait at the end of a sidewalk -> walk back.
// Flee: run away from a threat point for a few seconds, then resume.
export function updatePedestrians(peds, threat, dt, time) {
  for (const p of peds) {
    const m = p.mesh;
    if (p.state === 'flee') {
      const dx = m.position.x - p.fleeX;
      const dz = m.position.z - p.fleeZ;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      m.position.x += (dx / d) * 4.4 * dt;
      m.position.z += (dz / d) * 4.4 * dt;
      m.rotation.y = Math.atan2(dx, dz);
      p.wait -= dt;
      if (p.wait <= 0) p.state = 'walk';
    } else if (p.state === 'wait') {
      p.wait -= dt;
      if (p.wait <= 0) { p.state = 'walk'; p.dir *= -1; }
    } else {
      // Walk along the sidewalk segment.
      const speed = p.speed;
      if (p.axis === 'x') {
        m.position.x += p.dir * speed * dt;
        if (m.position.x > p.to || m.position.x < p.from) {
          p.state = 'wait';
          p.wait = range(Math.random, 1, 3);
          m.position.x = clamp(m.position.x, p.from, p.to);
        }
        m.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        m.position.z += p.dir * speed * dt;
        if (m.position.z > p.to || m.position.z < p.from) {
          p.state = 'wait';
          p.wait = range(Math.random, 1, 3);
          m.position.z = clamp(m.position.z, p.from, p.to);
        }
        m.rotation.y = p.dir > 0 ? 0 : Math.PI;
      }
      // A nearby threat makes them flee.
      if (threat) {
        const d = dist2D(m.position.x, m.position.z, threat.x, threat.z);
        if (d < threat.radius) {
          p.state = 'flee';
          p.fleeX = threat.x;
          p.fleeZ = threat.z;
          p.wait = 3;
        }
      }
    }
    // Swing the arms while walking.
    const u = m.userData;
    u.walkPhase += dt * (p.state === 'flee' ? 11 : 6);
    const swing = Math.sin(u.walkPhase) * 0.5;
    u.armL.rotation.x = swing;
    u.armR.rotation.x = -swing;
  }
}

export function scarePedestrians(peds, x, z, radius) {
  for (const p of peds) {
    const m = p.mesh;
    if (dist2D(m.position.x, m.position.z, x, z) < radius) {
      p.state = 'flee';
      p.fleeX = x;
      p.fleeZ = z;
      p.wait = 3;
    }
  }
}
