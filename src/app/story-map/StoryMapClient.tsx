"use client";

import { CheckCircle2, Film, Play, ShieldAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useCinematicNavigate } from "@/components/fx/CinematicLink";
import { SiteNav } from "@/components/landing/SiteNav";
import { engine, formatTime, media, story } from "@/lib/story";
import { useHydrated, useProgress } from "@/lib/story/progress";
import { validateStory } from "@/lib/story/validate";
import type { Scene } from "@/lib/story/types";

const COL_W = 210;
const ROW_H = 92;
const NODE_W = 172;
const NODE_H = 58;

function layout() {
  // column = longest path depth from start (keeps edges left→right)
  const depth = new Map<string, number>([[engine.start, 0]]);
  const order: string[] = [];
  const visit = (id: string) => {
    if (order.includes(id)) return;
    order.push(id);
    for (const c of engine.children(id)) {
      depth.set(c, Math.max(depth.get(c) ?? 0, (depth.get(id) ?? 0) + 1));
      visit(c);
    }
  };
  visit(engine.start);
  // second pass to settle longest paths
  for (let k = 0; k < 4; k++)
    for (const id of order)
      for (const c of engine.children(id)) depth.set(c, Math.max(depth.get(c)!, depth.get(id)! + 1));
  const cols = new Map<number, string[]>();
  for (const id of order) {
    const d = depth.get(id)!;
    cols.set(d, [...(cols.get(d) ?? []), id]);
  }
  const maxRows = Math.max(...[...cols.values()].map((c) => c.length));
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of cols) {
    const off = ((maxRows - ids.length) * ROW_H) / 2;
    ids.forEach((id, i) => pos.set(id, { x: 20 + d * COL_W, y: 20 + off + i * ROW_H }));
  }
  return { pos, width: 40 + (Math.max(...cols.keys()) + 1) * COL_W, height: 40 + maxRows * ROW_H };
}

const typeStyle: Record<Scene["type"], { fill: string; stroke: string }> = {
  segment: { fill: "#16161b", stroke: "#3a3a44" },
  decision: { fill: "#3a0710", stroke: "#c8102e" },
  credits: { fill: "#0d0d10", stroke: "#2a2a31" },
};

