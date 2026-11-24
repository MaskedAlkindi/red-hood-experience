# Prompt for Cursor (agent controlling the server PC)

> Fill in the four values in **SETUP VALUES**, then paste everything below the line into Cursor.

---

You are setting up and running a private, password-protected web app on THIS machine (the server).
The app is "Red Hood Experience": a Next.js 16 + TypeScript interactive player for the owner's own
DVD of *Batman: Death in the Family (2020)*. It converts the DVD's VOB files into browser MP4 clips
with FFmpeg and serves them behind a site-wide password. Work carefully, verify each step, and report
results honestly. Do not mark anything as working unless you tested it.

## SETUP VALUES (filled in by the owner)

- `MOVIE_DIR` = `<<full path on this server to the folder containing VIDEO_TS.IFO, VTS_01_1.VOB, ...>>`
- `PROJECT_SOURCE` = `<<where the project code is: a git URL, a zip, or a folder path>>`
- `APP_DIR` = `<<where to install the app, e.g. C:\apps\red-hood-experience or /opt/red-hood-experience>>`
- `PORT` = `<<port to serve on, e.g. 3100 — must not be used by anything else>>`
- `ACCESS` = `<<"this PC only" | "home LAN" | "Tailscale" | "internet via HTTPS reverse proxy">>`

## HARD RULES — never break these

1. The movie files in `MOVIE_DIR` are the only copy that matters. **Read them only.** Never move,
   rename, re-encode in place, delete, chmod/chown or write anything into `MOVIE_DIR`.
2. **Do not interrupt anything already running on this server.** Never stop or restart other services,
   processes, containers or web servers. Never reuse a port that is in use; check first
   (`netstat -ano | findstr :PORT` on Windows, `ss -ltnp | grep :PORT` on Linux).
3. The site must **never** be reachable without the password. Do not delete, rename or bypass
   `src/proxy.ts`. Do not add public routes. If `SITE_PASSWORD`/`AUTH_SECRET` are missing the app
   deliberately returns 503: fix the config, do not weaken the check.
4. Never commit or upload `.env.local`, `public/media/`, `movie files/` or any VOB/IFO/BUP file.
   Never print the site password into logs, commit messages or files other than `.env.local`.
5. Never expose the port to the internet directly (no router port-forwarding). If `ACCESS` is
   "internet", use an HTTPS reverse proxy (step 7). Ask the owner before changing firewall or router
   settings, and before installing system-wide software.
6. Updates must not interrupt viewers: build and test in a separate folder/port first, then switch
   (step 9). Never run `next build` inside the folder that is currently serving.

## 1. Inventory the machine (report what you find before installing anything)

