// Engine: renderer, sunset light, the main loop, input, the state machine
// (title / playing / paused / busted / complete), and the wiring between
// every module. This is the only file that knows about all the others.

import * as THREE from 'three';
import { mulberry32, clamp } from './seed.js';
import { buildTown, LANDMARKS } from './town.js';
import { buildRides } from './rides.js';
import { buildFolks } from './folks.js';
import { buildHero } from './hero.js';
import { buildChase } from './chase.js';
import { buildGunplay } from './gunplay.js';
import { buildStory } from './story.js';
import { buildDisplay } from './display.js';
import { saveGame, loadGame } from './vault.js';
import { buildFollow } from './follow.js';
import { applyPreset } from './presets.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const shot = params.get('shot');
const rng = mulberry32(seed);

// --- Renderer / scene / camera ------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('game') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8a05c, 130, 380);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-60, 40, 150);

// Sunset sky dome: a gradient canvas on a big sphere, never fogged.
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a1a4a');
  grad.addColorStop(0.45, '#7a3a6a');
  grad.addColorStop(0.68, '#e86a4a');
  grad.addColorStop(0.82, '#ffc46b');
  grad.addColorStop(1, '#ffd9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
}

const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
sun.position.set(-140, 110, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150;
sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.5;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffd9a0, 0x4a3a2a, 1.15));

// --- World --------------------------------------------------------------------
const town = buildTown(scene, rng);
const rides = buildRides(scene, rng, town);
const folks = buildFolks(scene, rng, town);
const hero = buildHero(scene, LANDMARKS.start);
const chase = buildChase(scene, rng, town, rides);
const gun = buildGunplay(scene, camera, rng);
const story = buildStory(scene, rng);
const display = buildDisplay(town.map);
const follow = buildFollow(camera);

// --- Game state ---------------------------------------------------------------
let state = 'title';
let cash = 120;
let health = 100;
let lastHurtT = -100;
let elapsed = 0;
let lastShot = null;
let titlePreset = false;

const saved = loadGame();
if (saved) {
  cash = saved.cash;
  story.resume(saved.mission);
  hero.teleport(saved.x, saved.z);
  display.setSaveNote(`Save found — Mission ${saved.mission + 1}, ${'$' + saved.cash}. Press START to continue.`);
}

const events = {
  chase,
  onSteal() {
    if (folks.witnessNear(hero.x, hero.z, 18)) {
      chase.addWanted(1);
      display.toast('Someone saw you steal that car!');
    }
  },
  onRam() {
    follow.addShake(0.35);
  },
  onBusted() {
    if (state !== 'playing') return;
    bust('The Solmar Bay PD took you in.');
  },
  onHeatDrop(w) {
    if (w === 0) display.toast('You lost them.');
  },
  onPlayerShot(dmg) {
    if (state !== 'playing') return;
    health -= dmg;
    lastHurtT = elapsed;
    display.hurtFlash();
    follow.addShake(0.5);
    if (health <= 0) bust('You got shot up.');
  },
  onMissionComplete(m) {
    cash += m.reward;
    display.toast(`JOB DONE — ${m.title} +$${m.reward}`);
    saveGame({ cash, mission: story.index, x: hero.x, z: hero.z });
    setTimeout(() => {
      if (state === 'playing' && !story.complete) story.start(events);
    }, 2600);
  },
  onMissionFailed(reason) {
    display.toast(reason + ' — retrying the job.');
    setTimeout(() => {
      if (state === 'playing') story.start(events);
    }, 2200);
  },
  onStoryComplete() {
    state = 'complete';
    display.showScreen('screen-complete');
    saveGame({ cash, mission: story.index, x: hero.x, z: hero.z });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onDialogue(speaker, text) {
    display.showDialogue(speaker, text);
  },
};

function bust(note) {
  state = 'busted';
  const fine = Math.min(cash, Math.max(200, Math.round(cash * 0.1)));
  cash -= fine;
  health = 100;
  chase.clearAll();
  gun.clearCrew();
  display.setBustedNote(`${note} Fine: $${fine}.`);
  display.showScreen('screen-busted');
  if (document.pointerLockElement) document.exitPointerLock();
  saveGame({ cash, mission: story.index, x: LANDMARKS.garage.x, z: LANDMARKS.garage.z });
}

function respawn() {
  hero.teleport(LANDMARKS.garage.x, LANDMARKS.garage.z);
  health = 100;
  display.showScreen(null);
  state = 'playing';
  story.active = false;
  story.step = 0;
  story.start(events);
}

function startGame() {
  if (state !== 'title') return;
  display.showScreen(null);
  state = 'playing';
  if (!story.active && !story.complete) story.start(events);
}

// --- Input --------------------------------------------------------------------
const input = {
  forward: false, back: false, left: false, right: false,
  sprint: false, interact: false, fireHeld: false,
};
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const mapped = KEYMAP[e.code];
  if (mapped) { input[mapped] = true; e.preventDefault(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
  if (e.code === 'KeyE') input.interact = true;
  if (e.code === 'KeyR') gun.startReload();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'playing') { state = 'paused'; display.showScreen('screen-pause'); }
    else if (state === 'paused') { state = 'playing'; display.showScreen(null); }
  }
  if (e.code === 'Enter' && state === 'title') startGame();
});
window.addEventListener('keyup', (e) => {
  const mapped = KEYMAP[e.code];
  if (mapped) input[mapped] = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
});

