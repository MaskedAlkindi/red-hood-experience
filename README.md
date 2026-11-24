# Red Hood Experience

A local, cinematic, interactive player for **Batman: Death in the Family (2020)**, built from the
owner's own DVD. The story graph, decision timing, defaults and endings are extracted from the
disc's navigation data — nothing is invented — and the footage is the disc's own video.

## Run it

```powershell
npm install
npm run dev          # http://localhost:3000  (development)
```

or double-click **`start.cmd`** (builds once, opens the browser, runs `next start`).

The processed media in `public/media` must exist (see the pipeline). It is git-ignored.

## Media pipeline (reproducible)

Requires Python 3.10+ (numpy only for the media test) and FFmpeg (`winget install Gyan.FFmpeg`).

```powershell
npm run dvd:analyze   # parse IFOs, scan menu buttons, emulate DVD VM -> analysis/
npm run story:build   # analysis/dvd_graph.json + labels -> src/data/story.json
npm run media:build   # sector-exact DVD cells -> public/media (H.264/AAC MP4, posters, sprites, stills)
npm run validate      # story-graph + media validation
npm run test:media    # frame-accurate cut check vs the DVD source + every transition chain
```

`npm run pipeline` runs the first three. Source files in `movie files/` are only ever read.
Set `DVD_SOURCE` to point at another `VIDEO_TS` folder.

How it works: each clip is an exact DVD cell sector range streamed straight from the VOBs into
FFmpeg (no intermediate files), scaled to square-pixel 1024×576 (16:9), CRF 18 `-tune animation`,
English AC-3 5.1 downmixed to AAC stereo 192 kb/s, 2-second keyframes for seeking.

The only hand-entered data is `scripts/story/labels.json`: English translations of the Russian
on-screen decision text.

## Project layout

| Path | Purpose |
|---|---|
| `scripts/dvd` | IFO parser, VM-command disassembler, NAV-pack (button) scanner, DVD VM emulator |
| `scripts/story` | Builds `src/data/story.json` from the emulated navigation graph |
| `scripts/media` | FFmpeg pipeline → `public/media` + `src/data/media-manifest.json` |
| `scripts/validate` | Graph validation (TS) and media/transition verification (Python) |
| `src/lib/story` | Branching story engine, validation, progress persistence (localStorage) |
| `src/components/player` | Interactive player (video pool, decision overlay, controls, drawer, endings) |
| `src/app` | `/` landing, `/watch` player, `/endings` explorer, `/story-map` graph debugger |
| `analysis` | DVD dumps and [DVD_REPORT.md](analysis/DVD_REPORT.md) |

## Player controls

| Key | Action |
|---|---|
| Space / K | Play / pause (Space/Enter confirms a highlighted choice) |
| ← / → / ↓ | During a decision: highlight left / right / down choice (like a DVD remote) |
| Enter, 1–3 | Confirm highlighted choice / pick choice by number |
| ← → / J L | Seek ±10 s (outside decisions) |
| ↑ / ↓ | Volume |
| M | Mute |
| F / double-click | Fullscreen |
| S | Skip credits |
| H | Your-story drawer (rewind to any decision) |

Decisions behave like the disc: choices appear when the disc enables its buttons, the countdown
is the disc's own timeout, and on timeout the default branch plays without the choice stinger.

## Known limitations

* English DVD subtitles are bitmap subpictures and are not converted (no OCR step).
* The Russian audio track is not included in the MP4s (browsers can't switch MP4 audio tracks).
* Decision screens and stingers are the disc's Russian-language artwork; the website overlays
  English text. Toggle **DVD screen** in the player to see the original menu unobstructed.
