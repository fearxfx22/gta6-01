// The story: five chained jobs for Vera Solano. Each mission is a list of
// steps — get in a car, reach a place, wait, clear the crew, lose the cops —
// and pays out when the last step lands. Objective checks always use the
// car's position while Rex is driving, and deliver zones are wide enough for
// a car to reach.

import * as THREE from 'three';
import { LANDMARKS } from './town.js';

const VERA = 'Vera Solano';

const MISSIONS = [
  {
    id: 1, title: 'First Gear', reward: 400,
    intro: "Rex. You owe me, and the city doesn't wait. Steal a car and bring it to my garage. Any car. Don't get cute.",
    steps: [
      { type: 'enterCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', pos: LANDMARKS.garage, radius: 10, text: "Deliver the car to Vera's Garage" },
    ],
    done: 'Good. One down. The debt is still large, Rex.',
  },
  {
    id: 2, title: 'The Pickup', reward: 700,
    intro: 'A package is waiting at the North Docks. Pick it up, bring it to Marina Cafe. The yard guards are jumpy — if they call it in, drive like you mean it.',
    steps: [
      { type: 'goto', pos: LANDMARKS.docks, radius: 7, text: 'Go to the North Docks' },
      { type: 'wait', pos: LANDMARKS.docks, radius: 7, seconds: 3, text: 'Grab the package…' },
      { type: 'goto', pos: LANDMARKS.cafe, radius: 10, text: 'Deliver the package to Marina Cafe' },
    ],
    done: 'Clean. The cafe crowd never saw a thing.',
  },
  {
    id: 3, title: 'Hot Pursuit', reward: 900,
    intro: "The pickup went loud, Rex. Three stars, and every cop in Solmar Bay knows your car. Lose them, then lay low at Palm Court. Don't come to my garage with a tail.",
    steps: [
      { type: 'loseCops', text: 'Lose the cops — break away and stay quiet' },
      { type: 'goto', pos: LANDMARKS.palmCourt, radius: 8, text: 'Lay low at Palm Court' },
    ],
    done: 'You shook them. Breathe. We are not done.',
  },
  {
    id: 4, title: 'The Exchange', reward: 1200,
    intro: "The Tide Kings have my case at the docks, and they don't hand things over. Take out all four, grab the case, bring it home. Watch your back.",
    steps: [
      { type: 'goto', pos: LANDMARKS.docks, radius: 10, text: 'Go to the North Docks' },
      { type: 'eliminate', text: 'Take out the four Tide Kings' },
      { type: 'wait', pos: LANDMARKS.docks, radius: 7, seconds: 2, text: 'Grab the case…' },
      { type: 'goto', pos: LANDMARKS.garage, radius: 10, text: "Bring the case to Vera's Garage" },
    ],
    done: 'The case is mine again. One job left, Rex. The big one.',
  },
  {
    id: 5, title: 'Sunset Run', reward: 2000,
    intro: "Last job. The case goes to the lighthouse before sunset — 150 seconds, two stars on your tail. Make it, and the debt is clear. Miss it, and you're mine forever.",
    steps: [
      { type: 'timed', pos: LANDMARKS.lighthouse, radius: 10, seconds: 150, text: 'Get the case to the lighthouse' },
    ],
    done: 'The debt is clear, Rex. Solmar Bay is yours now.',
  },
];

