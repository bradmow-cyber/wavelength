'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu, net, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { spawn } = require('child_process');
const L = require('./lib');

// We handle media keys ourselves (globalShortcut) so Chromium's SMTC overlay doesn't double-handle them.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const UA = 'Wavelength/1.0 (open-source desktop music player)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const USER = app.getPath('userData');
const DIRS = {
  bin: path.join(USER, 'bin'),
  audio: path.join(USER, 'audio'),
  covers: path.join(USER, 'covers'),
  lyrics: path.join(USER, 'lyrics'),
};
const FILES = {
  library: path.join(USER, 'library.json'),
  matches: path.join(USER, 'matches.json'),
  settings: path.join(USER, 'settings.json'),
};
const DEFAULT_SETTINGS = {
  spotifyClientId: '',
  spotifyClientSecret: '',
  cacheLimitMB: 2048,
  lastUpdateCheck: 0,
};

let win = null;
let mediaPort = 0;

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

async function httpGet(url, headers = {}) {
  const res = await net.fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  return res;
}
async function getJSON(url, headers) {
  const res = await httpGet(url, headers);
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} for ${new URL(url).host}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

let settingsCache = null;
async function getSettings() {
  if (!settingsCache) settingsCache = { ...DEFAULT_SETTINGS, ...(await readJson(FILES.settings, {})) };
  return settingsCache;
}
async function saveSettings(patch) {
  const s = await getSettings();
  Object.assign(s, patch);
  await writeJson(FILES.settings, s);
  return s;
}

let libraryCache = null;
async function getLibrary() {
  if (!libraryCache) libraryCache = await readJson(FILES.library, { playlists: [] });
  return libraryCache;
}
const saveLibrary = async () => writeJson(FILES.library, await getLibrary());

let matchesCache = null;
async function getMatches() {
  if (!matchesCache) matchesCache = await readJson(FILES.matches, {});
  return matchesCache;
}
const saveMatches = async () => writeJson(FILES.matches, await getMatches());

/* ------------------------------------------------------------------ */
/* Spotify import (no login needed)                                     */
/* ------------------------------------------------------------------ */

async function importViaEmbed(type, id) {
  const res = await httpGet(`https://open.spotify.com/embed/${type}/${id}`, {
    'User-Agent': BROWSER_UA,
    'Accept-Language': 'en',
  });
  if (res.status === 404) throw new Error('Spotify says that playlist does not exist or is private.');
  if (!res.ok) throw new Error(`Spotify returned HTTP ${res.status}.`);
  const data = L.parseEmbedHtml(await res.text());
  if (!data.tracks.length) throw new Error('That Spotify link has no playable tracks.');
  return {
    ...data,
    limited: data.tracks.length >= 100,
  };
}

let tokenCache = { token: '', exp: 0, key: '' };
async function spotifyToken(s) {
  const key = `${s.spotifyClientId}:${s.spotifyClientSecret}`;
  if (tokenCache.token && tokenCache.exp > Date.now() + 30000 && tokenCache.key === key) return tokenCache.token;
  const res = await net.fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(key).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Spotify rejected the Client ID/Secret in Settings.');
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000, key };
  return tokenCache.token;
}

