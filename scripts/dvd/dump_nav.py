"""Dump full DVD navigation (titles, PGCs, cells, commands) to analysis/."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ifo import parse_vmg, parse_vts, to_jsonable  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "movie files"
OUT = ROOT / "analysis"
OUT.mkdir(exist_ok=True)


def fmt_t(s):
    return f"{int(s // 3600):d}:{int(s % 3600 // 60):02d}:{s % 60:06.3f}"


def dump_pgc(p, lines, ind="  "):
    lines.append(f"{ind}PGC {p.number} cat=0x{p.entry:08x} programs={p.nprograms} cells={p.ncells} "
                 f"dur={fmt_t(p.duration)} next={p.next_pgcn} prev={p.prev_pgcn} goup={p.goup_pgcn} "
                 f"still={p.still_time} mode={p.playback_mode} uops=0x{p.prohibited_ops:08x}")
    for i, c in enumerate(p.pre):
        lines.append(f"{ind}  pre[{i + 1}]  {c['hex']}  {c['asm']}")
    lines.append(f"{ind}  program_map={p.program_map}")
    for c in p.cells:
        lines.append(f"{ind}  cell {c.index:3d} vob={c.vob_id:3d} cid={c.cell_id:3d} dur={fmt_t(c.duration)} "
                     f"sec={c.first_sector}-{c.last_sector} still={c.still_time} cmd={c.cell_cmd} "
                     f"blk={c.block_mode}/{c.block_type} seam={int(c.seamless)} stc={int(c.stc_discontinuity)}")
    for i, c in enumerate(p.post):
        lines.append(f"{ind}  post[{i + 1}] {c['hex']}  {c['asm']}")
    for i, c in enumerate(p.cellcmds):
        lines.append(f"{ind}  cellcmd[{i + 1}] {c['hex']}  {c['asm']}")


def main():
    lines = []
    vmg = parse_vmg(SRC / "VIDEO_TS.IFO")
    lines.append(f"== VMG  num_vts={vmg['num_vts']}")
    lines.append("-- First Play PGC")
    if vmg["first_play"]:
        dump_pgc(vmg["first_play"], lines)
    lines.append("-- Titles")
    for t in vmg["titles"]:
        lines.append(f"  TT{t['ttn']}: vts={t['vts']} vts_ttn={t['vts_ttn']} ptts={t['ptts']} angles={t['angles']} type=0x{t['type']:02x}")
    for lu in vmg["menus"]:
        lines.append(f"-- VMGM lang={lu['lang']}")
        for p in lu["pgcs"]:
            dump_pgc(p, lines)
    data = {"vmg": to_jsonable(vmg), "vts": []}
    for n in range(1, vmg["num_vts"] + 1):
        vts = parse_vts(SRC / f"VTS_{n:02d}_0.IFO")
        data["vts"].append(to_jsonable(vts))
        lines.append(f"\n== VTS {n}  video={vts['video_attr']} audio={vts['audio']} subp={vts['subpictures']}")
        for t in vts["ptt"]:
            lines.append(f"  VTS_TT{t['vts_ttn']} ptts: " + " ".join(f"{x['pgcn']}/{x['pgn']}" for x in t["ptts"]))
        lines.append("-- Title PGCs")
        for p in vts["pgcs"]:
            dump_pgc(p, lines)
        for lu in vts["menus"]:
            lines.append(f"-- VTSM lang={lu['lang']}")
            for p in lu["pgcs"]:
                dump_pgc(p, lines)
    (OUT / "dvd_nav.txt").write_text("\n".join(lines), encoding="utf-8")
    (OUT / "dvd_nav.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    print(f"wrote {OUT / 'dvd_nav.txt'} ({len(lines)} lines)")


if __name__ == "__main__":
    main()
