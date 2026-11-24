"""Read sector ranges from a VTS's title or menu VOB set (read-only access to source)."""
from pathlib import Path

SECTOR = 2048


def vob_files(src: Path, vts: int, menu: bool):
    if vts == 0:
        return [src / "VIDEO_TS.VOB"]
    if menu:
        return [src / f"VTS_{vts:02d}_0.VOB"]
    return sorted(src.glob(f"VTS_{vts:02d}_[1-9].VOB"))


def iter_sectors(src: Path, vts: int, menu: bool, first: int, last: int, chunk=4096):
    """Yield bytes for sectors [first, last] inclusive across the multi-file VOB set."""
    files = vob_files(src, vts, menu)
    base = 0
    for f in files:
        n = f.stat().st_size // SECTOR
        lo, hi = max(first, base), min(last, base + n - 1)
        if lo <= hi:
            with f.open("rb") as fh:
                fh.seek((lo - base) * SECTOR)
                remaining = hi - lo + 1
                while remaining:
                    k = min(chunk, remaining)
                    yield fh.read(k * SECTOR)
                    remaining -= k
        base += n
