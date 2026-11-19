// Boot for Solmar Bay: creates the renderer, the sunset lighting, builds
// the world, wires every system together, and runs the game loop. Also the
// title/pause/busted/game-over flow, the enter-car hand-off, shooting, and
// the ?shot= presets the screenshots are taken with (title, street, chase,
// mission). One fixed seed makes the city identical on every load.

import * as THREE from 'three';
import { makeRng, clamp, lerp, dist2D, WORLD, PALETTE, PLACES } from './util.js';
import { buildCity } from './city.js';
import { makeCar, driveCar, carProximity } from './vehicles.js';
import { buildTraffic, updateTraffic, buildPedestrians, updatePedestrians, scarePedestrians } from './traffic.js';
import { makePlayer, updatePlayer, damagePlayer, healPlayer } from './player.js';
import { makeWanted, makePolice, updatePolice, addHeat, setWanted, clearPolice } from './police.js';
import { makePistol, makePistolMesh, firePistol, reloadPistol, updatePistol, updateTracers, updateCrewMember } from './weapons.js';
import { makeMissions, startMission, updateMissions, missionObjective, missionTarget, clearCrew } from './missions.js';
import { buildHud, setHealth, setCash, setWantedStars, setAmmo, setObjective, setLocation, setPrompt, showMessage, showDialogue, updateDialogue, drawMinimap, showTitle, hideTitle, showPause, showComplete, showBusted, hideBusted, showGameOver } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { makeCameraRig, applyLook, addShake, updateCamera, snapCamera } from './camera.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || WORLD.seed);
const SHOT = params.get('shot') || '';

const rng = makeRng(SEED);

// --- Renderer / scene / lights --------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 240, 700);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 40, 120);

scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
sun.position.set(-90, 210, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 420;
sun.shadow.camera.left = -200;
sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;
sun.shadow.bias = -0.0004;
scene.add(sun);
// Warm sunset fill from the west so the shadows stay readable.
const fill = new THREE.DirectionalLight(0xff9a6a, 0.55);
fill.position.set(120, 40, -80);
scene.add(fill);

// --- World -------------------------------------------------------------------
const { colliders, lighthouse, sea } = buildCity(scene, rng);
const traffic = buildTraffic(scene, rng, colliders);
const peds = buildPedestrians(scene, rng);
const player = makePlayer();
player.position.set(0, 0, 96);
scene.add(player);
const wanted = makeWanted();
const police = makePolice(scene);
const missions = makeMissions(scene);
const pistol = makePistol();
const pistolMesh = makePistolMesh();
camera.add(pistolMesh);
scene.add(camera);

// Parked cars the player can steal (a few sit at curbs around the city).
const parkedCars = [];
const parkedSpots = [
  { x: 20, z: 88, heading: Math.PI / 2 }, { x: -22, z: 52, heading: -Math.PI / 2 },
  { x: 56, z: -18, heading: 0 }, { x: -56, z: -52, heading: Math.PI },
  { x: 92, z: 88, heading: Math.PI / 2 }, { x: -92, z: -88, heading: 0 },
];
for (const s of parkedSpots) {
  const c = makeCar([0xc23a2e, 0x2e6fb8, 0xe8a83a, 0x3a8a5a, 0xe8e8e8][parkedCars.length % 5], s);
  scene.add(c);
  parkedCars.push(c);
}

// --- HUD / camera -------------------------------------------------------------
const hud = buildHud();
const rig = makeCameraRig(camera);
snapCamera(rig, player.position, Math.PI);

// --- Game state -----------------------------------------------------------------
const state = {
  mode: 'title', // title | playing | paused | busted | over
  inCar: false,
  playerCar: null,
  cash: 0,
  time: 0,
  mapTimer: 0,
  keys: {},
  mouseDown: false,
  aiming: false,
  threat: null,
  shotReady: false,
};

function allCars() {
  const list = [...traffic.map((t) => t.mesh), ...parkedCars, ...police.units.map((u) => u.mesh)];
  if (state.playerCar) list.push(state.playerCar);
  return list;
}

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const c of allCars()) {
    if (c.userData.isPlayer) continue;
    const d = carProximity(c, player.position.x, player.position.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function enterCar(car) {
  state.inCar = true;
  state.playerCar = car;
  car.userData.isPlayer = true;
  player.visible = false;
  pistolMesh.visible = false;
  addHeat(wanted, 25); // stealing a car is a crime
  scarePedestrians(peds, player.position.x, player.position.z, 14);
  showMessage(hud, 'Car stolen — the law noticed.');
  setPrompt(hud, '');
}

function exitCar() {
  const car = state.playerCar;
  if (!car) return;
  car.userData.isPlayer = false;
  const side = car.position.clone();
  side.x += Math.cos(car.userData.heading) * 3;
  side.z -= Math.sin(car.userData.heading) * 3;
  player.position.set(side.x, 0, side.z);
  player.visible = true;
  pistolMesh.visible = true;
  state.inCar = false;
  state.playerCar = null;
  snapCamera(rig, player.position, rig.yaw);
}

function applySave(record) {
  if (!record) return;
  missions.index = clamp(record.missionIndex, 0, 4);
  missions.cash = record.cash || 0;
  state.cash = missions.cash;
  player.userData.health = record.health ?? 100;
  player.position.set(record.x ?? 0, 0, record.z ?? 96);
  setCash(hud, state.cash);
  setHealth(hud, player.userData.health, player.userData.maxHealth);
}

function doSave() {
  saveGame({
    missionIndex: missions.index,
    cash: missions.cash,
    health: player.userData.health,
    x: player.position.x,
    z: player.position.z,
  });
}

function bustPlayer() {
  const fine = Math.min(150, state.cash);
  state.cash -= fine;
  missions.cash = state.cash;
  setWanted(wanted, 0);
  clearPolice(police);
  player.userData.health = player.userData.maxHealth;
  if (state.inCar) exitCar();
  player.position.set(-60, 0, 102);
  snapCamera(rig, player.position, Math.PI);
  setCash(hud, state.cash);
  setHealth(hud, player.userData.health, player.userData.maxHealth);
  state.mode = 'busted';
  showBusted(hud);
  document.exitPointerLock?.();
  setTimeout(() => {
    hideBusted(hud);
    if (state.mode === 'busted') state.mode = 'playing';
  }, 2600);
}

function gameOver() {
  state.mode = 'over';
  showGameOver(hud);
  document.exitPointerLock?.();
}

// --- Mission context ------------------------------------------------------------
const missionCtx = {
  scene,
  wanted,
  time: 0,
  playerPos: player.position,
  get inCar() { return state.inCar; },
  say: (name, text) => showDialogue(hud, name, text),
  setObjective: (t) => setObjective(hud, t),
  onMissionComplete: (def, cash) => {
    state.cash = cash;
    setCash(hud, cash);
    showComplete(hud, `${def.name} — complete`, `+$${def.reward} — Vera paid up.`);
    healPlayer(player, 25);
    setHealth(hud, player.userData.health, player.userData.maxHealth);
  },
  save: () => doSave(),
  addHeat: (n) => addHeat(wanted, n),
};

// --- Input -----------------------------------------------------------------------
const input = { forward: 0, strafe: 0, run: false, jump: false };

function readInput() {
  const k = state.keys;
  input.forward = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  input.strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  input.run = !!k.ShiftLeft || !!k.ShiftRight;
  input.jump = !!k.Space;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  state.keys[e.code] = true;
  if (state.mode !== 'playing') return;
  if (e.code === 'KeyE') {
    if (state.inCar) exitCar();
    else {
      const car = nearestCar(4);
      if (car) enterCar(car);
    }
  }
  if (e.code === 'KeyR') reloadPistol(pistol);
  if (e.code === 'KeyM') {
    if (!missions.active && missions.index < missions.defs.length) {
      startMission(missions, missionCtx);
    }
  }
  if (e.code === 'KeyP' || e.code === 'Escape') pauseGame(true);
});
window.addEventListener('keyup', (e) => { state.keys[e.code] = false; });
window.addEventListener('blur', () => { state.keys = {}; });

canvas.addEventListener('click', () => {
  if (state.mode === 'playing' && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state.mode === 'playing' && !SHOT) {
    pauseGame(true);
  }
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && state.mode === 'playing') {
    applyLook(rig, e.movementX, e.movementY);
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    state.mouseDown = true;
    tryShoot(); // the first shot fires on the click itself, not next frame
  }
  if (e.button === 2) state.aiming = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) state.mouseDown = false;
  if (e.button === 2) state.aiming = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function pauseGame(on) {
  if (on && state.mode === 'playing') {
    state.mode = 'paused';
    showPause(hud, true);
    document.exitPointerLock?.();
  } else if (!on && state.mode === 'paused') {
    state.mode = 'playing';
    showPause(hud, false);
    canvas.requestPointerLock();
  }
}

document.getElementById('start-btn').addEventListener('click', () => startGame(false));
document.getElementById('continue-btn').addEventListener('click', () => startGame(true));
document.getElementById('resume-btn').addEventListener('click', () => pauseGame(false));
document.getElementById('restart-btn').addEventListener('click', () => location.reload());
document.getElementById('busted-btn').addEventListener('click', () => {
  hideBusted(hud);
  if (state.mode === 'busted') state.mode = 'playing';
});
document.getElementById('title-restart-btn')?.addEventListener('click', () => {
  localStorage.removeItem('solmarbay-save-v1');
  location.reload();
});

if (hasSave()) {
  document.getElementById('continue-btn').style.display = 'inline-block';
}

function startGame(fromSave) {
  hideTitle(hud);
  if (fromSave) {
    applySave(loadGame());
    showMessage(hud, 'Welcome back, Rex. Vera is waiting — press M for work.');
  } else {
    showMessage(hud, 'Welcome to Solmar Bay. Press M to hear from Vera.');
  }
  setObjective(hud, missions.index < missions.defs.length ? 'Press M to start the next job from Vera.' : 'All missions complete — Solmar Bay is yours.');
  state.mode = 'playing';
  canvas.requestPointerLock();
  snapCamera(rig, player.position, rig.yaw);
}

// --- Shooting ----------------------------------------------------------------------
function tryShoot() {
  if (state.inCar || state.mode !== 'playing') return;
  const solids = [];
  scene.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.position.y > 2) solids.push(o);
  });
  const targets = [];
  for (const c of missions.crew) targets.push(c);
  for (const u of police.units) {
    targets.push({
      mesh: u.mesh, hp: u.mesh.userData.health, dead: false, radius: 1.6,
      onDeath: null,
      set hp(v) { u.mesh.userData.health = v; },
      get hp() { return u.mesh.userData.health; },
    });
  }
  const hit = firePistol(pistol, camera, targets, solids, scene, (res) => {
    addShake(rig, 0.12);
    if (res.hit) {
      showMessage(hud, res.killed ? 'Target down.' : 'Hit!', 1200);
      addHeat(wanted, res.killed ? 18 : 6);
      scarePedestrians(peds, player.position.x, player.position.z, 30);
    }
  });
  if (hit) {
    // A police car disabled by damage stops chasing.
    if (hit.mesh && hit.mesh.userData.isPolice && hit.hp <= 0) {
      hit.mesh.userData.maxSpeed = 0;
    }
  }
  pistolMesh.userData.flashTimer = 0.06;
  pistolMesh.userData.flash.material.opacity = 1;
}

