// Solmar Bay — entry point for the make.fun gta6-01 bounty (Node 22, standard
// library only). The game is plain static files under game/ (three.js vendored,
// no build step, no network at runtime). This script gathers the entry: it
// copies game/ and screenshots/ next to this file into the output folder and
// writes dossier.json, the summary the judge reads, using the vendored
// make.fun library.
//
// Run it from the repo root, e.g.:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');

if (!existsSync(gameDir)) throw new Error(`game/ not found beside main.ts (${gameDir})`);

// The gate caps from the competition (see the kit's reference/gate.json): the
// dossier text is capped, and an entry is refused outright for more than four
// screenshots, a screenshot over 256 KiB, more than 993 game files, game
// files over 48 MiB in total, or a game path over 1000 bytes.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Every file under a directory, recursively. */
function listFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(p));
    else found.push(p);
  }
  return found;
}

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

const gameFiles = listFiles(gameDir);
if (gameFiles.length > DOSSIER_CAPS.game_max_files) {
  throw new Error(`game/ has ${gameFiles.length} files, over the 993-file gate cap`);
}
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_CAPS));
