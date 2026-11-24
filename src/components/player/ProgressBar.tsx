"use client";

import { useRef, useState } from "react";
import { formatTime } from "@/lib/story";
import type { MediaClipInfo } from "@/lib/story/types";

interface Props {
  time: number;
  duration: number;
  buffered: number;
  sprite?: MediaClipInfo["sprite"];
  disabled?: boolean;
  onSeek: (t: number) => void;
}

/** Seekable progress bar with buffered range and sprite-sheet hover previews. */
export function ProgressBar({ time, duration, buffered, sprite, disabled, onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const pct = duration ? ((drag ?? time) / duration) * 100 : 0;
  const bpct = duration ? (buffered / duration) * 100 : 0;

  const tAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { x: f * r.width, t: f * duration, w: r.width };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || !duration) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(tAt(e.clientX).t);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!duration) return;
    const { x, t } = tAt(e.clientX);
    setHover({ x, t });
    if (drag !== null) setDrag(t);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag === null) return;
    onSeek(tAt(e.clientX).t);
    setDrag(null);
  };

  const tile = (() => {
    if (!sprite || !hover) return null;
    const i = Math.min(sprite.count - 1, Math.floor(hover.t / sprite.interval));
    return { col: i % sprite.cols, row: Math.floor(i / sprite.cols) };
  })();

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-disabled={disabled}
      tabIndex={-1}
      className={`group relative h-5 w-full touch-none select-none ${disabled ? "cursor-default" : "cursor-pointer"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
    >
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15 transition-all group-hover:h-[5px]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${bpct}%` }} />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blood via-crimson to-ember shadow-[0_0_12px_rgba(255,42,61,.6)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      {!disabled && (
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow-[0_0_0_4px_rgba(200,16,46,.45)] transition-transform group-hover:scale-100"
          style={{ left: `${pct}%` }}
        />
      )}
      {hover && !disabled && (
        <div
          className="pointer-events-none absolute bottom-6 -translate-x-1/2"
          style={{ left: Math.min(Math.max(hover.x, 90), (ref.current?.clientWidth ?? 0) - 90) }}
        >
          {sprite && tile && (
            <div
              className="mb-1.5 overflow-hidden rounded-md border border-white/15 shadow-2xl"
              style={{
                width: sprite.w,
                height: sprite.h,
                backgroundImage: `url(${sprite.src})`,
                backgroundPosition: `-${tile.col * sprite.w}px -${tile.row * sprite.h}px`,
                backgroundSize: `${sprite.cols * sprite.w}px ${sprite.rows * sprite.h}px`,
              }}
            />
          )}
          <div className="text-center font-mono text-xs text-white/90">{formatTime(hover.t)}</div>
        </div>
      )}
    </div>
  );
}
