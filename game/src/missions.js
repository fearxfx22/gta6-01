// The story: five jobs for Vera Solano across Solmar Bay. Each mission is a
// list of steps — go somewhere, get in a car, lose the heat, take out a crew,
// beat a clock — with a gold beacon in the world and on the minimap, Vera's
// dialogue, and a cash reward at the end. Progress is saved after every job.
import * as THREE from 'three';
import { MISSION_REWARDS } from './config.js';
import { writeSave } from './save.js';

const DOCKS = { x: 60, z: -262 };

const MISSIONS = [
  {
    name: 'First Gear',
    intro: 'Rex. Your car is in my impound lot and your debt is on my books. One job and we start even. Steal a car — any car — and bring it to my garage.',
    steps: [
      { type: 'enterCar', text: 'Steal a car — any car will do. Press E next to one.' },
      { type: 'goto', x: -150, z: 128, r: 12, text: 'Drive it to Vera\'s Garage.' },
    ],
    done: 'Vera: "Not bad. The car stays with me until your debt is clear."',
  },
  {
    name: 'The Pickup',
    intro: 'A package is waiting at the container yard, north docks. Pick it up, bring it to Marina Cafe. Do not open it. Do not drop it. Do not get chatty.',
    steps: [
      { type: 'goto', x: DOCKS.x, z: -250, r: 12, text: 'Pick up the package at the container yard.' },
      { type: 'goto', x: 120, z: 238, r: 12, text: 'Deliver the package to Marina Cafe.' },
    ],
    done: 'Vera: "Clean. The client sends his regards — and your cut."',
  },
  {
    name: 'Hot Pursuit',
    intro: 'Change of plan, Rex. The yard guards called your plate in — you have got three stars and every cruiser in the bay. Lose them, then lay low at Palm Court. Do not get caught.',
    steps: [
      { type: 'escape', text: 'Lose the cops — get your wanted level to zero.' },
      { type: 'goto', x: 150, z: 128, r: 12, text: 'Lay low at Palm Court.' },
    ],
    done: 'Vera: "You drive like the devil himself. I like that in an employee."',
  },
  {
    name: 'The Exchange',
    intro: 'The Tide Kings took my case at the docks and they are not giving it back nicely. Four of them, armed. Take them out, grab the case, bring it home.',
    steps: [
      { type: 'goto', x: DOCKS.x, z: -250, r: 16, text: 'Meet the Tide Kings at the container yard.' },
      { type: 'killAll', text: 'Take out the Tide Kings crew.' },
      { type: 'goto', x: DOCKS.x, z: -250, r: 10, text: 'Grab the case.' },
      { type: 'goto', x: -150, z: 128, r: 12, text: 'Bring the case back to Vera\'s Garage.' },
    ],
    done: 'Vera: "The case is safe. The Tide Kings will think twice next time."',
  },
  {
    name: 'Sunset Run',
    intro: 'Last job, Rex. The case goes to the lighthouse keeper before sunset — 150 seconds, and the whole bay is watching. Drive like your debt depends on it. It does.',
    steps: [
      { type: 'goto', x: -120, z: 256, r: 12, text: 'Deliver the case to the lighthouse.', seconds: 150 },
    ],
    done: 'Vera: "Debt clear, Rex. The car is yours. Solmar Bay is yours."',
  },
];

