"""
Media / transition verification against the ORIGINAL DVD source.

For every processed clip:
  * frame-accurate cut check: first & last decoded frame of the MP4 vs the frame decoded
    directly from the DVD sector range (PSNR, same scaling)
  * frame count vs IFO cell playback time (25 fps)
  * audio present and not silent (max volume)
For every decision choice:
  * decision clip -> (stinger) -> target segment chain exists and is decodable,
    timeout path -> default target without stinger.

  python scripts/validate/test_media_transitions.py [--quick]
Writes analysis/media_test_report.json and exits non-zero on failure.
"""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "dvd"))
sys.path.insert(0, str(ROOT / "scripts" / "media"))
from sectors import iter_sectors  # noqa: E402
from build_media import FFMPEG, SRC  # noqa: E402

W, H = 256, 144  # comparison resolution
FRAME = W * H * 3
TAIL_SECTORS = 2500


def decode_frames(args, stdin_iter=None):
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", *args, "-vf", f"scale={W}:{H}:flags=area",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    if stdin_iter is None:
        out = subprocess.run(cmd, capture_output=True, check=True).stdout
    else:
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        import threading
        chunks = []
        t = threading.Thread(target=lambda: chunks.append(p.stdout.read()))
        t.start()
        try:
            for b in stdin_iter:
                p.stdin.write(b)
        except (BrokenPipeError, OSError):
            pass
        try:
            p.stdin.close()
        except OSError:
            pass
        t.join()
        p.wait()
        out = chunks[0]
    n = len(out) // FRAME
    return np.frombuffer(out[: n * FRAME], np.uint8).reshape(n, H, W, 3) if n else np.zeros((0, H, W, 3), np.uint8)


def psnr(a, b):
    mse = np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2)
    return 99.0 if mse < 1e-6 else float(10 * np.log10(255 ** 2 / mse))


def best_match(frame, candidates):
    """PSNR against the best matching candidate frame and its offset (handles off-by-one)."""
    scores = [psnr(frame, c) for c in candidates]
    i = int(np.argmax(scores)) if scores else -1
    return (scores[i], i) if scores else (0.0, -1)


