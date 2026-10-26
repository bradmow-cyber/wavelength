'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const L = require('../src/lib');

// Spotify links
assert.deepStrictEqual(L.parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc'), { type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
assert.deepStrictEqual(L.parseSpotifyUrl('https://open.spotify.com/intl-de/album/1A2b3C4d5E6f7G8h9I0jKl'), { type: 'album', id: '1A2b3C4d5E6f7G8h9I0jKl' });
assert.deepStrictEqual(L.parseSpotifyUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'), { type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
assert.strictEqual(L.parseSpotifyUrl('https://example.com/playlist/abc'), null);
assert.ok(L.isSpotifyShortLink('https://spotify.link/AbCdEf'));

// Embed parsing (shape modelled on Spotify's __NEXT_DATA__)
const next = { props: { pageProps: { state: { data: { entity: {
  name: 'Road Trip', subtitle: 'Sam', coverArt: { sources: [{ url: 'https://i.scdn.co/small', width: 64 }, { url: 'https://i.scdn.co/big', width: 640 }] },
  trackList: [
    { uri: 'spotify:track:AAA111', title: 'Song One', subtitle: 'Artist A, Artist B', duration: 201000 },
    { uri: 'spotify:track:BBB222', title: 'Song Two', subtitle: 'Artist C', duration: 180500 },
    { uri: '', title: 'broken' },
  ] } } } } } };
const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></html>`;
const parsed = L.parseEmbedHtml(html);
assert.strictEqual(parsed.name, 'Road Trip');
assert.strictEqual(parsed.cover, 'https://i.scdn.co/big');
assert.strictEqual(parsed.tracks.length, 2);
assert.strictEqual(parsed.tracks[0].artist, 'Artist A, Artist B');
assert.strictEqual(parsed.tracks[0].id, 'AAA111');
assert.throws(() => L.parseEmbedHtml('<html></html>'));

// Title cleaning
assert.strictEqual(L.cleanTitle('Blinding Lights (feat. Someone)'), 'Blinding Lights');
assert.strictEqual(L.cleanTitle('Yesterday - Remastered 2009'), 'Yesterday');
assert.strictEqual(L.cleanTitle('Hey Jude - Radio Edit'), 'Hey Jude');
assert.strictEqual(L.cleanTitle('Song [Remastered 2011]'), 'Song');
assert.strictEqual(L.primaryArtist('Daft Punk, Pharrell Williams'), 'Daft Punk');

// Candidate ranking prefers right duration + Topic channel, avoids live/remix
const track = { title: 'Get Lucky', artist: 'Daft Punk, Pharrell Williams', durationMs: 369000 };
const ranked = L.rankCandidates([
  { id: 'live1111111', title: 'Daft Punk - Get Lucky (Live at Coachella)', channel: 'RandomFan', duration: 410 },
  { id: 'remx1111111', title: 'Get Lucky (Remix) Daft Punk', channel: 'DJ Foo', duration: 369 },
  { id: 'vevo1111111', title: 'Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams', channel: 'Daft Punk', duration: 248 },
  { id: 'topic111111', title: 'Get Lucky', channel: 'Daft Punk - Topic', duration: 369 },
  { id: 'topic111111', title: 'dup', channel: 'dup', duration: 1 },
], track);
assert.strictEqual(ranked[0].id, 'topic111111');
assert.strictEqual(ranked.length, 4);

// yt-dlp JSON lines
const lines = L.parseYtdlpJsonLines('{"id":"abc","title":"T","channel":"C","duration":12.5}\nnoise\n{"id":"d","uploader":"U"}');
assert.strictEqual(lines.length, 2);
assert.strictEqual(lines[1].channel, 'U');

// LRC
const lrc = L.parseLrc('[ar:x]\n[00:12.50]Hello\n[00:20.00][01:05.25]Chorus line\n[00:30.00]\n');
assert.deepStrictEqual(lrc.map((l) => [l.t, l.text]), [[12.5, 'Hello'], [20, 'Chorus line'], [30, ''], [65.25, 'Chorus line']]);
const pick = L.pickLyrics([{ duration: 100, syncedLyrics: 'a' }, { duration: 200, syncedLyrics: 'b' }, { duration: 201, plainLyrics: 'c' }], 199);
assert.strictEqual(pick.syncedLyrics, 'b');

// Media server with Range support
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-'));
  const buf = Buffer.alloc(1000);
  for (let i = 0; i < 1000; i++) buf[i] = i % 251;
  fs.writeFileSync(path.join(dir, 'abcdefghijk.webm'), buf);
  const srv = L.createMediaServer(dir);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const get = (p, headers = {}) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  let r = await get('/abcdefghijk.webm');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.length, 1000);
  assert.strictEqual(r.headers['access-control-allow-origin'], '*');
  r = await get('/abcdefghijk.webm', { Range: 'bytes=100-199' });
  assert.strictEqual(r.status, 206); assert.strictEqual(r.body.length, 100); assert.ok(r.body.equals(buf.subarray(100, 200)));
  assert.strictEqual(r.headers['content-range'], 'bytes 100-199/1000');
  r = await get('/abcdefghijk.webm', { Range: 'bytes=900-' });
  assert.strictEqual(r.status, 206); assert.strictEqual(r.body.length, 100);
  r = await get('/abcdefghijk.webm', { Range: 'bytes=-50' });
  assert.strictEqual(r.status, 206); assert.strictEqual(r.body.length, 50);
  r = await get('/abcdefghijk.webm', { Range: 'bytes=5000-6000' });
  assert.strictEqual(r.status, 416);
  r = await get('/..%2F..%2Fetc%2Fpasswd'); assert.strictEqual(r.status, 404);
  r = await get('/nope.webm'); assert.strictEqual(r.status, 404);
  srv.close();
  console.log('all lib tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
