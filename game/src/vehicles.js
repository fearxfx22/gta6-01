// Cars: a box-built factory (sedan, sport, taxi, truck, police), one arcade
// physics step shared by the player, traffic and police, and enter/exit/steal.
import * as THREE from 'three';
import { CAR, WORLD } from './config.js';
import { clamp, lerp } from './random.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xd8a02e, 0x3a9a4a, 0x7a4a9a, 0xdad8d2, 0x2a2d33, 0x4a7a8a];

function box(w, h, d, color, x, y, z, rough = 0.35, metal = 0.55) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function makeCarMesh(type, color) {
  const g = new THREE.Group();
  const sport = type === 'sport';
  const truck = type === 'truck';
  const L = truck ? 5.6 : sport ? 4.4 : 4.2;
  const W = truck ? 2.4 : 2.0;
  const bodyH = truck ? 1.5 : 0.62;
  const body = box(L, bodyH, W, color, 0, 0.62, 0);
  g.add(body);
  if (truck) {
    g.add(box(1.4, 1.1, 2.1, 0x3a3f45, L / 2 - 0.4, 1.7, 0));
    g.add(box(3.4, 1.6, 2.2, 0x8a8578, -0.8, 1.5, 0, 0.8, 0.2));
  } else {
    g.add(box(L * 0.52, 0.55, W * 0.86, 0x1a222e, -L * 0.05, 1.18, 0, 0.15, 0.7));
  }
  // headlights + taillights (front is +x)
  const hl = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe27a, emissiveIntensity: 1.4 });
  const tl = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2a1a, emissiveIntensity: 1.1 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.42), hl);
    h.position.set(L / 2, 0.62, s * (W / 2 - 0.32));
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.42), tl);
    t.position.set(-L / 2, 0.62, s * (W / 2 - 0.32));
    g.add(t);
  }
  if (type === 'taxi') {
    g.add(box(0.7, 0.22, 0.5, 0xd8a02e, -0.1, 1.62, 0, 0.6, 0.1));
  }
  let lightBar = null;
  if (type === 'police') {
    lightBar = new THREE.Group();
    const bar = box(0.5, 0.16, 1.5, 0x1a1a1a, -0.1, 1.5, 0, 0.5, 0.3);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 2 }));
    red.position.set(-0.1, 1.62, -0.42);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x111188, emissive: 0x2255ff, emissiveIntensity: 2 }));
    blue.position.set(-0.1, 1.62, 0.42);
    lightBar.add(bar, red, blue);
    lightBar.userData = { red, blue };
    g.add(lightBar);
  }
  // wheels: each on its own pivot so it can spin (axle = local z) and steer (y)
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const wheels = [];
  const spots = [[L / 2 - 0.8, W / 2 - 0.05, true], [L / 2 - 0.8, -W / 2 + 0.05, true], [-L / 2 + 0.8, W / 2 - 0.05, false], [-L / 2 + 0.8, -W / 2 + 0.05, false]];
  for (const [wx, wz, front] of spots) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    g.add(pivot);
    wheels.push({ pivot, front });
  }
  g.userData = { wheels, lightBar, length: L, width: W };
  return g;
}

// One arcade step: throttle -1..1, steer -1..1, handbrake bool. Forward is +x
// of the car's local frame; heading 0 faces +x... we store heading as atan2(z, x)
// style? No: heading is rotation.y, forward = (sin(heading), cos(heading)) in
// (x, z) — three.js yaw convention. The mesh is built facing +x, so the group
// gets an extra -PI/2 yaw offset baked in at creation (see spawnCar).
export function stepCar(car, dt, control) {
  const maxSpeed = car.type === 'sport' ? CAR.maxSport : CAR.maxSpeed;
  const onSand = car.pos.x > WORLD.beachX;
  const cap = onSand ? maxSpeed * 0.55 : maxSpeed;
  if (control.throttle > 0) car.speed += CAR.accel * control.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  else if (control.throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed += CAR.reverseAccel * control.throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  }
  if (control.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 16 * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, cap);
  const steerTarget = control.steer * CAR.steerMax * (car.speed >= 0 ? 1 : -1);
  car.steer = lerp(car.steer, steerTarget, Math.min(1, CAR.steerSpeed * dt * 2));
  const grip = control.handbrake ? CAR.driftGrip : CAR.grip;
  const yawRate = (car.speed / 2.9) * Math.tan(car.steer) * clamp(Math.abs(car.speed) / 6, 0.25, 1);
  car.heading += yawRate * dt;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  // Velocity follows heading with a grip lag (drift when handbraking).
  const vx = car.vel.x, vz = car.vel.z;
  const fwdSpeed = vx * fx + vz * fz;
  const rx = vx - fwdSpeed * fx, rz = vz - fwdSpeed * fz;
  const k = Math.min(1, grip * dt);
  car.vel.x = fwdSpeed * fx + rx * (1 - k);
  car.vel.z = fwdSpeed * fz + rz * (1 - k);
  // Blend toward the target speed along the heading.
  const targetVx = fx * car.speed, targetVz = fz * car.speed;
  car.vel.x = lerp(car.vel.x, targetVx, Math.min(1, 6 * dt));
  car.vel.z = lerp(car.vel.z, targetVz, Math.min(1, 6 * dt));
  car.pos.x += car.vel.x * dt;
  car.pos.z += car.vel.z * dt;
  car.pos.x = clamp(car.pos.x, -215, 310);
  car.pos.z = clamp(car.pos.z, -300, 300);
}

