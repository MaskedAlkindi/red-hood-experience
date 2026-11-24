"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { InteractivePlayer, type PlayerStart } from "@/components/player/InteractivePlayer";
import { engine } from "@/lib/story";
import { useHydrated, useProgress } from "@/lib/story/progress";
import type { Progress } from "@/lib/story/progress";

/**
 * /watch                 → resume saved story if any, otherwise start from the opening
 * /watch?new=1           → start a new run
 * /watch?decision=<id>   → return to a decision (history rebuilt / truncated)
 * /watch?ending=<id>     → replay an ending
 */
function resolveStart(params: URLSearchParams, progress: Progress): PlayerStart {
  const fresh: PlayerStart = { step: { kind: "scene", sceneId: engine.start }, time: 0, history: [] };
  if (params.get("new")) return fresh;

  const endingId = params.get("ending");
  const e = endingId ? engine.ending(endingId) : undefined;
  if (e) return { step: { kind: "scene", sceneId: e.scene }, time: 0, history: engine.historyFromPath(e.path) };

  const dec = params.get("decision");
  if (dec && engine.hasScene(dec) && engine.scene(dec).type === "decision") {
    const idx = progress.history.findIndex((h) => h.decisionId === dec);
    const history =
      idx >= 0 ? progress.history.slice(0, idx) : engine.historyFromPath(engine.pathTo(dec) ?? []);
    return { step: { kind: "scene", sceneId: dec }, time: 0, history };
  }

  const cur = progress.current;
  if (cur) {
    const valid =
      cur.step.kind === "scene" ? engine.hasScene(cur.step.sceneId) : engine.hasScene(cur.step.then) && !!engine.data.clips[cur.step.clipId];
    if (valid) return { step: cur.step, time: Math.max(0, cur.time - 2), history: progress.history };
  }
  return fresh;
}

export function WatchClient() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const progress = useProgress();
  // resolve once after hydration (later progress/URL changes must not restart the player)
  const startRef = useRef<PlayerStart | null>(null);
  if (hydrated && !startRef.current) startRef.current = resolveStart(new URLSearchParams(params.toString()), progress);
  useEffect(() => {
    // drop the one-shot intent from the URL so a refresh resumes instead of restarting
    if (hydrated && window.location.search) window.history.replaceState(null, "", "/watch");
  }, [hydrated]);
  if (!startRef.current) return <div className="fixed inset-0 bg-black" />;
  return <InteractivePlayer start={startRef.current} />;
}