- OS and version, free disk space on the drive of `APP_DIR` (need ~1.5 GB: ~700 MB media + deps).
- Node.js **20.9+** (`node -v`), npm, Python **3.10+** with `numpy`, FFmpeg + FFprobe (`ffmpeg -version`).
- Missing tools — install with the owner's OK:
  - Windows: `winget install OpenJS.NodeJS.LTS`, `winget install Python.Python.3.12`,
    `winget install Gyan.FFmpeg`, then `python -m pip install numpy`.
  - Linux (Debian/Ubuntu): `sudo apt install nodejs npm python3 python3-numpy ffmpeg`
    (use NodeSource if the distro's Node is older than 20.9).

## 2. Verify the movie files are the same disc the app was built for

The story labels are keyed to this exact release (PAL, Russian-region, 2 title sets). In `MOVIE_DIR`
check these SHA-256 hashes (`certutil -hashfile <file> SHA256` on Windows, `sha256sum` on Linux):

| File | SHA-256 |
|---|---|
| VIDEO_TS.IFO | `ab78d138a7b1d168f16c3a1370211f73e8db4a17561f6010dae7148da8d3de5e` |
| VTS_01_0.IFO | `822dd2aa6faafeb6feb4d0d6c4139aff552a75cfef5d48c54d74433ff76acfd7` |
| VTS_02_0.IFO | `3b947fdd42c7e368f43b7067698b6ac4d47980c42abe0748bf07cfcade371ce2` |

Expected VOB sizes (bytes): VTS_01_1/2/3 = 1073739776 each, VTS_01_4 = 653168640,
VTS_02_0 = 256008192, VTS_02_1 = 565260288.

- If the hashes match: continue.
- If they do NOT match: **stop and report.** It may be a different release. You may run
  `npm run dvd:analyze` (read-only) and report `analysis/dvd_graph.txt`, but do not change
  `scripts/story/labels.json` yourself.
- Linux only: the scripts expect upper-case names (`VTS_01_1.VOB`). If the files are lower-case,
  create a separate folder of upper-case **symlinks** pointing at them and use that as `DVD_SOURCE`.
  Never rename the originals.

## 3. Install the app

- Put the project from `PROJECT_SOURCE` into `APP_DIR` (clone / unzip / copy). It must NOT
  contain the movie files; it reads them from `MOVIE_DIR` via the `DVD_SOURCE` variable.
- In `APP_DIR`: `npm ci` (or `npm install` if there is no lockfile).

## 4. Build the media from the server's movie files

Set `DVD_SOURCE` to `MOVIE_DIR` for these commands only (PowerShell: `$env:DVD_SOURCE="..."`,
bash: `export DVD_SOURCE="..."`), then in `APP_DIR`:

```
npm run dvd:analyze     # parses IFOs + emulates the DVD navigation -> analysis/
npm run story:build     # -> src/data/story.json
npm run media:build     # 38 MP4 clips + posters + sprites -> public/media (~690 MB, ~10-30 min)
npm run validate        # must print: VALIDATION PASSED, 34/34 scenes, 7/7 endings
npm run test:media      # must print: 38 clips, 19 transitions: ALL PASSED
```

Expected results from the reference machine: 6 decisions, 13 choices, 7 endings, 9 playthroughs;
every clip's encoded duration equals the DVD duration (d=+0.000) except `decision-1`
(27.872 s vs 28.240 s: a known quirk of the disc, the test explains it). If anything else differs,
stop and report the output. Do not "fix" by editing generated JSON.

## 5. Configure the password (whole site, including the video files)

Create `APP_DIR/.env.local` (see `.env.example`):

```
SITE_PASSWORD=<long passphrase chosen by the owner, or generated>
AUTH_SECRET=<32+ random chars: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))">
```

- If you generate the password, show it to the owner **once** in chat and tell them to store it in
  their password manager. Don't write it anywhere else.
- Set `TRUST_PROXY=1` **only** if you put a reverse proxy you control in front (step 7).
- Changing `SITE_PASSWORD` logs out every device (sessions are bound to it).

## 6. Build and run as a background service on `PORT`

- `npm run build`, then confirm `PORT` is free, then test once in the foreground:
  `npx next start -p PORT`.
- Make it survive reboots without touching other services:
  - Windows: a Task Scheduler task "Red Hood Experience" (run at startup, whether user is logged on
    or not, start in `APP_DIR`, command `npx next start -p PORT`), or NSSM if already installed.
  - Linux: a systemd unit `red-hood-experience.service` (`WorkingDirectory=APP_DIR`,
    `ExecStart=/usr/bin/npx next start -p PORT`, `Restart=on-failure`, non-root user that can
    read `MOVIE_DIR` and `APP_DIR`).

## 7. Network access (according to `ACCESS`)

- "this PC only": bind to localhost: `npx next start -p PORT -H 127.0.0.1`.
- "home LAN": ask before adding an inbound firewall rule for `PORT` restricted to the local subnet
  (Windows: `New-NetFirewallRule -DisplayName "Red Hood Experience" -Direction Inbound -Protocol TCP
  -LocalPort PORT -RemoteAddress LocalSubnet -Action Allow`).
- "Tailscale": serve on the Tailscale interface only; no public exposure.
- "internet": use Caddy (or the existing reverse proxy) with automatic HTTPS in front of
  `127.0.0.1:PORT`, set `TRUST_PROXY=1`, bind the app to 127.0.0.1. Never serve it over plain HTTP.

## 8. Verify (all must pass; report each result)

From the server (replace PORT; use the HTTPS URL too if step 7 added one):

1. `curl -I -H "Accept: text/html" http://localhost:PORT/` → **307** redirect to `/login?next=%2F`
2. `curl -I http://localhost:PORT/media/video/scene-opening.mp4` → **401**
3. `curl -I http://localhost:PORT/media/posters/scene-opening.jpg` → **401**
4. Wrong password POST to `/api/auth/login` → **401**; after 8 wrong tries → **429**
5. Correct password → **200** with an `HttpOnly` `rhx_session` cookie; with that cookie a
   `Range: bytes=0-99` request for the video → **206**
6. In a browser: login page → sign in → Start Experience → real footage plays → at Decision 1
   pick a choice → the stinger and next scene play → sign out (lock icon) → videos return 401.
7. Confirm `MOVIE_DIR` is unchanged (same hashes as step 2) and no other service was stopped.

## 9. Updating later without interrupting viewers

Blue/green: copy the app to a new folder (e.g. `APP_DIR-next`), reuse the existing media
(copy `public/media` or link it), `npm ci && npm run build`, start it on a **different** free port,
run the step-8 checks there, and only then point the service/reverse proxy at the new folder and stop
the old instance. Never rebuild inside the live folder.

## 10. Report back

Give the owner: the URL(s), how the service starts on boot, where `.env.local` lives (not its
contents), the validate and test:media summaries, the step-8 results, disk usage of `public/media`,
and anything that failed or that you skipped, with the exact error output.