async function importViaApi(type, id, s) {
  const token = await spotifyToken(s);
  const api = async (u) => getJSON(u.startsWith('http') ? u : `https://api.spotify.com/v1${u}`, { Authorization: `Bearer ${token}` });
  const tracks = [];

  if (type === 'playlist') {
    const pl = await api(`/playlists/${id}`);
    // Spotify has renamed fields over time; accept either shape.
    let page = pl.items && pl.items.items ? pl.items : pl.tracks;
    while (page) {
      for (const entry of page.items || []) {
        const t = entry && (entry.track || entry.item);
        if (!t || !t.id || t.type === 'episode') continue;
        tracks.push({
          id: t.id,
          title: t.name,
          artist: (t.artists || []).map((a) => a.name).join(', '),
          album: t.album && t.album.name,
          durationMs: t.duration_ms || 0,
          cover: t.album && t.album.images && t.album.images[0] && t.album.images[0].url,
        });
      }
      page = page.next ? await api(page.next) : null;
    }
    return {
      name: pl.name,
      owner: (pl.owner && pl.owner.display_name) || '',
      cover: pl.images && pl.images[0] && pl.images[0].url,
      tracks,
      limited: false,
    };
  }

  const al = await api(`/albums/${id}`);
  let page = al.tracks;
  while (page) {
    for (const t of page.items || []) {
      tracks.push({
        id: t.id,
        title: t.name,
        artist: (t.artists || []).map((a) => a.name).join(', '),
        album: al.name,
        durationMs: t.duration_ms || 0,
        cover: al.images && al.images[0] && al.images[0].url,
      });
    }
    page = page.next ? await api(page.next) : null;
  }
  return {
    name: al.name,
    owner: (al.artists || []).map((a) => a.name).join(', '),
    cover: al.images && al.images[0] && al.images[0].url,
    tracks,
    limited: false,
  };
}

async function importSpotify(input) {
  let url = String(input || '').trim();
  if (L.isSpotifyShortLink(url)) {
    const r = await net.fetch(url, { headers: { 'User-Agent': BROWSER_UA }, redirect: 'follow' });
    url = r.url || url;
  }
  const parsed = L.parseSpotifyUrl(url);
  if (!parsed) throw new Error("That doesn't look like a Spotify playlist or album link.");

  const s = await getSettings();
  let data = null;
  let apiError = null;
  if (s.spotifyClientId && s.spotifyClientSecret) {
    try {
      data = await importViaApi(parsed.type, parsed.id, s);
    } catch (e) {
      apiError = e.message;
    }
  }
  if (!data) data = await importViaEmbed(parsed.type, parsed.id);
  return { ...data, spotifyId: parsed.id, type: parsed.type, apiError };
}

async function addOrUpdatePlaylist(input) {
  const data = await importSpotify(input);
  const lib = await getLibrary();
  let pl = lib.playlists.find((p) => p.spotifyId === data.spotifyId);
  if (pl) {
    Object.assign(pl, { name: data.name, owner: data.owner, cover: data.cover, tracks: data.tracks, type: data.type, updatedAt: Date.now() });
  } else {
    pl = {
      id: crypto.randomUUID(),
      spotifyId: data.spotifyId,
      type: data.type,
      name: data.name,
      owner: data.owner,
      cover: data.cover,
      tracks: data.tracks,
      addedAt: Date.now(),
    };
    lib.playlists.unshift(pl);
  }
  await saveLibrary();
  return { playlist: pl, limited: data.limited, apiError: data.apiError };
}

/* ------------------------------------------------------------------ */
/* yt-dlp management                                                   */
/* ------------------------------------------------------------------ */

function ytdlpAsset() {
  if (process.platform === 'win32') return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  return 'yt-dlp_linux';
}
const ytdlpPath = () => path.join(DIRS.bin, ytdlpAsset());

let ytdlpReady = null;
let updating = Promise.resolve();

function status(msg, kind = 'info') {
  send('status', { kind, msg });
}

async function downloadYtdlp() {
  status('Downloading the YouTube helper (yt-dlp), one-time setup…');
  const res = await net.fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpAsset()}`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Could not download yt-dlp (HTTP ${res.status}). Check your internet connection.`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = ytdlpPath();
  const tmp = dest + '.download';
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, dest);
  if (process.platform !== 'win32') await fsp.chmod(dest, 0o755);
}

function ensureYtdlp() {
  if (!ytdlpReady) {
    ytdlpReady = (async () => {
      await fsp.mkdir(DIRS.bin, { recursive: true });
      if (!fs.existsSync(ytdlpPath())) {
        await downloadYtdlp();
        await saveSettings({ lastUpdateCheck: Date.now() });
        status('YouTube helper installed.', 'ok');
      }
      return ytdlpPath();
    })().catch((e) => {
      ytdlpReady = null;
      throw e;
    });
  }
  return ytdlpReady;
}

