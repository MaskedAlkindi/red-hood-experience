"""
Explore the whole DVD navigation graph with the VM, starting from First Play.

Output: analysis/dvd_graph.json + analysis/dvd_graph.txt
Each node is a playable PGC entry point; edges come from button presses, timeouts
(post commands after the last cell) and title-end post commands.
"""
import json
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vm import VM, Loc, State, Halt, clone  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
A = ROOT / "analysis"


def node_id(loc):
    if isinstance(loc, tuple):
        return loc[0]
    base = f"{loc.domain}{'' if loc.domain in ('FP', 'VMGM') else loc.vts}_PGC{loc.pgcn}"
    if loc.pgn != 1:
        base += f"_PG{loc.pgn}"
    if loc.cell:
        base += f"_C{loc.cell}"
    return base


def main():
    nav = json.loads((A / "dvd_nav.json").read_text(encoding="utf-8"))
    buttons = json.loads((A / "dvd_buttons.json").read_text(encoding="utf-8"))
    vm = VM(nav)

    def buttons_for(loc):
        label = "VMGM" if loc.domain == "VMGM" else f"VTS{loc.vts} menu"
        pgc = vm.pgc(loc)
        cells = {(c["vob_id"], c["cell_id"]) for c in pgc["cells"]}
        out = []
        for entry in buttons.get(label, []):
            if entry["cell"] and tuple(entry["cell"]) in cells:
                out.append(entry)
        return out

    def play_cells(loc):
        pgc = vm.pgc(loc)
        start = loc.cell or (pgc["program_map"][loc.pgn - 1] if pgc["program_map"] else 1)
        cells = []
        ends = "post"
        loops = False
        for c in pgc["cells"][start - 1:]:
            cells.append(c)
            if c["still_time"] == 255:
                ends = "still"
                break
            if c["cell_cmd"]:
                asm = pgc["cellcmds"][c["cell_cmd"] - 1]["asm"]
                if "LinkTopC" in asm:
                    loops = True
                    ends = "loop"
                break
        return cells, ends, loops

    st0 = State()
    trace = []
    start = vm.settle(st0, Loc("FP", 0, 0), trace)
    nodes, edges = {}, []
    q = deque([(start, st0)])
    seen = set()
    while q:
        loc, st = q.popleft()
        k = (loc.key(), tuple(st.g))
        if k in seen:
            continue
        seen.add(k)
        nid = node_id(loc)
        cells, ends, loops = play_cells(loc)
        pgc = vm.pgc(loc)
        if nid not in nodes:
            nodes[nid] = {
                "id": nid, "domain": loc.domain, "vts": loc.vts, "pgcn": loc.pgcn, "pgn": loc.pgn,
                "cell": loc.cell,
                "cells": [{"vob_id": c["vob_id"], "cell_id": c["cell_id"], "duration": c["duration"],
                           "first_sector": c["first_sector"], "last_sector": c["last_sector"]} for c in cells],
                "duration": round(sum(c["duration"] for c in cells), 3),
                "ends": ends, "buttons": []}
        # edges
        if loc.domain in ("VMGM", "VTSM"):
            for bset in buttons_for(loc):
                for b in bset["pci"]["buttons"]:
                    s2 = clone(st)
                    tr = []
                    try:
                        dest = vm.press(s2, loc, b["cmd_hex"], tr)
                    except Halt as e:
                        dest = ("HALT:" + str(e),)
                    did = node_id(dest)
                    info = {"button": b["n"], "rect": [b["x0"], b["y0"], b["x1"], b["y1"]],
                            "cell": bset["cell"], "cmd": b["cmd"], "dest": did, "via": tr,
                            "hl_start": bset["pci"].get("hli_s_ptm"), "hl_end": bset["pci"].get("hli_e_ptm")}
                    if info not in nodes[nid]["buttons"]:
                        nodes[nid]["buttons"].append(info)
                    edges.append({"from": nid, "to": did, "kind": f"button{b['n']}", "via": tr})
                    if isinstance(dest, Loc):
                        q.append((dest, s2))
        if ends == "post":
            s2 = clone(st)
            tr = []
            try:
                dest = vm.after_post(s2, loc, tr)
            except Halt as e:
                dest = ("HALT:" + str(e),)
            did = node_id(dest)
            nodes[nid]["on_end"] = did
            nodes[nid]["on_end_via"] = tr
            edges.append({"from": nid, "to": did, "kind": "end", "via": tr})
            if isinstance(dest, Loc):
                q.append((dest, s2))
    uniq = []
    for e in edges:
        if e not in uniq:
            uniq.append(e)
    (A / "dvd_graph.json").write_text(json.dumps({"start": node_id(start), "nodes": nodes, "edges": uniq}, indent=1))
    lines = [f"start: {node_id(start)}  (via {' > '.join(trace)})"]
    for n in sorted(nodes.values(), key=lambda n: (n["domain"], n["vts"], n["pgcn"], n["pgn"])):
        cs = ", ".join(f"v{c['vob_id']}c{c['cell_id']}({c['duration']:.2f}s)" for c in n["cells"])
        lines.append(f"\n[{n['id']}] dur={n['duration']:.2f}s ends={n['ends']} cells: {cs}")
        for b in n["buttons"]:
            lines.append(f"    btn{b['button']} {b['rect']} -> {b['dest']}   ({b['cmd']})")
        if "on_end" in n:
            lines.append(f"    END -> {n['on_end']}   via {' > '.join(n['on_end_via'])}")
    (A / "dvd_graph.txt").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