export function createVehicles(scene, world, rng) {
  const cars = [];
  const parked = [];
  function spawnCar(type, color, x, z, heading, parkedFlag) {
    const mesh = makeCarMesh(type, color);
    // Mesh faces +x; rotation.y = heading - PI/2 maps yaw-heading to +x forward.
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading - Math.PI / 2;
    scene.add(mesh);
    const car = {
      mesh, type, color, parked: parkedFlag,
      pos: new THREE.Vector3(x, 0, z),
      vel: new THREE.Vector3(),
      heading, speed: 0, steer: 0,
      driver: null, // 'player' | 'traffic' | 'police' | null
      ai: null,
      flashing: 0,
    };
    cars.push(car);
    return car;
  }
  // Parked cars from the city's spots; the orange sport by the garage is Rex's own.
  const types = ['sedan', 'sedan', 'sport', 'taxi', 'sedan', 'truck', 'sedan', 'sport'];
  world.parkedSpots.forEach((s, i) => {
    const type = types[i % types.length];
    const color = type === 'sport' && i === 2 ? 0xe86a1a : CAR_COLORS[i % CAR_COLORS.length];
    const car = spawnCar(type, color, s.x, s.z, s.heading, true);
    parked.push(car);
  });
  // Rex's own orange sport coupe, parked by Vera's garage.
  const own = spawnCar('sport', 0xe86a1a, -132, 128, Math.PI / 2, true);
  parked.push(own);

  function syncMesh(car, dt) {
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading - Math.PI / 2;
    for (const w of car.mesh.userData.wheels) {
      w.pivot.rotation.z -= (car.speed / 0.36) * dt;
      w.pivot.rotation.y = w.front ? car.steer * 0.4 : 0;
    }
    if (car.mesh.userData.lightBar) {
      car.flashing += dt;
      const on = Math.floor(car.flashing * 6) % 2 === 0;
      car.mesh.userData.lightBar.userData.red.material.emissiveIntensity = on ? 3 : 0.2;
      car.mesh.userData.lightBar.userData.blue.material.emissiveIntensity = on ? 0.2 : 3;
    }
  }

  return {
    cars, parked,
    spawnCar,
    nearestCar(x, z, maxDist) {
      let best = null, bd = maxDist;
      for (const c of cars) {
        const d = Math.hypot(c.pos.x - x, c.pos.z - z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    update(dt, world, onCollide) {
      // Car-car shoving (circle vs circle).
      for (let i = 0; i < cars.length; i += 1) {
        for (let j = i + 1; j < cars.length; j += 1) {
          const a = cars[i], b = cars[j];
          if (a.parked && b.parked) continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const d = Math.hypot(dx, dz);
          const min = CAR.radius * 1.7;
          if (d > 0.01 && d < min) {
            const push = (min - d) / 2;
            const nx = dx / d, nz = dz / d;
            if (!a.parked) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
            if (!b.parked) { b.pos.x += nx * push; b.pos.z += nz * push; }
            const rel = Math.abs(a.speed - b.speed);
            if (rel > 4 && onCollide) onCollide(a, b, rel);
            a.speed *= 0.92; b.speed *= 0.92;
          }
        }
      }
      for (const car of cars) {
        const solved = world.resolveCircle(car.pos.x, car.pos.z, CAR.radius);
        if (solved.hit && Math.abs(car.speed) > 5 && onCollide) onCollide(car, null, Math.abs(car.speed));
        if (solved.hit) car.speed *= 0.45;
        car.pos.x = solved.x; car.pos.z = solved.z;
        syncMesh(car, dt);
      }
    },
  };
}
