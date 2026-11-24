"""
Minimal DVD-Video virtual machine.

Executes navigation commands (pre/post/cell/button) from the parsed IFO data until the
machine reaches a playable PGC (one with cells), giving the exact destination of every
button press and timeout. Only the instruction subset used on this disc must be exact,
but the decoder handles the full command set and raises on anything unknown.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field

from ifo import Cmd


@dataclass
class Loc:
    domain: str        # "FP" | "VMGM" | "VTSM" | "TT"
    vts: int           # 0 for VMG
    pgcn: int
    pgn: int = 1       # program to start at (for TT and menus)
    cell: int = 0      # explicit cell (LinkCN), 0 = from program

    def key(self):
        return (self.domain, self.vts, self.pgcn, self.pgn, self.cell)


@dataclass
class State:
    g: list = field(default_factory=lambda: [0] * 16)
    s: list = field(default_factory=lambda: [0] * 24)
    loc: Loc | None = None


class Halt(Exception):
    pass


class VM:
    def __init__(self, nav):
        self.vmg = nav["vmg"]
        self.vts = {i + 1: v for i, v in enumerate(nav["vts"])}

    # ------------------------------------------------------------------ lookup
    def pgc(self, loc: Loc):
        if loc.domain == "FP":
            return self.vmg["first_play"]
        if loc.domain == "VMGM":
            return self.vmg["menus"][0]["pgcs"][loc.pgcn - 1]
        if loc.domain == "VTSM":
            return self.vts[loc.vts]["menus"][0]["pgcs"][loc.pgcn - 1]
        return self.vts[loc.vts]["pgcs"][loc.pgcn - 1]

    def menu_entry(self, vts: int, menu_id: int) -> int:
        pgcs = (self.vmg if vts == 0 else self.vts[vts])["menus"][0]["pgcs"]
        for p in pgcs:
            cat = p["entry"]
            if (cat >> 24) & 0x80 and ((cat >> 24) & 0x0F) == menu_id:
                return p["number"]
        raise KeyError(f"menu {menu_id} not found in vts {vts}")

    def vts_ptt(self, vts: int, ttn: int, ptt: int) -> Loc:
        e = self.vts[vts]["ptt"][ttn - 1]["ptts"][ptt - 1]
        return Loc("TT", vts, e["pgcn"], e["pgn"])

    # ------------------------------------------------------------------ eval
    @staticmethod
    def _rd(st: State, r: int) -> int:
        return st.s[r & 0x7F] if r & 0x80 else st.g[r & 0x0F]

    def _rod(self, st, c: Cmd, imm, start):
        return c.bits(start, 16) if imm else self._rd(st, c.bits(start - 8, 8))

    @staticmethod
    def _cmp(op, a, b):
        return {1: lambda: bool(a & b), 2: lambda: a == b, 3: lambda: a != b, 4: lambda: a >= b,
                5: lambda: a > b, 6: lambda: a <= b, 7: lambda: a < b}[op]()

    @staticmethod
    def _set(st, reg, op, v):
        a = st.g[reg]
        if op == 1:
            r = v
        elif op == 2:
            raise Halt("swap unsupported")
        elif op == 3:
            r = a + v
        elif op == 4:
            r = a - v
        elif op == 5:
            r = a * v
        elif op == 6:
            r = a // v if v else 0xFFFF
        elif op == 7:
            r = a % v if v else 0xFFFF
        elif op == 8:
            raise Halt("random unsupported")
        elif op == 9:
            r = a & v
        elif op == 10:
            r = a | v
        elif op == 11:
            r = a ^ v
        else:
            raise Halt(f"setop {op}")
        st.g[reg] = r & 0xFFFF

    def _linksub(self, st, op, loc: Loc):
        """Return new Loc or special markers."""
        if op == 0:
            return None
        if op == 13:   # LinkTailPGC
            return ("TAIL",)
        if op == 1:    # LinkTopC
            return ("TOPC",)
        if op == 16:
            return ("RSM",)
        raise Halt(f"linksub {op}")

    def exec_cmd(self, st: State, raw_hex: str, loc: Loc):
        """Execute one command. Returns None (continue), ('GOTO', n), ('BREAK',), or a jump target."""
        c = Cmd(bytes.fromhex(raw_hex))
        t = c.bits(63, 3)

        def cond1():
            op = c.bits(54, 3)
            return True if not op else self._cmp(op, self._rd(st, c.bits(39, 8)), self._rod(st, c, c.bits(55, 1), 31))

        def cond2():
            op = c.bits(54, 3)
            return True if not op else self._cmp(op, self._rd(st, c.bits(15, 8)), self._rd(st, c.bits(7, 8)))

        def cond3():
            op = c.bits(54, 3)
            return True if not op else self._cmp(op, st.g[c.bits(43, 4)], self._rod(st, c, c.bits(55, 1), 15))

        def link(optional):
            op = c.bits(51, 4)
            if op == 0:
                return None
            if op == 1:
                hl = c.bits(15, 6)
                if hl:
                    st.s[8] = hl << 10
                return self._linksub(st, c.bits(7, 8), loc)
            if op == 4:
                return Loc(loc.domain, loc.vts, c.bits(14, 15))
            if op == 5:
                if loc.domain != "TT":
                    raise Halt("LinkPTTN outside title")
                return self.vts_ptt(loc.vts, self.ttn_of(loc), c.bits(9, 10))
            if op == 6:
                return Loc(loc.domain, loc.vts, loc.pgcn, c.bits(6, 7))
            if op == 7:
                return Loc(loc.domain, loc.vts, loc.pgcn, 1, c.bits(7, 8))
            raise Halt(f"link op {op}")

        if t == 0:
            if not cond1():
                return None
            op = c.bits(51, 4)
            if op == 0:
                return None
            if op == 1:
                return ("GOTO", c.bits(7, 8))
            if op == 2:
                return ("BREAK",)
            raise Halt(f"special {op}")
        if t == 1:
            if c.bits(60, 1):
                if not cond2():
                    return None
                op = c.bits(51, 4)
                if op == 1:
                    return ("EXIT",)
                if op == 2:
                    tt = self.vmg["titles"][c.bits(22, 7) - 1]
                    return self.vts_ptt(tt["vts"], tt["vts_ttn"], 1)
                if op == 3:
                    return self.vts_ptt(loc.vts, c.bits(22, 7), 1)
                if op == 5:
                    return self.vts_ptt(loc.vts, c.bits(22, 7), c.bits(41, 10))
                if op in (6, 8):
                    k = c.bits(23, 2)
                    if op == 8:
                        st.s[20] = 0  # resume info not modelled beyond marker
                    if k == 0:
                        return Loc("FP", 0, 0)
                    if k == 1:
                        return Loc("VMGM", 0, self.menu_entry(0, c.bits(19, 4)))
                    if k == 2:
                        vts = c.bits(30, 7) if op == 6 else loc.vts
                        return Loc("VTSM", vts, self.menu_entry(vts, c.bits(19, 4)))
                    return Loc("VMGM", 0, c.bits(46, 15))
                raise Halt(f"jump op {op}")
            if not cond1():
                return None
            return link(False)
        if t == 2:
            if not cond2():
                return None
            op = c.bits(59, 4)
            imm = c.bits(60, 1)
            if op == 1:
                for i in range(1, 4):
                    if c.bits(47 - i * 8, 1):
                        st.s[i] = c.bits(47 - i * 8 - 1, 7) if imm else st.g[c.bits(47 - i * 8 - 4, 4)]
            elif op == 6:
                st.s[8] = c.bits(31, 16) if imm else self._rd(st, c.bits(23, 8))
            elif op == 3:
                st.g[c.bits(19, 4)] = self._rod(st, c, imm, 47)
            else:
                raise Halt(f"sysset {op}")
            return link(True)
        if t == 3:
            if not cond3():
                return None
            op = c.bits(59, 4)
            if op:
                self._set(st, c.bits(35, 4), op, self._rod(st, c, c.bits(60, 1), 31))
            return link(True)
        raise Halt(f"cmd type {t} ({raw_hex})")

    def ttn_of(self, loc: Loc) -> int:
        for t in self.vts[loc.vts]["ptt"]:
            for p in t["ptts"]:
                if p["pgcn"] == loc.pgcn:
                    return t["vts_ttn"]
        raise KeyError(loc)

    def run_list(self, st: State, cmds: list, loc: Loc):
        i = 0
        steps = 0
        while i < len(cmds):
            steps += 1
            if steps > 10000:
                raise Halt("infinite loop")
            r = self.exec_cmd(st, cmds[i]["hex"], loc)
            if r is None:
                i += 1
                continue
            if r[0] == "GOTO" if isinstance(r, tuple) else False:
                i = r[1] - 1
                continue
            if isinstance(r, tuple) and r[0] == "BREAK":
                return None
            return r
        return None

    # ------------------------------------------------------------------ driver
    def settle(self, st: State, loc: Loc, trace: list, max_hops=100):
        """Follow pre-commands (and jumps) until a playable PGC is reached. Returns Loc."""
        for _ in range(max_hops):
            pgc = self.pgc(loc)
            trace.append(f"{loc.domain}{'' if loc.domain in ('FP', 'VMGM') else loc.vts}:PGC{loc.pgcn}")
            if loc.pgn == 1 and loc.cell == 0:
                r = self.run_list(st, pgc["pre"], loc)
            else:
                r = None  # entering mid-PGC (PTT / LinkCN) skips pre commands
                if loc.domain == "TT" or loc.cell:
                    r = None
            if r is None:
                if pgc["cells"]:
                    st.loc = loc
                    return loc
                # no cells: post commands
                r = self.run_list(st, pgc["post"], loc)
                if r is None:
                    raise Halt(f"dead end at {loc}")
            if isinstance(r, Loc):
                loc = r
                continue
            if r[0] == "EXIT":
                return ("EXIT",)
            if r[0] == "RSM":
                return ("RSM",)
            raise Halt(f"unexpected {r} at {loc}")
        raise Halt("too many hops")

    def after_post(self, st: State, loc: Loc, trace: list):
        pgc = self.pgc(loc)
        r = self.run_list(st, pgc["post"], loc)
        if r is None:
            # fall through to next PGC
            if pgc["next_pgcn"]:
                return self.settle(st, Loc(loc.domain, loc.vts, pgc["next_pgcn"]), trace)
            return ("END",)
        if isinstance(r, Loc):
            return self.settle(st, r, trace)
        return r

    def press(self, st: State, loc: Loc, button_hex: str, trace: list):
        r = self.exec_cmd(st, button_hex, loc)
        if r is None:
            return ("NOP",)
        if isinstance(r, Loc):
            return self.settle(st, r, trace)
        if r[0] == "TAIL":
            return self.after_post(st, loc, trace)
        return r


def clone(st: State) -> State:
    return copy.deepcopy(st)
