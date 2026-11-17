// Rex Dalton on foot: camera-relative WASD movement, sprint, jump, and a simple
// low-poly character whose limbs swing with the stride. Health + regen live here.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, dampFactor } from './random.js';

function limb(w, h, d, color, x, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  m.position.set(x, y, 0);
  m.castShadow = true;
  return m;
}

export function makePersonMesh(jacket, pants, skin) {
  const g = new THREE.Group();
  const legL = limb(0.26, 0.78, 0.3, pants, -0.16, 0.39);
  const legR = limb(0.26, 0.78, 0.3, pants, 0.16, 0.39);
  const torso = limb(0.72, 0.72, 0.4, jacket, 0, 1.16);
  const armL = limb(0.2, 0.62, 0.24, jacket, -0.48, 1.2);
  const armR = limb(0.2, 0.62, 0.24, jacket, 0.48, 1.2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }));
  head.position.y = 1.78;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
  cap.position.y = 1.98;
  g.add(legL, legR, torso, armL, armR, head, cap);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

export function createPlayer(scene, world) {
  const mesh = makePersonMesh(0x8a2f23, 0x2a3242, 0xc98a5a);
  scene.add(mesh);
  const pos = new THREE.Vector3(-150, 0, 132);
  const vel = new THREE.Vector3();
  let heading = Math.PI;
  let vy = 0, onGround = true;
  let health = PLAYER.health;
  let lastHurt = -99;
  let walkPhase = 0;
  let time = 0;
  let dead = false;

  function damage(amount, when) {
    if (dead) return;
    health -= amount;
    lastHurt = when;
    if (health <= 0) { health = 0; dead = true; }
  }

  return {
    mesh, pos, get heading() { return heading; }, get health() { return health; },
    get dead() { return dead; }, get speed() { return Math.hypot(vel.x, vel.z); },
    reset(x, z) {
      pos.set(x, 0, z);
      vel.set(0, 0, 0);
      vy = 0; health = PLAYER.health; dead = false; lastHurt = -99;
    },
    damage,
    update(dt, input, camYaw) {
      time += dt;
      if (dead) { mesh.rotation.x = -Math.PI / 2 * 0.9; return; }
      const ax = input.axis();
      const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
      const maxSpeed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      // Camera-relative move direction: W walks away from the camera.
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      let mx = ax.x * cos + ax.z * sin;
      let mz = -ax.x * sin + ax.z * cos;
      const len = Math.hypot(mx, mz);
      if (len > 0) { mx /= len; mz /= len; }
      vel.x += mx * PLAYER.accel * dt;
      vel.z += mz * PLAYER.accel * dt;
      const sp = Math.hypot(vel.x, vel.z);
      const cap = len > 0 ? maxSpeed : 0;
      if (sp > cap) {
        const f = Math.max(cap, sp - PLAYER.accel * 1.4 * dt) / sp;
        vel.x *= f; vel.z *= f;
      }
      if (len > 0.1) {
        const target = Math.atan2(vel.x, vel.z);
        let d = target - heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        heading += clamp(d, -9 * dt, 9 * dt);
      }
      pos.x += vel.x * dt;
      pos.z += vel.z * dt;
      const solved = world.resolveCircle(pos.x, pos.z, PLAYER.radius);
      pos.x = solved.x; pos.z = solved.z;
      pos.x = clamp(pos.x, -215, 300);
      pos.z = clamp(pos.z, -300, 300);
      // Jump + gravity (flat ground, y = 0).
      if (onGround && input.down('Space')) { vy = PLAYER.jumpSpeed; onGround = false; }
      vy -= PLAYER.gravity * dt;
      pos.y += vy * dt;
      if (pos.y <= 0) { pos.y = 0; vy = 0; onGround = true; }
      // Regen after a quiet stretch.
      if (time - lastHurt > PLAYER.regenDelay && health < PLAYER.health) {
        health = Math.min(PLAYER.health, health + PLAYER.regenRate * dt);
      }
      // Walk cycle.
      const moving = Math.hypot(vel.x, vel.z);
      walkPhase += moving * dt * 1.9;
      const swing = Math.min(1, moving / 4) * Math.sin(walkPhase) * 0.55;
      const u = mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
      mesh.position.copy(pos);
      mesh.rotation.y = heading;
      mesh.rotation.x = 0;
    },
  };
}