function rawRun(bin, args, { onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' },
    });
    let stdout = '';
    let stderr = '';
    let carry = '';
    child.stdout.on('data', (d) => {
      const s = d.toString('utf8');
      stdout += s;
      if (onStdout) {
        carry += s;
        const lines = carry.split(/\r?\n|\r/);
        carry = lines.pop();
        lines.forEach(onStdout);
      }
    });
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// yt-dlp needs a JavaScript runtime to talk to YouTube. We reuse Electron itself (it is Node when
// ELECTRON_RUN_AS_NODE=1), so users do not have to install Deno.
function jsRuntimeArgs() {
  return ['--js-runtimes', `node:${process.execPath}`, '--remote-components', 'ejs:github'];
}

async function ytdlp(args, opts) {
  const bin = await ensureYtdlp();
  await updating;
  let r = await rawRun(bin, [...jsRuntimeArgs(), ...args], opts);
  if (r.code !== 0 && /no such option|unrecognized arguments|unknown option/i.test(r.stderr)) {
    r = await rawRun(bin, args, opts); // older yt-dlp without those flags
  }
  return r;
}

function maybeUpdateYtdlp() {
  updating = (async () => {
    try {
      const bin = await ensureYtdlp();
      const s = await getSettings();
      if (Date.now() - s.lastUpdateCheck < 12 * 3600 * 1000) return;
      await saveSettings({ lastUpdateCheck: Date.now() });
      await rawRun(bin, ['-U']);
    } catch (_) {
      /* offline or already current */
    }
  })();
  return updating;
}

/* ------------------------------------------------------------------ */
/* Matching a Spotify track to a YouTube video                          */
/* ------------------------------------------------------------------ */

async function searchYouTube(query) {
  const r = await ytdlp([`ytsearch8:${query}`, '--flat-playlist', '--dump-json', '--no-warnings', '--skip-download']);
  if (r.code !== 0 && !r.stdout.trim()) {
    throw new Error(summarizeYtdlpError(r.stderr) || 'YouTube search failed.');
  }
  return L.parseYtdlpJsonLines(r.stdout);
}

function summarizeYtdlpError(stderr) {
  const lines = String(stderr || '').split(/\r?\n/).filter((l) => /ERROR/i.test(l));
  const last = lines[lines.length - 1] || '';
  return last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, '').slice(0, 220);
}

async function matchTrack(track) {
  const artist = L.primaryArtist(track.artist);
  const title = L.cleanTitle(track.title);
  const [a, b] = await Promise.allSettled([
    searchYouTube(`${artist} - ${title}`),
    searchYouTube(`${artist} ${title} topic audio`),
  ]);
  const all = [...(a.value || []), ...(b.value || [])];
  if (!all.length) {
    const reason = (a.reason || b.reason || {}).message;
    throw new Error(reason || `No YouTube match found for “${track.title}”.`);
  }
  const ranked = L.rankCandidates(all, track).slice(0, 6);
  const best = ranked[0];
  return { videoId: best.id, title: best.title, channel: best.channel, duration: best.duration, candidates: ranked, idx: 0 };
}

/* ------------------------------------------------------------------ */
/* Audio download + cache                                              */
/* ------------------------------------------------------------------ */

const AUDIO_EXT = ['webm', 'm4a', 'mp4', 'opus', 'ogg', 'mp3', 'aac'];
const VIDEO_ID = /^[\w-]{11}$/;

async function findCached(videoId) {
  for (const ext of AUDIO_EXT) {
    const f = path.join(DIRS.audio, `${videoId}.${ext}`);
    try {
      const st = await fsp.stat(f);
      if (st.size > 50 * 1024) {
        const now = new Date();
        fsp.utimes(f, now, now).catch(() => {});
        return f;
      }
    } catch (_) { /* next */ }
  }
  return null;
}

