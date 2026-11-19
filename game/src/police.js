// The wanted system for Solmar Bay: a 0-5 star level, police cars that
// spawn at the city edge and chase (game-ai FSM: patrol -> chase -> ram),
// and the bust/escape rules. Wanted rises with crimes (stealing a car,
// shooting, killing crew) and drains when no police unit can see the player
// for a while — that drain is what the Hot Pursuit mission is built on.

import * as THREE from 'three';
import { makeCar, driveCar, coastToStop, flashLightBar } from './vehicles.js';
import { clamp, lerp, angleDelta, dist2D, smoothFactor, WORLD, roadCoord } from './util.js';

export const WANTED_MAX = 5;

// How many police cars hunt at each wanted level.
const UNITS_AT_LEVEL = [0, 1, 2, 3, 4, 5];

export function makeWanted() {
  return {
    level: 0,
    heat: 0, // 0..100 inside the current level; 100 pushes a level up
    unseenTimer: 0, // seconds since any unit saw the player
    busted: 0, // 0..1 arrest progress while a unit is close and the player is slow
  };
}

export function addHeat(wanted, amount) {
  wanted.heat += amount;
  while (wanted.heat >= 100 && wanted.level < WANTED_MAX) {
    wanted.heat -= 100;
    wanted.level += 1;
  }
  wanted.heat = clamp(wanted.heat, 0, 100);
}

export function setWanted(wanted, level) {
  wanted.level = clamp(level, 0, WANTED_MAX);
  wanted.heat = 0;
  wanted.unseenTimer = 0;
}

// Spawn a police unit at a road edge away from the player.
function spawnUnit(scene, rng, playerPos) {
  const edge = Math.floor(rng() * 4);
  let x, z;
  if (edge === 0) { x = playerPos.x + (rng() < 0.5 ? -70 : 70); z = playerPos.z - 60; }
  else if (edge === 1) { x = playerPos.x + (rng() < 0.5 ? -70 : 70); z = playerPos.z + 60; }
  else if (edge === 2) { x = playerPos.x - 60; z = playerPos.z + (rng() < 0.5 ? -70 : 70); }
  else { x = playerPos.x + 60; z = playerPos.z + (rng() < 0.5 ? -70 : 70); }
  x = clamp(x, -WORLD.halfCity, WORLD.halfCity);
  z = clamp(z, -WORLD.halfCity, WORLD.halfCity);
  const car = makeCar(0xe8e8e8, { x, z, police: true, maxSpeed: 27 + Math.random() * 4 });
  scene.add(car);
  return { mesh: car, state: 'chase', repath: 0, stuck: 0, lastX: x, lastZ: z };
}

export function makePolice(scene) {
  return { units: [], scene, spawnTimer: 0 };
}

// Keep the number of units matched to the wanted level, spawning at the
// edges and removing them when the heat dies down.
export function updatePolice(police, wanted, playerPos, playerSpeed, playerInCar, colliders, dt, time, rng) {
  const want = UNITS_AT_LEVEL[wanted.level];
  // Spawn up to the wanted count, one at a time.
  police.spawnTimer -= dt;
  if (police.units.length < want && police.spawnTimer <= 0) {
    police.units.push(spawnUnit(police.scene, rng, playerPos));
    police.spawnTimer = 2.5;
  }
  // Remove extra units once the wanted level falls.
  while (police.units.length > want) {
    const u = police.units.pop();
    police.scene.remove(u.mesh);
  }

  let anySeen = false;
  for (const u of police.units) {
    const m = u.mesh;
    const d = dist2D(m.position.x, m.position.z, playerPos.x, playerPos.z);
    const seen = d < 90;
    if (seen) anySeen = true;
    // Chase: steer toward the player, full throttle, ram at close range.
    const wantHeading = Math.atan2(playerPos.x - m.position.x, playerPos.z - m.position.z);
    const steer = clamp(angleDelta(m.userData.heading, wantHeading) * 1.8, -1, 1);
    let throttle = 1;
    if (d < 6) throttle = 1; // ram
    else if (d > 120) throttle = 1;
    driveCar(m, throttle, steer, dt);
    // Nudge out of buildings.
    const [nx, nz] = pushOutOfBuildings(m.position.x, m.position.z, colliders);
    m.position.x = nx;
    m.position.z = nz;
    flashLightBar(m, time);
    // Stuck detection: if the car barely moved for 2s, teleport it to a
    // nearby road so the chase never stalls behind a building.
    const moved = dist2D(m.position.x, m.position.z, u.lastX, u.lastZ);
    if (moved < 0.4) u.stuck += dt; else u.stuck = 0;
    u.lastX = m.position.x;
    u.lastZ = m.position.z;
    if (u.stuck > 2.5) {
      m.position.x = clamp(playerPos.x + (rng() < 0.5 ? -55 : 55), -WORLD.halfCity, WORLD.halfCity);
      m.position.z = clamp(playerPos.z - 45, -WORLD.halfCity, WORLD.halfCity);
      m.userData.speed = 0;
      u.stuck = 0;
    }
    // Damage the player on a hard ram.
    if (d < 3.4 && Math.abs(m.userData.speed) > 6) {
      u.ramCooldown = (u.ramCooldown ?? 0) - dt;
      if (u.ramCooldown <= 0) {
        u.ramCooldown = 1.2;
        u.ramHit = true;
      }
    }
  }

  // Wanted drains while nobody sees the player; the bust meter fills while
  // a unit sits on top of a slow player.
  if (wanted.level > 0) {
    if (anySeen) {
      wanted.unseenTimer = 0;
    } else {
      wanted.unseenTimer += dt;
      if (wanted.unseenTimer > 6) {
        wanted.heat -= dt * 7;
        if (wanted.heat <= 0) {
          wanted.level -= 1;
          wanted.heat = wanted.level > 0 ? 60 : 0;
          wanted.unseenTimer = 0;
        }
      }
    }
    let closest = Infinity;
    for (const u of police.units) {
      closest = Math.min(closest, dist2D(u.mesh.position.x, u.mesh.position.z, playerPos.x, playerPos.z));
    }
    const slow = playerInCar ? Math.abs(playerSpeed) < 4 : Math.abs(playerSpeed) < 2;
    if (closest < 5 && slow) wanted.busted = clamp(wanted.busted + dt * 0.35, 0, 1);
    else wanted.busted = clamp(wanted.busted - dt * 0.5, 0, 1);
  }
  return { anySeen };
}

// Push a point out of building AABBs (police cars have no full collision).
function pushOutOfBuildings(x, z, colliders) {
  for (const b of colliders) {
    if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) {
      const dxl = x - (b.minX - 1);
      const dxr = (b.maxX + 1) - x;
      const dzl = z - (b.minZ - 1);
      const dzr = (b.maxZ + 1) - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = b.minX - 1;
      else if (m === dxr) x = b.maxX + 1;
      else if (m === dzl) z = b.minZ - 1;
      else z = b.maxZ + 1;
    }
  }
  return [x, z];
}

export function clearPolice(police) {
  for (const u of police.units) police.scene.remove(u.mesh);
  police.units = [];
}
