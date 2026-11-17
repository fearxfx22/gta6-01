// Pedestrians: locals strolling the sidewalks, who run when they hear a shot
// or see a car coming at them, and go down when a car clips them.
import { makePersonMesh } from './player.js';
import { clamp } from './random.js';

const PED_COUNT = 24;
const JACKETS = [0x3a6a9a, 0x9a3a5a, 0x4a8a5a, 0xc2a23a, 0x6a4a9a, 0xdad8d2, 0x2a2d33, 0x8a6a3a];
const PANTS = [0x2a3242, 0x3a2a22, 0x4a4a4a, 0x22303a];
const SKINS = [0xc98a5a, 0x8a5a3a, 0xe8b88a, 0x6a4530];

export function createPedestrians(scene, world, rng) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const spot = world.sidewalkPoint();
    const mesh = makePersonMesh(
      JACKETS[rng.int(0, JACKETS.length - 1)],
      PANTS[rng.int(0, PANTS.length - 1)],
      SKINS[rng.int(0, SKINS.length - 1)],
    );
    mesh.scale.setScalar(rng.range(0.92, 1.08));
    scene.add(mesh);
    const next = world.sidewalkPoint();
    peds.push({
      mesh, x: spot.x, z: spot.z,
      tx: next.x, tz: next.z,
      speed: rng.range(1.1, 1.7),
      heading: rng.range(0, Math.PI * 2),
      state: 'walk', // walk | flee | down
      timer: 0,
      phase: rng.range(0, Math.PI * 2),
      dead: false,
    });
  }

  function retarget(ped) {
    const next = world.sidewalkPoint();
    ped.tx = next.x; ped.tz = next.z;
  }

  return {
    peds,
    // threats: {playerX, playerZ, carSpeed, gunshot: {x, z} | null}
    update(dt, threats) {
      for (const ped of peds) {
        const u = ped.mesh.userData;
        if (ped.state === 'down') {
          ped.timer -= dt;
          if (ped.timer <= 0 && !ped.dead) {
            ped.state = 'flee';
            ped.timer = 2.5;
          } else if (ped.timer <= 0 && ped.dead) {
            // Gone for good: respawn far away as a fresh local.
            const spot = world.sidewalkPoint();
            ped.x = spot.x; ped.z = spot.z;
            ped.dead = false;
            ped.state = 'walk';
            ped.mesh.visible = true;
            ped.mesh.rotation.x = 0;
            retarget(ped);
          }
          continue;
        }
        // Fear: gunfire nearby, or a fast car bearing down.
        const dPlayer = Math.hypot(ped.x - threats.playerX, ped.z - threats.playerZ);
        const dShot = threats.gunshot ? Math.hypot(ped.x - threats.gunshot.x, ped.z - threats.gunshot.z) : Infinity;
        if (ped.state !== 'flee' && (dShot < 22 || (dPlayer < 9 && threats.carSpeed > 8))) {
          ped.state = 'flee';
          ped.timer = 2.5;
        }
        let speed = ped.speed;
        if (ped.state === 'flee') {
          ped.timer -= dt;
          speed = 4.2;
          // Run away from the player.
          const ax = ped.x - threats.playerX, az = ped.z - threats.playerZ;
          const al = Math.hypot(ax, az) || 1;
          ped.tx = ped.x + (ax / al) * 40;
          ped.tz = ped.z + (az / al) * 40;
          if (ped.timer <= 0) { ped.state = 'walk'; retarget(ped); }
        }
        const dx = ped.tx - ped.x, dz = ped.tz - ped.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2) {
          if (ped.state === 'walk') retarget(ped);
          else { ped.state = 'walk'; retarget(ped); }
        } else {
          const want = Math.atan2(dx, dz);
          let dh = want - ped.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          ped.heading += clamp(dh, -5 * dt, 5 * dt);
          ped.x += Math.sin(ped.heading) * speed * dt;
          ped.z += Math.cos(ped.heading) * speed * dt;
          const solved = world.resolveCircle(ped.x, ped.z, 0.5);
          ped.x = solved.x; ped.z = solved.z;
        }
        ped.phase += speed * dt * 2.4;
        const swing = Math.min(1, speed / 3) * Math.sin(ped.phase) * 0.5;
        u.legL.rotation.x = swing;
        u.legR.rotation.x = -swing;
        u.armL.rotation.x = -swing * 0.8;
        u.armR.rotation.x = swing * 0.8;
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = ped.heading;
      }
    },
    knockDown(ped, lethal) {
      if (ped.state === 'down') return;
      ped.state = 'down';
      ped.timer = lethal ? 6 : 3;
      ped.dead = !!lethal;
      ped.mesh.rotation.x = -Math.PI / 2 * 0.92;
      ped.mesh.position.y = 0.3;
    },
  };
}
