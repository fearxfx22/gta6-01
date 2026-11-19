// The pistol for Solmar Bay: a hitscan weapon (fps-shooter pattern) —
// one ray from the camera, the first thing it hits takes damage, with a
// tracer line, a muzzle flash, a hitmarker and a short cooldown. Ammo is a
// magazine of 12 with a reload. The same module owns the enemy crew the
// player shoots at in The Exchange: simple FSM fighters that take cover
// positions and fire back with poor aim.

import * as THREE from 'three';
import { clamp, lerp, dist2D, range } from './util.js';

export function makePistol() {
  return {
    ammo: 12,
    magSize: 12,
    reserve: 60,
    cooldown: 0,
    reloadTimer: 0,
    damage: 34,
    range: 90,
  };
}

// Build the visible pistol held in front of the camera (a small dark box
// group attached to the camera).
export function makePistolMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.7 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.42), mat);
  barrel.position.set(0, 0, -0.18);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), mat);
  grip.position.set(0, -0.11, 0.04);
  grip.rotation.x = 0.25;
  g.add(grip);
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.34, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc86a, transparent: true, opacity: 0 }),
  );
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0, 0, -0.5);
  g.add(flash);
  g.userData.flash = flash;
  g.userData.flashTimer = 0;
  g.position.set(0.34, -0.3, -0.55);
  return g;
}

// Fire one hitscan shot. `targets` is a list of {mesh, radius, onHit} —
// crew members, police cars, etc. `solids` is the list of meshes a shot
// can be blocked by (buildings). Returns what the shot hit, or null.
export function firePistol(pistol, camera, targets, solids, scene, onShot) {
  if (pistol.cooldown > 0 || pistol.reloadTimer > 0 || pistol.ammo <= 0) return null;
  pistol.ammo -= 1;
  pistol.cooldown = 0.22;
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = pistol.range;
  // The closest solid hit caps the shot's reach.
  const solidHits = ray.intersectObjects(solids, false);
  let maxDist = pistol.range;
  let hitPoint = null;
  if (solidHits.length > 0) {
    maxDist = solidHits[0].distance;
    hitPoint = solidHits[0].point.clone();
  }
  // Test each target as a sphere around its chest.
  let best = null;
  let bestDist = maxDist;
  for (const t of targets) {
    if (t.dead) continue;
    const c = t.mesh.position.clone();
    c.y += 1.2;
    const toC = c.clone().sub(ray.ray.origin);
    const along = toC.dot(ray.ray.direction);
    if (along < 0 || along > bestDist) continue;
    const closest = ray.ray.origin.clone().addScaledVector(ray.ray.direction, along);
    const d = closest.distanceTo(c);
    if (d < (t.radius ?? 0.9)) {
      best = t;
      bestDist = along;
      hitPoint = closest;
    }
  }
  const end = hitPoint ?? ray.ray.origin.clone().addScaledVector(ray.ray.direction, pistol.range);
  spawnTracer(scene, ray.ray.origin.clone().addScaledVector(ray.ray.direction, 0.6), end);
  if (best) {
    best.hp -= pistol.damage;
    if (best.hp <= 0 && !best.dead) {
      best.dead = true;
      if (best.onDeath) best.onDeath(best);
    }
    if (onShot) onShot({ hit: best, point: end, killed: best.dead });
    return best;
  }
  if (onShot) onShot({ hit: null, point: end, killed: false });
  return null;
}

const tracers = [];
function spawnTracer(scene, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, life: 0.07 });
}

export function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      t.line.parent?.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

export function reloadPistol(pistol) {
  if (pistol.reloadTimer > 0 || pistol.ammo === pistol.magSize || pistol.reserve <= 0) return false;
  pistol.reloadTimer = 1.1;
  return true;
}

export function updatePistol(pistol, dt) {
  pistol.cooldown = Math.max(0, pistol.cooldown - dt);
  if (pistol.reloadTimer > 0) {
    pistol.reloadTimer -= dt;
    if (pistol.reloadTimer <= 0) {
      const need = pistol.magSize - pistol.ammo;
      const take = Math.min(need, pistol.reserve);
      pistol.ammo += take;
      pistol.reserve -= take;
    }
  }
}

// --- Enemy crew (The Exchange) --------------------------------------------
// A crew member stands at a post, watches for the player, and fires back
// with slow, inaccurate shots. FSM: idle -> alert -> shoot -> down.
export function makeCrewMember(x, z, scene) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0x7a2020, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a6a, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.85, 0.28), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.9 }));
  legs.position.y = 0.43;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), shirt);
  torso.position.y = 1.16;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.4, metalness: 0.7 }));
  gun.position.set(0.3, 1.2, 0.3);
  g.add(gun);
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    mesh: g,
    hp: 100,
    dead: false,
    radius: 0.9,
    state: 'idle',
    shootTimer: range(Math.random, 0.5, 1.5),
    onDeath: null,
  };
}

// One crew step: face the player when alerted, fire slow shots that can
// hurt the player. Returns true if this member shot the player this frame.
export function updateCrewMember(member, playerPos, dt, onPlayerHit) {
  if (member.dead) {
    // Fall over.
    member.mesh.rotation.x = lerp(member.mesh.rotation.x, -Math.PI / 2, 1 - Math.exp(-6 * dt));
    member.mesh.position.y = lerp(member.mesh.position.y, 0.25, 1 - Math.exp(-6 * dt));
    return false;
  }
  const m = member.mesh;
  const d = dist2D(m.position.x, m.position.z, playerPos.x, playerPos.z);
  if (d < 46) member.state = 'alert';
  if (member.state === 'alert') {
    m.rotation.y = Math.atan2(playerPos.x - m.position.x, playerPos.z - m.position.z);
    member.shootTimer -= dt;
    if (member.shootTimer <= 0 && d < 40) {
      member.shootTimer = range(Math.random, 1.1, 1.9);
      // Poor aim: hits only sometimes, and never at long range.
      const hitChance = d < 14 ? 0.34 : d < 26 ? 0.2 : 0.1;
      if (Math.random() < hitChance) {
        onPlayerHit(7 + Math.random() * 6);
        return true;
      }
    }
  }
  return false;
}
