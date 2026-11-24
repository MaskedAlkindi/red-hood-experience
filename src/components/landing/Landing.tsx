"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, Clapperboard, Clock3, GitFork, Play, Skull, StepForward } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Atmosphere } from "@/components/fx/Atmosphere";
import { useCinematicNavigate } from "@/components/fx/CinematicLink";
import { EndingCard } from "@/components/endings/EndingCard";
import { engine, formatTime, media, story, totalFootage } from "@/lib/story";
import { useHydrated, useProgress } from "@/lib/story/progress";
import { SiteNav } from "./SiteNav";

const ease = [0.22, 1, 0.36, 1] as const;

function HeroBackdrop() {
  const stills = media.stills?.length ? media.stills : [engine.clip(engine.start).poster];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => (x + 1) % stills.length), 7000);
    return () => window.clearInterval(t);
  }, [stills.length]);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <AnimatePresence>
        <motion.div
          key={stills[i]}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.2 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stills[i]} alt="" className="kenburns h-full w-full object-cover" />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,6,.96)_0%,rgba(5,5,6,.75)_38%,rgba(5,5,6,.25)_70%,rgba(5,5,6,.55)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,#050506_0%,rgba(5,5,6,0)_40%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_40%,rgba(200,16,46,.18),transparent_70%)] mix-blend-screen" />
    </div>
  );
}