// --- Shot presets (screenshots) -------------------------------------------------------
function applyShotPreset() {
  if (!SHOT) return;
  hideTitle(hud);
  state.mode = 'playing';
  if (SHOT === 'title') {
    showTitle(hud);
    state.mode = 'title';
    return;
  }
  if (SHOT === 'street') {
    // On the Sunset Beach promenade, facing north up the avenue into the
    // city. The beach road sits south of the towers, so the sunset lights
    // the facades and the walk instead of throwing them into shadow.
    player.position.set(18, 0, 126);
    player.rotation.y = Math.PI;
    snapCamera(rig, player.position, 0.4);
    setObjective(hud, 'Explore Solmar Bay — steal a car (E), press M for work from Vera.');
    showMessage(hud, 'Sunset Beach, Solmar Bay — the promenade at golden hour.');
  } else if (SHOT === 'chase') {
    // On the avenue at x=18, driving north with three stars. The camera
    // snaps in behind the car (yaw 0 = south of a northbound car) so the
    // car, the avenue ahead and the chase read at once.
    const car = parkedCars[0];
    car.position.set(18, 0, 60);
    car.userData.heading = Math.PI;
    car.rotation.y = Math.PI;
    enterCar(car);
    snapCamera(rig, car.position, 0);
    setWanted(wanted, 3);
    showMessage(hud, 'Three stars — lose the cops!');
    setObjective(hud, 'Lose the cops — get your wanted level to zero.');
  } else if (SHOT === 'mission') {
    // On the dock road, facing north into the container yard where the crew
    // waits. The camera sits a touch higher than usual so the crew and the
    // containers fill the frame instead of the haze past the docks.
    player.position.set(44, 0, -128);
    player.rotation.y = 0;
    snapCamera(rig, player.position, 0.2);
    rig.pitch = 0.45;
    missions.index = 3;
    startMission(missions, missionCtx);
    // Jump straight to the crew fight for the shot.
    missions.step = 1;
    updateMissions(missions, { ...missionCtx, playerPos: player.position }, 0);
    setObjective(hud, 'Take out the Tide Kings crew (4) — 4 left');
    player.userData.aiming = true;
  }
  state.shotReady = true;
}

