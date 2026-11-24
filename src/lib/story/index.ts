import storyJson from "@/data/story.json";
import manifestJson from "@/data/media-manifest.json";
import { StoryEngine } from "./engine";
import type { MediaManifest, StoryData } from "./types";

export const story = storyJson as unknown as StoryData;
export const media = manifestJson as unknown as MediaManifest;
export const engine = new StoryEngine(story);

export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Total unique footage in the story (seconds). */
export const totalFootage = Object.values(story.clips).reduce((a, c) => a + c.duration, 0);

export * from "./types";
export { StoryEngine } from "./engine";
