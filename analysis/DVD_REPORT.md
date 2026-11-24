# DVD navigation analysis — Batman: Death in the Family (2020)

Everything below was extracted from the disc by `scripts/dvd/*` (IFO parsing, NAV-pack button
scan, and a DVD-VM emulation starting at First Play). Raw dumps: `dvd_nav.txt`, `dvd_buttons.txt`,
`dvd_graph.txt` in this folder.

## Disc

| | |
|---|---|
| Format | DVD-Video, PAL, MPEG-2 720×576, 25 fps progressive, 16:9 (SAR 64:45) |
| Title sets | 2 (VTS 1 = story segments, VTS 2 = credits + all menus) |
| Audio | VTS 1/2 titles: AC-3 5.1 Russian (0x80), **AC-3 5.1 English (0x81)**; menus: AC-3 2.0 (0x80) |
| Subtitles | VTS 1: Russian (0x20), English (0x21) DVD bitmap subtitles |
| Menus | Russian-language decision screens (this is a Russian-region release) |

## How the disc implements the interactive story

1. Each story segment is its own VTS 1 title. Titles 2–16 start with a ~5.4 s **stinger cell**
   (the chosen option written in red on black), followed by the segment cell and a 0.4 s black cell.
2. When a segment ends, its post-command `CallSS VMGM (pgc N)` sets `g15` and jumps to the root
   menu of VTS 2, whose PGC 2 dispatches on `g15` to a **decision menu** (VTS 2 menu PGCs 5–10).
3. Each decision menu = intro cell (8.4–10.2 s, buttons inactive) + button cell (~18 s) with an
   invisible default button and 2–3 visible arrow buttons (left / right / down).
   Pressing a button: `JumpSS VMGM pgc` → `g15` → VTS 1 root → `JumpVTS_PTT title:1`
   (PTT 1 = **stinger + segment**).
4. **Timeout:** if no button is pressed, the menu's post-command jumps to the default branch at
   `JumpVTS_PTT title:2` — PTT 2 **skips the stinger**. The website reproduces this exactly.
5. Endings: the final segment's post-command plays one of four credit rolls (VTS 2 titles 2–7,
   two pairs share the same VOB), then a 20.7 s finale (VTS 2 title 8), then the main menu.

## Mapped decisions (6) and choices (13)

| # | DVD node | On-screen prompt (translated) | Left | Right | Down | Timeout default |
|---|---|---|---|---|---|---|
| 1 | VTSM2 PGC10 | Robin will die. | Robin cheats death | Batman saves Robin | Robin dies | Batman saves Robin |
| 2 | VTSM2 PGC9 | Batman is dead. | Catch the Joker | Kill the Joker | | Kill the Joker |
| 3 | VTSM2 PGC8 | The Joker will die. | Spare the Joker | Kill the Joker | | Spare the Joker |
| 4 | VTSM2 PGC7 | Save Batman. | Life | Death | | Death |
| 5 | VTSM2 PGC6 | The Joker is dead. | Surrender | Attack | | Attack |
| 6 | VTSM2 PGC5 | Red Robin will die. | The unscarred coin | The scarred coin | | The scarred coin |

Decision 4 is reached from both choices of Decision 3.
The coin labels have no text on the disc; they describe the two coins shown (the stinger footage
for the right button shows the scarred coin, confirming the mapping).

## Endings (7)

| Ending | Final choice | Path |
|---|---|---|
| 1 | Robin cheats death | D1 left |
| 2 | Life | D1 right → D2 left → D3 (either) → D4 left |
| 3 | Death | D1 right → D2 left → D3 (either) → D4 right |
| 4 | Surrender | D1 right → D2 right → D5 left |
| 5 | The unscarred coin | D1 right → D2 right → D5 right → D6 left |
| 6 | The scarred coin | D1 right → D2 right → D5 right → D6 right |
| 7 | Robin dies | D1 down |

9 complete playthroughs exist.

## Content not part of the interactive story

* VTS 1 title 1 — a 67-minute "play all" concatenation of every segment cell; not reachable from
  the menus. VTS 1 title 15 (opening without the first cell) — only reachable from a hidden
  8-button menu (VTS 2 menu PGC 4) that is not linked from First Play.
* VTS 2 title 1 — "play all" of the credit rolls.
* Main / audio / subtitle / instruction menus (VTS 2 menu PGCs 11–15) — replaced by the website's
  own landing page; the website always uses the English audio track.

## Source quirk

`decision-1` (VTS 2 menu VOB 8): the IFO declares 28.24 s but the cells contain 696 frames
(27.84 s). The encode matches the actual cell content; the player's countdown uses the real
media duration, which is when the disc's timeout fires.
