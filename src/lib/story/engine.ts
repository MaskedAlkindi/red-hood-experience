import type {
  Choice,
  Clip,
  DecisionScene,
  Ending,
  HistoryEntry,
  Scene,
  SceneId,
  Step,
  StoryData,
} from "./types";

/**
 * Data-driven branching story engine. Pure (no React / DOM) so it can be shared by the
 * player, the endings explorer, the story-map debugger and the validation script.
 */
export class StoryEngine {
  readonly data: StoryData;
  private choiceIndex = new Map<string, { decision: DecisionScene; choice: Choice }>();
  private parents = new Map<SceneId, SceneId[]>();

  constructor(data: StoryData) {
    this.data = data;
    for (const s of Object.values(data.scenes)) {
      if (s.type === "decision") {
        for (const c of s.choices) {
          this.choiceIndex.set(c.id, { decision: s, choice: c });
          this.addParent(c.target, s.id);
        }
      } else if (s.next) {
        this.addParent(s.next, s.id);
      }
    }
  }

  private addParent(child: SceneId, parent: SceneId) {
    const list = this.parents.get(child) ?? [];
    if (!list.includes(parent)) list.push(parent);
    this.parents.set(child, list);
  }

  get start(): SceneId {
    return this.data.start;
  }

  scene(id: SceneId): Scene {
    const s = this.data.scenes[id];
    if (!s) throw new Error(`Unknown scene ${id}`);
    return s;
  }

  hasScene(id: string | null | undefined): id is SceneId {
    return !!id && id in this.data.scenes;
  }

  clip(id: string): Clip {
    const c = this.data.clips[id];
    if (!c) throw new Error(`Unknown clip ${id}`);
    return c;
  }

  decision(id: SceneId): DecisionScene {
    const s = this.scene(id);
    if (s.type !== "decision") throw new Error(`${id} is not a decision`);
    return s;
  }

  get decisions(): DecisionScene[] {
    return this.data.decisions.map((d) => this.decision(d));
  }

  get endings(): Ending[] {
    return this.data.endings;
  }

  ending(id: string): Ending | undefined {
    return this.data.endings.find((e) => e.id === id);
  }

  choice(id: string) {
    return this.choiceIndex.get(id);
  }

  clipForStep(step: Step): Clip {
    return step.kind === "stinger" ? this.clip(step.clipId) : this.clip(this.scene(step.sceneId).clip);
  }

  /** Step after a step's clip finishes. `null` = story complete (ending reached). */
  nextAfter(step: Step): { step: Step | null; timedOutChoice?: Choice } {
    if (step.kind === "stinger") return { step: { kind: "scene", sceneId: step.then } };
    const s = this.scene(step.sceneId);
    if (s.type === "decision") {
      // DVD post command: timeout jumps straight to the default branch (no stinger).
      const c = s.choices.find((x) => x.id === s.defaultChoice)!;
      return { step: { kind: "scene", sceneId: c.target }, timedOutChoice: c };
    }
    return { step: s.next ? { kind: "scene", sceneId: s.next } : null };
  }

  /** Step when the viewer actively picks a choice: stinger first (as on the disc), then target. */
  choose(decisionId: SceneId, choiceId: string): Step {
    const d = this.decision(decisionId);
    const c = d.choices.find((x) => x.id === choiceId);
    if (!c) throw new Error(`Choice ${choiceId} not in ${decisionId}`);
    if (c.stingerClip) return { kind: "stinger", clipId: c.stingerClip, choiceId: c.id, decisionId, then: c.target };
    return { kind: "scene", sceneId: c.target };
  }

  /** Clips that could play right after this step (for preloading), most likely first. */
  upcomingClips(step: Step): string[] {
    if (step.kind === "stinger") return [this.scene(step.then).clip];
    const s = this.scene(step.sceneId);
    if (s.type === "decision") {
      const def = s.choices.find((c) => c.id === s.defaultChoice)!;
      const out = s.choices.map((c) => c.stingerClip).filter((x): x is string => !!x);
      out.push(this.scene(def.target).clip);
      return out;
    }
    return s.next ? [this.scene(s.next).clip] : [];
  }