def check_clip(clip, quick=False):
    src = clip["source"]
    menu = src["vob"] == "menu"
    mp4 = ROOT / "public" / clip["src"].lstrip("/")
    res = {"id": clip["id"], "ok": True, "notes": []}
    if not mp4.exists():
        return res | {"ok": False, "notes": ["missing mp4"]}
    # first frames
    enc_head = decode_frames(["-i", str(mp4), "-frames:v", "3"])
    dvd_head = decode_frames(["-f", "mpeg", "-i", "pipe:0", "-frames:v", "3"],
                             iter_sectors(SRC, src["vts"], menu, src["firstSector"], min(src["lastSector"], src["firstSector"] + 1500)))
    res["firstFramePSNR"], off = best_match(enc_head[0], dvd_head) if len(enc_head) and len(dvd_head) else (0, -1)
    res["firstFrameOffset"] = off
    # last frames
    enc_tail = decode_frames(["-sseof", "-1.5", "-i", str(mp4)])
    dvd_tail = decode_frames(["-f", "mpeg", "-i", "pipe:0"],
                             iter_sectors(SRC, src["vts"], menu, max(src["firstSector"], src["lastSector"] - TAIL_SECTORS), src["lastSector"]))
    if len(enc_tail) and len(dvd_tail):
        res["lastFramePSNR"], k = best_match(enc_tail[-1], dvd_tail[-4:])
        res["lastFrameOffset"] = k - (min(4, len(dvd_tail)) - 1)
    else:
        res["lastFramePSNR"], res["lastFrameOffset"] = 0, None
    # frames & audio
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", str(mp4), "-map", "0:a:0", "-af", "volumedetect",
                           "-f", "null", "-"], capture_output=True, text=True).stderr
    mv = re.search(r"max_volume: (-?[\d.]+) dB", info)
    res["audioMaxDb"] = float(mv.group(1)) if mv else None
    probe = subprocess.run([FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), "-v", "error", "-select_streams", "v:0",
                            "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(mp4)],
                           capture_output=True, text=True).stdout.strip()
    res["frames"] = int(probe) if probe.isdigit() else None
    res["expectedFrames"] = round(clip["duration"] * 25)
    if res["firstFramePSNR"] < 32:
        res["ok"] = False
        res["notes"].append("first frame does not match DVD cell start")
    if res["lastFramePSNR"] < 30:
        res["ok"] = False
        res["notes"].append("last frame does not match DVD cell end")
    if res["frames"] is not None and abs(res["frames"] - res["expectedFrames"]) > 2:
        # IFO playback time can exceed the cell's real content; count frames in the source itself
        p = subprocess.Popen([FFMPEG, "-hide_banner", "-f", "mpeg", "-i", "pipe:0", "-map", "0:v:0", "-f", "null", "-"],
                             stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        import threading
        err = []
        t = threading.Thread(target=lambda: err.append(p.stderr.read().decode("utf-8", "replace")))
        t.start()
        try:
            for b in iter_sectors(SRC, src["vts"], menu, src["firstSector"], src["lastSector"]):
                p.stdin.write(b)
        except (BrokenPipeError, OSError):
            pass
        p.stdin.close()
        t.join()
        p.wait()
        frames = re.findall(r"frame=\s*(\d+)", err[0])
        res["sourceFrames"] = int(frames[-1]) if frames else None
        res["notes"].append(f"IFO time implies {res['expectedFrames']} frames; DVD cell actually contains {res['sourceFrames']}")
        res["expectedFrames"] = res["sourceFrames"]
    if res["frames"] is None or res["expectedFrames"] is None or abs(res["frames"] - res["expectedFrames"]) > 2:
        res["ok"] = False
        res["notes"].append(f"frame count {res['frames']} != {res['expectedFrames']}")
    if res["audioMaxDb"] is None or res["audioMaxDb"] < -60:
        res["ok"] = False
        res["notes"].append("audio missing/silent")
    return res


def main():
    story = json.loads((ROOT / "src/data/story.json").read_text(encoding="utf-8"))
    clips = list(story["clips"].values())
    only = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
    prev_path = ROOT / "analysis" / "media_test_report.json"
    prev = {r["id"]: r for r in json.loads(prev_path.read_text())["clips"]} if only and prev_path.exists() else {}
    todo = [c for c in clips if not only or c["id"] in only]
    with ThreadPoolExecutor(max_workers=4) as ex:
        fresh = {r["id"]: r for r in ex.map(check_clip, todo)}
    results = [fresh.get(c["id"]) or prev[c["id"]] for c in clips]
    by_id = {r["id"]: r for r in results}
    ok = all(r["ok"] for r in results)
    for r in sorted(results, key=lambda r: r["id"]):
        print(f"{'PASS' if r['ok'] else 'FAIL'} {r['id']:46} first {r['firstFramePSNR']:5.1f}dB(off {r['firstFrameOffset']}) "
              f"last {r['lastFramePSNR']:5.1f}dB(off {r['lastFrameOffset']}) frames {r['frames']}/{r['expectedFrames']} "
              f"audio {r['audioMaxDb']}dB {'; '.join(r['notes'])}")

    # transitions
    transitions = []
    for did in story["decisions"]:
        d = story["scenes"][did]
        for c in d["choices"]:
            target = story["scenes"][c["target"]]
            chain = [d["clip"]] + ([c["stingerClip"]] if c["stingerClip"] else []) + [target["clip"]]
            t_ok = all(by_id.get(x, {}).get("ok") for x in chain)
            transitions.append({"decision": did, "choice": c["id"], "chain": chain, "ok": t_ok, "kind": "active"})
            if c["isDefault"]:
                chain2 = [d["clip"], target["clip"]]
                transitions.append({"decision": did, "choice": c["id"], "chain": chain2,
                                    "ok": all(by_id.get(x, {}).get("ok") for x in chain2), "kind": "timeout"})
    print()
    for t in transitions:
        print(f"{'PASS' if t['ok'] else 'FAIL'} {t['kind']:7} {t['choice']:44} {' -> '.join(t['chain'])}")
    ok = ok and all(t["ok"] for t in transitions)
    report = {"ok": ok, "clips": results, "transitions": transitions}
    (ROOT / "analysis" / "media_test_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"\n{len(results)} clips, {len(transitions)} transitions: {'ALL PASSED' if ok else 'FAILURES'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
