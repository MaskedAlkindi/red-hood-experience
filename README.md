<p align="center">
  <img src="public/icon.svg" alt="Red Hood" width="96" height="96">
</p>

# Red Hood Experience

A player for the interactive DVD of *Batman: Death in the Family* (2020). Choices, timers, and endings follow that disc. English text is drawn over the Russian menus.

The movie is not in this repo. You need your own disc.

## Run it

Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The site loads without pictures until you build the clips. Do that first if you want video.

On Windows, double-click `start.cmd` after the media build. It installs packages if needed, builds the site, and opens the browser.

## Build the clips

1. Install FFmpeg, including `ffprobe` (`winget install Gyan.FFmpeg` on Windows), and Python 3.10 or newer.
2. Copy the `VIDEO_TS` folder from your DVD into a folder named `movie files` in this project. The `.IFO` and `.VOB` files should sit directly inside `movie files`, not in another subfolder.
3. If the files live somewhere else, point at that `VIDEO_TS` folder before building.

   PowerShell:

   ```powershell
   $env:DVD_SOURCE = "D:\discs\death-in-the-family\VIDEO_TS"
   ```

   bash:

   ```bash
   export DVD_SOURCE="/path/to/VIDEO_TS"
   ```

4. Build and check:

   ```bash
   npm run pipeline
   npm run validate
   ```

`pipeline` reads the disc, writes the story file, and encodes `public/media` (about 700 MB). That folder is ignored by git. Do not commit it, and do not commit the VOB files.

This story file matches one release: the PAL DVD with Russian menus and an English 5.1 track. Names, sizes, and checksums are in [docs/media.md](docs/media.md). If your files do not match, stop. A Blu-ray or another cut will not line up.

## Keys

| Key | Action |
|---|---|
| Space, K | Play or pause. Space or Enter confirms the highlighted choice |
| ← → ↓ | Move between choices |
| 1–3 | Pick a choice by number |
| J / L, or ← → | Seek 10 seconds, when no choice is on screen |
| ↑ ↓ | Volume |
| M | Mute |
| F, double-click | Fullscreen |
| S | Skip credits |
| H | Path so far. Jump back to a choice you already made |

The timer is the disc’s timer. If it runs out, the default path plays and the short red choice card is skipped.

**DVD screen** in the player hides the English overlay.

## Pages

| Path | Page |
|---|---|
| `/` | Start |
| `/watch` | Player |
| `/endings` | The seven endings |
| `/story-map` | The branches |

Progress stays in this browser. Nothing is uploaded.

## Commands

| Command | What it does |
|---|---|
| `npm run dvd:analyze` | Read the IFOs and menu buttons into `analysis/` |
| `npm run story:build` | Write `src/data/story.json` |
| `npm run media:build` | Encode the clips, posters, and preview sheets |
| `npm run pipeline` | Those three, in that order |
| `npm run validate` | Check the story file against the media manifest |
| `npm run test:media` | Check cuts against the disc. Needs `python -m pip install numpy` |

The scripts only read the disc folder. They never write into it.

Hand-written story text is only `scripts/story/labels.json` (English for the Russian prompts).

## Limits

English subtitles on the disc are images, so they are not in the clips. The Russian audio track is not in the clips either. Menus and the red choice cards stay in Russian.

## License

The code is [MIT](LICENSE). The film, the characters, and any clips you encode belong to DC and Warner Bros. Don’t publish those with this repo.