// --- Main loop -------------------------------------------------------------------------
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;
  missionCtx.time = state.time;

  // Ambient animation: lighthouse beam sweeps, the sea breathes.
  lighthouse.beam.rotation.y += dt * 0.5;
  sea.position.y = 0.1 + Math.sin(state.time * 0.6) * 0.08;

  if (state.mode === 'title') {
    // Slow cinematic orbit over downtown for the title screen.
    const a = state.time * 0.05;
    camera.position.set(Math.sin(a) * 150, 70, Math.cos(a) * 150);
    camera.lookAt(0, 8, 0);
  } else if (state.mode === 'playing') {
    readInput();
    updatePistol(pistol, dt);
    if (pistolMesh.userData.flashTimer > 0) {
      pistolMesh.userData.flashTimer -= dt;
      if (pistolMesh.userData.flashTimer <= 0) pistolMesh.userData.flash.material.opacity = 0;
    }
    // Player: on foot or driving.
    let playerSpeed = 0;
    if (state.inCar && state.playerCar) {
      const car = state.playerCar;
      const throttle = input.forward;
      const steer = -input.strafe;
      playerSpeed = driveCar(car, throttle, steer, dt);
      const [nx, nz] = clampCarToWorld(car);
      car.position.x = nx;
      car.position.z = nz;
      // The camera follows the car.
      updateCamera(rig, new THREE.Vector3(car.position.x, 1.4, car.position.z), Math.abs(playerSpeed), dt, colliders);
    } else {
      playerSpeed = updatePlayer(player, input, rig.yaw, colliders, dt);
      player.userData.aiming = state.aiming;
      updateCamera(rig, player.position, Math.abs(playerSpeed), dt, colliders);
      if (state.mouseDown) tryShoot();
    }
    // Wanted prompt: nearest car to steal.
    if (!state.inCar) {
      const car = nearestCar(4);
      setPrompt(hud, car ? 'Press E to steal the car' : '');
    } else {
      setPrompt(hud, 'Press E to get out — W/S drive, A/D steer');
    }
    // Traffic, pedestrians, police, crew.
    updateTraffic(traffic, state.playerCar, dt, state.time);
    updatePedestrians(peds, state.threat, dt, state.time);
    const playerPos = state.inCar && state.playerCar ? state.playerCar.position : player.position;
    const policeRes = updatePolice(police, wanted, playerPos, playerSpeed, state.inCar, colliders, dt, state.time, rng);
    for (const u of police.units) {
      if (u.ramHit) {
        u.ramHit = false;
        damagePlayer(player, 8);
        addShake(rig, 0.5);
        showMessage(hud, 'The cops rammed you!', 1500);
      }
    }
    for (const member of missions.crew) {
      updateCrewMember(member, playerPos, dt, (dmg) => {
        damagePlayer(player, dmg);
        addShake(rig, 0.3);
      });
    }
    updateTracers(dt);
    // Missions. The mission context tracks where Rex actually is — the car
    // when driving, the player on foot — so the distance checks (deliver,
    // goto, collect) follow the car instead of the stale on-foot position.
    missionCtx.playerPos = playerPos;
    updateMissions(missions, missionCtx, dt);
    // Wanted / health / bust / death.
    if (wanted.busted >= 1) bustPlayer();
    if (player.userData.health <= 0) gameOver();
    // HUD.
    setHealth(hud, player.userData.health, player.userData.maxHealth);
    setCash(hud, state.cash);
    setWantedStars(hud, wanted.level);
    setAmmo(hud, pistol.ammo, pistol.reserve);
    setLocation(hud, playerPos.x, playerPos.z);
    updateDialogue(hud, dt);
    state.mapTimer -= dt;
    if (state.mapTimer <= 0) {
      state.mapTimer = 0.2;
      drawMinimap(hud, {
        player: { x: playerPos.x, z: playerPos.z, heading: state.inCar && state.playerCar ? state.playerCar.userData.heading : player.rotation.y },
        target: missionTarget(missions),
        police: police.units.map((u) => ({ x: u.mesh.position.x, z: u.mesh.position.z })),
      });
    }
  }

  renderer.render(scene, camera);
}

function clampCarToWorld(car) {
  let x = clamp(car.position.x, -186, 186);
  let z = clamp(car.position.z, -186, 186);
  // Cars stop at buildings (simple push-out).
  for (const b of colliders) {
    if (x > b.minX - 1.4 && x < b.maxX + 1.4 && z > b.minZ - 1.4 && z < b.maxZ + 1.4) {
      const dxl = x - (b.minX - 1.4);
      const dxr = (b.maxX + 1.4) - x;
      const dzl = z - (b.minZ - 1.4);
      const dzr = (b.maxZ + 1.4) - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = b.minX - 1.4;
      else if (m === dxr) x = b.maxX + 1.4;
      else if (m === dzl) z = b.minZ - 1.4;
      else z = b.maxZ + 1.4;
      car.userData.speed *= 0.4;
    }
  }
  return [x, z];
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Apply the screenshot preset (if any), then start.
applyShotPreset();
if (SHOT === 'title') showTitle(hud);
else if (!SHOT) showTitle(hud);
setCash(hud, state.cash);
setHealth(hud, player.userData.health, player.userData.maxHealth);
setAmmo(hud, pistol.ammo, pistol.reserve);
setWantedStars(hud, 0);
window.__game = { state, missions, wanted, player, rig, scene };
window.__shotReady = !!SHOT;
renderer.setAnimationLoop(tick);
