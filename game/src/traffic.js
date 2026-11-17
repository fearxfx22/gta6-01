// Traffic: cars that drive the road graph like locals — pick a neighbouring
// intersection, follow the lane (right-hand side), brake for the car ahead,
// respawn near the player when they drift too far away.
import { stepCar } from './vehicles.js';
import { clamp } from './random.js';

const TRAFFIC_COUNT = 14;
const LANE = 3.2; // right-hand offset from the road centre line

export function createTraffic(scene, world, vehicles, rng) {
  const cars = [];
  const types = ['sedan', 'sedan', 'taxi', 'sedan', 'truck', 'sedan'];
  const colors = [0xc23b2e, 0x2e6fc2, 0xd8a02e, 0x3a9a4a, 0xdad8d2, 0x2a2d33, 0x4a7a8a];

  function spawnAt(nodeId) {
    const node = world.nodes[nodeId];
    const type = types[rng.int(0, types.length - 1)];
    const color = type === 'taxi' ? 0xe8c31a : colors[rng.int(0, colors.length - 1)];
    const car = vehicles.spawnCar(type, color, node.x, node.z, rng.range(0, Math.PI * 2), false);
    car.driver = 'traffic';
    const next = node.links[rng.int(0, node.links.length - 1)];
    car.ai = { node: nodeId, target: next, cruise: rng.range(8, 13), stuck: 0 };
    cars.push(car);
    return car;
  }

  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    spawnAt(rng.int(0, world.nodes.length - 1));
  }

  function pickNext(car) {
    const node = world.nodes[car.ai.target];
    const options = node.links.filter((l) => l !== car.ai.node);
    const next = options.length ? options[rng.int(0, options.length - 1)] : node.links[0];
    car.ai.node = car.ai.target;
    car.ai.target = next;
  }

  function carAhead(car) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let best = Infinity;
    for (const other of vehicles.cars) {
      if (other === car || other.parked) continue;
      const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 13 && side < 3) best = Math.min(best, along);
    }
    return best;
  }

  return {
    cars,
    update(dt, playerPos) {
      for (const car of cars) {
        const target = world.nodes[car.ai.target];
        // Lane offset: right-hand side of the direction of travel.
        const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        const dirX = dist > 0.01 ? dx / dist : 0, dirZ = dist > 0.01 ? dz / dist : 0;
        const rx = -dirZ, rz = dirX; // right of travel direction (x,z plane)
        const tx = target.x + rx * LANE, tz = target.z + rz * LANE;
        const tdx = tx - car.pos.x, tdz = tz - car.pos.z;
        const wantHeading = Math.atan2(tdx, tdz);
        let dh = wantHeading - car.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        const ahead = carAhead(car);
        let throttle = 0.85;
        if (ahead < 9) throttle = 0;
        if (dist < 12) throttle = Math.min(throttle, 0.35);
        if (dist < 3.5) pickNext(car);
        stepCar(car, dt, { throttle, steer: clamp(dh * 1.6, -1, 1), handbrake: false });
        // Stuck (wedged against something): pick a new route after a while.
        car.ai.stuck = Math.abs(car.speed) < 0.5 ? car.ai.stuck + dt : 0;
        if (car.ai.stuck > 5) { pickNext(car); car.ai.stuck = 0; }
        // Keep the action near the player: respawn far cars close by.
        const pd = Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z);
        if (pd > 190) {
          const near = world.nearestNode(playerPos.x, playerPos.z);
          const node = world.nodes[near];
          car.pos.set(node.x + rng.range(-6, 6), 0, node.z + rng.range(-6, 6));
          car.vel.set(0, 0, 0);
          car.speed = 0;
          car.ai.node = near;
          car.ai.target = node.links[rng.int(0, node.links.length - 1)];
        }
      }
    },
  };
}
