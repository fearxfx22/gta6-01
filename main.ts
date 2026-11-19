// Solmar Bay — the program that hands the game in (Node 22, standard
// library only). It copies this repository's game/ and screenshots/ into
// /output and writes /output/dossier.json with the kit's buildDossier
// helper, exactly as the competition asks. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output, so a local run is:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const here = fileURLToPath(new URL('.', import.meta.url));
// The grader gives us a writable /output; locally the env var overrides it.
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Count the files and bytes under a directory, so the run can report
// what it handed in instead of failing silently on an empty copy.
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

// The game itself: plain static files, served by any static server.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
const game = tally(join(out, 'game'));

// The screenshots, taken by the game's maker in a browser.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
const shots = tally(join(out, 'screenshots'));

// The dossier is the judge's view of the entry: the game block, the
// sources, and the screenshots. The caps are the scorer's own (see the
// kit's RULES.txt): at most 4 screenshots of 256 KiB each, at most 993
// files and 48 MiB under game/, and the dossier text capped at 160 KiB.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// Report the handoff so a local run shows what the grader will receive.
console.log(`Solmar Bay handed in: game ${game.files} files, ${(game.bytes / 1024).toFixed(0)} KiB; ` +
  `screenshots ${shots.files} files, ${(shots.bytes / 1024).toFixed(0)} KiB; ` +
  `dossier ${dossier.length} bytes.`);
if (game.files === 0 || shots.files === 0) {
  throw new Error('handoff incomplete: the game or the screenshots are missing');
}
