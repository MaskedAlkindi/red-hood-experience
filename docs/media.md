# Disc files

The player expects the PAL DVD of *Batman: Death in the Family* (2020) with Russian menus and an English 5.1 track. Put that disc’s `VIDEO_TS` contents where the scripts can see them, then run the commands in the [README](../README.md).

## Where the files go

Either of these works. The `.IFO` and `.VOB` files have to be directly inside the folder you point at.

```text
movie files/VIDEO_TS.IFO
movie files/VTS_01_1.VOB
```

```text
D:\discs\death-in-the-family\VIDEO_TS\VIDEO_TS.IFO
```

For the second one:

```powershell
$env:DVD_SOURCE = "D:\discs\death-in-the-family\VIDEO_TS"
```

```bash
export DVD_SOURCE="/path/to/VIDEO_TS"
```

If you leave `DVD_SOURCE` unset, the scripts use `movie files` in the project root.

On Linux, the names must be upper case (`VTS_01_1.VOB`). If yours are lower case, make a second folder of upper-case symlinks and point `DVD_SOURCE` at that. Don’t rename the originals.

## Files

| File | Role |
|---|---|
| `VIDEO_TS.IFO`, `VIDEO_TS.BUP`, `VIDEO_TS.VOB` | Disc menu manager |
| `VTS_01_0.IFO`, `VTS_01_0.BUP`, `VTS_01_0.VOB` | Story title set |
| `VTS_01_1.VOB` … `VTS_01_4.VOB` | Story video |
| `VTS_02_0.IFO`, `VTS_02_0.BUP`, `VTS_02_0.VOB` | Menus |
| `VTS_02_1.VOB` | Credits and menu video |

Sizes that match this story file, in bytes:

| File | Bytes |
|---|---|
| `VTS_01_1.VOB`, `VTS_01_2.VOB`, `VTS_01_3.VOB` | 1073739776 each |
| `VTS_01_4.VOB` | 653168640 |
| `VTS_02_0.VOB` | 256008192 |
| `VTS_02_1.VOB` | 565260288 |

SHA-256 of the IFO files:

| File | SHA-256 |
|---|---|
| `VIDEO_TS.IFO` | `ab78d138a7b1d168f16c3a1370211f73e8db4a17561f6010dae7148da8d3de5e` |
| `VTS_01_0.IFO` | `822dd2aa6faafeb6feb4d0d6c4139aff552a75cfef5d48c54d74433ff76acfd7` |
| `VTS_02_0.IFO` | `3b947fdd42c7e368f43b7067698b6ac4d47980c42abe0748bf07cfcade371ce2` |

Windows: `certutil -hashfile VIDEO_TS.IFO SHA256`  
macOS / Linux: `sha256sum VIDEO_TS.IFO`

If those hashes differ, this is a different disc. Stop there.

FFmpeg has to be able to read the MPEG stream inside the VOBs. An `.iso` you have not opened, or a folder that is still scrambled, will not encode.

## Build

```bash
npm install
npm run pipeline
npm run validate
npm run test:media
```

`test:media` needs numpy: `python -m pip install numpy`.

Output goes to `public/media` (video, posters, scrub sheets, landing stills) and `src/data/media-manifest.json`. Re-running the media build skips clips that already match. To encode again: `python scripts/media/build_media.py --force`. To encode a few clips: `python scripts/media/build_media.py --only scene-opening,decision-1`.

On this disc, encoded durations match the DVD except `decision-1`. The IFO says 28.240 s. The cells are 27.84 s. The encode follows the cells.

## Don’t commit the movie

`.gitignore` already skips `movie files/`, `VIDEO_TS/`, `public/media/`, and `*.VOB`, `*.IFO`, `*.BUP`, `*.iso`, `*.img`, `*.mkv`. Check `git status` before you commit.
