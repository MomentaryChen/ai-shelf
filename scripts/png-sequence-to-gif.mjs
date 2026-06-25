#!/usr/bin/env node
/**
 * Convert a numbered PNG sequence (000.png, 001.png, …) to an optimized GIF via ffmpeg.
 *
 * Usage: node scripts/png-sequence-to-gif.mjs <framesDir> <outGif> [fps] [width]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const [framesDir, outGif, fpsArg = "8", widthArg = "960"] = process.argv.slice(2);

if (!framesDir || !outGif) {
  console.error(
    "Usage: node scripts/png-sequence-to-gif.mjs <framesDir> <outGif> [fps] [width]",
  );
  process.exit(1);
}

const frames = readdirSync(framesDir)
  .filter((f) => /^\d{3}\.png$/i.test(f))
  .sort();

if (frames.length === 0) {
  console.error(`No numbered frames (NNN.png) found in ${framesDir}`);
  process.exit(1);
}

const fps = Number.parseFloat(fpsArg);
const width = Number.parseInt(widthArg, 10);
const durationSec = frames.length / fps;

mkdirSync(dirname(outGif), { recursive: true });

const inputPattern = join(framesDir, "%03d.png");
const filter = [
  `fps=${fps}`,
  `scale=${width}:-1:flags=lanczos`,
  "split[s0][s1]",
  "[s0]palettegen=stats_mode=diff:max_colors=128[p]",
  "[s1][p]paletteuse=dither=bayer:bayer_scale=3",
].join(",");

execFileSync(
  "ffmpeg",
  ["-y", "-framerate", String(fps), "-i", inputPattern, "-vf", filter, "-loop", "0", outGif],
  { stdio: "inherit" },
);

console.log(
  `Wrote ${outGif} — ${frames.length} frames @ ${fps} fps (~${durationSec.toFixed(1)}s)`,
);
