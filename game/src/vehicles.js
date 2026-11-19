// Cars for Solmar Bay: the car factory (body, cabin, wheels, lights from
// plain geometry), arcade drive physics, and the enter/exit rules. One car
// is the player's; the rest are traffic or parked. No model files — every
// car is built from boxes and cylinders.

import * as THREE from 'three';
import { clamp, lerp, wrapAngle, angleDelta } from './util.js';

const CAR_COLORS = [0xc23a2e, 0x2e6fb8, 0xe8a83a, 0x3a8a5a, 0xe8e8e8, 0x222226, 0x8a5ac8, 0xd8d0c0];

// A car is a group: body + cabin + 4 wheels + headlights + taillights.
// mesh.userData holds the driving state.
export function makeCar(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, metalness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.58, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.7 }),
  );
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.2 });
  for (const lx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), lightMat);
    h.position.set(lx, 0.68, 2.22);
    g.add(h);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc02020, emissive: 0x800808, emissiveIntensity: 0.9 });
  for (const lx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), tailMat);
    t.position.set(lx, 0.68, -2.22);
    g.add(t);
  }
  g.userData = {
    speed: 0,
    steer: 0,
    heading: opts.heading ?? 0,
    maxSpeed: opts.maxSpeed ?? 26,
    accel: opts.accel ?? 14,
    brake: 26,
    health: 100,
    isPlayer: false,
    isPolice: !!opts.police,
    kind: opts.police ? 'police' : 'civilian',
    wheels,
  };
  if (opts.police) {
    // Black-and-white police livery with a light bar.
    body.material = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.35, metalness: 0.4 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.42), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5 }));
    band.position.y = 0.62;
    g.add(band);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0x2040c8, emissive: 0x2040ff, emissiveIntensity: 1.4 }));
    bar.position.set(0, 1.56, -0.25);
    g.add(bar);
    g.userData.lightBar = bar;
    g.userData.maxSpeed = 30;
  }
  g.position.set(opts.x ?? 0, 0, opts.z ?? 0);
  g.rotation.y = g.userData.heading;
  return g;
}

// Arcade drive step: throttle in [-1, 1], steer in [-1, 1], dt seconds.
// The car turns more at low speed, grips at high speed, and eases to a
// stop without input. Returns the new speed.
export function driveCar(car, throttle, steerInput, dt) {
  const u = car.userData;
  const targetSteer = clamp(steerInput, -1, 1);
  u.steer = lerp(u.steer, targetSteer, 1 - Math.exp(-8 * dt));
  if (throttle > 0) {
    u.speed += u.accel * throttle * dt;
  } else if (throttle < 0) {
    // Reverse if nearly stopped, brake otherwise.
    if (u.speed > 0.5) u.speed += u.brake * throttle * dt;
    else u.speed += u.accel * 0.6 * throttle * dt;
  } else {
    // Rolling drag.
    u.speed -= Math.sign(u.speed) * Math.min(Math.abs(u.speed), 8 * dt);
  }
  u.speed = clamp(u.speed, -9, u.maxSpeed);
  // Steering authority falls off with speed so the car stays controllable.
  const steerAuthority = clamp(1 - Math.abs(u.speed) / (u.maxSpeed * 1.6), 0.35, 1);
  u.heading += u.steer * 1.9 * steerAuthority * (u.speed / u.maxSpeed) * dt * (u.speed >= 0 ? 1 : -1);
  const fx = Math.sin(u.heading);
  const fz = Math.cos(u.heading);
  car.position.x += fx * u.speed * dt;
  car.position.z += fz * u.speed * dt;
  car.rotation.y = u.heading;
  // Spin the wheels with the speed.
  for (const w of u.wheels) w.rotation.x += (u.speed / 0.36) * dt;
  return u.speed;
}

// Slow a car to a stop (used when the player exits or a police car gives up).
export function coastToStop(car, dt) {
  const u = car.userData;
  u.speed -= Math.sign(u.speed) * Math.min(Math.abs(u.speed), 14 * dt);
  const fx = Math.sin(u.heading);
  const fz = Math.cos(u.heading);
  car.position.x += fx * u.speed * dt;
  car.position.z += fz * u.speed * dt;
  for (const w of u.wheels) w.rotation.x += (u.speed / 0.36) * dt;
}

// Distance from a point to the nearest side of a car (for "press E" prompts).
export function carProximity(car, x, z) {
  const dx = car.position.x - x;
  const dz = car.position.z - z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Flash a police light bar between red and blue.
export function flashLightBar(car, time) {
  const bar = car.userData.lightBar;
  if (!bar) return;
  const on = Math.floor(time * 6) % 2 === 0;
  bar.material.color.setHex(on ? 0xc02020 : 0x2040c8);
  bar.material.emissive.setHex(on ? 0xff2020 : 0x2040ff);
}
