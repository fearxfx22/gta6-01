// Hitscan pistol and the armed crew who shoot back. One ray from the camera
// decides a shot: the first thing it meets takes it. Crew are simple FSM
// shooters — hold a post, fire at Rex when he is close, fall when their
// health runs out. Fire on mousedown, immediately, so a slow frame never
// eats the first shot.

import * as THREE from 'three';
import { rand, randInt, pick, clamp } from './seed.js';

const CREW_COLORS = [0x7a2a3a, 0x2a4a7a, 0x5a3a7a, 0x8a6a2a];

function makeCrewMesh(color) {
  const g = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), vest);
  torso.position.y = 1.08;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.12, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.5, metalness: 0.6 }),
  );
  gun.position.set(0.3, 1.15, 0.35);
  g.add(gun);
  for (const lx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.68, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.95 }),
    );
    leg.position.set(lx, 0.36, 0);
    g.add(leg);
  }
  return g;
}

export function buildGunplay(scene, camera, rng) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const crew = [];
  const tracers = [];
  const impacts = [];
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true });
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });

  const gun = {
    ammo: 12,
    magSize: 12,
    reloading: false,
    reloadT: 0,
    fireCooldown: 0,
    crew,
    spawnCrew(x, z, rng) {
      const mesh = makeCrewMesh(pick(rng, CREW_COLORS));
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      const c = {
        mesh, x, z, hp: 100, alive: true,
        shootT: rand(rng, 0.8, 2), heading: rand(rng, 0, Math.PI * 2),
      };
      crew.push(c);
      return c;
    },
    clearCrew() {
      for (const c of crew) scene.remove(c.mesh);
      crew.length = 0;
    },
    // origin: Vector3 muzzle, dir: normalized Vector3. Returns the crew hit, if any.
    fire(origin, dir, onHit) {
      if (this.reloading || this.fireCooldown > 0) return null;
      if (this.ammo <= 0) {
        this.startReload();
        return null;
      }
      this.ammo -= 1;
      this.fireCooldown = 0.22;
      raycaster.set(origin, dir);
      // Crew meshes first: if a crew member is the nearest hit, he takes it.
      const crewMeshes = crew.filter((c) => c.alive).map((c) => c.mesh);
      const crewHits = raycaster.intersectObjects(crewMeshes, true);
      const allHits = raycaster.intersectObjects(scene.children, true);
      let hitPoint = null;
      let hitCrew = null;
      if (crewHits.length > 0 && (!allHits.length || crewHits[0].distance <= allHits[0].distance + 0.01)) {
        hitPoint = crewHits[0].point;
        let obj = crewHits[0].object;
        while (obj && !crew.some((c) => c.mesh === obj)) obj = obj.parent;
        hitCrew = crew.find((c) => c.mesh === obj) || null;
      } else if (allHits.length > 0) {
        hitPoint = allHits[0].point;
      } else {
        hitPoint = origin.clone().add(dir.clone().multiplyScalar(80));
      }
      // Tracer line from the muzzle to the hit.
      const geo = new THREE.BufferGeometry().setFromPoints([origin, hitPoint]);
      const line = new THREE.Line(geo, tracerMat.clone());
      line.material.opacity = 0.9;
      scene.add(line);
      tracers.push({ line, life: 0.09 });
      // Impact flash.
      const imp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), flashMat.clone());
      imp.position.copy(hitPoint);
      scene.add(imp);
      impacts.push({ mesh: imp, life: 0.12 });
      if (hitCrew) {
        const dist = origin.distanceTo(hitPoint);
        const dmg = Math.round(34 * (dist > 40 ? 0.6 : 1));
        hitCrew.hp -= dmg;
        if (onHit) onHit(hitCrew, dmg);
        if (hitCrew.hp <= 0) {
          hitCrew.alive = false;
          hitCrew.mesh.rotation.x = -Math.PI / 2;
          hitCrew.mesh.position.y = 0.3;
        }
      }
      return hitCrew;
    },
    startReload() {
      if (this.reloading || this.ammo === this.magSize) return;
      this.reloading = true;
      this.reloadT = 1.4;
    },
    update(dt, heroPos, events) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          this.reloading = false;
          this.ammo = this.magSize;
        }
      }
      for (const t of tracers.slice()) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) {
          scene.remove(t.line);
          tracers.splice(tracers.indexOf(t), 1);
        }
      }
      for (const im of impacts.slice()) {
        im.life -= dt;
        const s = Math.max(0.01, im.life / 0.12);
        im.mesh.scale.setScalar(s);
        if (im.life <= 0) {
          scene.remove(im.mesh);
          impacts.splice(impacts.indexOf(im), 1);
        }
      }
      // Crew return fire.
      for (const c of crew) {
        if (!c.alive || !heroPos) continue;
        const dx = heroPos.x - c.x;
        const dz = heroPos.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 34) continue;
        c.heading = Math.atan2(dx, dz);
        c.mesh.rotation.y = c.heading;
        c.shootT -= dt;
        if (c.shootT <= 0) {
          c.shootT = 1.3 + rng() * 0.9;
          const hitChance = d < 25 ? 0.25 : 0.13;
          if (rng() < hitChance && events) events.onPlayerShot(8);
          // Their tracer, from the crew member toward Rex.
          const from = new THREE.Vector3(c.x, 1.3, c.z);
          const to = new THREE.Vector3(heroPos.x, 1.2, heroPos.z);
          const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
          const line = new THREE.Line(geo, tracerMat.clone());
          line.material.opacity = 0.7;
          scene.add(line);
          tracers.push({ line, life: 0.09 });
        }
      }
    },
  };
  return gun;
}
