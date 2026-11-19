// Vehicles: the car factory, the traffic flow on the road grid, and the
// parked cars Rex can steal. Traffic cars follow the intersection graph;
// the car Rex drives uses arcade physics instead.

import * as THREE from 'three';
import { rand, randInt, pick, clamp, angleLerp, dist2 } from './seed.js';
import { ROAD_LINES, HALF } from './town.js';

const PAINT = [0xc94f3d, 0x3d6f9e, 0xe0b45a, 0x5a8a5a, 0x8a8f96, 0xd8d2c4, 0x6a4a7a, 0x2a2f3a];

export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2432, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0.9 });
  for (const hx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    h.position.set(hx, 0.6, 2.22);
    g.add(h);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc22a2a, emissive: 0x8a1010, emissiveIntensity: 0.8 });
  for (const tx of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    t.position.set(tx, 0.6, -2.22);
    g.add(t);
  }
  if (police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4 }),
    );
    bar.position.set(0, 1.5, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }),
    );
    red.position.set(-0.32, 1.62, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 2 }),
    );
    blue.position.set(0.32, 1.62, -0.2);
    g.add(blue);
    g.userData.lightBar = { red, blue };
  }
  g.userData.wheels = wheels;
  return g;
}

function newCar(scene, x, z, heading, color, police = false) {
  const mesh = makeCarMesh(color, police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, x, z, heading, speed: 0, police,
    steer: 0, parked: false, driven: false, target: null, cameFrom: null,
  };
}

// Nearest intersection node to (x, z).
function nearestNode(x, z) {
  let bx = ROAD_LINES[0];
  let bz = ROAD_LINES[0];
  for (const c of ROAD_LINES) {
    if (Math.abs(c - x) < Math.abs(bx - x)) bx = c;
    if (Math.abs(c - z) < Math.abs(bz - z)) bz = c;
  }
  return { x: bx, z: bz };
}

export function buildRides(scene, rng, town) {
  const cars = [];
  const parked = [];

  // Parked cars Rex can steal, lined along roads near the start and the Strip.
  const parkSpots = [
    [-80, 40, 0], [-80, 56, 0], [16, -40, Math.PI / 2], [48, 8, 0],
    [-48, -16, Math.PI / 2], [80, 48, 0], [-16, 80, Math.PI / 2], [32, -80, 0],
  ];
  for (const [x, z, h] of parkSpots) {
    const c = newCar(scene, x, z, h, pick(rng, PAINT));
    c.parked = true;
    cars.push(c);
    parked.push(c);
  }

  // Moving traffic on the grid.
  for (let i = 0; i < 12; i++) {
    const node = pick(rng, ROAD_LINES);
    const node2 = pick(rng, ROAD_LINES);
    const c = newCar(scene, node, node2, rand(rng, 0, Math.PI * 2), pick(rng, PAINT));
    c.speed = rand(rng, 8, 11);
    c.target = nearestNode(c.x + rand(rng, -30, 30), c.z + rand(rng, -30, 30));
    c.cameFrom = nearestNode(c.x, c.z);
    cars.push(c);
  }

  function driveTraffic(car, dt) {
    if (!car.target) return;
    const dx = car.target.x - car.x;
    const dz = car.target.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5) {
      // Arrived at an intersection: pick a neighbouring node, not back the way we came.
      const cur = nearestNode(car.x, car.z);
      const options = [];
      for (const c of ROAD_LINES) {
        if (c !== cur.x) options.push({ x: c, z: cur.z });
        if (c !== cur.z) options.push({ x: cur.x, z: c });
      }
      const next = pick(rng, options.filter((o) => !(o.x === car.cameFrom.x && o.z === car.cameFrom.z)));
      car.cameFrom = cur;
      car.target = next || { x: cur.x, z: cur.z };
      return;
    }
    const want = Math.atan2(dx, dz);
    car.heading = angleLerp(car.heading, want, Math.min(1, 4 * dt));
    // Slow down if another car is close ahead.
    let blocked = false;
    for (const o of cars) {
      if (o === car || o.parked) continue;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const ox = o.x - car.x;
      const oz = o.z - car.z;
      const ahead = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
    }
    const targetSpeed = blocked ? 0 : randInt(rng, 8, 11) + 0; // keep cruise speed
    car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const hit = town.collideCircle(car.x, car.z, 2.2);
    car.x = hit.x;
    car.z = hit.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }

  // Arcade driving for the car Rex is in.
  function drivePlayer(car, input, dt) {
    const throttle = (input.forward ? 1 : 0) - (input.back ? 0.75 : 0);
    const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const maxSpeed = 27;
    if (throttle > 0) car.speed += 15 * dt;
    else if (throttle < 0) car.speed += (car.speed > 0.5 ? -26 : -8) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
    car.speed = clamp(car.speed, -8, maxSpeed);
    const steerMax = 0.55 * clamp(1 - Math.abs(car.speed) / 34, 0.35, 1);
    car.steer += clamp(steerIn * steerMax - car.steer, -3.2 * dt, 3.2 * dt);
    if (Math.abs(car.speed) > 0.2) {
      car.heading += car.steer * (car.speed / 7) * dt * (car.speed < 0 ? -1 : 1);
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const hit = town.collideCircle(car.x, car.z, 2.2);
    const hitSomething = Math.abs(hit.x - car.x) > 0.01 || Math.abs(hit.z - car.z) > 0.01;
    car.x = hit.x;
    car.z = hit.z;
    if (hitSomething) car.speed *= 0.55;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // Wheels spin with speed, front wheels yaw with steering.
    const spin = car.speed * dt * 2.4;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }

  return {
    cars,
    parked,
    spawnCar(x, z, heading, color, police = false) {
      const c = newCar(scene, x, z, heading, color, police);
      cars.push(c);
      return c;
    },
    removeCar(car) {
      scene.remove(car.mesh);
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
    },
    nearestParked(x, z, maxDist) {
      let best = null;
      let bestD = maxDist * maxDist;
      for (const c of parked) {
        if (c.driven) continue;
        const d = dist2(x, z, c.x, c.z);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    },
    update(dt, playerCar) {
      for (const c of cars) {
        if (c.parked || c === playerCar || c.police) continue;
        driveTraffic(c, dt);
      }
      // Gentle separation between cars that overlap.
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i];
          const b = cars[j];
          if (a.parked && b.parked) continue;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 12.25 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (3.5 - d) / 2;
            const nx = dx / d;
            const nz = dz / d;
            if (!a.parked) { a.x -= nx * push; a.z -= nz * push; }
            if (!b.parked) { b.x += nx * push; b.z += nz * push; }
          }
        }
      }
    },
    drivePlayer,
  };
}
