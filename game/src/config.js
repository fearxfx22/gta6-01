// Solmar Bay tuning: every number the game balances on lives in this one
// file, so a balance pass never has to hunt through the systems. The values
// below are the shipped balance — change a number here and the whole game
// follows; no system keeps a private copy of a tuned constant.

export const WORLD = {
  block: 46, // block interior size (m)
  road: 14, // road width (m)
  pitch: 60, // block + road
  grid: 7, // roads per axis
  half: 210, // city half-extent (m)
  beachX: 236, // sand starts here
  oceanX: 268, // water starts here
  docksZ: -236, // container yard starts here (north)
  marinaZ: 236, // marina / lighthouse strip (south)
};

export const PLAYER = {
  walkSpeed: 4.6,
  sprintSpeed: 8.2,
  accel: 42,
  jumpSpeed: 7.5,
  gravity: 22,
  radius: 0.55,
  health: 100,
  regenDelay: 5, // seconds of quiet before health starts coming back
  regenRate: 9, // health per second while regenerating
};

export const CAR = {
  accel: 15,
  brake: 34,
  reverseAccel: 10,
  maxSpeed: 37, // m/s, ~133 km/h
  maxSport: 47, // m/s, ~169 km/h
  maxReverse: 12,
  steerMax: 0.55, // radians of front-wheel angle
  steerSpeed: 3.2,
  grip: 8.5, // how fast velocity aligns with heading (1 = no drift)
  driftGrip: 3.2, // grip while handbraking — low enough to slide
  radius: 2.3, // collision circle around a car
};

export const WANTED = {
  maxStars: 5,
  decaySeconds: 26, // unseen this long -> lose one star
  stealCar: 1, // stealing a parked car
  jackCar: 1, // jacking a moving car
  hitPed: 1,
  shootPed: 1,
  killCop: 1,
  shootCop: 1,
};

export const TRAFFIC_COUNT = 14; // cars driving the road graph
export const PED_COUNT = 24; // locals on the sidewalks

export const CRASH = {
  cooldown: 0.5, // seconds between crash feedback bursts
  minRelSpeed: 4, // relative speed (m/s) that counts as a crash
  shake: 0.35, // camera trauma added per crash
};

export const FOV_KICK = 10; // extra degrees of camera FOV at top speed

export const POLICE = {
  maxCars: 10, // cruisers on the road at once, however hot it gets
  spawnDist: 70, // cruisers spawn at least this far from the player
  despawnDist: 190, // further than this and the chase gives up / relocates
  chaseSpeed: 34,
  ramDamage: 6, // health lost when a cruiser rams the player's car
  bustDist: 2.4, // a cop this close on foot starts the arrest
  bustTime: 2.2, // seconds held before the arrest lands
};

export const COMBAT = {
  pistolDamage: 34,
  headshotMult: 2,
  fireInterval: 0.16, // seconds between shots
  range: 90, // metres — the pistol is useless past this
  spread: 0.012,
  enemyDamage: 9, // health lost per enemy hit
  enemyInterval: 0.9, // seconds between enemy shots
  enemyAccuracy: 0.42, // chance an enemy shot lands
};

export const SAVE_KEY = 'solmarbay-save-v1';
export const MISSION_REWARDS = [400, 700, 900, 1200, 2000];
