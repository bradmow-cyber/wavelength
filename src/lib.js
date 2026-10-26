'use strict';
/**
 * Pure logic with no Electron dependency, so it can be unit-tested with plain Node.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

/* ---------- Spotify link parsing ---------- */

function parseSpotifyUrl(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]{10,30})/i);
  if (m) return { type: m[1].toLowerCase(), id: m[2] };
  m = s.match(/^spotify:(playlist|album):([A-Za-z0-9]{10,30})$/i);
  if (m) return { type: m[1].toLowerCase(), id: m[2] };
  return null;
}

function isSpotifyShortLink(input) {
  return /^https?:\/\/(spotify\.link|spotify\.app\.link)\//i.test(String(input || '').trim());
}

/* ---------- Spotify embed page parsing ---------- */

function findEntity(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (Array.isArray(node.trackList)) return node;
  for (const k of Object.keys(node)) {
    const r = findEntity(node[k], depth + 1);
    if (r) return r;
  }
  return null;
}

function findKey(node, key, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return undefined;
  if (key in node) return node[key];
  for (const k of Object.keys(node)) {
    const r = findKey(node[k], key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

function cleanText(s) {
  return String(s == null ? '' : s).replace(/[  ​]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseEmbedHtml(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Spotify page had no data (the link may be private or Spotify changed its page).');
  const json = JSON.parse(m[1]);
  const entity = findEntity(json);
  if (!entity) throw new Error('Could not find the track list on that Spotify page.');

  let cover = null;
  const sources = (entity.coverArt && entity.coverArt.sources) || findKey(entity, 'sources');
  if (Array.isArray(sources) && sources.length) {
    cover = sources.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0].url || null;
  }

  const tracks = entity.trackList
    .map((t) => {
      const id = String(t.uri || '').split(':').pop();
      if (!id || !t.title) return null;
      return {
        id,
        title: cleanText(t.title),
        artist: cleanText(t.subtitle),
        durationMs: Number(t.duration) || 0,
      };
    })
    .filter(Boolean);

  return {
    name: cleanText(entity.name || entity.title || 'Untitled'),
    owner: cleanText(entity.subtitle || ''),
    cover,
    tracks,
  };
}

/* ---------- Title cleaning / matching ---------- */

function primaryArtist(artistStr) {
  return cleanText(String(artistStr || '').split(/,|&| feat\.? | ft\.? | x /i)[0]);
}

function cleanTitle(title) {
  let t = cleanText(title);
  t = t.replace(/\s*[\(\[]\s*(?:feat|ft|featuring|with|prod)\.?[^\)\]]*[\)\]]/gi, '');
  t = t.replace(/\s+-\s+.*?(?:remaster|version|edit|mono|stereo|mix|live|deluxe|anniversary|single|bonus|radio).*$/i, '');
  t = t.replace(/\s*[\(\[]\s*(?:remaster(?:ed)?(?:\s+\d{4})?|\d{4}\s+remaster(?:ed)?|radio edit|single version|album version|mono|stereo)\s*[\)\]]/gi, '');
  return cleanText(t);
}

const BAD_WORDS = /\b(live|cover|remix|karaoke|instrumental|slowed|sped up|speed up|reverb|8d|nightcore|mashup|reaction|acoustic|tutorial|lesson|piano version|bass boosted|loop|1 hour|extended)\b/i;

function scoreCandidate(c, track) {
  const target = track.durationMs ? track.durationMs / 1000 : 0;
  const vt = (c.title || '').toLowerCase();
  const ch = (c.channel || '').toLowerCase();
  const title = cleanTitle(track.title).toLowerCase();
  const artist = primaryArtist(track.artist).toLowerCase();
  let score = 0;

  if (target && c.duration) {
    const dd = Math.abs(c.duration - target);
    score -= Math.min(dd, 60) * 2;
    if (dd <= 3) score += 30;
    else if (dd <= 8) score += 12;
  }
  if (/ - topic$/.test(ch)) score += 25;
  if (/official (audio|lyric)/.test(vt)) score += 6;
  if (/official (music )?video/.test(vt)) score -= 4;
  if (BAD_WORDS.test(vt) && !BAD_WORDS.test(title)) score -= 40;
  if (title && vt.includes(title)) score += 8;
  if (artist && (vt.includes(artist) || ch.includes(artist))) score += 8;
  else score -= 10;
  if (c.duration && c.duration > 15 * 60) score -= 50;
  return score;
}

function rankCandidates(cands, track) {
  const seen = new Set();
  return cands
    .filter((c) => c && c.id && !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({ ...c, score: scoreCandidate(c, track) }))
    .sort((a, b) => b.score - a.score);
}

function parseYtdlpJsonLines(stdout) {
  const out = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      if (!j.id) continue;
      out.push({
        id: j.id,
        title: j.title || '',
        channel: j.channel || j.uploader || '',
        duration: Number(j.duration) || 0,
      });
    } catch (_) { /* skip */ }
  }
  return out;
}

/* ---------- Lyrics ---------- */

function parseLrc(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const line = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text: line });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function pickLyrics(results, durationSec) {
  if (!Array.isArray(results)) return null;
  const withSync = results.filter((r) => r && r.syncedLyrics);
  const pool = withSync.length ? withSync : results.filter((r) => r && (r.plainLyrics || r.instrumental));
  if (!pool.length) return null;
  if (!durationSec) return pool[0];
  return pool
    .slice()
    .sort((a, b) => Math.abs((a.duration || 0) - durationSec) - Math.abs((b.duration || 0) - durationSec))[0];
}

/* ---------- Palette helpers (used by tests; renderer has its own copy) ---------- */

/* ---------- Local media server with Range support ---------- */

const MIME = {
  '.webm': 'audio/webm', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.aac': 'audio/aac',
};
const SAFE_NAME = /^[\w-]{6,24}\.(webm|m4a|mp4|opus|ogg|mp3|aac)$/;

function createMediaServer(dir) {
  const server = http.createServer((req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
      if (!SAFE_NAME.test(name)) { res.writeHead(404); return res.end(); }
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      const type = MIME[path.extname(name)] || 'application/octet-stream';
      const base = {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      };
      const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (range) {
        let start = range[1] === '' ? NaN : parseInt(range[1], 10);
        let end = range[2] === '' ? NaN : parseInt(range[2], 10);
        if (Number.isNaN(start)) { start = Math.max(0, stat.size - end); end = stat.size - 1; }
        else if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
        if (start > end || start >= stat.size) {
          res.writeHead(416, { ...base, 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
      }
      res.writeHead(200, { ...base, 'Content-Length': stat.size });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch (_) {
      res.writeHead(404);
      res.end();
    }
  });
  return server;
}

module.exports = {
  parseSpotifyUrl, isSpotifyShortLink, parseEmbedHtml, findEntity, findKey, cleanText,
  primaryArtist, cleanTitle, scoreCandidate, rankCandidates, parseYtdlpJsonLines,
  parseLrc, pickLyrics, createMediaServer, SAFE_NAME,
};
