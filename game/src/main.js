// Solmar Bay — boot and the one loop. Screens: title, play, paused, end.
// Fixed 1/60 s steps (several in a slow frame, none in a fast one). The game
// context G is shared by every system; later phases attach traffic, police,
// combat, missions, HUD and audio to it.
//
// ?seed=N fixes the city layout. ?shot=title|street stages a screenshot scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { WORLD } from './config.js';
import { makeRng } from './random.js';
import { createInput } from './input.js';
import { buildWorld } from './world.js';
import { createRenderer } from './render.js';
import { createPlayer } from './player.js';
import { createVehicles, stepCar } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('scene');
const status = document.getElementById('status');
const rng = makeRng(seed);

const G = {
  time: 0,
  screen: 'title',
  cash: 0,
  wanted: 0,
  driving: null,      // car the player drives, or null
  seed,
  rng,
};

export function getGame() { return G; }

const rig = createRenderer(canvas);
G.rig = rig;
const world = buildWorld(rig.scene, rng);
G.world = world;
const player = createPlayer(rig.scene, world);
G.player = player;
const vehicles = createVehicles(rig.scene, world, rng);
G.vehicles = vehicles;
const traffic = createTraffic(rig.scene, world, vehicles, rng);
G.traffic = traffic;
const pedestrians = createPedestrians(rig.scene, world, rng);
G.pedestrians = pedestrians;
const effects = createEffects(rig.scene);
G.effects = effects;
const audio = createAudio();
G.audio = audio;
const police = createPolice(rig.scene, world, vehicles, rng);
G.police = police;
const combat = createCombat(rig.scene, world, rng);
G.combat = combat;
const input = createInput(canvas);
G.input = input;

// Wanted level (0-5). Crimes raise it; the police system (phase 3) decays it
// and sends the cars. Missions can set it directly.
G.addWanted = (n) => { G.wanted = Math.min(5, Math.max(0, G.wanted + n)); };
G.setWanted = (n) => { G.wanted = Math.min(5, Math.max(0, n)); };
G.lastGunshot = null;

function announce(message) { status.textContent = message; }
G.announce = announce;

const hudEl = document.getElementById('hud');
const titleEl = document.getElementById('titlescreen');
const pauseEl = document.getElementById('pausescreen');
const endEl = document.getElementById('endscreen');

function showScreen(name) {
  G.screen = name;
  titleEl.classList.toggle('hidden', name !== 'title');
  pauseEl.classList.toggle('hidden', name !== 'paused');
  endEl.classList.toggle('hidden', name !== 'end');
  hudEl.classList.toggle('hidden', name !== 'play');
  if (name === 'play') announce('Playing. WASD to move, E to enter a car.');
}

function endRun(kind) {
  // Busted or wasted: the run pauses here, the player keeps most of his cash.
  G.wanted = 0;
  G.cash = Math.floor(G.cash * 0.8);
  police.clear();
  combat.clearEnemies();
  if (G.driving) { G.driving.driver = null; G.driving = null; }
  player.mesh.visible = true;
  const title = document.getElementById('endtitle');
  const text = document.getElementById('endtext');
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    title.classList.remove('win');
    text.textContent = 'The Solmar Bay police hauled you in. They kept 20% of your cash as a "processing fee". Vera is not impressed.';
    audio.busted();
  } else {
    title.textContent = 'WASTED';
    title.classList.remove('win');
    text.textContent = 'You woke up at Solmar General, 20% lighter. The city is still out there, Rex.';
    audio.busted();
  }
  player.reset(150, -132);
  showScreen('end');
  announce(kind === 'busted' ? 'Busted.' : 'Wasted.');
}
G.onBusted = () => { if (G.screen === 'play') endRun('busted'); };
G.onWasted = () => { if (G.screen === 'play') endRun('wasted'); };

function startGame(fresh) {
  if (fresh) {
    G.cash = 0;
    G.wanted = 0;
    police.clear();
    combat.clearEnemies();
    player.reset(-150, 132);
    if (G.driving) { G.driving.driver = null; G.driving = null; }
  }
  audio.start();
  showScreen('play');
}

function driveControl() {
  const ax = input.axis();
  return {
    throttle: -ax.z,
    steer: -ax.x, // D turns right: heading decreases toward +x when facing north
    handbrake: input.down('Space'),
  };
}

function tryEnterExitCar() {
  if (G.driving) {
    const car = G.driving;
    car.driver = null;
    car.speed = 0;
    G.driving = null;
    player.reset(car.pos.x + Math.cos(car.heading) * 3, car.pos.z - Math.sin(car.heading) * 3);
    player.mesh.visible = true;
    announce('Out of the car.');
    return;
  }
  const car = vehicles.nearestCar(player.pos.x, player.pos.z, 3.6);
  if (car) {
    if (car.parked) {
      G.addWanted(1);
      announce('Car stolen. The police have been called.');
    }
    G.driving = car;
    car.driver = 'player';
    car.parked = false;
    player.mesh.visible = false;
    announce(car.type === 'sport' ? 'Nice ride.' : 'Borrowed. The owner will understand. Eventually.');
  }
}

