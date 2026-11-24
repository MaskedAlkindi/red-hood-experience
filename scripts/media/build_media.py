"""
Reproducible media pipeline: DVD sector ranges -> browser MP4 (H.264/AAC) + posters + scrub sprites.

  python scripts/media/build_media.py [--force] [--jobs 3] [--only clipId,...]

Reads clip definitions from src/data/story.json (each clip = exact DVD cell sector range),
streams the sectors straight from the read-only source VOBs into FFmpeg, and writes:
  public/media/video/<clip>.mp4        H.264 High, 1024x576 square pixels (16:9 DAR), 25 fps, CRF 18
                                       AAC-LC stereo 192k (English track 0x81 for titles, menu track 0x80)
  public/media/posters/<clip>.jpg      poster frame
  public/media/sprites/<clip>.jpg      scrub-preview sprite sheet (1 frame / 5 s, 160x90 tiles)
  public/media/stills/*.jpg            atmospheric stills for the landing page
  src/data/media-manifest.json         probed durations / sizes for validation
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "dvd"))
from sectors import iter_sectors  # noqa: E402

SRC = Path(os.environ.get("DVD_SOURCE", ROOT / "movie files"))
PUB = ROOT / "public" / "media"
STORY = ROOT / "src" / "data" / "story.json"
MANIFEST = ROOT / "src" / "data" / "media-manifest.json"
SPRITE_INTERVAL = 5
TILE_W, TILE_H, COLS = 160, 90, 10


def find_bin(name: str) -> str:
    p = shutil.which(name)
    if p:
        return p
    f = ROOT / "analysis" / "ffbin.txt"
    if f.exists():
        d = f.read_text().strip()
        if d.startswith("/c/"):
            d = "C:/" + d[3:]
        cand = Path(d) / (name + ".exe")
        if cand.exists():
            return str(cand)
    winget = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    for c in winget.glob(f"Gyan.FFmpeg*/**/bin/{name}.exe"):
        return str(c)
    raise SystemExit(f"{name} not found. Install with: winget install Gyan.FFmpeg")


FFMPEG, FFPROBE = find_bin("ffmpeg"), find_bin("ffprobe")


def probe(path: Path) -> dict:
    out = subprocess.run([FFPROBE, "-v", "error", "-show_entries",
                          "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,channels,sample_aspect_ratio",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def encode(clip: dict, force: bool) -> dict:
    cid = clip["id"]
    out = PUB / "video" / f"{cid}.mp4"
    src = clip["source"]
    if out.exists() and not force:
        try:
            info = probe(out)
            if abs(float(info["format"]["duration"]) - clip["duration"]) < 0.6:
                return finish(clip, out, info, cached=True)
        except Exception:
            pass
    menu = src["vob"] == "menu"
    audio_id = "0x80" if menu else "0x81"
    tmp = out.with_suffix(".tmp.mp4")
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
           "-probesize", "60M", "-analyzeduration", "60M", "-fflags", "+genpts",
           "-f", "mpeg", "-i", "pipe:0",
           "-map", "0:v:0", "-map", f"0:i:{audio_id}",
           "-vf", "scale=1024:576:flags=lanczos,setsar=1,format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-tune", "animation",
           "-profile:v", "high", "-level", "4.0", "-g", "50", "-keyint_min", "25", "-r", "25",
           "-af", "aresample=async=1:first_pts=0", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000",
           "-metadata:s:a:0", "language=eng" if not menu else "language=und",
           "-movflags", "+faststart", "-f", "mp4", str(tmp)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for chunk in iter_sectors(SRC, src["vts"], menu, src["firstSector"], src["lastSector"]):
            p.stdin.write(chunk)
    except (BrokenPipeError, OSError):
        pass
    try:
        p.stdin.close()
    except OSError:
        pass
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg failed for {cid}")
    tmp.replace(out)
    return finish(clip, out, probe(out), cached=False)


def finish(clip, out: Path, info: dict, cached: bool) -> dict:
    cid = clip["id"]
    dur = float(info["format"]["duration"])
    poster = PUB / "posters" / f"{cid}.jpg"
    if not poster.exists() or not cached:
        t = min(max(dur * 0.4, 0.5), max(dur - 0.5, 0))
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", str(out),
                        "-frames:v", "1", "-vf", "scale=1024:576", "-q:v", "3", str(poster)], check=True)
    n = max(1, math.ceil(dur / SPRITE_INTERVAL))
    rows = math.ceil(n / COLS)
    sprite = PUB / "sprites" / f"{cid}.jpg"
    if not sprite.exists() or not cached:
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(out),
                        "-vf", f"fps=1/{SPRITE_INTERVAL},scale={TILE_W}:{TILE_H},tile={COLS}x{rows}",
                        "-frames:v", "1", "-q:v", "5", str(sprite)], check=True)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = [s for s in info["streams"] if s["codec_type"] == "audio"]
    return {"id": cid, "src": clip["src"], "duration": round(dur, 3), "expectedDuration": clip["duration"],
            "bytes": int(info["format"]["size"]), "width": v["width"], "height": v["height"],
            "fps": v["r_frame_rate"], "video": v["codec_name"], "audio": a[0]["codec_name"] if a else None,
            "audioChannels": a[0].get("channels") if a else 0,
            "poster": clip["poster"],
            "sprite": {"src": f"/media/sprites/{cid}.jpg", "interval": SPRITE_INTERVAL, "cols": COLS,
                       "rows": rows, "count": n, "w": TILE_W, "h": TILE_H},
            "cached": cached}


def make_stills(story: dict):
    """Landing-page atmosphere: frames from the opening and early story (no ending spoilers)."""
    d = PUB / "stills"
    d.mkdir(parents=True, exist_ok=True)
    picks = [("scene-opening", [0.22, 0.38, 0.55, 0.72, 0.9]),
             ("scene-decision-1-batman-saves-robin", [0.3, 0.7]),
             ("scene-decision-2-catch-the-joker", [0.25, 0.5]),
             ("scene-decision-2-kill-the-joker", [0.3, 0.6])]
    out = []
    for cid, fracs in picks:
        clip = story["clips"].get(cid)
        f = PUB / "video" / f"{cid}.mp4"
        if not clip or not f.exists():
            continue
        dur = float(probe(f)["format"]["duration"])
        for i, fr in enumerate(fracs):
            name = f"{cid}-{i + 1}.jpg"
            subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{dur * fr:.2f}", "-i", str(f),
                            "-frames:v", "1", "-q:v", "2", str(d / name)], check=True)
            out.append(f"/media/stills/{name}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    for sub in ("video", "posters", "sprites", "stills"):
        (PUB / sub).mkdir(parents=True, exist_ok=True)
    story = json.loads(STORY.read_text(encoding="utf-8"))
    clips = list(story["clips"].values())
    if args.only:
        keep = set(args.only.split(","))
        clips = [c for c in clips if c["id"] in keep]
    # longest first for better parallel packing
    clips.sort(key=lambda c: -c["duration"])
    print(f"ffmpeg: {FFMPEG}\nsource: {SRC}\nclips: {len(clips)}", flush=True)
    results = {}
    prev = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"clips": {}}
    with cf.ThreadPoolExecutor(max_workers=args.jobs) as ex:
        futs = {ex.submit(encode, c, args.force): c for c in clips}
        for fu in cf.as_completed(futs):
            c = futs[fu]
            r = fu.result()
            results[c["id"]] = r
            delta = r["duration"] - r["expectedDuration"]
            print(f"{'cached ' if r['cached'] else 'encoded'} {c['id']:48} {r['duration']:9.3f}s "
                  f"(ifo {r['expectedDuration']:.3f}, d={delta:+.3f}) {r['bytes'] / 1e6:7.1f} MB", flush=True)
    merged = prev.get("clips", {}) | results
    stills = make_stills(story)
    MANIFEST.write_text(json.dumps({"clips": dict(sorted(merged.items())), "stills": stills}, indent=2), encoding="utf-8")
    print(f"manifest: {MANIFEST}")


if __name__ == "__main__":
    main()
