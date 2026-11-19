// Third-person follow camera: a yaw/pitch orbit on a spring arm that pulls
// in when a building blocks it, exponential smoothing so the feel is the
// same at any frame rate, and a hard clamp so the view never leaves the city.

import * as THREE from 'three';
import { clamp, damp } from './seed.js';

export function buildFollow(camera) {
  const follow = {
    yaw: 0.6,
    pitch: 0.32,
    distance: 8,
    target: new THREE.Vector3(),
    shake: 0,
    addShake(amount) {
      this.shake = Math.min(1, this.shake + amount);
    },
    update(dt, focus, driving, town) {
      const wantDist = driving ? 13 : 7.5;
      const wantHeight = driving ? 4.2 : 2.6;
      this.distance += (wantDist - this.distance) * damp(4, dt);
      const fx = focus.x;
      const fz = focus.z;
      const fy = driving ? 1.6 : 1.4;
      this.target.set(fx, fy, fz);
      // Spring arm: walk from the target toward the camera and stop at the
      // first building in the way.
      const cx = Math.sin(this.yaw) * Math.cos(this.pitch);
      const cz = Math.cos(this.yaw) * Math.cos(this.pitch);
      const cy = Math.sin(this.pitch);
      let arm = this.distance;
      for (let d = 1.5; d <= this.distance; d += 1.0) {
        const px = fx + cx * d;
        const pz = fz + cz * d;
        if (town.pointInside(px, pz)) { arm = Math.max(2.2, d - 1.2); break; }
      }
      const desired = new THREE.Vector3(
        fx + cx * arm,
        fy + cy * arm + wantHeight * 0.4,
        fz + cz * arm,
      );
      camera.position.lerp(desired, damp(10, dt));
      // Shake rides on top of the smooth follow, never inside it.
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const sh = this.shake * this.shake * 0.35;
      const look = new THREE.Vector3(fx, fy + 0.4, fz);
      if (sh > 0.001) {
        look.x += (Math.random() - 0.5) * sh;
        look.y += (Math.random() - 0.5) * sh;
        look.z += (Math.random() - 0.5) * sh;
      }
      camera.lookAt(look);
    },
    // Bearing from the camera to a world point, in degrees, for the HUD arrow.
    // The arrow points up when the point is straight ahead of the camera
    // (view direction heading = yaw + PI); +90 is to the right.
    bearingTo(focus, pos) {
      const dx = pos.x - focus.x;
      const dz = pos.z - focus.z;
      const worldAngle = Math.atan2(dx, dz);
      let deg = 180 - ((worldAngle - this.yaw) * 180) / Math.PI;
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      return deg;
    },
    setYawPitch(yaw, pitch) {
      this.yaw = yaw;
      this.pitch = clamp(pitch, 0.08, 1.1);
    },
  };
  return follow;
}
