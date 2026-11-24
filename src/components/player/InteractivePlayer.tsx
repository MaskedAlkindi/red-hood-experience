"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  FastForward,
  Loader2,
  Maximize,
  Minimize,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  ScrollText,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCinematicNavigate } from "@/components/fx/CinematicLink";
import { Emblem } from "@/components/fx/Atmosphere";
import { engine, formatTime, media } from "@/lib/story";
import { progressActions, updateSettings, useProgress, useSettings } from "@/lib/story/progress";
import type { DecisionScene, Ending, HistoryEntry, Step } from "@/lib/story/types";
import { DecisionOverlay } from "./DecisionOverlay";
import { EndingOverlay } from "./EndingOverlay";
import { ProgressBar } from "./ProgressBar";
import { StoryDrawer } from "./StoryDrawer";

export interface PlayerStart {
  step: Step;
  time: number;
  history: HistoryEntry[];
}

const POOL_LIMIT = 5;
const CHOICE_CONFIRM_MS = 650;

declare global {
  interface Window {
    /** Debug / test hook (used by the automated browser walkthrough). */
    __rhx?: Record<string, unknown>;
  }
}

export function InteractivePlayer({ start }: { start: PlayerStart }) {
  const navigate = useCinematicNavigate();
  const settings = useSettings();
  const progress = useProgress();

  const [step, setStep] = useState<Step>(start.step);
  const [nonce, setNonce] = useState(0);
  const nonceRef = useRef(0);
  // start position for each navigation, keyed by nonce (idempotent under StrictMode double effects)
  const startAt = useRef<{ nonce: number; t: number }>({ nonce: 0, t: start.time });

  const [time, setTime] = useState(start.time);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [paused, setPaused] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [endingShown, setEndingShown] = useState<{ ending: Ending; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const lastSave = useRef(0);
  const newlyUnlocked = useRef<Set<string>>(new Set());
  const hideTimer = useRef<number>(0);

  const clip = engine.clipForStep(step);
  const activeId = clip.id;
  const scene = step.kind === "scene" ? engine.scene(step.sceneId) : null;
  const decision: DecisionScene | null = scene?.type === "decision" ? scene : null;
  const decisionActive = !!decision && time >= decision.activeFrom && !chosen;
  const isCredits = scene?.type === "credits";
  const seekable = !!scene && scene.type !== "decision";
  const clipMedia = media.clips[activeId];

  // refs mirror state for event handlers
  const stepRef = useRef(step);
  stepRef.current = step;
  const chosenRef = useRef(chosen);
  chosenRef.current = chosen;

  // ------------------------------------------------------------------ video pool
  const pool = useMemo(() => {
    const ids = [activeId, ...engine.upcomingClips(step).filter((id) => id !== activeId)];
    return [...new Set(ids)].slice(0, POOL_LIMIT);
  }, [activeId, step]);

  const active = () => videos.current.get(activeId) ?? null;

  const safePlay = useCallback((el: HTMLVideoElement) => {
    const p = el.play();
    if (p)
      p.then(() => setNeedsGesture(false)).catch((e: DOMException) => {
        if (e.name === "NotAllowedError") setNeedsGesture(true);
      });
  }, []);

  // the run's decision history is defined by how playback started (new / resume / rewind / replay)
  useEffect(() => {
    progressActions.setHistory(start.history);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // activate the current step's clip (preloaded element if available)
  useEffect(() => {
    const el = videos.current.get(activeId);
    if (!el) return;
    videos.current.forEach((v, id) => {
      if (id !== activeId) {
        v.pause();
        v.muted = true;
      }
    });
    el.muted = settings.muted;
    el.volume = settings.volume;
    const t = startAt.current.nonce === nonce ? startAt.current.t : 0;
    if (Math.abs(el.currentTime - t) > 0.05) el.currentTime = t;
    setTime(t);
    setDuration(Number.isFinite(el.duration) ? el.duration : clip.duration);
    setSelected(null);
    setChosen(null);
    setError(null);
    setWaiting(el.readyState < 3);
    // a preload that failed earlier was ignored while inactive: retry now that it is on screen
    if (el.error) el.load();
    safePlay(el);
    if (step.kind === "scene") progressActions.sawScene(step.sceneId);
    progressActions.setCurrent(step, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  // keep volume in sync
  useEffect(() => {
    const el = active();
    if (el) {
      el.volume = settings.volume;
      el.muted = settings.muted;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.volume, settings.muted]);

  // smooth clock during decisions (countdown) – timeupdate is only ~4 Hz
  useEffect(() => {
    if (!decision) return;
    let raf = 0;
    const tick = () => {
      const el = videos.current.get(activeId);
      if (el) setTime(el.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [decision, activeId]);

  // ------------------------------------------------------------------ navigation
  const go = useCallback((next: Step, t = 0) => {
    nonceRef.current += 1;
    startAt.current = { nonce: nonceRef.current, t };
    setEndingShown(null);
    setStep(next);
    setNonce(nonceRef.current);
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((m) => (m === msg ? null : m)), 4200);
  }, []);

  const unlockEnding = useCallback(
    (endingId: string) => {
      const e = engine.ending(endingId);
      if (!e) return;
      const already = !!progress.endings[endingId];
      if (!already) newlyUnlocked.current.add(endingId);
      progressActions.unlockEnding(endingId, e.path);
      flash(`${already ? "Ending reached" : "Ending unlocked"} · ${e.title}`);
    },
    [progress.endings, flash],
  );

  const finishStory = useCallback(
    (endingId: string) => {
      const e = engine.ending(endingId);
      if (!e) return;
      active()?.pause();
      progressActions.clearCurrent();
      setEndingShown({ ending: e, isNew: newlyUnlocked.current.has(endingId) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId],
  );

  const handleEnded = useCallback(() => {
    const cur = stepRef.current;
    const { step: next, timedOutChoice } = engine.nextAfter(cur);
    if (cur.kind === "scene") {
      const s = engine.scene(cur.sceneId);
      if (s.type === "decision") {
        if (chosenRef.current) return; // a choice is already transitioning
        if (timedOutChoice)
          progressActions.recordChoice({ decisionId: s.id, choiceId: timedOutChoice.id, timedOut: true, at: Date.now() });
      } else if (s.type === "segment" && s.endingId) {
        unlockEnding(s.endingId);
      }
      if (!next && s.type !== "decision" && s.endingId) return finishStory(s.endingId);
    }
    if (next) go(next);
  }, [go, unlockEnding, finishStory]);

  const choose = useCallback(
    (choiceId: string) => {
      const cur = stepRef.current;
      if (cur.kind !== "scene" || chosenRef.current) return;
      const d = engine.scene(cur.sceneId);
      if (d.type !== "decision") return;
      const el = videos.current.get(engine.clipForStep(cur).id);
      if (!el || el.currentTime < d.activeFrom - 0.05) return; // buttons not yet active on the disc
      setChosen(choiceId);
      setSelected(choiceId);
      progressActions.recordChoice({ decisionId: d.id, choiceId, timedOut: false, at: Date.now() });
      // fade the menu audio out while the card confirms
      const v0 = el.volume;
      const t0 = performance.now();
      const fade = () => {
        const k = Math.min(1, (performance.now() - t0) / CHOICE_CONFIRM_MS);
        el.volume = v0 * (1 - k);
        if (k < 1) requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
      window.setTimeout(() => go(engine.choose(d.id, choiceId)), CHOICE_CONFIRM_MS);
    },
    [go],
  );

  const rewindTo = useCallback(
    (decisionId: string) => {
      const idx = progress.history.findIndex((h) => h.decisionId === decisionId);
      const hist =
        idx >= 0 ? progress.history.slice(0, idx) : engine.historyFromPath(engine.pathTo(decisionId) ?? []);
      progressActions.setHistory(hist);
      setDrawer(false);
      go({ kind: "scene", sceneId: decisionId });
    },
    [progress.history, go],
  );

  const replayEnding = useCallback(
    (e: Ending) => {
      progressActions.setHistory(engine.historyFromPath(e.path));
      go({ kind: "scene", sceneId: e.scene });
    },
    [go],
  );

  const restart = useCallback(() => {
    progressActions.setHistory([]);
    setDrawer(false);
    go({ kind: "scene", sceneId: engine.start });
  }, [go]);

  const skipCredits = useCallback(() => {
    if (scene?.type === "credits") finishStory(scene.endingId);
  }, [scene, finishStory]);

  // ------------------------------------------------------------------ controls
  const togglePlay = useCallback(() => {
    const el = active();
    if (!el || endingShown) return;
    if (el.paused) safePlay(el);
    else el.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, endingShown, safePlay]);

  const seek = useCallback(
    (t: number) => {
      const el = active();
      if (!el || !seekable) return;
      el.currentTime = Math.max(0, Math.min(t, (el.duration || clip.duration) - 0.25));
      setTime(el.currentTime);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, seekable, clip.duration],
  );

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (c.requestFullscreen) c.requestFullscreen().catch(() => {});
    else (active() as unknown as { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2800);
  }, []);
  useEffect(() => {
    poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [poke]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      poke();
      if (endingShown) return;
      const d = decision;
      const dirKey: Record<string, string> = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down" };
      if (d && decisionActive) {
        if (dirKey[e.key]) {
          const c = d.choices.find((x) => x.direction === dirKey[e.key]);
          if (c) {
            e.preventDefault();
            setSelected(c.id);
            return;
          }
        }
        if ((e.key === "Enter" || e.key === " ") && selected) {
          e.preventDefault();
          choose(selected);
          return;
        }
        const n = Number(e.key);
        if (n >= 1 && n <= d.choices.length) {
          choose(d.choices[n - 1].id);
          return;
        }
      }
      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "m":
        case "M":
          updateSettings({ muted: !settings.muted });
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          if (seekable) {
            e.preventDefault();
            seek(time - 10);
          }
          break;
        case "ArrowRight":
        case "l":
        case "L":
          if (seekable) {
            e.preventDefault();
            seek(time + 10);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          updateSettings({ volume: Math.min(1, settings.volume + 0.05), muted: false });
          break;
        case "ArrowDown":
          e.preventDefault();
          updateSettings({ volume: Math.max(0, settings.volume - 0.05) });
          break;
        case "s":
        case "S":
          skipCredits();
          break;
        case "h":
        case "H":
          setDrawer((x) => !x);
          break;
        case "Escape":
          setDrawer(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decision, decisionActive, selected, choose, togglePlay, toggleFullscreen, seek, seekable, time, settings, skipCredits, endingShown, poke]);

  // persist resume point on leave
  useEffect(() => {
    const save = () => {
      const el = videos.current.get(activeId);
      if (el && !endingShown) progressActions.setCurrent(stepRef.current, decision ? 0 : el.currentTime);
    };
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [activeId, decision, endingShown]);

  // test / debug hook
  useEffect(() => {
    window.__rhx = {
      state: () => ({
        step: stepRef.current,
        clip: activeId,
        time: videos.current.get(activeId)?.currentTime,
        duration: videos.current.get(activeId)?.duration,
        paused: videos.current.get(activeId)?.paused,
        readyState: videos.current.get(activeId)?.readyState,
        videoWidth: videos.current.get(activeId)?.videoWidth,
        playingElements: [...videos.current.values()].filter((v) => !v.paused).length,
        pool: [...videos.current.keys()],
        decisionActive,
        ending: endingShown?.ending.id ?? null,
        needsGesture,
        error,
      }),
      seekToEnd: (left = 1.5) => {
        const el = videos.current.get(activeId);
        if (el) el.currentTime = Math.max(0, (el.duration || clip.duration) - left);
      },
      seekTo: (t: number) => {
        const el = videos.current.get(activeId);
        if (el) el.currentTime = t;
      },
      choose,
    };
  }, [activeId, decisionActive, endingShown, needsGesture, error, choose, clip.duration]);

  // ------------------------------------------------------------------ render helpers
  const title = (() => {
    if (step.kind === "stinger") return engine.choice(step.choiceId)?.choice.label.replace(/\.$/, "") ?? "";
    if (!scene) return "";
    if (scene.type === "decision") return `Decision ${scene.index}`;
    if (scene.type === "credits") return scene.title;
    return scene.title.replace(/\.$/, "");
  })();
  const stingerLabel = step.kind === "stinger" ? engine.choice(step.choiceId)?.choice.label : null;
  const showChrome = uiVisible || paused || !!error || needsGesture;
  const VolIcon = settings.muted || settings.volume === 0 ? VolumeX : settings.volume < 0.5 ? Volume1 : Volume2;
  const blurMenu = !!decision && !settings.showOriginalMenus;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 overflow-hidden bg-black text-white ${!showChrome && !decision ? "hide-cursor" : ""}`}
      onMouseMove={poke}
      onTouchStart={poke}
    >
      {/* video pool: active clip + preloaded candidates */}
      {pool.map((id) => {
        const c = engine.clip(id);
        const isActive = id === activeId;
        return (
          <video
            key={id}
            ref={(el) => {
              if (el) videos.current.set(id, el);
              else videos.current.delete(id);
            }}
            src={c.src}
            poster={isActive ? undefined : undefined}
            preload="auto"
            playsInline
            muted={!isActive || settings.muted}
            data-clip={id}
            data-active={isActive || undefined}
            className="absolute inset-0 h-full w-full object-contain transition-[opacity,filter] duration-700"
            style={{
              opacity: isActive && !endingShown ? 1 : 0,
              filter: isActive && blurMenu ? "blur(7px) brightness(.45) saturate(1.15)" : "none",
              zIndex: isActive ? 1 : 0,
            }}
            onClick={() => !decision && !drawer && togglePlay()}
            onDoubleClick={toggleFullscreen}
            onTimeUpdate={(e) => {
              if (!isActive) return;
              const el = e.currentTarget;
              if (!decision) setTime(el.currentTime);
              if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
              const now = performance.now();
              if (now - lastSave.current > 3000) {
                lastSave.current = now;
                progressActions.setCurrent(stepRef.current, decision ? 0 : el.currentTime);
              }
            }}
            onDurationChange={(e) => isActive && setDuration(e.currentTarget.duration)}
            onPlay={() => isActive && setPaused(false)}
            onPause={() => isActive && setPaused(true)}
            onWaiting={() => isActive && setWaiting(true)}
            onPlaying={() => isActive && setWaiting(false)}
            onCanPlay={() => isActive && setWaiting(false)}
            onEnded={() => isActive && handleEnded()}
            onError={(e) => {
              if (!isActive) return;
              const code = e.currentTarget.error?.code;
              setError(`Could not load ${c.src}${code ? ` (media error ${code})` : ""}`);
            }}
          />
        );
      })}

      {/* stinger caption: the disc shows the chosen option in Russian; show the English line */}
      <AnimatePresence>
        {stingerLabel && (
          <motion.div
            key={stingerLabel}
            className="pointer-events-none absolute inset-x-0 bottom-[14%] z-10 text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.3, duration: 0.8 } }}
            exit={{ opacity: 0 }}
          >
            <p className="font-serif text-3xl italic text-ember drop-shadow-[0_2px_10px_rgba(0,0,0,.9)] sm:text-5xl">
              {stingerLabel}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* decision screen */}
      <AnimatePresence>
        {decision && !endingShown && (
          <DecisionOverlay
            key={`${decision.id}-${nonce}`}
            decision={decision}
            time={time}
            endAt={duration || undefined}
            selected={selected}
            chosen={chosen}
            showOriginal={settings.showOriginalMenus}
            onSelect={setSelected}
            onChoose={choose}
          />
        )}
      </AnimatePresence>

      {/* buffering */}
      {waiting && !error && !needsGesture && !endingShown && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-ember/80" />
        </div>
      )}

      {/* autoplay blocked */}
      {needsGesture && !endingShown && (
        <button
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            const el = active();
            if (el) safePlay(el);
          }}
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-crimson shadow-[0_0_60px_rgba(255,42,61,.6)]">
            <Play className="ml-1 h-10 w-10 fill-white" />
          </span>
          <span className="font-display text-2xl tracking-[0.3em]">Press to continue</span>
        </button>
      )}

      {/* media error */}
      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
          <div className="panel-metal max-w-md rounded-xl p-6 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-ember" />
            <h3 className="mt-3 font-display text-3xl tracking-wide">Scene unavailable</h3>
            <p className="mt-2 text-sm text-zinc-400">{error}</p>
            <p className="mt-1 text-xs text-zinc-500">Re-run <code>npm run media:build</code> if the processed media is missing.</p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                className="rounded-md bg-crimson px-4 py-2 text-sm hover:bg-ember"
                onClick={() => {
                  const el = active();
                  setError(null);
                  if (el) {
                    el.load();
                    safePlay(el);
                  }
                }}
              >
                Retry
              </button>
              <button className="rounded-md border border-white/15 px-4 py-2 text-sm hover:border-white/40" onClick={handleEnded}>
                Skip scene
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="panel-metal absolute top-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-2.5"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <Emblem className="h-5 w-5" />
            <span className="font-display text-lg tracking-wider">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* top bar */}
      <AnimatePresence>
        {showChrome && !endingShown && (
          <motion.header
            className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/85 to-transparent px-4 pt-4 pb-10 sm:px-8"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <button
              onClick={() => navigate("/", "")}
              className="flex items-center gap-2 rounded-full px-2 py-1.5 text-sm text-zinc-300 transition hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
            <div className="min-w-0 text-center">
              <p className="truncate text-[10px] tracking-[0.45em] text-zinc-500 uppercase">Death in the Family</p>
              <p className="truncate font-display text-xl tracking-wider text-white sm:text-2xl">{title}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {engine.decisions.map((d) => {
                const made = progress.history.find((h) => h.decisionId === d.id);
                const now = decision?.id === d.id;
                return (
                  <span
                    key={d.id}
                    title={`Decision ${d.index}`}
                    className={`hidden h-1.5 w-1.5 rounded-full sm:block ${now ? "animate-pulse bg-ember" : made ? "bg-crimson" : "bg-white/15"}`}
                  />
                );
              })}
              <button
                onClick={() => setDrawer(true)}
                className="ml-2 rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Your story"
                title="Your story (H)"
              >
                <ScrollText className="h-5 w-5" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* bottom controls */}
      <AnimatePresence>
        {showChrome && !endingShown && (
          <motion.div
            className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {!decision && (
              <ProgressBar
                time={time}
                duration={duration || clip.duration}
                buffered={buffered}
                sprite={clipMedia?.sprite}
                disabled={!seekable}
                onSeek={seek}
              />
            )}
            <div className="mt-1 flex items-center gap-1 sm:gap-2">
              <button onClick={togglePlay} className="rounded-full p-2 transition hover:bg-white/10" aria-label={paused ? "Play" : "Pause"}>
                {paused ? <Play className="h-6 w-6 fill-white" /> : <Pause className="h-6 w-6 fill-white" />}
              </button>
              {seekable && (
                <>
                  <button onClick={() => seek(time - 10)} className="rounded-full p-2 transition hover:bg-white/10" aria-label="Back 10 seconds">
                    <RotateCcw className="h-5 w-5" />
                  </button>
                  <button onClick={() => seek(time + 10)} className="rounded-full p-2 transition hover:bg-white/10" aria-label="Forward 10 seconds">
                    <RotateCw className="h-5 w-5" />
                  </button>
                </>
              )}
              <div className="group flex items-center">
                <button
                  onClick={() => updateSettings({ muted: !settings.muted })}
                  className="rounded-full p-2 transition hover:bg-white/10"
                  aria-label={settings.muted ? "Unmute" : "Mute"}
                >
                  <VolIcon className="h-5 w-5" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.muted ? 0 : settings.volume}
                  onChange={(e) => updateSettings({ volume: Number(e.target.value), muted: false })}
                  className="rhx-range ml-1 hidden w-24 sm:block"
                  style={{ ["--fill" as string]: `${(settings.muted ? 0 : settings.volume) * 100}%` }}
                  aria-label="Volume"
                />
              </div>
              {!decision && (
                <span className="ml-2 font-mono text-xs text-zinc-300 tabular-nums sm:text-sm">
                  {formatTime(time)} <span className="text-zinc-500">/ {formatTime(duration || clip.duration)}</span>
                </span>
              )}
              <div className="ml-auto flex items-center gap-1 sm:gap-2">
                {isCredits && (
                  <button
                    onClick={skipCredits}
                    className="flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm transition hover:border-crimson hover:bg-crimson/20"
                  >
                    <SkipForward className="h-4 w-4" /> Skip credits
                  </button>
                )}
                {step.kind === "stinger" && (
                  <button
                    onClick={handleEnded}
                    className="flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm transition hover:border-white/40"
                  >
                    <FastForward className="h-4 w-4" /> Skip
                  </button>
                )}
                {decision && (
                  <button
                    onClick={() => updateSettings({ showOriginalMenus: !settings.showOriginalMenus })}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition sm:text-sm ${
                      settings.showOriginalMenus ? "border-crimson bg-crimson/20" : "border-white/20 hover:border-white/40"
                    }`}
                    title="Show the disc's original decision screen"
                  >
                    <MonitorPlay className="h-4 w-4" /> DVD screen
                  </button>
                )}
                <button onClick={toggleFullscreen} className="rounded-full p-2 transition hover:bg-white/10" aria-label="Fullscreen (F)">
                  {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ending */}
      <AnimatePresence>
        {endingShown && (
          <EndingOverlay
            ending={endingShown.ending}
            isNew={endingShown.isNew}
            unlockedCount={Object.keys(progress.endings).length}
            poster={engine.clip(engine.scene(endingShown.ending.scene).clip).poster}
            onReplay={() => replayEnding(endingShown.ending)}
            onRewind={rewindTo}
            onEndings={() => navigate("/endings", "ENDINGS")}
            onHome={() => navigate("/", "")}
          />
        )}
      </AnimatePresence>

      {/* story drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="absolute inset-0 z-40 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <StoryDrawer
              history={progress.history}
              currentDecision={decision?.id ?? null}
              onRewind={rewindTo}
              onRestart={restart}
              onClose={() => setDrawer(false)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