const downloads = new Map();
function ensureAudio(videoId, onProgress) {
  if (!VIDEO_ID.test(videoId)) return Promise.reject(new Error('Bad video id.'));
  if (downloads.has(videoId)) {
    const d = downloads.get(videoId);
    if (onProgress) d.listeners.add(onProgress);
    return d.promise;
  }
  const d = { listeners: new Set(onProgress ? [onProgress] : []) };
  d.promise = (async () => {
    const cached = await findCached(videoId);
    if (cached) return cached;
    await fsp.mkdir(DIRS.audio, { recursive: true });
    const r = await ytdlp(
      [
        `https://www.youtube.com/watch?v=${videoId}`,
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '--no-playlist', '--no-warnings', '--no-mtime', '--newline',
        '-N', '4',
        '--progress-template', 'download:[[%(progress._percent_str)s]]',
        '-o', path.join(DIRS.audio, '%(id)s.%(ext)s'),
      ],
      {
        onStdout: (line) => {
          const m = line.match(/\[\[\s*([\d.]+)%\s*\]\]/);
          if (m) d.listeners.forEach((fn) => fn(parseFloat(m[1])));
        },
      }
    );
    const file = await findCached(videoId);
    if (!file) {
      const e = new Error(summarizeYtdlpError(r.stderr) || 'Download failed.');
      e.stderr = r.stderr;
      throw e;
    }
    pruneCache(file).catch(() => {});
    return file;
  })().finally(() => downloads.delete(videoId));
  downloads.set(videoId, d);
  return d.promise;
}

async function pruneCache(keep) {
  const s = await getSettings();
  const limit = (s.cacheLimitMB || 2048) * 1024 * 1024;
  const names = await fsp.readdir(DIRS.audio);
  const files = [];
  let total = 0;
  for (const n of names) {
    const f = path.join(DIRS.audio, n);
    try {
      const st = await fsp.stat(f);
      if (!st.isFile()) continue;
      total += st.size;
      files.push({ f, size: st.size, t: st.mtimeMs });
    } catch (_) { /* ignore */ }
  }
  files.sort((a, b) => a.t - b.t);
  for (const x of files) {
    if (total <= limit) break;
    if (x.f === keep) continue;
    await fsp.unlink(x.f).catch(() => {});
    total -= x.size;
  }
}

const VIDEO_PROBLEM = /unavailable|not available|private video|blocked|copyright|age-restricted|confirm your age|removed/i;
const inflight = new Map();

function prepareTrack(track, { rematch = false } = {}) {
  const key = `${track.id}:${rematch ? 'r' : 'p'}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = doPrepare(track, rematch).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function doPrepare(track, rematch) {
  const emit = (stage, percent) => send('prepare-progress', { id: track.id, stage, percent });
  const matches = await getMatches();
  let m = matches[track.id];

  if (!m) {
    emit('matching');
    m = await matchTrack(track);
    matches[track.id] = m;
    await saveMatches();
  } else if (rematch && m.candidates && m.candidates.length > 1) {
    m.idx = (m.idx + 1) % m.candidates.length;
    Object.assign(m, pick(m.candidates[m.idx]));
    await saveMatches();
  }

  let file = null;
  let lastErr = null;
  const tries = Math.min(3, (m.candidates || []).length || 1);
  for (let i = 0; i < tries; i++) {
    try {
      if (!(await findCached(m.videoId))) emit('downloading', 0);
      file = await ensureAudio(m.videoId, (pct) => emit('downloading', pct));
      break;
    } catch (e) {
      lastErr = e;
      if (!VIDEO_PROBLEM.test(`${e.message}\n${e.stderr || ''}`) || !m.candidates || m.candidates.length < 2) throw e;
      m.idx = (m.idx + 1) % m.candidates.length;
      Object.assign(m, pick(m.candidates[m.idx]));
      await saveMatches();
    }
  }
  if (!file) throw lastErr || new Error('Could not load audio.');

  return {
    url: `http://127.0.0.1:${mediaPort}/${encodeURIComponent(path.basename(file))}`,
    match: { videoId: m.videoId, title: m.title, channel: m.channel, duration: m.duration, canRematch: (m.candidates || []).length > 1 },
  };
}
const pick = (c) => ({ videoId: c.id, title: c.title, channel: c.channel, duration: c.duration });

