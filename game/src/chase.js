// Wanted level and the police who answer it. Police cars run a small FSM:
// patrol the grid, chase the player's position when the heat is on, ram the
// player's car, and arrest Rex on foot if they can hold him still.

import * as THREE from 'three';
import { rand, pick, clamp, angleLerp } from './seed.js';
import { ROAD_LINES } from './town.js';

export function buildChase(scene, rng, town, rides) {
  const police = [];
  let flashT = 0;

  function spawnPolice(x, z) {
    const car = rides.spawnCar(x, z, rand(rng, 0, Math.PI * 2), 0x1a2432, true);
    car.police = true;
    car.state = 'chase';
    car.arrestT = 0;
    car.retargetT = 0;
    car.tx = x;
    car.tz = z;
    police.push(car);
    return car;
  }

  function wantedCount(w) {
    return w <= 0 ? 0 : w === 1 ? 1 : w <= 3 ? 2 : 3;
  }

  const chase = {
    wanted: 0,
    quietT: 0,
    police,
    spawnPoliceAt(x, z) {
      return spawnPolice(x, z);
    },
    addWanted(n) {
      this.wanted = clamp(this.wanted + n, 0, 5);
      this.quietT = 0;
    },
    setWanted(n) {
      this.wanted = clamp(n, 0, 5);
      this.quietT = 0;
    },
    clearAll() {
      for (const c of police.slice()) rides.removeCar(c);
      police.length = 0;
      this.wanted = 0;
    },
    update(dt, hero, events) {
      // Keep the fleet at the size the wanted level demands.
      const need = wantedCount(this.wanted);
      while (police.length < need) {
        const node = pick(rng, ROAD_LINES);
        const node2 = pick(rng, ROAD_LINES);
        const px = hero.x + (rng() < 0.5 ? -1 : 1) * rand(rng, 40, 60);
        const pz = hero.z + (rng() < 0.5 ? -1 : 1) * rand(rng, 40, 60);
        spawnPolice(clamp(px, -112, 112), clamp(pz, -112, 112));
        void node;
        void node2;
      }
      while (police.length > need) {
        const c = police.pop();
        rides.removeCar(c);
      }

      // Quiet time decays the heat when nobody is watching.
      this.quietT += dt;
      if (this.wanted > 0 && this.quietT > 18) {
        let seen = false;
        for (const c of police) {
          const dx = c.x - hero.x;
          const dz = c.z - hero.z;
          if (dx * dx + dz * dz < 900) { seen = true; break; }
        }
        if (!seen) {
          this.wanted -= 1;
          this.quietT = 0;
          if (events) events.onHeatDrop(this.wanted);
        }
      }

      flashT += dt;
      const flash = Math.sin(flashT * 10) > 0;
      for (const c of police) {
        const bar = c.mesh.userData.lightBar;
        if (bar) {
          bar.red.material.emissiveIntensity = flash ? 2.4 : 0.2;
          bar.blue.material.emissiveIntensity = flash ? 0.2 : 2.4;
        }
        c.retargetT -= dt;
        if (c.retargetT <= 0) {
          c.retargetT = 0.4;
          c.tx = hero.x;
          c.tz = hero.z;
        }
        const dx = c.tx - c.x;
        const dz = c.tz - c.z;
        const d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        c.heading = angleLerp(c.heading, want, Math.min(1, 3.2 * dt));
        const targetSpeed = this.wanted > 0 ? 30 : 10;
        c.speed += clamp(targetSpeed - c.speed, -18 * dt, 12 * dt);
        c.x += Math.sin(c.heading) * c.speed * dt;
        c.z += Math.cos(c.heading) * c.speed * dt;
        const hit = town.collideCircle(c.x, c.z, 2.2);
        c.x = hit.x;
        c.z = hit.z;
        c.mesh.position.set(c.x, 0, c.z);
        c.mesh.rotation.y = c.heading;

        // Ram the player's car; arrest Rex on foot.
        const pdx = hero.x - c.x;
        const pdz = hero.z - c.z;
        const pd = Math.hypot(pdx, pdz);
        if (hero.inCar) {
          if (pd < 4.5) {
            hero.inCar.speed *= 0.94;
            if (events) events.onRam();
          }
          c.arrestT = 0;
        } else if (pd < 3.2) {
          c.arrestT += dt;
          if (c.arrestT > 1.2 && events) events.onBusted();
        } else {
          c.arrestT = 0;
        }
      }
    },
  };
  return chase;
}
