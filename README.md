# Wavelength

An open-source desktop music player for Windows (also runs on macOS/Linux). Paste a Spotify playlist or album link, and Wavelength finds each song on YouTube, plays the audio with no ads, draws visuals driven by the album cover, and scrolls time-synced lyrics.

- **No Spotify login needed.** Public playlist/album links are read from Spotify's public embed page. Optional free API keys lift the 100-track limit.
- **Ad-free audio via YouTube.** Each track is matched by duration, title and artist (it prefers auto-generated "Artist - Topic" uploads, which are clean album audio) and fetched with [yt-dlp](https://github.com/yt-dlp/yt-dlp). Audio is cached on disk, and the next song is pre-fetched so playback stays gapless-ish.
- **Cover-reactive visuals.** Colours are pulled from the cover art; a blurred, drifting backdrop pulses with the bass, and a radial spectrum rings the cover.
- **Synced lyrics** from [LRCLIB](https://lrclib.net) (free, no key). Click a line to jump to it; ±0.5 s buttons fix timing for songs whose YouTube version is slightly offset.
- "Wrong song?" button cycles to the next-best YouTube match.
- Media keys, shuffle/repeat, volume, filter, immersive full-window mode (`F`).

## Run it

You need [Node.js 20+](https://nodejs.org).

```bash
npm install
npm start
```

First launch downloads yt-dlp (~20 MB) into the app's data folder. After that it checks for updates every 12 hours, because YouTube changes often.

## Build a Windows installer

```bash
npm run dist      # installer + portable .exe in ./dist
```

or push the repo to GitHub and run the **Build Windows app** workflow (Actions tab). It uploads the installer as an artifact, and attaches it to a release when you push a tag like `v1.0.0`.

Installers are unsigned, so Windows SmartScreen shows "unknown publisher" the first time: choose *More info → Run anyway*.

## Keyboard

| Key | Action | Key | Action |
|---|---|---|---|
| Space | Play / pause | S | Shuffle |
| ← / → | Seek 5 s | R | Repeat off / all / one |
| Shift + ← / → | Previous / next | M | Mute |
| ↑ / ↓ | Volume | F / Esc | Immersive mode on / off |

## Troubleshooting

- **A song won't load / "bot check" error:** Settings → *Update now* for yt-dlp. If it persists, wait a few minutes (YouTube rate-limits) or install Deno (`winget install DenoLand.Deno`), which yt-dlp can also use.
- **Only 100 tracks imported:** create a free app at developer.spotify.com/dashboard and paste its Client ID/Secret in Settings, then press the refresh button on the playlist.
- **Private playlists** can't be read. Make the playlist public, or share a public copy.
- **Wrong version of a song** (live, remix): press the swap button in the player bar.

## Project layout

```
src/main.js        Electron main process: Spotify import, YouTube matching, downloads, cache, lyrics, covers
src/lib.js         Pure logic (link parsing, scoring, LRC parsing, local media server), unit-tested
src/preload.js     Safe bridge between UI and main process
src/renderer/      UI (index.html, styles.css, app.js)
test/              Unit tests (npm test)
```

## Legal note

Wavelength is a personal-use tool that streams audio from YouTube on your behalf. YouTube's Terms of Service restrict downloading content outside its own apps, and artists don't earn from Spotify or YouTube plays this way. Use it knowing that, and support artists you love. You are responsible for how you use it.

## License

MIT
