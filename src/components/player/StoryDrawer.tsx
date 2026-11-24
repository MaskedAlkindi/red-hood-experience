"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Clock, GitBranch, Undo2, X } from "lucide-react";
import { engine } from "@/lib/story";
import type { HistoryEntry } from "@/lib/story/types";

interface Props {
  history: HistoryEntry[];
  currentDecision: string | null;
  onRewind: (decisionId: string) => void;
  onRestart: () => void;
  onClose: () => void;
}

/** Side panel: the viewer's decisions so far, with the ability to rewind to any of them. */
export function StoryDrawer({ history, currentDecision, onRewind, onRestart, onClose }: Props) {
  return (
    <motion.aside
      className="panel-metal absolute inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-y-0 border-r-0"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 260 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h3 className="font-display text-2xl tracking-wider">Your story</h3>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
      <ol className="scrollbar-none flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <li className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-zinc-500" /> Opening
        </li>
        {history.map((h) => {
          const r = engine.choice(h.choiceId);
          if (!r) return null;
          return (
            <li key={h.decisionId} className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] tracking-[0.3em] text-ember uppercase">Decision {r.decision.index}</p>
                  <p className="font-serif text-sm italic text-zinc-400">{r.decision.title}</p>
                  <p className="mt-1 font-display text-xl tracking-wide text-white">{r.choice.label.replace(/\.$/, "")}</p>
                  {h.timedOut && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                      <Clock className="h-3 w-3" /> Time ran out
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onRewind(h.decisionId)}
                  className="mt-1 flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 transition hover:border-crimson hover:text-white"
                  title="Return to this decision"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Rewind
                </button>
              </div>
            </li>
          );
        })}
        {currentDecision && !history.some((h) => h.decisionId === currentDecision) && (
          <li className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ember">
            <span className="h-2 w-2 animate-pulse rounded-full bg-ember" /> Decision {engine.decision(currentDecision).index} — now
          </li>
        )}
      </ol>
      <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
        <button onClick={onRestart} className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-white/30 hover:text-white">
          Restart story
        </button>
        <Link
          href="/story-map"
          className="flex items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-white/30 hover:text-white"
        >
          <GitBranch className="h-4 w-4" /> Story map
        </Link>
      </div>
    </motion.aside>
  );
}
