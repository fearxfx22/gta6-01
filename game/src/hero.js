// Rex, the player: on-foot movement relative to the camera, and getting in
// and out of cars. Stealing a parked car in front of a witness is a crime —
// the engine decides the wanted level from what this module reports.

import * as THREE from 'three';
import { clamp } from './seed.js';

function makeHeroMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99a6b, roughness: 0.9 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.95 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), jacket);
  torso.position.y = 1.08;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  g.add(head);
  // Flat cap.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.26, 0.09, 10),
    new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.9 }),
  );
  cap.position.y = 1.84;
  g.add(cap);
  for (const lx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), jeans);
    leg.position.set(lx, 0.36, 0);
    g.add(leg);
  }
  return g;
}

export function buildHero(scene, start) {
  const mesh = makeHeroMesh();
  mesh.position.set(start.x, 0, start.z);
  scene.add(mesh);
  const hero = {
    mesh, x: start.x, z: start.z, heading: 0,
    inCar: null, walkPhase: 0, speedNow: 0,
    // Where the camera should look: the hero, or the car when driving.
    focus() {
      return this.inCar ? { x: this.inCar.x, z: this.inCar.z } : { x: this.x, z: this.z };
    },
    update(dt, input, camYaw, town, rides, events) {
      if (this.inCar) {
        rides.drivePlayer(this.inCar, input, dt);
        this.x = this.inCar.x;
        this.z = this.inCar.z;
        this.heading = this.inCar.heading;
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const len = Math.hypot(fwd, strafe) || 1;
      const speed = input.sprint ? 9.5 : 6;
      // Camera-relative movement: forward is away from the camera (the view
      // direction is (-sin yaw, -cos yaw)), right is (cos yaw, -sin yaw).
      const mx = (-Math.sin(camYaw) * fwd + Math.cos(camYaw) * strafe) / len;
      const mz = (-Math.cos(camYaw) * fwd - Math.sin(camYaw) * strafe) / len;
      const moving = fwd !== 0 || strafe !== 0;
      this.speedNow = moving ? speed : 0;
      if (moving) {
        this.x += mx * speed * dt;
        this.z += mz * speed * dt;
        this.heading = Math.atan2(mx, mz);
        this.walkPhase += dt * 9;
      }
      const hit = town.collideCircle(this.x, this.z, 0.6);
      this.x = hit.x;
      this.z = hit.z;
      mesh.position.set(this.x, moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0, this.z);
      mesh.rotation.y = this.heading;
      if (input.interact) {
        const car = rides.nearestParked(this.x, this.z, 4);
        if (car) this.enterCar(car, events);
      }
    },
    enterCar(car, events) {
      car.driven = true;
      car.parked = false;
      car.speed = 0;
      this.inCar = car;
      this.x = car.x;
      this.z = car.z;
      if (events) events.onSteal(car);
    },
    exitCar() {
      if (!this.inCar) return;
      const car = this.inCar;
      car.driven = false;
      car.parked = true;
      car.speed = 0;
      // Step out on the driver's side.
      const sx = Math.cos(car.heading);
      const sz = -Math.sin(car.heading);
      this.x = car.x + sx * 2.6;
      this.z = car.z + sz * 2.6;
      this.inCar = null;
      mesh.visible = true;
    },
    teleport(x, z) {
      if (this.inCar) this.exitCar();
      this.x = x;
      this.z = z;
      mesh.position.set(x, 0, z);
    },
  };
  return hero;
}
