"""
Scan VOB files for NAV packs and extract PCI highlight (button) information.

NAV pack layout (2048-byte sector):
  0     pack header (14)
  14    system header (24)
  38    PES 0x1BF, substream 0x00 -> PCI (data at 45)
  1024  PES 0x1BF, substream 0x01 -> DSI (data at 1031)
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ifo import disasm  # noqa: E402

SECTOR = 2048


def parse_pci(sec: bytes):
    if sec[0:4] != b"\x00\x00\x01\xba" or sec[38:42] != b"\x00\x00\x01\xbf" or sec[44] != 0:
        return None
    p = sec[45:45 + 980]
    lbn, = struct.unpack_from(">I", p, 0)
    s_ptm, e_ptm = struct.unpack_from(">II", p, 12)
    h = 0x60
    hli_ss = struct.unpack_from(">H", p, h)[0] & 3
    out = {"lbn": lbn, "s_ptm": s_ptm, "e_ptm": e_ptm, "hli_ss": hli_ss, "buttons": []}
    if hli_ss == 0:
        return out
    hs_ptm, he_ptm, bse_ptm = struct.unpack_from(">III", p, h + 2)
    btn_md = struct.unpack_from(">H", p, h + 14)[0]
    btn_sn, btn_ns, nsl_btn_ns = p[h + 16], p[h + 17], p[h + 18]
    fosl, foac = p[h + 20], p[h + 21]
    out.update({"hli_s_ptm": hs_ptm, "hli_e_ptm": he_ptm, "btn_se_e_ptm": bse_ptm, "btn_md": btn_md,
                "btn_ofn": btn_sn, "btn_ns": btn_ns, "nsl_btn_ns": nsl_btn_ns,
                "fosl_btnn": fosl, "foac_btnn": foac})
    bt = h + 22 + 24
    for i in range(btn_ns):
        q = bt + 18 * i
        a = int.from_bytes(p[q:q + 3], "big")
        b = int.from_bytes(p[q + 3:q + 6], "big")
        raw = bytes(p[q + 10:q + 18])
        out["buttons"].append({
            "n": i + 1,
            "x0": (a >> 12) & 0x3FF, "x1": a & 0x3FF,
            "y0": (b >> 12) & 0x3FF, "y1": b & 0x3FF,
            "auto": (b >> 22) & 3, "color": (a >> 22) & 3,
            "up": p[q + 6] & 0x3F, "down": p[q + 7] & 0x3F, "left": p[q + 8] & 0x3F, "right": p[q + 9] & 0x3F,
            "cmd_hex": raw.hex(), "cmd": disasm(raw)})
    return out


def scan(files: list[Path], only_hli=True, step_check=None):
    """Yield (absolute sector, pci) for every NAV pack across concatenated files."""
    base = 0
    for f in files:
        with f.open("rb") as fh:
            idx = 0
            while True:
                chunk = fh.read(SECTOR * 4096)
                if not chunk:
                    break
                for k in range(0, len(chunk), SECTOR):
                    sec = chunk[k:k + SECTOR]
                    if sec[14:18] == b"\x00\x00\x01\xbb":
                        pci = parse_pci(sec)
                        if pci and (not only_hli or pci["hli_ss"]):
                            yield base + idx, pci
                    idx += 1
        base += f.stat().st_size // SECTOR