export function createMissions(scene, G) {
  // Gold beacon: a light pillar + a floating diamond over the current target.
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc24b, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffc24b, transparent: true, opacity: 0.9 }),
  );
  scene.add(pillar, diamond);
  pillar.visible = false;
  diamond.visible = false;

  let currentIndex = 0;
  let stepIndex = 0;
  let timer = 0;
  let enemiesSpawned = false;
  let active = false;

  function current() { return MISSIONS[currentIndex]; }
  function step() { return current() ? current().steps[stepIndex] : null; }

  function showBeacon(x, z) {
    pillar.position.set(x, 17, z);
    diamond.position.set(x, 7, z);
    pillar.visible = true;
    diamond.visible = true;
  }
  function hideBeacon() { pillar.visible = false; diamond.visible = false; }

  function startMission(i) {
    currentIndex = i;
    stepIndex = 0;
    timer = 0;
    enemiesSpawned = false;
    active = true;
    const m = current();
    G.hud.dialogue('Vera', m.intro, 6000);
    G.hud.toast(`Mission ${i + 1}: ${m.name}`);
    if (i === 2) G.setWanted(3);
    if (i === 4) G.setWanted(2);
    G.audio.mission();
    enterStep();
  }

  function enterStep() {
    const s = step();
    if (!s) return;
    if (s.type === 'goto' || s.type === 'pickup') showBeacon(s.x, s.z);
    else if (s.type === 'killAll') {
      hideBeacon();
      if (!enemiesSpawned) {
        enemiesSpawned = true;
        const spots = [[40, -265], [80, -265], [55, -279], [75, -279]]; // open lanes between container rows
        for (const [x, z] of spots) G.combat.spawnEnemy(x, z);
        G.hud.toast('Four Tide Kings. They shoot first.');
      }
    } else if (s.type === 'escape') hideBeacon();
    else if (s.type === 'enterCar') hideBeacon();
    if (s.seconds) timer = s.seconds;
  }

  function completeStep() {
    stepIndex += 1;
    G.audio.pickup();
    if (stepIndex >= current().steps.length) completeMission();
    else enterStep();
  }

  function completeMission() {
    const reward = MISSION_REWARDS[currentIndex];
    G.cash += reward;
    G.missionsDone[currentIndex] = true;
    writeSave(G.missionsDone, G.cash);
    G.hud.banner('Mission complete', `${current().name} — +$${reward}`);
    G.hud.dialogue('Vera', current().done, 5000);
    G.audio.mission();
    active = false;
    hideBeacon();
    G.combat.clearEnemies();
    if (currentIndex + 1 < MISSIONS.length) {
      const next = currentIndex + 1;
      setTimeout(() => { if (!active) startMission(next); }, 4500);
    } else {
      setTimeout(() => {
        if (G.screen === 'play') G.hud.banner('Solmar Bay is yours', 'Every job done. The city is your playground now.');
      }, 4500);
    }
  }

  function failMission(reason) {
    G.hud.toast(reason);
    G.hud.dialogue('Vera', 'Again, Rex. From the top.', 4000);
    G.combat.clearEnemies();
    startMission(currentIndex);
  }

  return {
    get currentIndex() { return currentIndex; },
    activeMission() { return active ? current() : null; },
    objectiveText() {
      if (!active) return 'Explore Solmar Bay. Steal a car with E, lose the cops, find work.';
      const s = step();
      if (!s) return '';
      if (s.seconds) return `${s.text} — ${Math.ceil(timer)}s left`;
      return s.text;
    },
    target() {
      if (!active) return null;
      const s = step();
      return s && (s.type === 'goto' || s.type === 'pickup') ? { x: s.x, z: s.z } : null;
    },
    startFromSave(missionsDone) {
      const next = missionsDone.findIndex((d) => !d);
      if (next === -1) { active = false; return; }
      startMission(next);
    },
    restart() {
      if (!active) return;
      G.combat.clearEnemies();
      G.setWanted(0);
      startMission(currentIndex);
    },
    update(dt) {
      if (!active) return;
      const s = step();
      if (!s) return;
      const p = G.player.pos;
      diamond.rotation.y += dt * 2;
      diamond.position.y = 7 + Math.sin(G.time * 2) * 0.5;
      if (s.seconds) {
        timer -= dt;
        if (timer <= 0) { failMission('Too slow — the lighthouse keeper waited for no one.'); return; }
      }
      if (s.type === 'goto') {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < s.r) {
          if (currentIndex === 1 && stepIndex === 0) {
            G.setWanted(Math.max(G.wanted, 1));
            G.hud.dialogue('Vera', 'The yard guards called it in. You have got heat — drive careful.', 4000);
          }
          completeStep();
        }
      } else if (s.type === 'enterCar') {
        if (G.driving) completeStep();
      } else if (s.type === 'escape') {
        if (G.wanted === 0) completeStep();
      } else if (s.type === 'killAll') {
        if (G.combat.enemies.length === 0) completeStep();
      }
    },
  };
}
