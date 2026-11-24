"use client";

import { motion } from "motion/react";
import { Lock, Play, Undo2 } from "lucide-react";
import { engine } from "@/lib/story";
import type { Ending } from "@/lib/story/types";

interface Props {
  ending: Ending;
  unlocked?: { unlockedAt: number; times: number };
  seenDecisions: string[];
  onReplay: (e: Ending) => void;
  onDecision: (decisionId: string) => void;
  compact?: boolean;
  index?: number;
}

/** Cinematic ending card with locked / unlocked states. */
export function EndingCard({ ending, unlocked, seenDecisions, onReplay, onDecision, compact, index = 0 }: Props) {
  const poster = engine.clip(engine.scene(ending.scene).clip).poster;
  const lastChoice = engine.choice(ending.path[ending.path.length - 1]);
  const branchDecision = lastChoice?.decision;
  const knownBranch = branchDecision && seenDecisions.includes(branchDecision.id);

  return (
    <motion.article
      className={`group relative overflow-hidden rounded-xl border bg-coal ${
        unlocked ? "border-white/10 hover:border-crimson/60" : "border-white/5"
      } transition-colors duration-500`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative aspect-video overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster}
          alt=""
          loading="lazy"
          className={`h-full w-full object-cover transition-transform duration-[1.6s] ease-out ${
            unlocked ? "group-hover:scale-105" : "scale-110 blur-xl brightness-[.25] grayscale"
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-coal via-coal/30 to-transparent" />
        <span className="absolute top-3 left-3 font-display text-sm tracking-[0.35em] text-white/70">
          Ending {String(ending.number).padStart(2, "0")}
        </span>
        {unlocked ? (
          <button
            onClick={() => onReplay(ending)}
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Replay ending: ${ending.title}`}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-crimson/90 shadow-[0_0_40px_rgba(255,42,61,.6)]">
              <Play className="ml-0.5 h-6 w-6 fill-white" />
            </span>
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
            <Lock className="h-7 w-7" />
            <span className="text-[11px] tracking-[0.4em] uppercase">Locked</span>
          </div>
        )}
      </div>
      <div className={compact ? "p-4" : "p-5"}>
        <h3 className={`font-display tracking-wide ${compact ? "text-2xl" : "text-3xl"} ${unlocked ? "text-white" : "text-zinc-600"}`}>
          {unlocked ? ending.title : "Undiscovered"}
        </h3>
        {!compact && (
          <>
            {unlocked ? (
              <p className="mt-1 text-xs text-zinc-500">
                {ending.path.length} decision{ending.path.length === 1 ? "" : "s"} · watched {unlocked.times}×
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                {knownBranch
                  ? `Branches from Decision ${branchDecision!.index}: “${branchDecision!.title.replace(/\.$/, "")}”`
                  : "Keep making choices to find this path."}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              {unlocked && (
                <button
                  onClick={() => onReplay(ending)}
                  className="flex items-center gap-1.5 rounded-md bg-crimson px-3 py-1.5 text-sm text-white transition hover:bg-ember"
                >
                  <Play className="h-3.5 w-3.5 fill-white" /> Replay
                </button>
              )}
              {branchDecision && (unlocked || knownBranch) && (
                <button
                  onClick={() => onDecision(branchDecision.id)}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Decision {branchDecision.index}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </motion.article>
  );
}
