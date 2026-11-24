"""
DVD-Video IFO parser + VM command disassembler (stdlib only).

Structures follow the DVD-Video spec as documented by libdvdread (ifo_types.h)
and libdvdnav (vmcmd.c). Used to extract the real navigation of the disc.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass, field, asdict
from pathlib import Path

SECTOR = 2048


def u8(b, o): return b[o]
def u16(b, o): return struct.unpack_from(">H", b, o)[0]
def u32(b, o): return struct.unpack_from(">I", b, o)[0]


def bcd(x: int) -> int:
    return (x >> 4) * 10 + (x & 0xF)


def dvd_time(b, o):
    """4-byte BCD time -> (seconds float, fps)."""
    h, m, s, f = b[o], b[o + 1], b[o + 2], b[o + 3]
    fps_code = (f >> 6) & 3
    fps = {1: 25.0, 3: 29.97}.get(fps_code, 25.0)
    frames = bcd(f & 0x3F)
    return bcd(h) * 3600 + bcd(m) * 60 + bcd(s) + frames / fps, fps


# ---------------------------------------------------------------- VM commands

CMP = {1: "&", 2: "==", 3: "!=", 4: ">=", 5: ">", 6: "<=", 7: "<"}
SETOP = {1: "=", 2: "<->", 3: "+=", 4: "-=", 5: "*=", 6: "/=", 7: "%=", 8: "rnd", 9: "&=", 10: "|=", 11: "^="}
LINKSUB = {0: "LinkNoLink", 1: "LinkTopC", 2: "LinkNextC", 3: "LinkPrevC", 5: "LinkTopPG",
           6: "LinkNextPG", 7: "LinkPrevPG", 9: "LinkTopPGC", 10: "LinkNextPGC",
           11: "LinkPrevPGC", 12: "LinkGoUpPGC", 13: "LinkTailPGC", 16: "RSM"}
SPRM_NAMES = {0: "MenuLang", 1: "Audio", 2: "Subpic", 3: "Angle", 4: "TTN", 5: "VTS_TTN",
              6: "TT_PGCN", 7: "PTTN", 8: "HL_BTNN", 9: "NV_TMR", 10: "NV_TMR_PGCN",
              11: "AMXMD", 12: "CC_PLT", 13: "PTL", 14: "PlayerCfgVideo", 15: "PlayerCfgAudio",
              16: "InitAudioLang", 17: "InitAudioExt", 18: "InitSubLang", 19: "InitSubExt",
              20: "Region"}


class Cmd:
    def __init__(self, raw: bytes):
        self.raw = raw
        self.v = int.from_bytes(raw, "big")

    def bits(self, start, count):
        # start = MSB index (63..0), libdvdnav convention
        return (self.v >> (start - count + 1)) & ((1 << count) - 1)


def reg(r):
    if r & 0x80:
        return f"s{r & 0x7F}"
    return f"g{r & 0x0F}"


def reg_or_data(c: Cmd, imm, start):
    if imm:
        return str(c.bits(start, 16))
    return reg(c.bits(start - 8, 8))


def if1(c):
    op = c.bits(54, 3)
    if op:
        return f"if ({reg(c.bits(39, 8))} {CMP.get(op, '?')} {reg_or_data(c, c.bits(55, 1), 31)}) "
    return ""


def if2(c):
    op = c.bits(54, 3)
    if op:
        return f"if ({reg(c.bits(15, 8))} {CMP.get(op, '?')} {reg(c.bits(7, 8))}) "
    return ""


def if3(c):
    op = c.bits(54, 3)
    if op:
        return f"if (g{c.bits(43, 4)} {CMP.get(op, '?')} {reg_or_data(c, c.bits(55, 1), 15)}) "
    return ""


def if4(c):
    op = c.bits(54, 3)
    if op:
        return f"if (g{c.bits(51, 4)} {CMP.get(op, '?')} {reg_or_data(c, c.bits(55, 1), 31)}) "
    return ""


def if5(c):
    op = c.bits(54, 3)
    if not op:
        return ""
    if c.bits(60, 1):
        return f"if (g{c.bits(31, 8) & 0xF} {CMP.get(op, '?')} {reg(c.bits(23, 8))}) "
    return f"if (g{c.bits(39, 8) & 0xF} {CMP.get(op, '?')} {reg_or_data(c, c.bits(55, 1), 31)}) "


def linksub(c):
    op = c.bits(7, 8)
    btn = c.bits(15, 6)
    s = LINKSUB.get(op, f"LinkSub?{op}")
    if btn:
        s += f" (button {btn})"
    return s


def link(c, optional):
    op = c.bits(51, 4)
    pre = ", " if (optional and op) else ""
    if op == 0:
        return "" if optional else "NOP(link)"
    if op == 1:
        return pre + linksub(c)
    if op == 4:
        return pre + f"LinkPGCN {c.bits(14, 15)}"
    if op == 5:
        b = c.bits(15, 6)
        return pre + f"LinkPTTN {c.bits(9, 10)}" + (f" (button {b})" if b else "")
    if op == 6:
        b = c.bits(15, 6)
        return pre + f"LinkPGN {c.bits(6, 7)}" + (f" (button {b})" if b else "")
    if op == 7:
        b = c.bits(15, 6)
        return pre + f"LinkCN {c.bits(7, 8)}" + (f" (button {b})" if b else "")
    return pre + f"Link?{op}"


def jump(c):
    op = c.bits(51, 4)
    if op == 1:
        return "Exit"
    if op == 2:
        return f"JumpTT {c.bits(22, 7)}"
    if op == 3:
        return f"JumpVTS_TT {c.bits(22, 7)}"
    if op == 5:
        return f"JumpVTS_PTT {c.bits(22, 7)}:{c.bits(41, 10)}"
    if op == 6:
        k = c.bits(23, 2)
        if k == 0:
            return "JumpSS FP"
        if k == 1:
            return f"JumpSS VMGM (menu {c.bits(19, 4)})"
        if k == 2:
            return f"JumpSS VTSM (vts {c.bits(30, 7)}, title {c.bits(38, 7)}, menu {c.bits(19, 4)})"
        return f"JumpSS VMGM (pgc {c.bits(46, 15)})"
    if op == 8:
        k = c.bits(23, 2)
        rsm = c.bits(31, 8)
        if k == 0:
            return f"CallSS FP (rsm_cell {rsm})"
        if k == 1:
            return f"CallSS VMGM (menu {c.bits(19, 4)}, rsm_cell {rsm})"
        if k == 2:
            return f"CallSS VTSM (menu {c.bits(19, 4)}, rsm_cell {rsm})"
        return f"CallSS VMGM (pgc {c.bits(46, 15)}, rsm_cell {rsm})"
    return f"Jump?{op}"


def special(c):
    op = c.bits(51, 4)
    if op == 0:
        return "Nop"
    if op == 1:
        return f"Goto {c.bits(7, 8)}"
    if op == 2:
        return "Break"
    if op == 3:
        return f"SetTmpPML {c.bits(11, 4)}, Goto {c.bits(7, 8)}"
    return f"Special?{op}"


def sysset(c):
    op = c.bits(59, 4)
    imm = c.bits(60, 1)
    if op == 1:
        parts = []
        for i in range(1, 4):
            if c.bits(47 - i * 8, 1):
                if imm:
                    parts.append(f"s{i} = {c.bits(47 - i * 8 - 1, 7)}")
                else:
                    parts.append(f"s{i} = g{c.bits(47 - i * 8 - 4, 4)}")
        return "SetSTN " + ", ".join(parts)
    if op == 2:
        return f"SetNVTMR s9 = {reg_or_data(c, imm, 47)}, s10 = {c.bits(31, 16)}"
    if op == 3:
        return f"SetGPRMMD g{c.bits(19, 4)} = {reg_or_data(c, imm, 47)} (counter={c.bits(23, 1)})"
    if op == 4:
        return f"SetAMXMD s11 = {reg_or_data(c, imm, 47)}"
    if op == 6:
        if imm:
            return f"SetHL_BTNN s8 = {c.bits(31, 16)} (button {c.bits(31, 16) >> 10})"
        return f"SetHL_BTNN s8 = {reg(c.bits(23, 8))}"
    return f"SysSet?{op}"


def set1(c):
    op = c.bits(59, 4)
    if op:
        return f"g{c.bits(35, 4)} {SETOP.get(op, '?')} {reg_or_data(c, c.bits(60, 1), 31)}"
    return ""


def set2(c):
    op = c.bits(59, 4)
    if op:
        return f"g{c.bits(51, 4)} {SETOP.get(op, '?')} {reg_or_data(c, c.bits(60, 1), 47)}"
    return ""


def set3(c):
    op = c.bits(59, 4)
    if op:
        if c.bits(60, 1):
            src = str(c.bits(47, 16))
        else:
            src = reg(c.bits(39, 8))
        return f"g{c.bits(51, 4)} {SETOP.get(op, '?')} {src}"
    return ""


def disasm(raw: bytes) -> str:
    c = Cmd(raw)
    t = c.bits(63, 3)
    if t == 0:
        return if1(c) + special(c)
    if t == 1:
        if c.bits(60, 1):
            return if2(c) + jump(c)
        return if1(c) + link(c, False)
    if t == 2:
        return if2(c) + sysset(c) + link(c, True)
    if t == 3:
        return if3(c) + set1(c) + link(c, True)
    if t == 4:
        return set2(c) + ", " + if4(c) + linksub(c)
    if t == 5:
        return if5(c) + "{ " + set3(c) + ", " + linksub(c) + " }"
    if t == 6:
        return if5(c) + "{ " + set3(c) + " } " + linksub(c)
    return f"Unknown {raw.hex()}"


# ---------------------------------------------------------------- PGC

@dataclass
class CellPlayback:
    index: int
    category: int
    block_mode: int
    block_type: int
    seamless: bool
    interleaved: bool
    stc_discontinuity: bool
    still_time: int
    cell_cmd: int
    duration: float
    first_sector: int
    last_vobu_start: int
    last_sector: int
    vob_id: int = 0
    cell_id: int = 0


@dataclass
class PGC:
    number: int
    entry: int  # category raw
    nprograms: int
    ncells: int
    duration: float
    prohibited_ops: int
    next_pgcn: int
    prev_pgcn: int
    goup_pgcn: int
    still_time: int
    playback_mode: int
    audio_control: list
    subp_control: list
    pre: list = field(default_factory=list)
    post: list = field(default_factory=list)
    cellcmds: list = field(default_factory=list)
    program_map: list = field(default_factory=list)
    cells: list = field(default_factory=list)


def parse_pgc(b: bytes, o: int, number: int, category: int) -> PGC:
    np_, nc = b[o + 2], b[o + 3]
    dur, _ = dvd_time(b, o + 4)
    pgc = PGC(
        number=number, entry=category, nprograms=np_, ncells=nc, duration=dur,
        prohibited_ops=u32(b, o + 8),
        next_pgcn=u16(b, o + 0x9C), prev_pgcn=u16(b, o + 0x9E), goup_pgcn=u16(b, o + 0xA0),
        still_time=b[o + 0xA2], playback_mode=b[o + 0xA3],
        audio_control=[u16(b, o + 0x0C + 2 * i) for i in range(8)],
        subp_control=[u32(b, o + 0x1C + 4 * i) for i in range(32)],
    )
    cmd_off, pm_off, cp_off, cpos_off = (u16(b, o + 0xE4), u16(b, o + 0xE6), u16(b, o + 0xE8), u16(b, o + 0xEA))
    if cmd_off:
        co = o + cmd_off
        npre, npost, ncell = u16(b, co), u16(b, co + 2), u16(b, co + 4)
        p = co + 8
        for lst, n in ((pgc.pre, npre), (pgc.post, npost), (pgc.cellcmds, ncell)):
            for _ in range(n):
                raw = bytes(b[p:p + 8])
                lst.append({"hex": raw.hex(), "asm": disasm(raw)})
                p += 8
    if pm_off:
        pgc.program_map = [b[o + pm_off + i] for i in range(np_)]
    if cp_off:
        for i in range(nc):
            q = o + cp_off + 24 * i
            b0 = b[q]
            d, _ = dvd_time(b, q + 4)
            cell = CellPlayback(
                index=i + 1, category=u32(b, q), block_mode=(b0 >> 6) & 3, block_type=(b0 >> 4) & 3,
                seamless=bool(b0 & 8), interleaved=bool(b0 & 4), stc_discontinuity=bool(b0 & 2),
                still_time=b[q + 2], cell_cmd=b[q + 3], duration=d,
                first_sector=u32(b, q + 8), last_vobu_start=u32(b, q + 16), last_sector=u32(b, q + 20))
            if cpos_off:
                cell.vob_id = u16(b, o + cpos_off + 4 * i)
                cell.cell_id = b[o + cpos_off + 4 * i + 3]
            pgc.cells.append(cell)
    return pgc


def parse_pgcit(b: bytes, o: int) -> list[PGC]:
    n = u16(b, o)
    out = []
    for i in range(n):
        cat = u32(b, o + 8 + 8 * i)
        off = u32(b, o + 8 + 8 * i + 4)
        out.append(parse_pgc(b, o + off, i + 1, cat))
    return out


def parse_pgci_ut(b: bytes, o: int):
    n = u16(b, o)
    langs = []
    for i in range(n):
        e = o + 8 + 8 * i
        lang = bytes(b[e:e + 2]).decode("latin1")
        exist = b[e + 3]
        luoff = u32(b, e + 4)
        lu = o + luoff
        npgc = u16(b, lu)
        pgcs = []
        for j in range(npgc):
            cat = u32(b, lu + 8 + 8 * j)
            off = u32(b, lu + 8 + 8 * j + 4)
            pgc = parse_pgc(b, lu + off, j + 1, cat)
            pgcs.append(pgc)
        langs.append({"lang": lang, "menu_exist": exist, "pgcs": pgcs})
    return langs


def parse_c_adt(b, o):
    n = u16(b, o)
    end = u32(b, o + 4)
    cnt = (end + 1 - 8) // 12
    return [{"vob_id": u16(b, o + 8 + 12 * i), "cell_id": b[o + 8 + 12 * i + 2],
             "start": u32(b, o + 8 + 12 * i + 4), "end": u32(b, o + 8 + 12 * i + 8)} for i in range(cnt)]


def audio_attr(b, o):
    a = b[o]
    coding = {0: "AC3", 2: "MPEG1", 3: "MPEG2", 4: "LPCM", 6: "DTS"}.get(a >> 5, "?")
    lang = bytes(b[o + 2:o + 4]).decode("latin1").strip("\x00")
    ch = (b[o + 1] & 7) + 1
    ext = b[o + 5]
    return {"coding": coding, "lang": lang, "channels": ch, "code_ext": ext}


def subp_attr(b, o):
    lang = bytes(b[o + 2:o + 4]).decode("latin1").strip("\x00")
    return {"lang": lang, "code_ext": b[o + 5]}


def parse_vmg(path: Path):
    b = path.read_bytes()
    assert b[:12] == b"DVDVIDEO-VMG"
    res = {"file": path.name, "num_vts": u16(b, 0x3E)}
    fp = u32(b, 0x84)
    res["first_play"] = parse_pgc(b, fp, 0, 0) if fp else None
    tt = u32(b, 0xC4) * SECTOR
    nt = u16(b, tt)
    res["titles"] = [{
        "ttn": i + 1, "type": b[tt + 8 + 12 * i], "angles": b[tt + 9 + 12 * i],
        "ptts": u16(b, tt + 10 + 12 * i), "vts": b[tt + 14 + 12 * i], "vts_ttn": b[tt + 15 + 12 * i],
        "start_sector": u32(b, tt + 16 + 12 * i)} for i in range(nt)]
    ut = u32(b, 0xC8)
    res["menus"] = parse_pgci_ut(b, ut * SECTOR) if ut else []
    res["menu_vobs_sector"] = u32(b, 0xC0)
    cadt = u32(b, 0xD8)
    res["menu_c_adt"] = parse_c_adt(b, cadt * SECTOR) if cadt else []
    return res


def parse_vts(path: Path):
    b = path.read_bytes()
    assert b[:12] == b"DVDVIDEO-VTS"
    res = {"file": path.name}
    res["menu_vobs_sector"] = u32(b, 0xC0)
    res["title_vobs_sector"] = u32(b, 0xC4)
    v = u16(b, 0x200)
    res["video_attr"] = {
        "raw": v, "mpeg": (v >> 14) + 1, "system": "PAL" if (v >> 12) & 3 else "NTSC",
        "aspect": "16:9" if ((v >> 10) & 3) == 3 else "4:3"}
    na = u16(b, 0x202)
    res["audio"] = [audio_attr(b, 0x204 + 8 * i) for i in range(na)]
    ns = u16(b, 0x254)
    res["subpictures"] = [subp_attr(b, 0x256 + 6 * i) for i in range(ns)]
    ptt = u32(b, 0xC8) * SECTOR
    nt = u16(b, ptt)
    end = u32(b, ptt + 4)
    offs = [u32(b, ptt + 8 + 4 * i) for i in range(nt)] + [end + 1]
    titles = []
    for i in range(nt):
        ps = []
        for p in range(offs[i], offs[i + 1], 4):
            ps.append({"pgcn": u16(b, ptt + p), "pgn": u16(b, ptt + p + 2)})
        titles.append({"vts_ttn": i + 1, "ptts": ps})
    res["ptt"] = titles
    res["pgcs"] = parse_pgcit(b, u32(b, 0xCC) * SECTOR)
    mu = u32(b, 0xD0)
    res["menus"] = parse_pgci_ut(b, mu * SECTOR) if mu else []
    res["c_adt"] = parse_c_adt(b, u32(b, 0xE0) * SECTOR) if u32(b, 0xE0) else []
    res["menu_c_adt"] = parse_c_adt(b, u32(b, 0xD8) * SECTOR) if u32(b, 0xD8) else []
    return res


def to_jsonable(x):
    if isinstance(x, (PGC, CellPlayback)):
        return {k: to_jsonable(v) for k, v in asdict(x).items()}
    if isinstance(x, dict):
        return {k: to_jsonable(v) for k, v in x.items()}
    if isinstance(x, list):
        return [to_jsonable(v) for v in x]
    return x
