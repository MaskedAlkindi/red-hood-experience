"""
Build the website story graph (src/data/story.json) from the emulated DVD navigation graph.

Input : analysis/dvd_graph.json (scripts/dvd/explore.py), scripts/story/labels.json
Output: src/data/story.json

Rules (all derived from the disc):
  * Decision = menu PGC whose buttons lead to title PGCs and whose post command (timeout)
    also leads to a title PGC.
  * Choice   = a button of a decision whose destination is a title PGC (self-links ignored).
  * Stinger  = first cell of the destination PGC when the timeout path enters the same PGC
    at program 2 (or the first cell is < 10 s and followed by the segment cell).
  * Default  = the choice whose PGC equals the timeout destination.
  * Ending   = segment whose end leads into VTS 2 titles (credits) that return to the main menu.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
A = ROOT / "analysis"
OUT = ROOT / "src" / "data" / "story.json"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    g = json.loads((A / "dvd_graph.json").read_text(encoding="utf-8"))
    labels = json.loads((ROOT / "scripts" / "story" / "labels.json").read_text(encoding="utf-8"))["decisions"]
    nodes = g["nodes"]

    def is_tt(nid):
        return nid in nodes and nodes[nid]["domain"] == "TT"

    def base(nid):  # strip _PG / _C suffix
        return re.sub(r"_(PG|C)\d+$", "", nid)

    decisions = {nid: n for nid, n in nodes.items()
                 if n["domain"] == "VTSM" and n.get("on_end") and is_tt(n["on_end"])
                 and any(is_tt(b["dest"]) for b in n["buttons"])}

    # story start: title targeted by a non-decision menu button
    starts = {b["dest"] for nid, n in nodes.items() if n["domain"] == "VTSM" and nid not in decisions
              for b in n["buttons"] if is_tt(b["dest"])}
    assert len(starts) == 1, starts
    start_tt = starts.pop()

    clips = {}

    def add_clip(cid, node, cells, kind):
        assert all(cells[i]["last_sector"] + 1 == cells[i + 1]["first_sector"] for i in range(len(cells) - 1)), \
            f"non-contiguous cells for {cid}"
        key = (node["vts"], kind, cells[0]["first_sector"], cells[-1]["last_sector"])
        for c in clips.values():
            if c["_key"] == key:
                return c["id"]
        clips[cid] = {
            "id": cid, "src": f"/media/video/{cid}.mp4", "poster": f"/media/posters/{cid}.jpg",
            "duration": round(sum(c["duration"] for c in cells), 3),
            "source": {"vts": node["vts"], "vob": "menu" if kind == "menu" else "title",
                       "firstSector": cells[0]["first_sector"], "lastSector": cells[-1]["last_sector"],
                       "cells": [f"vob{c['vob_id']}/cell{c['cell_id']}" for c in cells],
                       "dvdNode": node["id"]},
            "_key": key}
        return cid

    scenes, endings = {}, []
    dec_order, dec_ids = [], {}

    def follow_credits(nid):
        """Return list of credits node ids until main menu."""
        chain = []
        cur = nid
        while is_tt(cur) and nodes[cur]["vts"] == 2:
            chain.append(cur)
            cur = nodes[cur].get("on_end")
        return chain, cur

    def segment_scene(tt_id, scene_id, title, path, cells=None):
        n = nodes[tt_id]
        cells = cells if cells is not None else n["cells"]
        clip = add_clip(scene_id, n, cells, "title")
        sc = {"id": scene_id, "type": "segment", "title": title, "clip": clip, "next": None,
              "dvd": {"node": base(tt_id), "cells": [f"vob{c['vob_id']}/cell{c['cell_id']}" for c in cells]}}
        scenes[scene_id] = sc
        nxt = n.get("on_end")
        if nxt in decisions:
            sc["next"] = visit_decision(nxt, path)
        elif is_tt(nxt) and nodes[nxt]["vts"] == 2:
            chain, final = follow_credits(nxt)
            num = len(endings) + 1
            eid = f"ending-{num}"
            prev = None
            credit_ids = []
            for i, cn in enumerate(chain):
                is_tail = i == len(chain) - 1 and len(chain) > 1
                roll_no = sum(1 for k in clips if k.startswith("credits-roll-")) + 1
                cid = add_clip("credits-tail" if is_tail else f"credits-roll-{roll_no}", nodes[cn], nodes[cn]["cells"], "title")
                sid = f"{eid}-credits" if not is_tail else f"{eid}-tail"
                scenes[sid] = {"id": sid, "type": "credits", "title": "End credits" if not is_tail else "Finale",
                               "clip": cid, "next": None, "endingId": eid, "dvd": {"node": cn}}
                if prev:
                    scenes[prev]["next"] = sid
                prev = sid
                credit_ids.append(sid)
            sc["next"] = credit_ids[0]
            sc["endingId"] = eid
            endings.append({"id": eid, "number": num, "title": title.rstrip("."), "scene": scene_id,
                            "credits": credit_ids, "path": list(path), "returnsTo": final})
        else:
            raise SystemExit(f"unhandled transition {tt_id} -> {nxt}")
        return scene_id

    def visit_decision(mid, path):
        if mid in dec_ids:
            return dec_ids[mid]
        n = decisions[mid]
        idx = len(dec_order) + 1
        did = f"decision-{idx}"
        dec_ids[mid] = did
        dec_order.append(mid)
        lab = labels[mid]
        clip = add_clip(did, n, n["cells"], "menu")
        timeout_dest = n["on_end"]
        choices = []
        btns = [b for b in n["buttons"] if is_tt(b["dest"])]
        btns.sort(key=lambda b: (b["rect"][1] > 400, b["rect"][0]))  # left, right, then bottom
        sc = {"id": did, "type": "decision", "index": idx, "title": lab["title"], "prompt": lab["prompt"],
              "original": lab["original"], "clip": clip,
              "activeFrom": round(n["cells"][0]["duration"], 3) if len(n["cells"]) > 1 else 0,
              "timeout": round(n["duration"], 3), "defaultChoice": None, "choices": choices,
              "dvd": {"node": mid}}
        scenes[did] = sc
        for b in btns:
            bl = lab["buttons"][str(b["button"])]
            dest = b["dest"]
            tnode = nodes[dest]
            x0, y0, x1, y1 = b["rect"]
            direction = "down" if y0 > 400 and len(btns) > 2 else ("left" if x0 < 340 else "right")
            if direction == "down":
                direction = "down"
            cid = f"{did}-{slug(bl['label'])}"
            is_default = base(timeout_dest) == base(dest)
            cells = tnode["cells"]
            stinger = None
            if len(cells) >= 2 and cells[0]["duration"] < 10:
                stinger = add_clip(f"{cid}-stinger", tnode, cells[:1], "title")
                cells = cells[1:]
            if is_default:
                # timeout path must enter the same PGC right after the stinger
                tn = nodes[timeout_dest]
                assert [c["first_sector"] for c in tn["cells"]] == [c["first_sector"] for c in cells], \
                    f"timeout path mismatch for {cid}"
                sc["defaultChoice"] = cid
            choices.append({"id": cid, "label": bl["label"], "original": bl["original"], "direction": direction,
                            "stingerClip": stinger, "target": None, "isDefault": is_default,
                            "dvd": {"button": b["button"], "rect": b["rect"], "command": b["cmd"],
                                    "destination": dest}})
        for ch in choices:
            ch["target"] = segment_scene(ch["dvd"]["destination"], f"scene-{ch['id']}", ch["label"],
                                         path + [ch["id"]], nodes[ch["dvd"]["destination"]]["cells"][1:]
                                         if ch["stingerClip"] else None)
        assert sc["defaultChoice"], f"no default for {mid}"
        return did

    segment_scene(start_tt, "scene-opening", "Opening", [])

    for c in clips.values():
        c.pop("_key")
    story = {
        "version": 1,
        "title": "Batman: Death in the Family",
        "year": 2020,
        "start": "scene-opening",
        "source": {
            "disc": "PAL DVD-Video (VIDEO_TS), 2 title sets",
            "navigation": "Derived by scripts/dvd/explore.py (DVD VM emulation from First Play)",
            "labels": "Translated from the disc's Russian on-screen menu text (scripts/story/labels.json)",
            "audio": "English AC-3 5.1 (stream 0x81) downmixed to AAC stereo",
        },
        "clips": clips,
        "scenes": scenes,
        "decisions": [dec_ids[m] for m in dec_order],
        "endings": endings,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(story, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"decisions={len(dec_order)} endings={len(endings)} scenes={len(scenes)} clips={len(clips)}")
    for d in story["decisions"]:
        s = scenes[d]
        print(f"  {d}: {s['title']}  ({s['dvd']['node']}) timeout={s['timeout']}s active@{s['activeFrom']}s")
        for ch in s["choices"]:
            print(f"     [{ch['direction']:5}] {ch['label']:24} -> {ch['target']}{'  (default)' if ch['isDefault'] else ''}")
    for e in endings:
        print(f"  {e['id']}: {e['title']}  via {' > '.join(e['path'])}")


if __name__ == "__main__":
    main()