  /** The ending a scene belongs to (ending segment or its credits), if any. */
  endingOf(sceneId: SceneId): Ending | undefined {
    const s = this.scene(sceneId);
    const eid = s.type === "decision" ? undefined : s.endingId;
    return eid ? this.ending(eid) : undefined;
  }

  /** Decision index (1-based) a scene belongs after, for chapter display. */
  depthOf(sceneId: SceneId): number {
    // number of decisions on the shortest path from start
    const seen = new Map<SceneId, number>([[this.start, 0]]);
    const q: SceneId[] = [this.start];
    while (q.length) {
      const id = q.shift()!;
      const d = seen.get(id)!;
      if (id === sceneId) return d;
      for (const n of this.children(id)) {
        if (!seen.has(n)) {
          seen.set(n, d + (this.scene(id).type === "decision" ? 1 : 0));
          q.push(n);
        }
      }
    }
    return 0;
  }

  children(id: SceneId): SceneId[] {
    const s = this.scene(id);
    if (s.type === "decision") return s.choices.map((c) => c.target);
    return s.next ? [s.next] : [];
  }

  parentsOf(id: SceneId): SceneId[] {
    return this.parents.get(id) ?? [];
  }

  /** Rebuild history for a given choice path (used to replay endings / jump to decisions). */
  historyFromPath(choiceIds: string[]): HistoryEntry[] {
    return choiceIds.map((cid) => {
      const r = this.choice(cid);
      if (!r) throw new Error(`Unknown choice ${cid}`);
      return { decisionId: r.decision.id, choiceId: cid, timedOut: false, at: 0 };
    });
  }

  /** Shortest choice path from the opening to a scene. */
  pathTo(target: SceneId): string[] | null {
    const prev = new Map<SceneId, { from: SceneId; choice?: string } | null>([[this.start, null]]);
    const q: SceneId[] = [this.start];
    while (q.length) {
      const id = q.shift()!;
      if (id === target) break;
      const s = this.scene(id);
      const edges =
        s.type === "decision"
          ? s.choices.map((c) => ({ to: c.target, choice: c.id }))
          : s.next
            ? [{ to: s.next, choice: undefined }]
            : [];
      for (const e of edges) {
        if (!prev.has(e.to)) {
          prev.set(e.to, { from: id, choice: e.choice });
          q.push(e.to);
        }
      }
    }
    if (!prev.has(target)) return null;
    const path: string[] = [];
    let cur: SceneId | undefined = target;
    while (cur && prev.get(cur)) {
      const p: { from: SceneId; choice?: string } = prev.get(cur)!;
      if (p.choice) path.unshift(p.choice);
      cur = p.from;
    }
    return path;
  }

  /** All complete playthroughs (choice sequences) from the opening to an ending. */
  allPaths(): { choices: string[]; ending: string }[] {
    const out: { choices: string[]; ending: string }[] = [];
    const walk = (id: SceneId, choices: string[], guard: Set<SceneId>) => {
      if (guard.has(id)) throw new Error(`Cycle at ${id}`);
      const g = new Set(guard).add(id);
      const s = this.scene(id);
      if (s.type === "decision") {
        for (const c of s.choices) walk(c.target, [...choices, c.id], g);
        return;
      }
      if (s.next) return walk(s.next, choices, g);
      out.push({ choices, ending: s.endingId ?? "?" });
    };
    walk(this.start, [], new Set());
    return out;
  }

  /** Total runtime of a playthrough, given choice ids (active choices incl. stingers). */
  runtimeOf(choiceIds: string[]): number {
    let t = 0;
    let id: SceneId | null = this.start;
    const picks = [...choiceIds];
    while (id) {
      const s: Scene = this.scene(id);
      if (s.type === "decision") {
        const cid = picks.shift();
        const c = s.choices.find((x) => x.id === cid);
        if (!c) break;
        t += s.activeFrom + 2;
        if (c.stingerClip) t += this.clip(c.stingerClip).duration;
        id = c.target;
      } else {
        t += this.clip(s.clip).duration;
        id = s.next;
      }
    }
    return t;
  }
}