/* ------------------------------------------------------------------ */
/* Cover art                                                           */
/* ------------------------------------------------------------------ */

async function itunesArt(track) {
  const artist = L.primaryArtist(track.artist);
  const title = L.cleanTitle(track.title);
  const qs = new URLSearchParams({ term: `${artist} ${title}`, entity: 'song', media: 'music', limit: '8' });
  const j = await getJSON(`https://itunes.apple.com/search?${qs}`);
  const lt = title.toLowerCase();
  const la = artist.toLowerCase();
  const hit =
    (j.results || []).find((r) => (r.trackName || '').toLowerCase().includes(lt) && (r.artistName || '').toLowerCase().includes(la)) ||
    (j.results || []).find((r) => (r.artistName || '').toLowerCase().includes(la));
  if (!hit || !hit.artworkUrl100) return null;
  return hit.artworkUrl100.replace(/\/\d+x\d+(bb)?\./, '/800x800bb.');
}

function dataUrlFromBuffer(buf) {
  const png = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50;
  const webp = buf.length > 12 && buf.slice(8, 12).toString() === 'WEBP';
  const mime = png ? 'image/png' : webp ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function fetchImage(url) {
  const res = await httpGet(url);
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function getCover(track) {
  await fsp.mkdir(DIRS.covers, { recursive: true });
  const file = path.join(DIRS.covers, `${sha1(track.id)}.img`);
  try {
    return dataUrlFromBuffer(await fsp.readFile(file));
  } catch (_) { /* not cached */ }

  const sources = [];
  if (track.cover) sources.push(async () => track.cover);
  sources.push(() => itunesArt(track));
  sources.push(async () => {
    const m = (await getMatches())[track.id];
    return m ? `https://i.ytimg.com/vi/${m.videoId}/hqdefault.jpg` : null;
  });

  for (const src of sources) {
    try {
      const url = await src();
      if (!url) continue;
      const buf = await fetchImage(url);
      if (buf.length < 1000) continue;
      await fsp.writeFile(file, buf);
      return dataUrlFromBuffer(buf);
    } catch (_) { /* try next source */ }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Lyrics (LRCLIB)                                                     */
/* ------------------------------------------------------------------ */

async function getLyrics(track) {
  await fsp.mkdir(DIRS.lyrics, { recursive: true });
  const file = path.join(DIRS.lyrics, `${sha1(track.id)}.json`);
  const cached = await readJson(file, null);
  if (cached && Date.now() - cached.at < 14 * 24 * 3600 * 1000) return cached.data;

  const artist = L.primaryArtist(track.artist);
  const title = L.cleanTitle(track.title);
  const dur = track.durationMs ? Math.round(track.durationMs / 1000) : 0;
  let rec = null;
  let reached = false; // did we actually get an answer from LRCLIB (even "not found")?

  try {
    const qs = new URLSearchParams({ artist_name: artist, track_name: title });
    if (track.album) qs.set('album_name', track.album);
    if (dur) qs.set('duration', String(dur));
    rec = await getJSON(`https://lrclib.net/api/get?${qs}`);
    reached = true;
  } catch (e) {
    if (e.status === 404) reached = true;
    else if (e.status) throw e;
  }
  if (!rec || (!rec.syncedLyrics && !rec.plainLyrics && !rec.instrumental)) {
    try {
      const results = await getJSON(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`);
      reached = true;
      rec = L.pickLyrics(results, dur) || rec;
    } catch (_) { /* leave rec as is */ }
  }
  if (!reached) throw new Error('Could not reach the lyrics service.');

  const data = rec
    ? {
        synced: rec.syncedLyrics ? L.parseLrc(rec.syncedLyrics) : null,
        plain: rec.plainLyrics || null,
        instrumental: !!rec.instrumental,
      }
    : { synced: null, plain: null, instrumental: false };

  await writeJson(file, { at: Date.now(), data }).catch(() => {});
  return data;
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  });
}

function registerIpc() {
  handle('library:get', async () => (await getLibrary()).playlists);
  handle('library:add', (url) => addOrUpdatePlaylist(url));
  handle('library:refresh', async (id) => {
    const lib = await getLibrary();
    const pl = lib.playlists.find((p) => p.id === id);
    if (!pl) throw new Error('Playlist not found.');
    return addOrUpdatePlaylist(`https://open.spotify.com/${pl.type}/${pl.spotifyId}`);
  });
  handle('library:remove', async (id) => {
    const lib = await getLibrary();
    lib.playlists = lib.playlists.filter((p) => p.id !== id);
    await saveLibrary();
    return true;
  });

  handle('track:prepare', (track, opts) => prepareTrack(track, opts || {}));
  handle('track:cover', (track) => getCover(track));
  handle('track:lyrics', (track) => getLyrics(track));

  handle('settings:get', async () => ({ ...(await getSettings()), platform: process.platform }));
  handle('settings:set', async (patch) => {
    const allowed = ['spotifyClientId', 'spotifyClientSecret', 'cacheLimitMB'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if ('cacheLimitMB' in clean) clean.cacheLimitMB = Math.max(256, Math.min(51200, Number(clean.cacheLimitMB) || 2048));
    tokenCache = { token: '', exp: 0, key: '' };
    return saveSettings(clean);
  });
  handle('cache:info', async () => {
    let size = 0;
    let count = 0;
    try {
      for (const n of await fsp.readdir(DIRS.audio)) {
        const st = await fsp.stat(path.join(DIRS.audio, n)).catch(() => null);
        if (st && st.isFile()) { size += st.size; count++; }
      }
    } catch (_) { /* none yet */ }
    return { size, count };
  });
  handle('cache:clear', async () => {
    try {
      for (const n of await fsp.readdir(DIRS.audio)) await fsp.unlink(path.join(DIRS.audio, n)).catch(() => {});
    } catch (_) { /* none */ }
    return true;
  });
  handle('ytdlp:version', async () => {
    const r = await ytdlp(['--version']);
    return r.stdout.trim();
  });
  handle('ytdlp:update', async () => {
    const bin = await ensureYtdlp();
    await updating;
    const r = await rawRun(bin, ['-U']);
    await saveSettings({ lastUpdateCheck: Date.now() });
    return (r.stdout + r.stderr).trim().split(/\r?\n/).slice(-2).join(' ');
  });

  handle('shell:open', async (url) => {
    if (/^https:\/\//i.test(url)) await shell.openExternal(url);
    return true;
  });
  handle('win:minimize', () => win && win.minimize());
  handle('win:maximize', () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
  handle('win:close', () => win && win.close());
}

/* ------------------------------------------------------------------ */
/* window + lifecycle                                                  */
/* ------------------------------------------------------------------ */

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#09090e',
    title: 'Wavelength',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  }
  win.on('closed', () => (win = null));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await Promise.all(Object.values(DIRS).map((d) => fsp.mkdir(d, { recursive: true })));

  const server = L.createMediaServer(DIRS.audio);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  mediaPort = server.address().port;

  registerIpc();
  createWindow();

  const keys = { MediaPlayPause: 'playpause', MediaNextTrack: 'next', MediaPreviousTrack: 'prev', MediaStop: 'stop' };
  for (const [accel, action] of Object.entries(keys)) {
    try { globalShortcut.register(accel, () => send('media-key', action)); } catch (_) { /* ignore */ }
  }

  // Get yt-dlp ready in the background so the first play is quick.
  win.webContents.once('did-finish-load', () => {
    ensureYtdlp()
      .then(() => maybeUpdateYtdlp())
      .catch((e) => status(e.message, 'error'));
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
