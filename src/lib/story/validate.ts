import { StoryEngine } from "./engine.ts";
import type { MediaManifest, StoryData } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  stats: {
    scenes: number;
    clips: number;
    decisions: number;
    choices: number;
    endings: number;
    playthroughs: number;
    reachableScenes: number;
    endingsReached: string[];
  };
}

/**
 * Structural validation of the story graph (+ media manifest when provided).
 * Shared by `npm run validate` and the in-app story map.
 */
export function validateStory(data: StoryData, media?: MediaManifest): ValidationReport {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ level: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ level: "warning", code, message });

  const scenes = data.scenes;
  const clips = data.clips;
  if (!scenes[data.start]) err("missing-start", `start scene ${data.start} does not exist`);

  const usedClips = new Set<string>();
  let choiceCount = 0;
  for (const s of Object.values(scenes)) {
    if (!clips[s.clip]) err("broken-clip-ref", `${s.id} references missing clip ${s.clip}`);
    usedClips.add(s.clip);
    if (s.type === "decision") {
      if (s.choices.length < 2) err("too-few-choices", `${s.id} has ${s.choices.length} choice(s)`);
      const defaults = s.choices.filter((c) => c.isDefault);
      if (defaults.length !== 1 || defaults[0].id !== s.defaultChoice)
        err("bad-default", `${s.id} default choice is inconsistent`);
      if (!(s.activeFrom >= 0 && s.activeFrom < s.timeout))
        err("bad-timing", `${s.id} activeFrom ${s.activeFrom} must be < timeout ${s.timeout}`);
      const dirs = new Set(s.choices.map((c) => c.direction));
      if (dirs.size !== s.choices.length) err("duplicate-direction", `${s.id} has duplicate choice directions`);
      for (const c of s.choices) {
        choiceCount++;
        if (!scenes[c.target]) err("broken-target", `${c.id} targets missing scene ${c.target}`);
        if (c.stingerClip) {
          if (!clips[c.stingerClip]) err("broken-clip-ref", `${c.id} stinger ${c.stingerClip} missing`);
          usedClips.add(c.stingerClip);
        }
        if (!c.label.trim()) err("empty-label", `${c.id} has no label`);
      }
    } else {
      if (s.next && !scenes[s.next]) err("broken-next", `${s.id} next ${s.next} missing`);
      if (!s.next && !s.endingId) err("dead-end", `${s.id} ends the story without an ending id`);
      if (s.endingId && !data.endings.some((e) => e.id === s.endingId))
        err("broken-ending-ref", `${s.id} references unknown ending ${s.endingId}`);
    }
  }
  for (const id of Object.keys(clips)) if (!usedClips.has(id)) warn("unused-clip", `clip ${id} is never played`);

  // reachability + cycles
  const reach = new Set<string>();
  const stack = [data.start];
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id) || !scenes[id]) continue;
    reach.add(id);
    const s = scenes[id];
    if (s.type === "decision") s.choices.forEach((c) => stack.push(c.target));
    else if (s.next) stack.push(s.next);
  }
  for (const id of Object.keys(scenes)) if (!reach.has(id)) err("unreachable", `scene ${id} is unreachable from start`);

  let paths: { choices: string[]; ending: string }[] = [];
  let engine: StoryEngine | null = null;
  try {
    engine = new StoryEngine(data);
    paths = engine.allPaths();
  } catch (e) {
    err("graph-walk", String(e));
  }
  const reached = new Set(paths.map((p) => p.ending));

  for (const e of data.endings) {
    if (!scenes[e.scene]) err("broken-ending", `ending ${e.id} scene ${e.scene} missing`);
    if (!reached.has(e.id)) err("unreachable-ending", `ending ${e.id} (${e.title}) is not reachable`);
    // the recorded path must actually lead to this ending
    if (engine) {
      const match = paths.find((p) => p.choices.join() === e.path.join());
      if (!match || match.ending !== e.id) err("bad-ending-path", `ending ${e.id} path does not lead to it`);
    }
  }
  for (const id of reached) if (!data.endings.some((e) => e.id === id)) err("unknown-ending", `path ends at ${id}`);

  if (media) {
    for (const c of Object.values(clips)) {
      const m = media.clips[c.id];
      if (!m) {
        err("missing-media", `no processed media for clip ${c.id}`);
        continue;
      }
      if (Math.abs(m.duration - c.duration) > 0.5)
        err("duration-mismatch", `${c.id}: media ${m.duration}s vs DVD ${c.duration}s`);
      if (m.video !== "h264") err("codec", `${c.id} video codec ${m.video}`);
      if (m.audio !== "aac") err("codec", `${c.id} audio codec ${m.audio}`);
    }
  }

  return {
    ok: !issues.some((i) => i.level === "error"),
    issues,
    stats: {
      scenes: Object.keys(scenes).length,
      clips: Object.keys(clips).length,
      decisions: data.decisions.length,
      choices: choiceCount,
      endings: data.endings.length,
      playthroughs: paths.length,
      reachableScenes: reach.size,
      endingsReached: [...reached],
    },
  };
}
