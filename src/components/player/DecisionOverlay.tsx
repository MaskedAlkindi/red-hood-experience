"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight, Timer } from "lucide-react";
import type { Choice, DecisionScene } from "@/lib/story/types";

interface Props {
  decision: DecisionScene;
  time: number;
  /** Actual end of the decision clip (the disc's timeout fires when the menu cell ends). */
  endAt?: number;
  selected: string | null;
  chosen: string | null;
  showOriginal: boolean;
  onSelect: (id: string) => void;
  onChoose: (id: string) => void;
}

const Arrow = ({ dir, className }: { dir: Choice["direction"]; className?: string }) =>
  dir === "left" ? (
    <ChevronLeft className={className} />
  ) : dir === "right" ? (
    <ChevronRight className={className} />
  ) : (
    <ChevronDown className={className} />
  );

/**
 * Decision screen layered over the DVD's own decision-menu footage.
 * Buttons activate exactly when the disc enables them (activeFrom) and the countdown is
 * the disc's own timeout (end of the menu cell), after which the default branch plays.
 */
export function DecisionOverlay({ decision, time, endAt, selected, chosen, showOriginal, onSelect, onChoose }: Props) {
  const active = time >= decision.activeFrom;
  const timeout = endAt && endAt > decision.activeFrom ? Math.min(endAt, decision.timeout) : decision.timeout;
  const activeSpan = timeout - decision.activeFrom;
  const remaining = Math.max(0, timeout - time);
  const frac = active ? Math.min(1, remaining / activeSpan) : 1;
  const def = decision.choices.find((c) => c.id === decision.defaultChoice)!;
  const sideChoices = decision.choices.filter((c) => c.direction !== "down");
  const down = decision.choices.find((c) => c.direction === "down");
  const urgent = active && remaining < 5;

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4 sm:px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      {!showOriginal && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,5,6,.35),rgba(5,5,6,.92)_75%)]" />
      )}

      <div className={`relative flex w-full max-w-5xl flex-col items-center ${showOriginal ? "mt-auto mb-24" : ""}`}>
        {!showOriginal && (
          <>
            <motion.p
              className="mb-3 flex items-center gap-3 font-display text-sm tracking-[0.55em] text-ember sm:text-base"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <span className="h-px w-8 bg-ember/60" />
              Decision {String(decision.index).padStart(2, "0")}
              <span className="h-px w-8 bg-ember/60" />
            </motion.p>
            <motion.h2
              className="text-metal text-center font-display text-5xl leading-[0.9] tracking-wide sm:text-7xl lg:text-8xl"
              initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            >
              {decision.title.replace(/\.$/, "")}
            </motion.h2>
            <motion.p
              className="mt-4 max-w-2xl text-center font-serif text-lg italic leading-snug text-zinc-300 sm:text-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 1 }}
            >
              {decision.prompt}
            </motion.p>
            <motion.p
              className="mt-2 hidden text-center text-xs tracking-wide text-zinc-500 sm:block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              lang="ru"
            >
              {decision.original.title} · {decision.original.prompt}
            </motion.p>
          </>
        )}

        <AnimatePresence>
          {active ? (
            <motion.div
              key="choices"
              className="mt-8 flex w-full flex-col items-center gap-4 sm:mt-10"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
            >
              <div className={`grid w-full gap-3 sm:gap-5 ${sideChoices.length === 2 ? "grid-cols-2" : "grid-cols-1"} max-w-3xl`}>
                {sideChoices.map((c) => (
                  <ChoiceCard key={c.id} c={c} selected={selected} chosen={chosen} onSelect={onSelect} onChoose={onChoose} />
                ))}
              </div>
              {down && (
                <div className="w-full max-w-sm">
                  <ChoiceCard c={down} selected={selected} chosen={chosen} onSelect={onSelect} onChoose={onChoose} />
                </div>
              )}

              {/* countdown: the DVD's timeout */}
              <motion.div
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                className="mt-3 flex w-full max-w-3xl items-center gap-3"
                aria-live="polite"
              >
                <Timer className={`h-4 w-4 shrink-0 ${urgent ? "text-ember" : "text-zinc-400"}`} />
                <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blood via-ember to-blood shadow-[0_0_14px_rgba(255,42,61,.8)]"
                    style={{ width: `${frac * 100}%` }}
                  />
                </div>
                <span className={`w-8 text-right font-mono text-sm tabular-nums ${urgent ? "text-ember" : "text-zinc-300"}`}>
                  {Math.ceil(remaining)}
                </span>
              </motion.div>
              <motion.p
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                className="text-center text-xs text-zinc-500"
              >
                If time runs out: <span className="text-zinc-300">{def.label.replace(/\.$/, "")}</span>
                <span className="hidden sm:inline"> · Use ← → {down ? "↓ " : ""}and Enter, or click</span>
              </motion.p>
            </motion.div>
          ) : (
            <motion.div
              key="wait"
              className="mt-10 flex items-center gap-2 text-xs tracking-[0.4em] text-zinc-500 uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" /> Choose your path
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ChoiceCard({
  c,
  selected,
  chosen,
  onSelect,
  onChoose,
}: {
  c: Choice;
  selected: string | null;
  chosen: string | null;
  onSelect: (id: string) => void;
  onChoose: (id: string) => void;
}) {
  const isSel = selected === c.id;
  const isChosen = chosen === c.id;
  const dimmed = chosen && !isChosen;
  const align = c.direction === "left" ? "items-start text-left" : c.direction === "right" ? "items-end text-right" : "items-center text-center";
  return (
    <motion.button
      type="button"
      data-choice={c.id}
      variants={{ hidden: { opacity: 0, y: 26, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      animate={isChosen ? { scale: [1, 1.04, 1.02], transition: { duration: 0.5 } } : undefined}
      onMouseEnter={() => onSelect(c.id)}
      onFocus={() => onSelect(c.id)}
      onClick={() => onChoose(c.id)}
      disabled={!!chosen}
      className={`panel-metal group relative flex min-h-[112px] flex-col justify-center overflow-hidden rounded-xl px-4 py-4 outline-none transition-all duration-300 sm:min-h-[140px] sm:px-7 ${align} ${
        isSel || isChosen
          ? "border-crimson/80 shadow-[0_0_0_1px_rgba(200,16,46,.6),0_0_60px_-10px_rgba(255,42,61,.6)]"
          : "hover:border-white/20"
      } ${dimmed ? "opacity-30 blur-[1px]" : ""}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-crimson/25 via-transparent to-transparent transition-opacity duration-500 ${
          isSel || isChosen ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        className={`relative mb-2 flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
          isSel || isChosen ? "border-ember bg-crimson text-white" : "border-white/20 text-zinc-300"
        }`}
      >
        <Arrow dir={c.direction} className="h-5 w-5" />
      </span>
      <span className="relative font-display text-2xl leading-none tracking-wide text-white sm:text-4xl">
        {c.label.replace(/\.$/, "")}
      </span>
      <span lang="ru" className="relative mt-1.5 text-[11px] text-zinc-500 sm:text-xs">
        {c.original}
      </span>
    </motion.button>
  );
}
