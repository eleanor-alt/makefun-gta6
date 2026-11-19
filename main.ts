// Palmira Heat — handover program for the make.fun gta6-01 bounty (Node 22, standard library only).
//
// The game itself is the static site in game/ beside this file: plain files, no build step, no
// network. This program's whole job is to hand that site in — copy game/ and screenshots/ into
// the output directory and write the dossier the judge reads, using make.fun's vendored library
// so the bytes match what the scorer rebuilds on its side.
//
// Run it the way the grader does, or locally with an output directory of your choice:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game tree goes over whole: whatever plays in a browser here is what the judge is handed.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots ride along beside it (3 or 4 of them; the first by name is the cover).
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier's caps are the scorer's own: the text budget shapes the document's bytes, and the
// rest make this program refuse a tree the gate would refuse anyway (too many screenshots, an
// oversized one, a game tree past its file or byte limits, an over-long path).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(`Palmira Heat handed in: game/ and screenshots/ copied to ${outputDir}, dossier.json written (${dossier.length} bytes).`);
