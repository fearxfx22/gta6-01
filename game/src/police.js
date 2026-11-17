// The Solmar Bay police: cruisers that spawn on the road graph and chase the
// player (ramming when he drives), foot cops who close in to arrest him, and
// the wanted level that cools down when nobody can see him.
import * as THREE from 'three';
import { POLICE, WANTED } from './config.js';
import { makePersonMesh } from './player.js';
import { stepCar } from './vehicles.js';
import { angleDiff, clamp } from './random.js';

export function createPolice(scene, world, vehicles, rng) {
  const cruisers = []; // {car}
  const cops = [];     // {mesh, x, z, heading, bustTimer}
  let quietTime = 0;
  let ramCooldown = 0;
  let nearestDist = Infinity;

  function spawnCruiser(playerPos) {
    // Pick a road node 70-110 m away, on the graph.
    let nodeId = -1, tries = 0;
    while (tries < 12) {
      const cand = rng.int(0, world.nodes.length - 1);
      const n = world.nodes[cand];
      const d = Math.hypot(n.x - playerPos.x, n.z - playerPos.z);
      if (d > POLICE.spawnDist && d < 130) { nodeId = cand; break; }
      tries += 1;
    }
    if (nodeId < 0) nodeId = world.nearestNode(playerPos.x, playerPos.z);
    const node = world.nodes[nodeId];
    const car = vehicles.spawnCar('police', 0xe8e8e8, node.x, node.z, rng.range(0, Math.PI * 2), false);
    car.driver = 'police';
    cruisers.push({ car });
    return car;
  }

  function spawnCop(playerPos) {
    const mesh = makePersonMesh(0x1a2a4a, 0x1a1a22, 0xc98a5a);
    const a = rng.range(0, Math.PI * 2);
    const x = playerPos.x + Math.cos(a) * rng.range(14, 24);
    const z = playerPos.z + Math.sin(a) * rng.range(14, 24);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cop = { mesh, x, z, heading: 0, bustTimer: 0, phase: 0, kind: 'cop' };
    mesh.traverse((o) => { o.userData.shootable = cop; });
    cops.push(cop);
  }

  function removeCruiser(i) {
    const c = cruisers[i];
    scene.remove(c.car.mesh);
    const idx = vehicles.cars.indexOf(c.car);
    if (idx >= 0) vehicles.cars.splice(idx, 1);
    cruisers.splice(i, 1);
  }

  function removeCop(i) {
    scene.remove(cops[i].mesh);
    cops.splice(i, 1);
  }

  return {
    cruisers, cops,
    get nearestDist() { return nearestDist; },
    clear() {
      while (cruisers.length) removeCruiser(0);
      while (cops.length) removeCop(0);
      nearestDist = Infinity;
      quietTime = 0;
    },
    killCop(cop) {
      const i = cops.indexOf(cop);
      if (i >= 0) removeCop(i);
    },
    update(dt, G) {
      const player = G.player;
      const wanted = G.wanted;
      const px = player.pos.x, pz = player.pos.z;
      ramCooldown = Math.max(0, ramCooldown - dt);

      // Nearest police distance drives the wanted cooldown.
      nearestDist = Infinity;
      for (const c of cruisers) nearestDist = Math.min(nearestDist, Math.hypot(c.car.pos.x - px, c.car.pos.z - pz));
      for (const c of cops) nearestDist = Math.min(nearestDist, Math.hypot(c.x - px, c.z - pz));

      // Wanted cools down when the heat cannot see the player.
      if (wanted > 0) {
        if (nearestDist > 55) {
          quietTime += dt;
          if (quietTime > WANTED.decaySeconds) { G.setWanted(wanted - 1); quietTime = 0; }
        } else quietTime = 0;
      } else quietTime = 0;

      // Spawn to the wanted level; stand down when it clears. The heat
      // scales: two cruisers per star, up to the configured maximum.
      const wantCars = wanted === 0 ? 0 : Math.min(wanted * 2, POLICE.maxCars);
      while (cruisers.length < wantCars) spawnCruiser(player.pos);
      // Stand down from the end, but never impound the cruiser the player
      // is driving — that would leave them in an invisible car.
      while (cruisers.length > wantCars) {
        let idx = cruisers.length - 1;
        while (idx >= 0 && cruisers[idx].car.driver === 'player') idx -= 1;
        if (idx < 0) break;
        removeCruiser(idx);
      }
      const wantCops = wanted >= 2 ? Math.min(wanted, 4) : 0;
      while (cops.length < wantCops) spawnCop(player.pos);
      while (cops.length > wantCops) removeCop(cops.length - 1);

      // Cruiser chase: aim ahead of the player's motion, ram to stop him.
      for (const { car } of cruisers) {
        // The player stole this cruiser: it is theirs now, not a chaser.
        if (car.driver === 'player') continue;
        const target = G.driving ? G.driving : player;
        const ahead = G.driving ? 1.1 : 0;
        const tx = target.pos.x + Math.sin(target.heading || 0) * (target.speed || 0) * ahead;
        const tz = target.pos.z + Math.cos(target.heading || 0) * (target.speed || 0) * ahead;
        const dx = tx - car.pos.x, dz = tz - car.pos.z;
        const wantHeading = Math.atan2(dx, dz);
        const dh = angleDiff(car.heading, wantHeading);
        const dist = Math.hypot(dx, dz);
        const throttle = dist < 6 ? 0.4 : 1;
        stepCar(car, dt, { throttle, steer: clamp(dh * 1.8, -1, 1), handbrake: false });
        // Ram: a hard hit on the player's car hurts and shakes the camera.
        if (G.driving && dist < 4.5 && ramCooldown <= 0) {
          const rel = Math.abs(car.speed - G.driving.speed);
          if (rel > 4) {
            player.damage(POLICE.ramDamage, G.time);
            G.rig.addShake(0.5);
            G.audio.crash();
            G.effects.sparks((car.pos.x + G.driving.pos.x) / 2, 1, (car.pos.z + G.driving.pos.z) / 2);
            ramCooldown = 1;
          }
        }
        // Give up the chase beyond the despawn ring.
        if (dist > POLICE.despawnDist) {
          const node = world.nodes[world.nearestNode(px, pz)];
          car.pos.set(node.x, 0, node.z);
          car.vel.set(0, 0, 0);
          car.speed = 0;
        }
      }

      // Foot cops: run the player down, then hold him for the arrest.
      for (let i = cops.length - 1; i >= 0; i -= 1) {
        const cop = cops[i];
        const dx = px - cop.x, dz = pz - cop.z;
        const dist = Math.hypot(dx, dz);
        if (dist > POLICE.despawnDist) { removeCop(i); continue; }
        const speed = G.driving ? 5.5 : 5.8;
        if (dist > POLICE.bustDist) {
          cop.bustTimer = 0;
          cop.heading = Math.atan2(dx, dz);
          cop.x += Math.sin(cop.heading) * speed * dt;
          cop.z += Math.cos(cop.heading) * speed * dt;
          const solved = world.resolveCircle(cop.x, cop.z, 0.5);
          cop.x = solved.x; cop.z = solved.z;
        } else if (!G.driving) {
          // Close enough, on foot: the arrest timer runs.
          cop.bustTimer += dt;
          if (cop.bustTimer > POLICE.bustTime) { G.onBusted(); return; }
        }
        cop.phase += speed * dt * 2.2;
        const swing = Math.sin(cop.phase) * 0.5;
        const u = cop.mesh.userData;
        u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
        u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.y = cop.heading;
      }
    },
  };
}