export function StoryMapClient() {
  const navigate = useCinematicNavigate();
  const hydrated = useHydrated();
  const progress = useProgress();
  const [sel, setSel] = useState<string>(engine.start);
  const [mediaCheck, setMediaCheck] = useState<Record<string, number | "err"> | null>(null);
  const { pos, width, height } = useMemo(layout, []);
  const report = useMemo(() => validateStory(story, media), []);
  const seen = new Set(hydrated ? progress.seenScenes : []);
  const s = engine.scene(sel);
  const clip = engine.clip(s.clip);
  const m = media.clips[clip.id];

  const checkMedia = async () => {
    const out: Record<string, number | "err"> = {};
    await Promise.all(
      Object.values(story.clips).map(async (c) => {
        try {
          const r = await fetch(c.src, { method: "HEAD" });
          out[c.id] = r.ok ? Number(r.headers.get("content-length") ?? 0) : "err";
        } catch {
          out[c.id] = "err";
        }
      }),
    );
    setMediaCheck(out);
  };

  const edges: { from: string; to: string; label?: string; def?: boolean }[] = [];
  for (const sc of Object.values(story.scenes)) {
    if (sc.type === "decision")
      sc.choices.forEach((c) => edges.push({ from: sc.id, to: c.target, label: c.label.replace(/\.$/, ""), def: c.isDefault }));
    else if (sc.next) edges.push({ from: sc.id, to: sc.next });
  }

  return (
    <main className="relative min-h-screen bg-ink pt-24">
      <SiteNav />
      <div className="px-5 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-sm tracking-[0.5em] text-ember">Diagnostics</p>
            <h1 className="text-metal font-display text-6xl leading-none">Story map</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Generated from the DVD navigation (VM emulation from First Play). Click a node for its source.
            </p>
          </div>
          <div className={`panel-metal flex items-center gap-3 rounded-lg px-4 py-3 ${report.ok ? "" : "border-crimson"}`}>
            {report.ok ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : <ShieldAlert className="h-6 w-6 text-ember" />}
            <div className="text-xs text-zinc-300">
              <p className="font-semibold">{report.ok ? "Graph valid" : "Graph has errors"}</p>
              <p>
                {report.stats.scenes} scenes · {report.stats.decisions} decisions · {report.stats.choices} choices ·{" "}
                {report.stats.endingsReached.length}/{report.stats.endings} endings reachable · {report.stats.playthroughs} playthroughs
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-[#3a3a44] bg-[#16161b]" /> Segment</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-crimson bg-[#3a0710]" /> Decision</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-[#2a2a31] bg-[#0d0d10]" /> Credits</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-emerald-400" /> Watched</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-5 bg-ember" /> Default (timeout) branch</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto border-y border-white/5 bg-coal">
        <svg width={width} height={height} className="block">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#55555f" />
            </marker>
            <marker id="arrRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#ff2a3d" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <g key={`${e.from}-${e.to}`}>
                <path
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={e.def ? "#ff2a3d" : "#44444d"}
                  strokeWidth={e.def ? 1.6 : 1.2}
                  markerEnd={`url(#${e.def ? "arrRed" : "arr"})`}
                />
                {e.label && (
                  <text
                    x={x2 - 6}
                    y={y2 - 7}
                    textAnchor="end"
                    fontSize="10"
                    fill={e.def ? "#ff6b78" : "#b4b4bd"}
                    stroke="#0b0b0d"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {Object.values(story.scenes).map((sc) => {
            const p = pos.get(sc.id)!;
            const st = typeStyle[sc.type];
            const label =
              sc.type === "decision" ? `D${sc.index} · ${sc.title.replace(/\.$/, "")}` : sc.title.replace(/\.$/, "");
            const end = sc.type === "segment" && sc.endingId ? engine.ending(sc.endingId) : undefined;
            return (
              <g key={sc.id} onClick={() => setSel(sc.id)} className="cursor-pointer">
                <rect
                  x={p.x}
                  y={p.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={st.fill}
                  stroke={sel === sc.id ? "#ffffff" : st.stroke}
                  strokeWidth={sel === sc.id ? 2 : 1}
                />
                <text x={p.x + 10} y={p.y + 22} fontSize="12" fill="#e7e7ea" fontWeight={600}>
                  {label.length > 24 ? label.slice(0, 23) + "…" : label}
                </text>
                <text x={p.x + 10} y={p.y + 40} fontSize="10" fill="#8a8a95">
                  {end ? `ENDING ${end.number} · ` : ""}
                  {formatTime(engine.clip(sc.clip).duration)} · {sc.dvd.node}
                </text>
                {seen.has(sc.id) && <circle cx={p.x + NODE_W - 10} cy={p.y + 10} r={4} fill="#34d399" />}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-6 px-5 py-8 sm:px-10 lg:grid-cols-2">
        <section className="panel-metal rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] tracking-[0.35em] text-ember uppercase">{s.type}</p>
              <h2 className="font-display text-3xl tracking-wide">{s.type === "decision" ? `Decision ${s.index}: ${s.title}` : s.title}</h2>
              <p className="font-mono text-xs text-zinc-500">{s.id}</p>
            </div>
            {s.type === "decision" ? (
              <button
                onClick={() => navigate(`/watch?decision=${s.id}`, `DECISION ${s.index}`)}
                className="flex items-center gap-1.5 rounded-md bg-crimson px-3 py-1.5 text-sm hover:bg-ember"
              >
                <Play className="h-3.5 w-3.5 fill-white" /> Play
              </button>
            ) : null}
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-zinc-500">Clip</dt>
            <dd className="font-mono text-xs text-zinc-300">{clip.src}</dd>
            <dt className="text-zinc-500">Duration</dt>
            <dd className="text-zinc-300">
              {clip.duration.toFixed(2)}s (DVD) {m ? `· ${m.duration.toFixed(2)}s (encoded)` : "· not encoded"}
            </dd>
            <dt className="text-zinc-500">DVD source</dt>
            <dd className="text-zinc-300">
              VTS {clip.source.vts} {clip.source.vob} VOBs · sectors {clip.source.firstSector}–{clip.source.lastSector} ·{" "}
              {clip.source.cells.join(", ")}
            </dd>
            <dt className="text-zinc-500">DVD node</dt>
            <dd className="font-mono text-xs text-zinc-300">{s.dvd.node}</dd>
            {s.type !== "decision" && (
              <>
                <dt className="text-zinc-500">Next</dt>
                <dd className="text-zinc-300">{s.next ?? (s.endingId ? `end of story (${s.endingId})` : "—")}</dd>
              </>
            )}
            {s.type === "decision" && (
              <>
                <dt className="text-zinc-500">Buttons active</dt>
                <dd className="text-zinc-300">
                  from {s.activeFrom}s · timeout at {s.timeout}s
                </dd>
              </>
            )}
          </dl>
          {s.type === "decision" && (
            <ul className="mt-4 space-y-2">
              {s.choices.map((c) => (
                <li key={c.id} className="rounded-md border border-white/5 bg-black/30 p-3 text-xs">
                  <p className="text-sm text-white">
                    {c.direction.toUpperCase()} · {c.label} {c.isDefault && <span className="text-ember">(default on timeout)</span>}
                  </p>
                  <p className="text-zinc-500">
                    DVD button {c.dvd.button} rect {c.dvd.rect.join(",")} · <span className="font-mono">{c.dvd.command}</span>
                  </p>
                  <p className="text-zinc-500">
                    stinger {c.stingerClip ?? "—"} → <button className="text-zinc-300 underline" onClick={() => setSel(c.target)}>{c.target}</button>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel-metal rounded-xl p-5">
          <h2 className="font-display text-3xl tracking-wide">Validation</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {report.issues.length === 0 && (
              <li className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> No broken references, unreachable scenes, dead ends or missing media entries.
              </li>
            )}
            {report.issues.map((i, k) => (
              <li key={k} className={i.level === "error" ? "text-ember" : "text-amber-300"}>
                [{i.code}] {i.message}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center gap-3">
            <button onClick={checkMedia} className="flex items-center gap-2 rounded-md border border-white/15 px-3 py-1.5 text-sm hover:border-white/40">
              <Film className="h-4 w-4" /> Check media files
            </button>
            {mediaCheck && (
              <span className="text-sm text-zinc-300">
                {Object.values(mediaCheck).filter((v) => v !== "err").length}/{Object.keys(story.clips).length} files served
              </span>
            )}
          </div>
          {mediaCheck && (
            <ul className="mt-3 max-h-64 space-y-0.5 overflow-y-auto font-mono text-[11px]">
              {Object.entries(mediaCheck).map(([id, v]) => (
                <li key={id} className={v === "err" ? "text-ember" : "text-zinc-400"}>
                  {v === "err" ? <XCircle className="mr-1 inline h-3 w-3" /> : <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-400" />}
                  {id} {v !== "err" && `· ${(v / 1e6).toFixed(1)} MB`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
