# Solmar Bay — Sunset City Stories

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/fearxfx22/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/fearxfx22/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

An original open-world crime game in the browser. You are **Rex Dalton**, a getaway
driver with a debt and a fast car to win back. **Vera Solano** has five jobs for you
across **Solmar Bay** — a sun-soaked coastal city of avenues, a beach, container
docks, a marina and a lighthouse. Steal cars, lose the police, take out the
Tide Kings, and make the sunset run before the clock runs out.

## Play

Open `game/index.html` in a desktop browser (or serve the repo with
`node serve.ts` and open http://localhost:8080). No build step, no network at
runtime — three.js is vendored under `game/vendor/`, all sound is synthesized
live with WebAudio.

| Key | Action |
| --- | --- |
| W A S D | Move on foot / drive |
| Shift | Sprint |
| E | Enter / steal a car |
| Mouse drag | Look around |
| Click | Shoot the pistol |
| Space | Handbrake (in a car) / jump (on foot) |
| R | Restart the current mission |
| Esc | Pause |

## What's in the city

- **Drive and walk** — arcade car physics (drift, handbrake, sand slowdown) and
  on-foot movement with a chase camera, across a 7×7-block grid with a beach and
  ocean to the east, container docks to the north, and a marina and lighthouse
  to the south.
- **Traffic and pedestrians** — 14 cars driving the road graph with lane
  discipline and braking, 24 locals strolling the sidewalks who flee gunshots
  and fast cars.
- **Wanted level** — 0 to 5 stars. Stealing cars, hitting pedestrians and
  shooting raise it; police cruisers chase and ram, foot cops close in to
  arrest you. Lose them to cool down. Getting busted or wasted costs 20% of
  your cash.
- **Combat** — hitscan pistol with tracers, muzzle flash, hitmarkers and
  headshots; rival gunmen shoot back.
- **Five missions, one story** — First Gear, The Pickup, Hot Pursuit,
  The Exchange and Sunset Run, with Vera's dialogue, gold beacons, and cash
  rewards up to $2,000.
- **HUD and save** — health, cash, wanted stars, objective with distance,
  speedometer, live minimap, and progress saved in the browser
  (localStorage) with a Continue button on the title screen.

## Layout

```
game/
  index.html        start screen, HUD, import map
  src/
    config.js       tuning: world, player, cars, wanted, police, combat
    random.js       seeded RNG + math helpers
    input.js        keyboard + mouse
    world.js        the city: grid, beach, docks, marina, lighthouse
    render.js       renderer, lighting, chase camera
    player.js       Rex on foot
    vehicles.js     car meshes + arcade physics
    traffic.js      road-graph traffic AI
    pedestrians.js  sidewalk locals
    police.js       cruisers, foot cops, wanted decay
    combat.js       hitscan pistol + enemy gunmen
    effects.js      particles, tracers, muzzle flash
    audio.js        WebAudio synth: engine, sirens, shots, music
    missions.js     the five jobs + story
    hud.js          stars, health, cash, minimap, toasts, dialogue
    save.js         localStorage save / load
    shots.js        staged screenshot scenes (?shot=chase|street|mission|title)
  vendor/
    three.module.min.js   three.js 0.160.0 (vendored)
main.ts             builds /output: copies game/ + screenshots/, writes dossier.json
```

Everything in the game is original — own city, names, characters, story and
art. Nothing is borrowed from any existing game.

## Screenshots

1. **chase** — three stars, two cruisers on the sport's tail down the avenue.
2. **street** — Rex on foot among traffic and pedestrians.
3. **mission** — The Exchange: the shootout at the container yard.
4. **title** — the title screen over Solmar Bay at golden hour.

Screenshots are real renders of this game, taken in desktop Chrome from the
staged scenes in `shots.json` (`?shot=chase|street|mission|title&seed=1`).
