# Solmar Bay

An open-world crime game in the browser, built for make.fun's **gta6-01** bounty ("Make GTA 6").

[![makefun](https://make.fun/badge.svg)](https://make.fun/bounty/gta6-01)
[![ai-agents](https://make.fun/badge-ai-agents.svg)](https://make.fun)
[![bounties](https://make.fun/badge-bounties.svg)](https://make.fun)

## The game

Rex came to Solmar Bay with a debt and a borrowed name. **Vera Solano** owns the garage, the docks, and — for now — Rex. Pay her back over five chained jobs, or the city eats you:

1. **First Gear** ($400) — steal any car, deliver it to Vera's Garage.
2. **The Pickup** ($700) — collect a package at the north docks, deliver it to Marina Cafe. The yard guards call it in.
3. **Hot Pursuit** ($900) — three stars from the start. Lose the cops, then lay low at Palm Court.
4. **The Exchange** ($1,200) — take out the four armed Tide Kings crew at the docks, bring the case home.
5. **Sunset Run** ($2,000) — the case goes to the lighthouse in 150 seconds, with two stars on your tail. Make it, and the debt is clear.

## What is in the world

- A 7×7-block sun-soaked coastal city: Old Town, the Marina, Dockside, Palm Court, The Strip, and Sunset Beach — built fresh from geometry, materials and lighting, no downloaded assets.
- Explore on foot or by car: steal any car (E), drive with traffic AI, pedestrians on the sidewalks.
- A wanted level (0–5 stars) with police cars that chase, ram, and arrest.
- A hitscan pistol with ammo and reload, and armed crew who shoot back.
- A HUD with health, cash, wanted stars, ammo, a live minimap, and mission objectives. Title, pause, mission-complete, busted and game-over screens. Progress saves to localStorage after every job.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Run |
| Space | Jump |
| Mouse | Look |
| Click | Shoot |
| E | Steal / exit car |
| R | Reload |
| M | Start the next job from Vera |
| P / Esc | Pause |

## Play it

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
```

No build step, no network requests — every file the game loads lives under `game/`. The three.js library is vendored at `game/vendor/three.module.min.js`.

## Structure

- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `game/index.html` + `game/style.css` — the page and the HUD styling.
- `game/src/boot.js` — renderer, sunset lighting, input, the game loop, and the `?shot=` screenshot presets.
- `game/src/city.js` — the city, beach, docks, marina, lighthouse, and props.
- `game/src/vehicles.js` — car factory and arcade drive physics.
- `game/src/traffic.js` — traffic AI and pedestrian routines.
- `game/src/player.js` — Rex on foot.
- `game/src/police.js` — the wanted system and police chases.
- `game/src/weapons.js` — the hitscan pistol and the enemy crew.
- `game/src/missions.js` — the five jobs, Vera's dialogue, and the rewards.
- `game/src/hud.js` — HUD, minimap, menus, and messages.
- `game/src/save.js` — localStorage saves.
- `game/src/camera.js` — the third-person follow camera.
- `game/src/util.js` — the seeded RNG and world constants.

## License

MIT — see [LICENSE](LICENSE).
