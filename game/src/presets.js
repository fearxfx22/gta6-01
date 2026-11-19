// Screenshot presets: deterministic scene setups for ?shot=chase|street|
// mission|title. Each one places Rex, the cars, the cops and the camera so a
// single frame shows a different face of the game. All of them run on the
// seeded world, so the same seed rebuilds the same shot.

import { LANDMARKS } from './town.js';

export function applyPreset(name, g) {
  const { hero, rides, chase, story, gun, follow, display, camera } = g;
  if (name === 'chase') {
    // Rex driving up the road at speed, two police cars on his tail, 3 stars.
    // Camera sits behind the car (yaw = heading + PI), low, so the road and
    // the pursuit both read in one frame.
    const car = rides.parked[3];
    hero.teleport(car.x, car.z);
    hero.enterCar(car, null);
    car.speed = 21;
    car.heading = Math.PI; // north
    hero.x = car.x;
    hero.z = car.z;
    chase.setWanted(3);
    chase.spawnPoliceAt(car.x - 5, car.z + 8);
    chase.spawnPoliceAt(car.x + 5, car.z + 13);
    follow.setYawPitch(0.15, 0.16);
    story.index = 0;
    story.start({ chase, onDialogue: (s, t) => display.showDialogue(s, t) });
    display.setObjective('1 · First Gear', 'Deliver the car to Vera\'s Garage', null);
    return 'playing';
  }
  if (name === 'street') {
    // Rex on foot on the Strip, a traffic car rolling past, pedestrians on
    // the walks. Camera behind him, low, looking up the street.
    hero.teleport(16, 0);
    hero.heading = Math.PI; // facing north, up the Strip
    const passer = rides.spawnCar(16, 48, Math.PI, 0x3d6f9e);
    passer.target = { x: 16, z: -80 };
    passer.cameFrom = { x: 16, z: 80 };
    passer.speed = 9;
    follow.setYawPitch(0.15, 0.22);
    story.index = 0;
    story.start({ chase, onDialogue: (s, t) => display.showDialogue(s, t) });
    display.setObjective('1 · First Gear', 'Steal a car — walk up to one and press E', null);
    return 'playing';
  }
  if (name === 'mission') {
    // Mission 2 at the docks: the beacon, the package run, Vera on the line.
    // Rex in a car on the Strip heading north, camera behind him so the road
    // to the docks and the beacon read in the frame.
    const car = rides.parked[2];
    hero.teleport(car.x, car.z);
    hero.enterCar(car, null);
    car.heading = Math.PI;
    car.speed = 0;
    hero.x = car.x;
    hero.z = car.z;
    story.index = 1;
    story.start({ chase, onDialogue: (s, t) => display.showDialogue(s, t) });
    display.showDialogue('Vera Solano', 'A package is waiting at the North Docks. Pick it up, bring it to Marina Cafe.');
    follow.setYawPitch(0.3, 0.2);
    return 'playing';
  }
  if (name === 'title') {
    // Title screen over a high sunset vista of the whole city.
    camera.position.set(-60, 55, 170);
    camera.lookAt(0, 8, -20);
    follow.setYawPitch(0.6, 0.3);
    return 'title';
  }
  return null;
}
