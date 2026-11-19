// Missions for Solmar Bay: Rex owes Vera Solano a debt, and pays it off
// over five chained jobs. Each mission is a list of steps — go somewhere,
// get in a car, deliver, escape the law, clear out a crew, beat a clock —
// with Vera's dialogue between them. The module owns the mission state,
// the 3D beacon marker, the crew for The Exchange, and the rewards.

import * as THREE from 'three';
import { dist2D, clamp, PLACES } from './util.js';
import { makeCrewMember } from './weapons.js';
import { setWanted, addHeat } from './police.js';

const MISSION_DEFS = [
  {
    id: 'first-gear',
    name: 'First Gear',
    reward: 400,
    intro: "Vera: Rex. You owe me, and the meter is running. First job is simple — take any car on the street and bring it to my garage. Don't scratch it. Much.",
    steps: [
      { type: 'enterCar', text: 'Steal a car — get in any car on the street (E)' },
      { type: 'deliver', at: PLACES.veraGarage, text: "Deliver the car to Vera's Garage" },
    ],
    done: "Vera: Not bad. The car is clean enough. Four hundred, as promised. Don't spend it all in one place — you still owe me plenty.",
  },
  {
    id: 'the-pickup',
    name: 'The Pickup',
    reward: 700,
    intro: "Vera: A package is waiting at the north docks, container yard. Bring it to Marina Cafe. The yard guards don't like visitors — if they call it in, you'll have company.",
    steps: [
      { type: 'goto', at: PLACES.containerYard, text: 'Go to the container yard at the north docks' },
      { type: 'collect', at: PLACES.containerYard, text: 'Pick up the package' },
      { type: 'deliver', at: PLACES.marinaCafe, text: 'Deliver the package to Marina Cafe' },
    ],
    done: "Vera: Smooth. Seven hundred. The cafe crowd never saw a thing.",
  },
  {
    id: 'hot-pursuit',
    name: 'Hot Pursuit',
    reward: 900,
    intro: "Vera: The law is on you, Rex — three stars and climbing. Lose them. When the heat is gone, lay low at Palm Court until I call. Drive like you mean it.",
    startWanted: 3,
    steps: [
      { type: 'escape', text: 'Lose the cops — get your wanted level to zero' },
      { type: 'laylow', at: PLACES.palmCourt, seconds: 5, text: 'Lay low at Palm Court' },
    ],
    done: "Vera: They lost you. Nine hundred. You're learning, Rex.",
  },
  {
    id: 'the-exchange',
    name: 'The Exchange',
    reward: 1200,
    intro: "Vera: The Tide Kings took my case at the docks. Four of them, armed. Take it back — all four — and bring the case to my garage. Watch your back.",
    steps: [
      { type: 'goto', at: PLACES.containerYard, text: 'Go to the docks' },
      { type: 'killAll', text: 'Take out the Tide Kings crew (4)' },
      { type: 'collect', at: PLACES.containerYard, text: 'Take the case' },
      { type: 'deliver', at: PLACES.veraGarage, text: "Bring the case to Vera's Garage" },
    ],
    done: "Vera: The case is mine again. Twelve hundred. One job left, Rex. The big one.",
  },
  {
    id: 'sunset-run',
    name: 'Sunset Run',
    reward: 2000,
    intro: "Vera: Last run. The case goes to the lighthouse, and it goes now — 150 seconds. The law will be on you from the start. Make it, and your debt is clear.",
    startWanted: 2,
    steps: [
      { type: 'timed', at: PLACES.lighthouse, seconds: 150, text: 'Deliver the case to the lighthouse — 150 seconds!' },
    ],
    done: "Vera: Debt clear, Rex. The car is yours. Solmar Bay is yours.",
  },
];

export function makeMissions(scene) {
  // The beacon: a tall light pillar + a floating diamond at the target.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.4, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 30;
  beacon.add(pillar);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb020, emissiveIntensity: 1.4, roughness: 0.3 }),
  );
  gem.position.y = 6;
  beacon.add(gem);
  beacon.visible = false;
  scene.add(beacon);
  return {
    defs: MISSION_DEFS,
    index: 0, // which mission is active (0..4); 5 = all done
    step: 0,
    active: false,
    started: false,
    timer: 0,
    laylowTimer: 0,
    beacon,
    gem,
    crew: [],
    crewSpawned: false,
    packageTaken: false,
    caseTaken: false,
    cash: 0,
    completedCount: 0,
  };
}

function currentDef(m) {
  return m.defs[m.index] ?? null;
}

function currentStep(m) {
  const d = currentDef(m);
  return d ? d.steps[m.step] : null;
}

export function missionObjective(m) {
  if (!m.active) {
    if (m.index >= m.defs.length) return 'All missions complete — Solmar Bay is yours.';
    return 'Talk to Vera to start the next job (press M).';
  }
  const s = currentStep(m);
  if (!s) return '';
  if (s.type === 'timed') {
    return `${s.text} — ${Math.max(0, Math.ceil(m.timer))}s left`;
  }
  if (s.type === 'killAll') {
    const left = m.crew.filter((c) => !c.dead).length;
    return `${s.text} — ${left} left`;
  }
  return s.text;
}

export function missionTarget(m) {
  const s = currentStep(m);
  if (!s || !s.at) return null;
  return s.at;
}

