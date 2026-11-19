// Solmar Bay — the program that hands the game in (Node 22, standard library
// only). The game is plain static files under game/ (three.js vendored, no
// network at runtime), plus 4 screenshots. This program copies game/ and
// screenshots/ from beside this file into /output and writes
// /output/dossier.json with the kit's buildDossier helper, exactly as the
// competition asks. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for
// /output, so a local run is:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Guard: refuse to hand in a half-built entry. The entry point and every
// screenshot must exist before anything is copied.
const required = [
  join(here, 'game', 'index.html'),
  join(here, 'screenshots', '1-chase.jpg'),
  join(here, 'screenshots', '2-street.jpg'),
  join(here, 'screenshots', '3-mission.jpg'),
  join(here, 'screenshots', '4-title.jpg'),
];
for (const f of required) {
  if (!existsSync(f)) throw new Error(`Solmar Bay: missing required output ${f}`);
}

// Count the files and bytes actually handed in, for the handoff report.
function tally(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const sub = tally(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
const game = tally(join(out, 'game'));
const shots = tally(join(out, 'screenshots'));
console.log(
  `Solmar Bay: handed in ${game.files} game files (${game.bytes} bytes) + ` +
  `${shots.files} screenshots (${shots.bytes} bytes) to ${out}`,
);

// The scorer's own caps: only text_max_bytes shapes the bytes; the rest refuse
// an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB;
// more than 993 files in game/ or 48 MiB of game files in all).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