const canvas = document.getElementById('game');
let dragging = false;
canvas.addEventListener('click', () => {
  if (state === 'playing' && !document.pointerLockElement) {
    canvas.requestPointerLock?.();
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  if (state === 'playing') {
    input.fireHeld = true;
    fireOnce();
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { dragging = false; input.fireHeld = false; }
});
window.addEventListener('mousemove', (e) => {
  if (!dragging && !document.pointerLockElement) return;
  follow.yaw -= e.movementX * 0.0028;
  follow.pitch += e.movementY * 0.0028;
  follow.setYawPitch(follow.yaw, follow.pitch);
});

function fireOnce() {
  if (state !== 'playing' || gun.reloading) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone().add(dir.clone().multiplyScalar(0.6));
  origin.y -= 0.25;
  lastShot = { x: hero.x, z: hero.z, t: elapsed };
  gun.fire(origin, dir, (crewMember) => {
    if (crewMember && !crewMember.alive) display.toast('Tide King down.');
  });
  if (chase.wanted < 2) chase.addWanted(2 - chase.wanted);
  follow.addShake(0.12);
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', respawn);
document.getElementById('btn-freeroam').addEventListener('click', () => {
  display.showScreen(null);
  state = 'playing';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame({ cash, mission: story.index, x: hero.x, z: hero.z });
});

// --- Screenshot presets -------------------------------------------------------
if (shot) {
  const game = { hero, rides, chase, story, gun, follow, display, camera };
  const result = applyPreset(shot, game);
  if (result === 'playing') {
    state = 'playing';
    display.showScreen(null);
  } else if (result === 'title') {
    titlePreset = true;
  }
}

// --- Main loop ----------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (state === 'title' && !titlePreset) {
    // Slow cinematic orbit over the city while the title is up.
    const t = elapsed * 0.04;
    camera.position.set(Math.sin(t) * 120, 58, Math.cos(t) * 120);
    camera.lookAt(0, 8, -10);
  }
  if (state === 'title') {
    // Keep the HUD honest on the title screen too: cash, minimap, stars.
    display.setHealth(health);
    display.setCash(cash);
    display.setWanted(chase.wanted);
    display.setAmmo(gun.ammo, gun.magSize, false);
    display.update(dt, hero, chase.police, gun.crew, story.objective(), follow.yaw);
  }
  if (state === 'playing') {
    hero.update(dt, input, follow.yaw, town, rides, events);
    input.interact = false;
    rides.update(dt, hero.inCar);
    const threat = lastShot && elapsed - lastShot.t < 0.6 ? lastShot : null;
    folks.update(dt, threat);
    chase.update(dt, hero, events);
    gun.update(dt, hero.focus(), events);
    story.update(dt, { hero, chase, gun, events });
    if (input.fireHeld) fireOnce();
    // Health regens after 8 quiet seconds.
    if (elapsed - lastHurtT > 8 && health < 100) health = Math.min(100, health + 6 * dt);
    // Camera follows the hero (or the car).
    const focus = hero.focus();
    follow.update(dt, focus, !!hero.inCar, town);
    // HUD.
    const obj = story.objective();
    const m = story.current();
    display.setHealth(health);
    display.setCash(cash);
    display.setMission(m && !story.complete ? `${m.id} · ${m.title}` : 'SOLMAR BAY');
    display.setWanted(chase.wanted);
    display.setAmmo(gun.ammo, gun.magSize, gun.reloading);
    display.setObjective(
      m && !story.complete ? `${m.id} · ${m.title}` : '',
      obj ? obj.text : '',
      story.currentStep()?.type === 'timed' ? story.timer : null,
    );
    display.setCompass(obj && obj.pos ? follow.bearingTo(focus, obj.pos) : null);
    display.update(dt, hero, chase.police, gun.crew, obj, follow.yaw);
  }

  renderer.render(scene, camera);
});

// For the playtest harness and debugging.
window.__game = {
  get state() { return state; },
  get cash() { return cash; },
  get health() { return health; },
  hero, story, chase, gun, rides, follow,
  startGame, respawn,
};
