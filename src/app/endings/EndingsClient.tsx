"use client";

import { motion } from "motion/react";
import { GitFork, Play, RotateCcw, Trophy } from "lucide-react";
import { useState } from "react";
import { Atmosphere } from "@/components/fx/Atmosphere";
import { useCinematicNavigate } from "@/components/fx/CinematicLink";
import { EndingCard } from "@/components/endings/EndingCard";
import { SiteNav } from "@/components/landing/SiteNav";
import { engine, story } from "@/lib/story";
import { resetProgress, useHydrated, useProgress } from "@/lib/story/progress";

export function EndingsClient() {
  const navigate = useCinematicNavigate();
  const hydrated = useHydrated();
  const progress = useProgress();
  const [confirmReset, setConfirmReset] = useState(false);
  const unlocked = hydrated ? progress.endings : {};
  const count = Object.keys(unlocked).length;
  const total = story.endings.length;
  const seen = hydrated ? progress.seenScenes : [];
  const decisionsSeen = engine.decisions.filter((d) => seen.includes(d.id));
  const choicesMade = hydrated ? progress.choicesMade : [];
  const totalChoices = engine.decisions.reduce((a, d) => a + d.choices.length, 0);
  const pct = Math.round((count / total) * 100);

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <section className="relative overflow-hidden px-5 pt-32 pb-14 sm:px-10 lg:px-20">
        <Atmosphere rain={false} />
        <SiteNav />
        <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <motion.p
              className="font-display text-sm tracking-[0.5em] text-ember"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Endings explorer
            </motion.p>
            <motion.h1
              className="text-metal mt-2 font-display text-7xl leading-[0.85] sm:text-9xl"
              initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            >
              Every road
              <br />
              <span className="text-blood">ends</span> somewhere
            </motion.h1>
          </div>

          <div className="flex items-center gap-8">
            <div className="relative h-36 w-36 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="url(#g)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 44}
                  initial={{ strokeDashoffset: 2 * Math.PI * 44 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - count / total) }}
                  transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                />
                <defs>
                  <linearGradient id="g">
                    <stop offset="0" stopColor="#8f0d16" />
                    <stop offset="1" stopColor="#ff2a3d" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-5xl leading-none">
                  {count}
                  <span className="text-2xl text-zinc-500">/{total}</span>
                </span>
                <span className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase">{pct}% found</span>
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Trophy className="h-4 w-4 text-ember" />
                <dd className="text-zinc-300">
                  {count} of {total} endings
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <GitFork className="h-4 w-4 text-ember" />
                <dd className="text-zinc-300">
                  {decisionsSeen.length} of {engine.decisions.length} decisions reached
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <Play className="h-4 w-4 text-ember" />
                <dd className="text-zinc-300">
                  {choicesMade.length} of {totalChoices} choices taken
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="relative px-5 pb-16 sm:px-10 lg:px-20">
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {story.endings.map((e, i) => (
            <EndingCard
              key={e.id}
              ending={e}
              index={i}
              unlocked={unlocked[e.id]}
              seenDecisions={seen}
              onReplay={(en) => navigate(`/watch?ending=${en.id}`, en.title.toUpperCase())}
              onDecision={(d) => navigate(`/watch?decision=${d}`, `DECISION ${engine.decision(d).index}`)}
            />
          ))}
        </div>
      </section>

      {/* decisions: jump back to any decision already reached */}
      <section className="border-t border-white/5 bg-coal px-5 py-16 sm:px-10 lg:px-20">
        <h2 className="font-display text-4xl tracking-wide">Return to a decision</h2>
        <p className="mt-1 text-sm text-zinc-500">Decisions unlock here once you have reached them in the film.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {engine.decisions.map((d) => {
            const reached = seen.includes(d.id);
            return (
              <button
                key={d.id}
                disabled={!reached}
                onClick={() => navigate(`/watch?decision=${d.id}`, `DECISION ${d.index}`)}
                className={`panel-metal group flex items-center gap-4 rounded-xl p-4 text-left transition ${
                  reached ? "hover:border-crimson/60" : "cursor-not-allowed opacity-40"
                }`}
              >
                <span className="font-display text-5xl leading-none text-ember/80">{String(d.index).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-2xl tracking-wide">
                    {reached ? d.title.replace(/\.$/, "") : "Not yet reached"}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {reached
                      ? d.choices
                          .map((c) => `${choicesMade.includes(c.id) ? "●" : "○"} ${c.label.replace(/\.$/, "")}`)
                          .join("   ")
                      : `${d.choices.length} choices`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-12 flex items-center gap-3">
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset all progress
            </button>
          ) : (
            <span className="flex items-center gap-3 text-xs text-zinc-400">
              Erase endings and story progress?
              <button
                className="rounded bg-crimson px-2.5 py-1 text-white"
                onClick={() => {
                  resetProgress();
                  setConfirmReset(false);
                }}
              >
                Erase
              </button>
              <button className="text-zinc-500 hover:text-white" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
