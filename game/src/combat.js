// Combat: hitscan pistol with tracers, muzzle flash and hitmarkers (fps-shooter
// patterns), plus the armed rivals who shoot back. Shooting is on foot only.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { makePersonMesh } from './player.js';
import { clamp } from './random.js';

export function createCombat(scene, world, rng) {
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const enemies = [];
  let cooldown = 0;

  // Tracer pool: thin glowing boxes stretched between muzzle and impact.
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0 });
  for (let i = 0; i < 10; i += 1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), tracerMat.clone());
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerCursor = 0;

  function fireTracer(from, to) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    t.mesh.position.copy(from).addScaledVector(dir, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.07;
  }

  function tagShootable(group, ref) {
    group.traverse((o) => { o.userData.shootable = ref; });
  }

  function spawnEnemy(x, z) {
    const mesh = makePersonMesh(0x1a1a1a, 0x2a2a2a, 0x8a5a3a);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const e = {
      mesh, x, z, hp: 100, heading: 0,
      shootTimer: rng.range(0.5, 1.5), dead: false, fade: 0,
      kind: 'enemy',
    };
    tagShootable(mesh, e);
    enemies.push(e);
    return e;
  }

  function killEnemy(e, G) {
    e.dead = true;
    e.fade = 5;
    e.mesh.rotation.x = -Math.PI / 2 * 0.92;
    e.mesh.position.y = 0.3;
    G.effects.blood(e.x, 1, e.z);
    G.audio.kill();
  }

  function shootableList(G) {
    const list = [];
    for (const e of enemies) if (!e.dead) list.push(e.mesh);
    for (const c of G.police.cops) list.push(c.mesh);
    for (const p of G.pedestrians.peds) if (p.state !== 'down') list.push(p.mesh);
    for (const car of G.vehicles.cars) if (!car.parked) list.push(car.mesh);
    return list;
  }

  return {
    enemies,
    spawnEnemy,
    clearEnemies() {
      for (const e of enemies) scene.remove(e.mesh);
      enemies.length = 0;
    },
    // One shot from the player's pistol. The camera looks down at the player,
    // so its centre ray dives into the ground a few metres ahead — a shot fired
    // along it would never reach a standing target. Instead: aim at the first
    // thing the camera ray actually hits; if that is the ground close by, aim
    // at the ray's far point clamped to torso height, then fire from the muzzle
    // toward that point and raycast the real hit from there.
    shoot(G) {
      const player = G.player;
      const camera = G.rig.camera;
      cooldown = COMBAT.fireInterval;
      const muzzle = new THREE.Vector3(player.pos.x, player.pos.y + 1.45, player.pos.z);
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const camPos = camera.position;
      raycaster.setFromCamera(center, camera);
      raycaster.far = COMBAT.range;
      const seen = raycaster.intersectObjects(shootableList(G), true);
      // Where does the camera ray meet the ground?
      let groundT = Infinity;
      if (camDir.y < -0.001) groundT = -camPos.y / camDir.y;
      let aim;
      if (seen.length && seen[0].distance < groundT) {
        aim = seen[0].point.clone();
      } else {
        aim = new THREE.Vector3().copy(camPos).addScaledVector(camDir, 30);
        aim.y = Math.max(aim.y, 1.3);
      }
      const dir = new THREE.Vector3().subVectors(aim, muzzle).normalize();
      raycaster.set(muzzle, dir);
      raycaster.far = COMBAT.range;
      const hits = raycaster.intersectObjects(shootableList(G), true);
      let end = new THREE.Vector3().copy(muzzle).addScaledVector(dir, COMBAT.range);
      let hitAny = false;
      if (hits.length) {
        const h = hits[0];
        end = h.point.clone();
        const ref = h.object.userData.shootable;
        const dist = h.distance;
        const falloff = dist < 20 ? 1 : Math.max(0.45, 1 - (dist - 20) / 70);
        if (ref) {
          hitAny = true;
          if (ref.kind === 'enemy') {
            const head = h.point.y - ref.mesh.position.y > 1.5;
            ref.hp -= COMBAT.pistolDamage * falloff * (head ? COMBAT.headshotMult : 1);
            G.effects.blood(h.point.x, h.point.y, h.point.z);
            if (ref.hp <= 0) killEnemy(ref, G);
          } else if (ref.kind === 'cop') {
            // Shooting a cop is a fast way to five stars.
            G.addWanted(2);
            G.effects.blood(h.point.x, h.point.y, h.point.z);
            G.police.killCop(ref);
            G.audio.kill();
          } else if (ref.state !== undefined) {
            // A pedestrian.
            G.addWanted(1);
            G.pedestrians.knockDown(ref, true);
          } else if (ref.pos) {
            // A car.
            G.effects.sparks(h.point.x, h.point.y, h.point.z);
          }
        } else {
          G.effects.sparks(h.point.x, h.point.y, h.point.z);
        }
      }
      fireTracer(muzzle, end);
      G.effects.muzzle(muzzle.x, muzzle.y, muzzle.z);
      G.audio.shot();
      G.rig.addShake(0.1);
      G.lastGunshot = { x: player.pos.x, z: player.pos.z, t: G.time };
      if (hitAny && G.hud) G.hud.hitmarker();
      return hitAny;
    },
    update(dt, G) {
      cooldown = Math.max(0, cooldown - dt);
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
          if (t.life <= 0) t.mesh.visible = false;
        }
      }
      // Hold the mouse to fire (a drag orbits the camera instead — see input).
      const input = G.input;
      if (G.screen === 'play' && !G.driving && !G.player.dead && input.mouseDown && input.dragDistance() < 12) {
        if (cooldown <= 0) this.shoot(G);
      }
      // Enemies: keep their distance, shoot back with shaky aim.
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const e = enemies[i];
        if (e.dead) {
          e.fade -= dt;
          if (e.fade <= 0) { scene.remove(e.mesh); enemies.splice(i, 1); }
          continue;
        }
        const player = G.player;
        const dx = player.pos.x - e.x, dz = player.pos.z - e.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 60 || player.dead) continue;
        e.heading = Math.atan2(dx, dz);
        // Hold 12-25 m: close in when far, back off when close.
        if (dist > 25) { e.x += Math.sin(e.heading) * 3.4 * dt; e.z += Math.cos(e.heading) * 3.4 * dt; }
        else if (dist < 10) { e.x -= Math.sin(e.heading) * 2 * dt; e.z -= Math.cos(e.heading) * 2 * dt; }
        const solved = world.resolveCircle(e.x, e.z, 0.5);
        e.x = solved.x; e.z = solved.z;
        e.mesh.position.set(e.x, 0, e.z);
        e.mesh.rotation.y = e.heading;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && dist < 45) {
          e.shootTimer = COMBAT.enemyInterval * (0.8 + Math.random() * 0.5);
          const from = new THREE.Vector3(e.x, 1.45, e.z);
          const to = new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z);
          fireTracer(from, to);
          G.effects.muzzle(from.x, from.y, from.z);
          G.audio.enemyShot();
          G.lastGunshot = { x: e.x, z: e.z, t: G.time };
          if (Math.random() < COMBAT.enemyAccuracy) {
            player.damage(COMBAT.enemyDamage, G.time);
            if (G.hud) G.hud.hurt();
          }
        }
      }
    },
  };
}
