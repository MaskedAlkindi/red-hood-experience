"use client";

import { motion } from "motion/react";
import { Film, Home, RotateCcw, Undo2 } from "lucide-react";
import { engine } from "@/lib/story";
import type { Ending } from "@/lib/story/types";

interface Props {
  ending: Ending;
  unlockedCount: number;
  isNew: boolean;
  poster: string;
  onReplay: () => void;
  onRewind: (decisionId: string) => void;
  onEndings: () => void;
  onHome: () => void;
}

export function EndingOverlay({ ending, unlockedCount, isNew, poster, onReplay, onRewind, onEndings, onHome }: Props) {
  const total = engine.endings.length;
  const lastChoice = ending.path.length ? engine.choice(ending.path[ending.path.length - 1]) : undefined;
  return (
    <motion.div
      className="absolute inset-0 isolate z-40 flex items-center justify-center overflow-x-hidden overflow-y-auto bg-ink/80 px-5 py-10 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" className="kenburns h-full w-full object-cover opacity-25 blur-sm" />
      </div>
      <div className="w-full max-w-3xl text-center">
        <motion.p
          className="font-display text-sm tracking-[0.6em] text-ember"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {isNew ? "New ending unlocked" : "Ending reached"}
        </motion.p>
        <motion.h2
          className="text-metal mt-3 font-display text-6xl leading-none sm:text-8xl"
          initial={{ opacity: 0, scale: 1.08, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {ending.title}
        </motion.h2>
        <p className="mt-2 font-serif text-xl italic text-zinc-400">
          Ending {ending.number} of {total}
        </p>

        <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {ending.path.map((cid, i) => {
            const r = engine.choice(cid);
            return (
              <span key={cid} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                <span className="text-ember">{i + 1}.</span> {r?.choice.label.replace(/\.$/, "")}
              </span>
            );
          })}
        </div>

        <div className="mx-auto mt-8 max-w-sm">
          <div className="mb-2 flex justify-between text-xs tracking-widest text-zinc-400 uppercase">
            <span>Endings discovered</span>
            <span className="text-white">
              {unlockedCount}/{total}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-gradient-to-r from-blood to-ember"
              initial={{ width: 0 }}
              animate={{ width: `${(unlockedCount / total) * 100}%` }}
              transition={{ delay: 0.6, duration: 1.2 }}
            />
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {lastChoice && (
            <button
              onClick={() => onRewind(lastChoice.decision.id)}
              className="flex items-center justify-center gap-2 rounded-lg bg-crimson px-5 py-3.5 font-display text-xl tracking-wider text-white shadow-[0_10px_40px_-10px_rgba(200,16,46,.9)] transition hover:bg-ember"
            >
              <Undo2 className="h-5 w-5" /> Return to Decision {lastChoice.decision.index}
            </button>
          )}
          <button
            onClick={onEndings}
            className="panel-metal flex items-center justify-center gap-2 rounded-lg px-5 py-3.5 font-display text-xl tracking-wider text-white transition hover:border-white/25"
          >
            <Film className="h-5 w-5" /> Explore endings
          </button>
          <button
            onClick={onReplay}
            className="panel-metal flex items-center justify-center gap-2 rounded-lg px-5 py-3.5 font-display text-xl tracking-wider text-white transition hover:border-white/25"
          >
            <RotateCcw className="h-5 w-5" /> Replay ending
          </button>
          <button
            onClick={onHome}
            className="panel-metal flex items-center justify-center gap-2 rounded-lg px-5 py-3.5 font-display text-xl tracking-wider text-white transition hover:border-white/25"
          >
            <Home className="h-5 w-5" /> Main menu
          </button>
        </div>
      </div>
    </motion.div>
  );
}