function step(dt) {
  G.time += dt;
  world.update(dt);
  const pressed = input.takePressed();
  if (pressed.has('Escape') && G.screen === 'play') { showScreen('paused'); announce('Paused.'); return; }
  if (pressed.has('KeyE') && G.screen === 'play') tryEnterExitCar();

  if (G.driving) {
    const car = G.driving;
    stepCar(car, dt, driveControl());
    player.pos.set(car.pos.x, 0, car.pos.z);
    rig.follow(dt, { x: car.pos.x, y: 0, z: car.pos.z }, car.heading, 'car', world.colliders);
  } else {
    player.update(dt, input, rig.yaw);
    rig.follow(dt, { x: player.pos.x, y: player.pos.y, z: player.pos.z }, player.heading, 'foot', world.colliders);
  }
  const drag = input.takeDrag();
  if (drag.dx || drag.dy) rig.orbit(drag.dx, drag.dy);
  const wheel = input.takeWheel();
  if (wheel) rig.zoom(wheel);
  vehicles.update(dt, world, null);
  traffic.update(dt, player.pos);
  pedestrians.update(dt, {
    playerX: player.pos.x,
    playerZ: player.pos.z,
    carSpeed: G.driving ? Math.abs(G.driving.speed) : 0,
    gunshot: G.lastGunshot,
  });
  police.update(dt, G);
  combat.update(dt, G);
  effects.update(dt);
  audio.update(dt, G.wanted, police.nearestDist < 90);
  audio.setEngine(G.driving ? Math.abs(G.driving.speed) / 47 : 0, !!G.driving);
  if (player.dead) { G.onWasted(); return; }
  // Cars clip pedestrians: they go down, and the driver takes the heat.
  for (const car of vehicles.cars) {
    if (car.parked || Math.abs(car.speed) < 3) continue;
    for (const ped of pedestrians.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - car.pos.x, ped.z - car.pos.z);
      if (d < 2.4) {
        pedestrians.knockDown(ped, false);
        if (car.driver === 'player') G.addWanted(1);
      }
    }
  }

  // Minimal HUD (the full HUD lands with phase 4).
  const speedEl = document.getElementById('speed');
  if (G.driving) {
    speedEl.classList.remove('hidden');
    speedEl.innerHTML = `${Math.round(Math.abs(G.driving.speed) * 3.6)} <small>km/h</small>`;
  } else {
    speedEl.classList.add('hidden');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (G.screen === 'title') {
    rig.setTitleView(G.time);
    G.time += 0.016;
    world.update(0.016);
    rig.render();
    return;
  }
  if (G.screen !== 'play') {
    audio.setEngine(0, false);
    rig.render();
    return;
  }
  const dt = Math.min((now - (frame.last || now)) / 1000, MAX_FRAME);
  frame.last = now;
  let acc = (frame.acc || 0) + dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  frame.acc = acc;
  rig.render();
}

function wireButtons() {
  document.getElementById('btnstart').addEventListener('click', () => startGame(true));
  document.getElementById('btnresume').addEventListener('click', () => showScreen('play'));
  document.getElementById('btnquit').addEventListener('click', () => showScreen('title'));
  document.getElementById('btnretry').addEventListener('click', () => startGame(true));
  document.getElementById('btntitle2').addEventListener('click', () => showScreen('title'));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && G.screen === 'title') startGame(true);
    else if (e.code === 'Escape' && G.screen === 'paused') showScreen('play');
  });
}

if (shot) {
  const staged = stageShot(shot, G);
  if (staged.screen === 'play') showScreen('play');
  let painted = 0;
  (function paint() {
    rig.render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  wireButtons();
  announce('Solmar Bay. Press Enter or Start engine.');
  requestAnimationFrame(frame);
}
window.__gameReady = true;
// Read-only probe for automated QA: screen, player position, driving state.
window.__probe = () => JSON.stringify({
  screen: G.screen,
  x: Math.round(player.pos.x * 10) / 10,
  z: Math.round(player.pos.z * 10) / 10,
  driving: !!G.driving,
  speed: G.driving ? Math.round(G.driving.speed * 10) / 10 : 0,
  wanted: G.wanted,
  cash: G.cash,
  health: Math.round(player.health),
  policeCars: G.police ? G.police.cruisers.length : 0,
  cops: G.police ? G.police.cops.length : 0,
  enemies: G.combat ? G.combat.enemies.length : 0,
  mission: G.missions ? G.missions.currentIndex : -1,
});
// QA handle for scripted play-tests (spawn enemies, read state).
window.__solmar = G;
