// Renderer, golden-hour lighting and the third-person camera rig: exponential
// smoothing, look-ahead, pitch clamp, wheel zoom and a simple push-in when a
// building blocks the view (camera-systems patterns, hand-rolled for three.js).
import * as THREE from 'three';
import { FOV_KICK } from './config.js';
import { angleLerp, clamp, dampFactor, lerp } from './random.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf7b98a, 240, 820);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2200);
  camera.position.set(-140, 60, 180);

  // Golden hour: warm low sun from the west, soft sky fill.
  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x4a3a2e, 0.85));
  const sun = new THREE.DirectionalLight(0xffb36b, 2.7);
  sun.position.set(-180, 130, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 520;
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  // Camera rig state.
  let yaw = Math.PI * 0.15, pitch = 0.24, dist = 8.5;
  let trauma = 0;
  let fov = 62; // base FOV; driving fast kicks it wider for speed feel
  let camPos = new THREE.Vector3(-140, 60, 180);
  let lookAt = new THREE.Vector3(0, 2, 0);
  const tmp = new THREE.Vector3();

  return {
    scene, camera, renderer,
    get yaw() { return yaw; },
    setYaw(v) { yaw = v; },
    addShake(amount) { trauma = Math.min(1, trauma + amount); },
    orbit(dx, dy) {
      yaw -= dx * 0.005;
      pitch = clamp(pitch + dy * 0.0035, -0.12, 1.15);
    },
    zoom(delta) { dist = clamp(dist + delta * 0.01, 5, 16); },
    setTitleView(t) {
      const a = t * 0.045;
      camPos.set(Math.sin(a) * 190, 74, Math.cos(a) * 190);
      camera.position.copy(camPos);
      camera.lookAt(0, 14, 0);
    },
    // focus: {x, z, y} of the thing followed; heading: its facing (car mode
    // eases the camera behind it); mode 'foot' | 'car' | 'fixed'; speed01 is
    // the car's speed as a 0..1 fraction, for the FOV kick.
    follow(dt, focus, heading, mode, colliders, speed01 = 0) {
      if (mode === 'car') {
        // Chase cam: ease yaw behind the car's heading, with look-ahead.
        yaw = angleLerp(yaw, heading + Math.PI, dampFactor(1.6, dt));
        pitch = lerp(pitch, 0.24, dampFactor(2, dt));
        dist = lerp(dist, 11.5, dampFactor(2, dt));
      }
      // Speed feel: the FOV widens as the car goes faster, eases back on foot.
      const targetFov = 62 + (mode === 'car' ? clamp(speed01, 0, 1) * FOV_KICK : 0);
      if (Math.abs(targetFov - fov) > 0.05) {
        fov = lerp(fov, targetFov, dampFactor(2.5, dt));
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      const target = tmp.set(focus.x, focus.y, focus.z);
      const lookY = mode === 'car' ? 2.2 : 1.7;
      lookAt.lerp(new THREE.Vector3(target.x, lookY, target.z), dampFactor(10, dt));
      const cd = Math.cos(pitch), sd = Math.sin(pitch);
      const desired = new THREE.Vector3(
        lookAt.x + Math.sin(yaw) * cd * dist,
        lookAt.y + sd * dist,
        lookAt.z + Math.cos(yaw) * cd * dist,
      );
      // Push-in: if a building sits between look point and camera, pull in.
      let d = dist;
      if (colliders) {
        for (let r = dist; r > 3; r -= 1.5) {
          const px = lookAt.x + Math.sin(yaw) * cd * r;
          const pz = lookAt.z + Math.cos(yaw) * cd * r;
          let inside = false;
          for (const c of colliders) {
            if (px > c.minX && px < c.maxX && pz > c.minZ && pz < c.maxZ) { inside = true; break; }
          }
          if (!inside) { d = r; break; }
          d = Math.max(3, r - 1.5);
        }
      }
      desired.set(
        lookAt.x + Math.sin(yaw) * cd * d,
        Math.max(lookAt.y + sd * d, 0.7),
        lookAt.z + Math.cos(yaw) * cd * d,
      );
      camPos.lerp(desired, dampFactor(mode === 'car' ? 7 : 9, dt));
      trauma = Math.max(0, trauma - dt * 1.6);
      const shake = trauma * trauma;
      camera.position.set(
        camPos.x + (Math.random() - 0.5) * shake * 0.7,
        camPos.y + (Math.random() - 0.5) * shake * 0.7,
        camPos.z + (Math.random() - 0.5) * shake * 0.7,
      );
      camera.lookAt(lookAt);
      // Keep the shadow frustum on the player.
      sun.position.set(focus.x - 180, 130, focus.z + 60);
      sun.target.position.set(focus.x, 0, focus.z);
    },
    render() { renderer.render(scene, camera); },
  };
}
