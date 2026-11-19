// Pedestrians: small FSM walkers on the sidewalks. States: stroll (walk to a
// nearby sidewalk point), idle (pause and look around), flee (run from a
// gunshot or a speeding car). They are set dressing and witnesses: stealing a
// car in front of one raises the wanted level.

import * as THREE from 'three';
import { rand, randInt, pick } from './seed.js';
import { BLOCK_CENTERS, HALF } from './town.js';

const SHIRTS = [0xe8dcc0, 0xc96f5a, 0x7fa8a0, 0xe0b45a, 0x9a7fb0, 0x4a6b8a, 0xd98f5f];

function makeWalkerMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99a6b, roughness: 0.9 });
  const legs = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.95 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  for (const lx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), legs);
    leg.position.set(lx, 0.35, 0);
    g.add(leg);
  }
  return g;
}

function sidewalkPoint(rng) {
  // A point just off a road, on a block edge (sidewalk).
  const bx = pick(rng, BLOCK_CENTERS);
  const bz = pick(rng, BLOCK_CENTERS);
  const side = randInt(rng, 0, 3);
  const off = 13.5;
  if (side === 0) return { x: bx + rand(rng, -11, 11), z: bz - off };
  if (side === 1) return { x: bx + rand(rng, -11, 11), z: bz + off };
  if (side === 2) return { x: bx - off, z: bz + rand(rng, -11, 11) };
  return { x: bx + off, z: bz + rand(rng, -11, 11) };
}

export function buildFolks(scene, rng, town) {
  const folks = [];
  for (let i = 0; i < 14; i++) {
    const p = sidewalkPoint(rng);
    const mesh = makeWalkerMesh(pick(rng, SHIRTS));
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    folks.push({
      mesh, x: p.x, z: p.z, heading: rand(rng, 0, Math.PI * 2),
      state: 'stroll', target: sidewalkPoint(rng),
      speed: rand(rng, 1.1, 1.7), idleT: 0, fleeT: 0,
    });
  }

  return {
    folks,
    // threat: {x, z} when something scary happened nearby, else null.
    update(dt, threat) {
      for (const f of folks) {
        if (threat) {
          const dx = f.x - threat.x;
          const dz = f.z - threat.z;
          const d = Math.hypot(dx, dz);
          if (d < 26) { f.state = 'flee'; f.fleeT = 3; }
        }
        if (f.state === 'flee') {
          f.fleeT -= dt;
          const dx = f.x - (threat ? threat.x : f.x);
          const dz = f.z - (threat ? threat.z : f.z);
          const d = Math.hypot(dx, dz) || 1;
          f.heading = Math.atan2(dx / d, dz / d);
          f.x += Math.sin(f.heading) * 3.6 * dt;
          f.z += Math.cos(f.heading) * 3.6 * dt;
          if (f.fleeT <= 0) { f.state = 'stroll'; f.target = sidewalkPoint(rng); }
        } else if (f.state === 'idle') {
          f.idleT -= dt;
          if (f.idleT <= 0) { f.state = 'stroll'; f.target = sidewalkPoint(rng); }
        } else {
          const dx = f.target.x - f.x;
          const dz = f.target.z - f.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.8) {
            if (rng() < 0.3) { f.state = 'idle'; f.idleT = rand(rng, 1.5, 4); }
            else f.target = sidewalkPoint(rng);
          } else {
            f.heading = Math.atan2(dx / d, dz / d);
            f.x += Math.sin(f.heading) * f.speed * dt;
            f.z += Math.cos(f.heading) * f.speed * dt;
          }
        }
        const hit = town.collideCircle(f.x, f.z, 0.5);
        f.x = Math.max(-HALF - 2, Math.min(HALF + 2, hit.x));
        f.z = Math.max(-HALF - 40, Math.min(HALF + 40, hit.z));
        f.mesh.position.set(f.x, 0, f.z);
        f.mesh.rotation.y = f.heading;
        // Simple walk bob.
        const moving = f.state !== 'idle';
        f.mesh.position.y = moving ? Math.abs(Math.sin(performance.now() * 0.008 + f.x)) * 0.05 : 0;
      }
    },
    // Is anyone close enough to witness a crime?
    witnessNear(x, z, r) {
      for (const f of folks) {
        const dx = f.x - x;
        const dz = f.z - z;
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    },
  };
}
