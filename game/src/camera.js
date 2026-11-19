// Third-person follow camera for Solmar Bay (camera-systems patterns):
// exponential smoothing so the feel is the same at any frame rate, a
// look-ahead that leans the camera toward the direction of travel, a
// deadzone so small movements don't nudge it, pitch clamping, and a shake
// offset that rides on top of the follow (never inside it). The camera
// updates after the player moves, so it never lags a frame behind.

import * as THREE from 'three';
import { clamp, lerp, wrapAngle, angleDelta, smoothFactor } from './util.js';

export function makeCameraRig(camera) {
  return {
    camera,
    yaw: Math.PI, // behind the player, looking north at spawn
    pitch: 0.32,
    distance: 9.5,
    height: 3.4,
    focus: new THREE.Vector3(0, 1.5, 0),
    shake: 0, // trauma 0..1; decays on its own
    shakeTime: 0,
  };
}

// Mouse look: yaw around the player, pitch clamped so the camera never
// flips over the top.
export function applyLook(rig, dx, dy) {
  rig.yaw -= dx * 0.0032;
  rig.pitch = clamp(rig.pitch + dy * 0.0022, -0.15, 0.85);
}

export function addShake(rig, amount) {
  rig.shake = clamp(rig.shake + amount, 0, 1);
}

// Follow the target. `target` is a Vector3 (the player's chest), `speed`
// the player's current speed for the look-ahead. `colliders` (optional) is
// the building AABB list the camera is pulled in front of, so it never
// clips inside a building — the spring-arm push-in, done with a segment
// test against the same AABBs the player collides with. dt seconds.
export function updateCamera(rig, target, speed, dt, colliders) {
  rig.shake = Math.max(0, rig.shake - dt * 1.4);
  rig.shakeTime += dt * 34;
  // Look-ahead: aim a little past the target in its travel direction.
  const lead = clamp(speed * 0.22, 0, 2.2);
  const leadX = Math.sin(rig.yaw) * -lead;
  const leadZ = Math.cos(rig.yaw) * -lead;
  const wantFocus = new THREE.Vector3(target.x + leadX, target.y + 1.4, target.z + leadZ);
  // Deadzone: ignore focus moves smaller than 0.6 units.
  const dx = wantFocus.x - rig.focus.x;
  const dz = wantFocus.z - rig.focus.z;
  const drift = Math.sqrt(dx * dx + dz * dz);
  if (drift > 0.6) {
    const t = smoothFactor(7, dt);
    rig.focus.x = lerp(rig.focus.x, wantFocus.x, t);
    rig.focus.z = lerp(rig.focus.z, wantFocus.z, t);
  }
  rig.focus.y = lerp(rig.focus.y, wantFocus.y, smoothFactor(5, dt));
  // Orbit position: behind the player at yaw/pitch, at a fixed distance.
  const cp = Math.cos(rig.pitch);
  const sp = Math.sin(rig.pitch);
  let cx = rig.focus.x + Math.sin(rig.yaw) * cp * rig.distance;
  let cy = rig.focus.y + sp * rig.distance;
  let cz = rig.focus.z + Math.cos(rig.yaw) * cp * rig.distance;
  // Pull the camera in front of any building the line of sight crosses.
  if (colliders) {
    const pulled = pullInFromBuildings(rig.focus, cx, cy, cz, colliders);
    cx = pulled[0];
    cy = pulled[1];
    cz = pulled[2];
  }
  // Shake rides on top of the follow as an additive offset.
  const sh = rig.shake * rig.shake;
  const shX = Math.sin(rig.shakeTime * 1.3) * sh * 0.5;
  const shY = Math.sin(rig.shakeTime * 1.7 + 2) * sh * 0.4;
  rig.camera.position.set(cx + shX, Math.max(1.2, cy + shY), cz);
  rig.camera.lookAt(rig.focus.x + shX * 0.5, rig.focus.y, rig.focus.z);
}

// Step along the focus->camera segment; return the last point that is not
// inside a building (plus a small margin), so the camera stops in front
// of the wall instead of inside it.
function pullInFromBuildings(focus, cx, cy, cz, colliders) {
  const steps = 16;
  let bx = cx;
  let by = cy;
  let bz = cz;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = focus.x + (cx - focus.x) * t;
    const y = focus.y + (cy - focus.y) * t;
    const z = focus.z + (cz - focus.z) * t;
    let inside = false;
    for (const b of colliders) {
      if (y > 0.4 && y < 46 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) {
        inside = true;
        break;
      }
    }
    if (inside) break;
    bx = x;
    by = y;
    bz = z;
  }
  return [bx, Math.max(1.2, by), bz];
}

// Snap the camera behind the player instantly (spawn, mission jumps).
export function snapCamera(rig, target, yaw) {
  rig.yaw = yaw;
  rig.focus.set(target.x, target.y + 1.4, target.z);
  const cp = Math.cos(rig.pitch);
  const sp = Math.sin(rig.pitch);
  rig.camera.position.set(
    rig.focus.x + Math.sin(rig.yaw) * cp * rig.distance,
    rig.focus.y + sp * rig.distance,
    rig.focus.z + Math.cos(rig.yaw) * cp * rig.distance,
  );
  rig.camera.lookAt(rig.focus);
}