export function buildStory(scene, rng) {
  // Beacon: a glowing pillar marking the current objective.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffc94d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.18, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const story = {
    index: 0, // mission 0..4
    step: 0,
    stepT: 0,
    timer: 0,
    active: false,
    complete: false,
    crewSpawned: false,
    guardsSpawned: false,
    heatTimer: 0,
    current() {
      return MISSIONS[this.index] || null;
    },
    currentStep() {
      const m = this.current();
      return m ? m.steps[this.step] : null;
    },
    start(events) {
      this.active = true;
      this.step = 0;
      this.stepT = 0;
      this.crewSpawned = false;
      this.guardsSpawned = false;
      const m = this.current();
      if (!m) return;
      if (m.id === 3) events.chase.setWanted(3);
      if (m.id === 5) {
        events.chase.setWanted(2);
        this.timer = 150;
      }
      events.onDialogue(VERA, m.intro);
    },
    // The objective the HUD, beacon and minimap point at.
    objective() {
      const s = this.currentStep();
      if (!s) return null;
      if (s.type === 'enterCar' || s.type === 'eliminate' || s.type === 'loseCops') {
        return { text: s.text, pos: null };
      }
      return { text: s.text, pos: s.pos };
    },
    update(dt, ctx) {
      const { hero, chase, gun, events } = ctx;
      if (!this.active || this.complete) return;
      const m = this.current();
      if (!m) return;
      const s = this.currentStep();
      if (!s) return;
      this.stepT += dt;
      const focus = hero.focus();

      // Beacon follows the current target.
      const obj = this.objective();
      if (obj && obj.pos) {
        beacon.visible = true;
        ring.visible = true;
        beacon.position.set(obj.pos.x, 15, obj.pos.z);
        ring.position.set(obj.pos.x, 0.4 + Math.sin(performance.now() * 0.003) * 0.25, obj.pos.z);
        ring.rotation.z += dt * 0.8;
      } else {
        beacon.visible = false;
        ring.visible = false;
      }

      let done = false;
      if (s.type === 'enterCar') {
        done = !!hero.inCar;
      } else if (s.type === 'goto' || s.type === 'timed') {
        const dx = focus.x - s.pos.x;
        const dz = focus.z - s.pos.z;
        done = dx * dx + dz * dz < s.radius * s.radius;
        if (s.type === 'timed') {
          this.timer -= dt;
          if (this.timer <= 0 && !done) {
            events.onMissionFailed('Out of time — the sun set on the run.');
            return;
          }
        }
      } else if (s.type === 'wait') {
        const dx = focus.x - s.pos.x;
        const dz = focus.z - s.pos.z;
        if (dx * dx + dz * dz < s.radius * s.radius) {
          this.zoneT = (this.zoneT || 0) + dt;
          done = this.zoneT >= s.seconds;
        } else {
          this.zoneT = 0;
        }
      } else if (s.type === 'eliminate') {
        if (!this.crewSpawned) {
          this.crewSpawned = true;
          for (const [cx, cz] of [[-14, -126], [10, -132], [-4, -120], [24, -128]]) {
            gun.spawnCrew(cx, cz, rng);
          }
          events.onDialogue(VERA, 'Four of them. Make it quick.');
        }
        done = gun.crew.every((c) => !c.alive);
      } else if (s.type === 'loseCops') {
        // After 25 seconds the heat starts bleeding off on its own — Rex is losing them.
        if (this.stepT > 25) {
          this.heatTimer += dt;
          if (this.heatTimer > 8 && chase.wanted > 0) {
            chase.wanted -= 1;
            this.heatTimer = 0;
          }
        }
        done = chase.wanted === 0;
      }

      // Mission 2: the yard guards call it in when Rex reaches the docks.
      if (m.id === 2 && this.step >= 1 && !this.guardsSpawned) {
        this.guardsSpawned = true;
        chase.addWanted(1);
        events.onDialogue(VERA, 'They called it in. One star — keep moving.');
      }

      if (done) {
        this.step += 1;
        this.stepT = 0;
        this.zoneT = 0;
        if (this.step >= m.steps.length) {
          this.completeMission(events);
        }
      }
    },
    completeMission(events) {
      const m = this.current();
      events.onMissionComplete(m);
      events.onDialogue(VERA, m.done);
      this.index += 1;
      this.active = false;
      if (this.index >= MISSIONS.length) {
        this.complete = true;
        events.onStoryComplete();
      }
    },
    failMission(events, reason) {
      this.active = false;
      events.onMissionFailed(reason);
    },
    resume(index) {
      this.index = Math.min(index, MISSIONS.length - 1);
      this.complete = this.index >= MISSIONS.length;
    },
  };
  return story;
}