export function startMission(m, ctx) {
  const d = currentDef(m);
  if (!d || m.active) return false;
  m.active = true;
  m.started = true;
  m.step = 0;
  m.timer = 0;
  m.laylowTimer = 0;
  m.crewSpawned = false;
  m.packageTaken = false;
  m.caseTaken = false;
  if (d.startWanted) setWanted(ctx.wanted, d.startWanted);
  if (d.id === 'sunset-run') m.timer = 150;
  ctx.say('Vera', d.intro);
  ctx.setObjective(missionObjective(m));
  placeBeacon(m);
  return true;
}

function placeBeacon(m) {
  const t = missionTarget(m);
  if (t) {
    m.beacon.position.set(t.x, 0, t.z);
    m.beacon.visible = true;
  } else {
    m.beacon.visible = false;
  }
}

function advanceStep(m, ctx) {
  m.step += 1;
  const d = currentDef(m);
  if (m.step >= d.steps.length) {
    completeMission(m, ctx);
    return;
  }
  const s = currentStep(m);
  if (s.type === 'timed') m.timer = s.seconds;
  if (s.type === 'laylow') m.laylowTimer = s.seconds;
  ctx.setObjective(missionObjective(m));
  placeBeacon(m);
}

function completeMission(m, ctx) {
  const d = currentDef(m);
  m.cash += d.reward;
  m.completedCount += 1;
  m.active = false;
  m.beacon.visible = false;
  ctx.say('Vera', d.done);
  ctx.onMissionComplete(d, m.cash);
  m.index += 1;
  m.step = 0;
  if (m.index < m.defs.length) {
    ctx.setObjective('Job done. Press M for the next job from Vera.');
  } else {
    ctx.setObjective('All missions complete — Solmar Bay is yours.');
  }
  ctx.save();
}

function spawnCrew(m, ctx) {
  if (m.crewSpawned) return;
  m.crewSpawned = true;
  const spots = [
    { x: 30, z: -138 }, { x: 54, z: -152 }, { x: 66, z: -140 }, { x: 44, z: -160 },
  ];
  for (const s of spots) {
    const member = makeCrewMember(s.x, s.z, ctx.scene);
    member.onDeath = () => {
      ctx.addHeat(12);
      ctx.say('Vera', 'One down. Keep going.');
    };
    m.crew.push(member);
  }
}

// One mission step. ctx: {playerPos, inCar, wanted, scene, say, setObjective,
// onMissionComplete, save, addHeat, onPlayerHit, damagePlayer}
export function updateMissions(m, ctx, dt) {
  // Animate the beacon gem.
  if (m.beacon.visible) {
    m.gem.rotation.y += dt * 2;
    m.gem.position.y = 6 + Math.sin(ctx.time * 2) * 0.6;
  }
  if (!m.active) return;
  const d = currentDef(m);
  const s = currentStep(m);
  if (!s) return;
  const p = ctx.playerPos;

  if (s.type === 'timed') {
    m.timer -= dt;
    ctx.setObjective(missionObjective(m));
    if (m.timer <= 0) {
      ctx.say('Vera', "Too slow, Rex. The deal is off — but the debt isn't. Try again.");
      failMission(m, ctx);
      return;
    }
    if (dist2D(p.x, p.z, s.at.x, s.at.z) < 12) {
      advanceStep(m, ctx);
      return;
    }
  } else if (s.type === 'enterCar') {
    if (ctx.inCar) advanceStep(m, ctx);
  } else if (s.type === 'goto' || s.type === 'deliver' || s.type === 'collect') {
    if (dist2D(p.x, p.z, s.at.x, s.at.z) < 12) {
      if (s.type === 'collect') {
        if (d.id === 'the-pickup') {
          m.packageTaken = true;
          addHeat(ctx.wanted, 100); // the yard guards call it in
          ctx.say('Vera', 'Package taken — and the guards called it in. Move!');
        } else {
          m.caseTaken = true;
        }
      }
      advanceStep(m, ctx);
    }
  } else if (s.type === 'escape') {
    if (ctx.wanted.level === 0) advanceStep(m, ctx);
  } else if (s.type === 'laylow') {
    if (dist2D(p.x, p.z, s.at.x, s.at.z) < 10) {
      m.laylowTimer -= dt;
      ctx.setObjective(`${s.text} — ${Math.max(0, Math.ceil(m.laylowTimer))}s`);
      if (m.laylowTimer <= 0) advanceStep(m, ctx);
    } else {
      m.laylowTimer = s.seconds;
      ctx.setObjective(s.text);
    }
  } else if (s.type === 'killAll') {
    spawnCrew(m, ctx);
    const left = m.crew.filter((c) => !c.dead).length;
    ctx.setObjective(missionObjective(m));
    if (left === 0) advanceStep(m, ctx);
  }
}

function failMission(m, ctx) {
  m.active = false;
  m.beacon.visible = false;
  m.index = Math.max(0, m.index); // retry the same mission
  ctx.setObjective('Job failed. Press M to try again.');
}

// Remove crew members from the scene (when a mission ends or restarts).
export function clearCrew(m, scene) {
  for (const c of m.crew) scene.remove(c.mesh);
  m.crew = [];
  m.crewSpawned = false;
}
