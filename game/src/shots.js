// Screenshot scenes behind ?shot=title|street|chase|mission. Each one plays
// the real game forward from a fresh state for a fixed number of steps, so the
// frame is what a short session really looks like and the same seed always
// gives the same frame. Traffic, peds and police are placed deliberately near
// the camera so the shot actually shows them.
import { stepCar } from './vehicles.js';

const STEP = 1 / 60;

export function stageShot(name, G) {
  const { rig, world, player, traffic, pedestrians, vehicles, police, combat, missions, hud } = G;

  /** Run the world forward `seconds` at 60 Hz, with an optional per-step hook. */
  function sim(seconds, extra) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i += 1) {
      const dt = STEP;
      traffic.update(dt, player.pos);
      pedestrians.update(dt, {
        playerX: player.pos.x,
        playerZ: player.pos.z,
        carSpeed: G.driving ? Math.abs(G.driving.speed) : 0,
        gunshot: null,
      });
      vehicles.update(dt, world, null); // syncs car meshes to their positions
      police.update(dt, G);
      combat.update(dt, G);
      missions.update(dt);
      world.update(dt);
      if (extra) extra(dt);
    }
  }

  /** Let the camera settle on its subject for half a second. */
  function settleCamera(mode, seconds = 0.5) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i += 1) {
      const focus = G.driving
        ? { x: G.driving.pos.x, y: 0, z: G.driving.pos.z }
        : { x: player.pos.x, y: player.pos.y, z: player.pos.z };
      const heading = G.driving ? G.driving.heading : player.heading;
      rig.follow(STEP, focus, heading, mode, world.colliders);
    }
  }

  function nodeAt(x, z) {
    return world.nodes.findIndex((n) => n.x === x && n.z === z);
  }

  /** Keep the staged car moving east down the avenue while the sim runs. */
  function driveEast(car) {
    return (dt) => {
      stepCar(car, dt, { throttle: 0.5, steer: 0, handbrake: false });
      player.pos.set(car.pos.x, 0, car.pos.z);
    };
  }

  if (name === 'street') {
    // On foot on a busy avenue: player mid-stride, traffic rolling past,
    // locals on the sidewalk.
    player.reset(-30, 128);
    const fakeInput = { axis: () => ({ x: 0, z: -1 }), down: () => false };
    player.update(0.5, fakeInput, Math.PI * 0.9);
    rig.setYaw(Math.PI * 0.9 + Math.PI);
    // Three traffic cars on the same avenue ahead of the player, heading east.
    const spots = [
      [-8, 117],
      [20, 123],
      [48, 117],
    ];
    for (let i = 0; i < 3; i += 1) {
      const car = traffic.cars[i];
      car.pos.set(spots[i][0], 0, spots[i][1]);
      car.heading = Math.PI / 2;
      car.speed = 9;
      car.ai.node = nodeAt(-120, 120);
      car.ai.target = nodeAt(0, 120);
    }
    // Four locals strolling the avenue ahead of the player, in frame.
    const walkers = [
      [-24, 124],
      [-36, 122],
      [-20, 118],
      [-40, 118],
    ];
    for (let i = 0; i < 4; i += 1) {
      const ped = pedestrians.peds[i];
      ped.x = walkers[i][0];
      ped.z = walkers[i][1];
      ped.tx = walkers[i][0] + 20;
      ped.tz = walkers[i][1];
      ped.state = 'walk';
    }
    sim(1.5);
    settleCamera('foot');
    hud.update(0.016);
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // The cover: Rex in the orange sport, two cruisers on his tail, three stars.
    const car = vehicles.nearestCar(-132, 128, 6);
    car.pos.set(-90, 0, 117);
    car.heading = Math.PI / 2;
    car.speed = 17;
    car.parked = false;
    car.driver = 'player';
    G.driving = car;
    player.mesh.visible = false;
    player.pos.set(car.pos.x, 0, car.pos.z);
    player.setHeading(Math.PI / 2);
    G.setWanted(3);
    rig.setYaw(Math.PI / 2 + Math.PI);
    sim(2, driveEast(car));
    // Bring two cruisers into frame: one in the next lane beside the sport,
    // one cutting across ahead — both visible from the chase camera.
    for (let i = 0; i < Math.min(2, police.cruisers.length); i += 1) {
      const pc = police.cruisers[i].car;
      if (i === 0) {
        pc.pos.set(car.pos.x - 4, 0, car.pos.z - 7.5);
        pc.speed = 20;
      } else {
        pc.pos.set(car.pos.x + 14, 0, car.pos.z + 7.5);
        pc.speed = 18;
      }
      pc.heading = car.heading;
    }
    // Two locals ahead on the avenue, so the chase has traffic to thread through.
    const aheadSpots = [
      [car.pos.x + 42, 117],
      [car.pos.x + 66, 123],
    ];
    for (let i = 0; i < 2; i += 1) {
      const tc = traffic.cars[3 + i];
      tc.pos.set(aheadSpots[i][0], 0, aheadSpots[i][1]);
      tc.heading = Math.PI / 2;
      tc.speed = 9;
      tc.ai.node = nodeAt(120, 120);
      tc.ai.target = nodeAt(180, 120);
    }
    sim(0.5, driveEast(car));
    settleCamera('car');
    hud.update(0.016);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Mission 4, the shootout: Rex at the container yard, four Tide Kings
    // closing in, the gold beacon over the case.
    missions.startFromSave([true, true, true, false, false]);
    player.reset(60, -246);
    player.setHeading(Math.PI); // face north, into the yard
    rig.setYaw(Math.PI + Math.PI);
    G.setWanted(1);
    // Walk into the meet point so the mission advances to the kill step.
    sim(0.6, () => {
      player.pos.z -= 0.2;
    });
    sim(2);
    settleCamera('foot');
    hud.update(0.016);
    return { screen: 'play' };
  }

  // Default: title orbit over the city at golden hour.
  for (let i = 0; i < 120; i += 1) world.update(STEP);
  rig.setTitleView(14);
  return { screen: 'title' };
}
