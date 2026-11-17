// Solmar Bay tuning: every number the game balances on lives here.
export const WORLD = {
  block: 46,          // block interior size (m)
  road: 14,           // road width (m)
  pitch: 60,          // block + road
  grid: 7,            // roads per axis
  half: 210,          // city half-extent (m)
  beachX: 236,        // sand starts here
  oceanX: 268,        // water starts here
  docksZ: -236,       // container yard starts here (north)
  marinaZ: 236,       // marina / lighthouse strip (south)
};

export const PLAYER = {
  walkSpeed: 4.6,
  sprintSpeed: 8.2,
  accel: 42,
  jumpSpeed: 7.5,
  gravity: 22,
  radius: 0.55,
  health: 100,
  regenDelay: 5,
  regenRate: 9,
};

export const CAR = {
  accel: 15,
  brake: 34,
  reverseAccel: 10,
  maxSpeed: 37,
  maxSport: 47,
  maxReverse: 12,
  steerMax: 0.55,
  steerSpeed: 3.2,
  grip: 8.5,
  driftGrip: 3.2,
  radius: 2.3,
};

export const WANTED = {
  maxStars: 5,
  decaySeconds: 26,   // unseen this long -> lose one star
  stealCar: 1,         // stealing a parked car
  jackCar: 1,          // jacking a moving car
  hitPed: 1,
  shootPed: 1,
  killCop: 1,
  shootCop: 1,
};

export const TRAFFIC_COUNT = 14; // cars driving the road graph
export const PED_COUNT = 24;     // locals on the sidewalks

export const CRASH = {
  cooldown: 0.5,   // s between crash feedback bursts
  minRelSpeed: 4,  // relative speed (m/s) that counts as a crash
  shake: 0.35,     // camera trauma added per crash
};

export const FOV_KICK = 10; // extra degrees of camera FOV at top speed

export const POLICE = {
  maxCars: 10,
  spawnDist: 70,
  despawnDist: 190,
  chaseSpeed: 34,
  ramDamage: 6,
  bustDist: 2.4,       // cop this close on foot starts the arrest
  bustTime: 2.2,
};

export const COMBAT = {
  pistolDamage: 34,
  headshotMult: 2,
  fireInterval: 0.16,
  range: 90,
  spread: 0.012,
  enemyDamage: 9,
  enemyInterval: 0.9,
  enemyAccuracy: 0.42,
};

export const SAVE_KEY = 'solmarbay-save-v1';
export const MISSION_REWARDS = [400, 700, 900, 1200, 2000];