export function Landing() {
  const navigate = useCinematicNavigate();
  const hydrated = useHydrated();
  const progress = useProgress();
  const cur = hydrated ? progress.current : null;
  const unlocked = hydrated ? progress.endings : {};
  const unlockedCount = Object.keys(unlocked).length;
  const decisionsMade = hydrated ? progress.history.length : 0;

  const continueLabel = (() => {
    if (!cur) return null;
    const st = cur.step;
    if (st.kind === "stinger") return engine.choice(st.choiceId)?.choice.label.replace(/\.$/, "");
    const s = engine.hasScene(st.sceneId) ? engine.scene(st.sceneId) : null;
    if (!s) return null;
    if (s.type === "decision") return `Decision ${s.index} — ${s.title.replace(/\.$/, "")}`;
    return `${s.title.replace(/\.$/, "")} · ${formatTime(cur.time)}`;
  })();

  const decisionsCount = story.decisions.length;
  const endingsCount = story.endings.length;

  return (
    <main className="relative">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative flex min-h-[100svh] items-end overflow-hidden pb-16 sm:items-center sm:pb-0">
        <HeroBackdrop />
        <Atmosphere />
        <SiteNav />
        <div className="relative z-10 w-full px-5 sm:px-10 lg:px-20">
          <div className="max-w-3xl">
            <motion.p
              className="flex items-center gap-3 font-display text-sm tracking-[0.55em] text-ember sm:text-base"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.2, ease }}
            >
              <span className="h-px w-10 bg-ember" /> An interactive DC film · {story.year}
            </motion.p>
            <motion.h1
              className="mt-5"
              initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.4, delay: 0.35, ease }}
            >
              <span className="text-metal block font-display text-5xl leading-none tracking-[0.18em] sm:text-7xl">Batman</span>
              <span className="text-metal block font-display text-[19vw] leading-[0.82] sm:text-[9.5rem] lg:text-[11rem]">
                Death in
              </span>
              <span className="block font-display text-[19vw] leading-[0.82] sm:text-[9.5rem] lg:text-[11rem]">
                <span className="text-metal">the </span>
                <span className="text-blood">Family</span>
              </span>
            </motion.h1>
            <motion.p
              className="mt-6 max-w-xl font-serif text-xl italic leading-snug text-zinc-300 sm:text-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.9 }}
            >
              Watch the film. At {decisionsCount} turning points the story stops and waits for you. Who lives, who dies —
              and who you become — is your call.
            </motion.p>

            <motion.div
              className="mt-9 flex flex-col gap-3 sm:flex-row"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 1.15, ease }}
            >
              <button
                onClick={() => navigate("/watch?new=1", "GOTHAM CITY")}
                className="group relative flex items-center justify-center gap-3 overflow-hidden rounded-lg bg-crimson px-8 py-4 font-display text-2xl tracking-[0.2em] text-white shadow-[0_18px_60px_-15px_rgba(255,42,61,.9)] transition hover:bg-ember"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <Play className="h-5 w-5 fill-white" />
                {cur ? "Start over" : "Start Experience"}
              </button>
              <AnimatePresence>
                {cur && continueLabel && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => navigate("/watch", "CONTINUE")}
                    className="panel-metal group flex items-center gap-4 rounded-lg px-6 py-3 text-left transition hover:border-white/25"
                  >
                    <StepForward className="h-6 w-6 shrink-0 text-ember" />
                    <span>
                      <span className="block font-display text-2xl leading-none tracking-[0.15em]">Continue Story</span>
                      <span className="mt-1 block max-w-[16rem] truncate text-xs text-zinc-400">{continueLabel}</span>
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.dl
              className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 1 }}
            >
              <div className="flex items-center gap-2">
                <GitFork className="h-4 w-4 text-ember" />
                <dt className="sr-only">Decisions</dt>
                <dd>{decisionsCount} decisions</dd>
              </div>
              <div className="flex items-center gap-2">
                <Skull className="h-4 w-4 text-ember" />
                <dt className="sr-only">Endings</dt>
                <dd>
                  {endingsCount} endings{hydrated && unlockedCount > 0 ? ` · ${unlockedCount} found` : ""}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-ember" />
                <dt className="sr-only">Footage</dt>
                <dd>{Math.round(totalFootage / 60)} min of footage</dd>
              </div>
            </motion.dl>
          </div>
        </div>
        <motion.a
          href="#endings"
          className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1 text-[10px] tracking-[0.4em] text-zinc-500 uppercase sm:flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 6, 0] }}
          transition={{ delay: 2, y: { repeat: Infinity, duration: 2.4 } }}
        >
          Scroll <ChevronDown className="h-4 w-4" />
        </motion.a>
      </section>

      {/* ---------------------------------------------------------------- how it plays */}
      <section className="relative border-t border-white/5 bg-coal px-5 py-20 sm:px-10 lg:px-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Clapperboard,
              title: "Watch",
              body: "The real film, straight from your disc, scene by scene — no gaps between branches.",
            },
            {
              icon: GitFork,
              title: "Decide",
              body: "When the disc asks, choose with your mouse or arrow keys. Hesitate, and the clock decides for you — just like the DVD.",
            },
            {
              icon: Skull,
              title: "Discover",
              body: `${endingsCount} endings wait at the end of different roads. Rewind any decision and take the other one.`,
            },
          ].map((c, i) => (
            <motion.div
              key={c.title}
              className="panel-metal rounded-xl p-6"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.7, ease }}
            >
              <c.icon className="h-7 w-7 text-ember" />
              <h3 className="mt-4 font-display text-3xl tracking-wider">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{c.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- endings */}
      <section id="endings" className="relative overflow-hidden bg-ink px-5 py-24 sm:px-10 lg:px-20">
        <div className="smoke opacity-60" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-sm tracking-[0.5em] text-ember">Explore endings</p>
            <h2 className="text-metal mt-2 font-display text-6xl leading-none sm:text-7xl">
              {["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][endingsCount] ?? endingsCount} fates
            </h2>
            <p className="mt-3 max-w-lg font-serif text-lg italic text-zinc-400">
              Every road ends somewhere. Unlock them all — locked endings stay hidden until you reach them.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="mb-2 flex justify-between text-xs tracking-widest text-zinc-400 uppercase">
              <span>Discovered</span>
              <span className="text-white">
                {unlockedCount}/{endingsCount}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-blood to-ember transition-all duration-1000"
                style={{ width: `${(unlockedCount / endingsCount) * 100}%` }}
              />
            </div>
            <Link href="/endings" className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white">
              Open the endings explorer <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="scrollbar-none relative mt-10 -mx-5 flex snap-x gap-5 overflow-x-auto px-5 pb-4 sm:-mx-10 sm:px-10 lg:-mx-20 lg:px-20">
          {story.endings.map((e, i) => (
            <div key={e.id} className="w-[78vw] shrink-0 snap-start sm:w-[340px]">
              <EndingCard
                ending={e}
                index={i}
                unlocked={unlocked[e.id]}
                seenDecisions={hydrated ? progress.seenScenes : []}
                onReplay={(en) => navigate(`/watch?ending=${en.id}`, en.title.toUpperCase())}
                onDecision={(d) => navigate(`/watch?decision=${d}`, `DECISION ${engine.decision(d).index}`)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- your path */}
      {hydrated && decisionsMade > 0 && (
        <section className="border-t border-white/5 bg-coal px-5 py-20 sm:px-10 lg:px-20">
          <p className="font-display text-sm tracking-[0.5em] text-ember">Your current path</p>
          <ol className="mt-6 flex flex-wrap items-center gap-3">
            <li className="text-sm text-zinc-500">Opening</li>
            {progress.history.map((h) => {
              const r = engine.choice(h.choiceId);
              if (!r) return null;
              return (
                <li key={h.decisionId} className="flex items-center gap-3">
                  <ArrowRight className="h-4 w-4 text-zinc-600" />
                  <button
                    onClick={() => navigate(`/watch?decision=${h.decisionId}`, `DECISION ${r.decision.index}`)}
                    className="panel-metal rounded-lg px-4 py-2 text-left transition hover:border-crimson/60"
                    title="Return to this decision"
                  >
                    <span className="block text-[10px] tracking-[0.3em] text-ember uppercase">Decision {r.decision.index}</span>
                    <span className="font-display text-xl tracking-wide">{r.choice.label.replace(/\.$/, "")}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <footer className="border-t border-white/5 bg-ink px-5 py-10 text-xs text-zinc-600 sm:px-10 lg:px-20">
        <div className="flex flex-col justify-between gap-3 sm:flex-row">
          <p>Personal, local playback of a disc you own. Footage, story and choices come from the DVD — nothing is uploaded.</p>
          <p>
            <Link href="/story-map" className="hover:text-zinc-300">
              Story map &amp; diagnostics
            </Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
