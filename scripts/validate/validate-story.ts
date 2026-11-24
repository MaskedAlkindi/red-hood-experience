/**
 * Automated story-graph validation:  npm run validate
 *  - broken references, unreachable scenes, dead ends, cycles
 *  - every ending reachable and its recorded path correct
 *  - every clip has processed media on disk (mp4, poster, sprite) with matching duration/codecs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateStory } from "../../src/lib/story/validate.ts";
import type { MediaManifest, StoryData } from "../../src/lib/story/types";

const root = resolve(import.meta.dirname, "..", "..");
const story: StoryData = JSON.parse(readFileSync(join(root, "src/data/story.json"), "utf8"));
const manifestPath = join(root, "src/data/media-manifest.json");
const media: MediaManifest | undefined = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : undefined;

const report = validateStory(story, media);

// files on disk
const pub = join(root, "public");
for (const c of Object.values(story.clips)) {
  for (const rel of [c.src, c.poster, media?.clips[c.id]?.sprite.src].filter(Boolean) as string[]) {
    const f = join(pub, rel);
    if (!existsSync(f) || statSync(f).size === 0) {
      report.issues.push({ level: "error", code: "missing-file", message: `${c.id}: missing ${rel}` });
      report.ok = false;
    }
  }
}
if (!media) {
  report.issues.push({ level: "error", code: "no-manifest", message: "src/data/media-manifest.json not found — run npm run media:build" });
  report.ok = false;
}

const s = report.stats;
console.log(`Story graph: ${s.scenes} scenes, ${s.clips} clips, ${s.decisions} decisions, ${s.choices} choices`);
console.log(`Reachable scenes: ${s.reachableScenes}/${s.scenes}   playthroughs: ${s.playthroughs}`);
console.log(`Endings reachable: ${s.endingsReached.length}/${s.endings}  (${s.endingsReached.sort().join(", ")})`);
for (const i of report.issues) console.log(`${i.level === "error" ? "ERROR" : "warn "} [${i.code}] ${i.message}`);
console.log(report.ok ? "\nVALIDATION PASSED" : "\nVALIDATION FAILED");
process.exit(report.ok ? 0 : 1);
