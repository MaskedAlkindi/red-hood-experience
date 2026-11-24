"""Dump unique button sets per menu cell (and detect buttons in title VOBs)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ifo import parse_vmg, parse_vts  # noqa: E402
from navpack import scan  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "movie files"
OUT = ROOT / "analysis"
SCAN_TITLES = "--titles" in sys.argv


def cell_of(cadt, sector):
    for c in cadt:
        if c["start"] <= sector <= c["end"]:
            return c["vob_id"], c["cell_id"]
    return None


def collect(files, cadt, label, lines, result):
    seen = {}
    for sector, pci in scan(files):
        key = (cell_of(cadt, sector), tuple(b["cmd_hex"] + str((b["x0"], b["y0"], b["x1"], b["y1"])) for b in pci["buttons"]))
        if key in seen:
            seen[key]["last_sector"] = sector
            seen[key]["count"] += 1
            continue
        seen[key] = {"first_sector": sector, "last_sector": sector, "count": 1, "pci": pci, "cell": key[0]}
    lines.append(f"===== {label}")
    out = []
    for v in seen.values():
        pci = v["pci"]
        lines.append(f"-- cell(vob,cid)={v['cell']} sectors {v['first_sector']}-{v['last_sector']} navpacks={v['count']} "
                     f"btns={pci.get('btn_ns')} hl_s={pci.get('hli_s_ptm')} hl_e={pci.get('hli_e_ptm')} "
                     f"btn_end={pci.get('btn_se_e_ptm')} fosl={pci.get('fosl_btnn')} foac={pci.get('foac_btnn')} vobu_s={pci['s_ptm']}")
        for b in pci["buttons"]:
            lines.append(f"     btn{b['n']} ({b['x0']},{b['y0']})-({b['x1']},{b['y1']}) auto={b['auto']} "
                         f"u{b['up']} d{b['down']} l{b['left']} r{b['right']}  {b['cmd']}")
        out.append({k: v[k] for k in ("first_sector", "last_sector", "count", "cell")} | {"pci": pci})
    result[label] = out


def main():
    lines, result = [], {}
    vmg = parse_vmg(SRC / "VIDEO_TS.IFO")
    collect([SRC / "VIDEO_TS.VOB"], vmg["menu_c_adt"], "VMGM", lines, result)
    for n in range(1, vmg["num_vts"] + 1):
        vts = parse_vts(SRC / f"VTS_{n:02d}_0.IFO")
        collect([SRC / f"VTS_{n:02d}_0.VOB"], vts["menu_c_adt"], f"VTS{n} menu", lines, result)
        if SCAN_TITLES:
            files = sorted(SRC.glob(f"VTS_{n:02d}_[1-9].VOB"))
            collect(files, vts["c_adt"], f"VTS{n} titles", lines, result)
    (OUT / "dvd_buttons.txt").write_text("\n".join(lines), encoding="utf-8")
    (OUT / "dvd_buttons.json").write_text(json.dumps(result, indent=1, default=str), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
