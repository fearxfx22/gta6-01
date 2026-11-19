// Rex, the player, on foot: a third-person walker with a run, a jump, and
// health. Movement is camera-relative (W walks away from the camera), the
// model turns toward its travel direction, and a simple circle-vs-building
// resolve keeps Rex out of walls. The same module owns the "enter car"
// hand-off: it only decides when the player is close enough to a car.

import * as THREE from 'three';
import { clamp, lerp, wrapAngle, angleDelta, smoothFactor } from './util.js';
import { resolveCircle } from './city.js';

export function makePlayer() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a07a, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e4a6b, roughness: 0.85 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.85, 0.28), jeans);
  legs.position.y = 0.43;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), jacket);
  torso.position.y = 1.16;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 }));
  hair.position.y = 1.76;
  g.add(hair);
  const armGeo = new THREE.BoxGeometry(0.14, 0.6, 0.14);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.36, 1.16, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.36, 1.16, 0);
  g.add(armR);
  g.userData = {
    heading: 0,
    speed: 0,
    vy: 0,
    onGround: true,
    health: 100,
    maxHealth: 100,
    armL, armR,
    walkPhase: 0,
    aiming: false,
  };
  return g;
}

// input: {forward, strafe, run, jump} in [-1,1]/booleans, camYaw is the
// camera's yaw. Moves Rex, resolves walls, and animates the limbs.
export function updatePlayer(player, input, camYaw, colliders, dt) {
  const u = player.userData;
  const walkSpeed = input.run ? 8.2 : 4.6;
  // Camera-relative movement: forward is away from the camera.
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  let mx = -sin * input.forward + cos * input.strafe;
  let mz = -cos * input.forward - sin * input.strafe;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const targetSpeed = len * walkSpeed;
  u.speed = lerp(u.speed, targetSpeed, smoothFactor(10, dt));
  let nx = player.position.x + mx * u.speed * dt;
  let nz = player.position.z + mz * u.speed * dt;
  // Keep Rex inside the playable bounds.
  nx = clamp(nx, -186, 186);
  nz = clamp(nz, -186, 186);
  [nx, nz] = resolveCircle(colliders, nx, nz, 0.6);
  player.position.x = nx;
  player.position.z = nz;
  // Face the travel direction, turning smoothly.
  if (len > 0.1) {
    const want = Math.atan2(mx, mz);
    player.rotation.y += angleDelta(player.rotation.y, want) * smoothFactor(12, dt);
    u.heading = player.rotation.y;
  }
  // Jump + gravity.
  if (input.jump && u.onGround) {
    u.vy = 7.5;
    u.onGround = false;
  }
  if (!u.onGround) {
    u.vy -= 22 * dt;
    player.position.y += u.vy * dt;
    if (player.position.y <= 0) {
      player.position.y = 0;
      u.vy = 0;
      u.onGround = true;
    }
  }
  // Limb swing while moving; arms raise while aiming.
  u.walkPhase += dt * (2 + Math.abs(u.speed) * 1.6);
  const swing = Math.sin(u.walkPhase) * clamp(Math.abs(u.speed) / 4.6, 0, 1) * 0.55;
  if (u.aiming) {
    u.armR.rotation.x = -1.35;
    u.armL.rotation.x = -1.1;
  } else {
    u.armL.rotation.x = swing;
    u.armR.rotation.x = -swing;
  }
  return u.speed;
}

export function damagePlayer(player, amount) {
  const u = player.userData;
  u.health = clamp(u.health - amount, 0, u.maxHealth);
  return u.health;
}

export function healPlayer(player, amount) {
  const u = player.userData;
  u.health = clamp(u.health + amount, 0, u.maxHealth);
  return u.health;
}
