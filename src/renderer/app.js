(() => {
  'use strict';

  /* ================================================================== */
  /* helpers                                                            */
  /* ================================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wave = window.wave;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('wl.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('wl.' + k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
  };

  const ICONS = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
    prev: 'M6 6h2v12H6zm3.5 6L18 18V6z',
    next: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
    shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
    repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
    volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    mute: 'M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
    refresh: 'M17.65 6.35A7.96 7.96 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z',
    trash: 'M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z',
    expand: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
    swap: 'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
    plus2: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    note: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;
  const setIcon = (el, name) => { el.innerHTML = svg(name); el.dataset.icon = name; };
  $$('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));

  const fmt = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  function toast(msg, kind = 'info', ms = 4200) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, ms);
  }

  function friendlyError(msg) {
    const m = String(msg || '');
    if (/sign in to confirm|not a bot/i.test(m)) return 'YouTube is asking for a bot check. Wait a minute, or open Settings → Update yt-dlp.';
    if (/HTTP 429|too many requests/i.test(m)) return 'YouTube is rate-limiting this connection. Try again in a few minutes.';
    if (/ENOTFOUND|ENETUNREACH|net::ERR|fetch failed|Failed to fetch|getaddrinfo/i.test(m)) return 'Could not reach the internet.';
    return m;
  }

  /* ================================================================== */
  /* state                                                              */
  /* ================================================================== */
  const audio = $('#audio');
  const S = {
    playlists: [],
    viewId: store.get('view', null),
    queue: [],
    order: [],
    pos: -1,
    queuePlaylistId: null,
    shuffle: store.get('shuffle', false),
    repeat: store.get('repeat', 'off'),
    token: 0,
    cur: null,
    match: null,
    failStreak: 0,
    lyrics: null,
    lines: [],
    times: [],
    lyricIdx: -2,
    offsets: store.get('offsets', {}),
    palette: { a1: '#8b8cff', a2: '#ff7ac6', a3: '#62e0ff' },
    loading: false,
    lastUserScroll: 0,
    seeking: false,
  };

  const curPlaylist = () => S.playlists.find((p) => p.id === S.viewId) || null;
  const queuePlaylist = () => S.playlists.find((p) => p.id === S.queuePlaylistId) || null;

  /* ================================================================== */
  /* palette from cover art                                             */
  /* ================================================================== */
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  const hsl = (h, s, l) => `hsl(${Math.round(((h % 1) + 1) % 1 * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

  function extractPalette(img) {
    const N = 48;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data;
    const B = 12;
    const buckets = Array.from({ length: B }, () => ({ w: 0, hs: 0, ss: 0 }));
    let ar = 0, ag = 0, ab = 0;
    for (let i = 0; i < d.length; i += 4) {
      ar += d[i]; ag += d[i + 1]; ab += d[i + 2];
      const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      if (l < 0.12 || l > 0.93 || s < 0.2) continue;
      const w = s * (1 - Math.abs(l - 0.5) * 1.3);
      const b = buckets[Math.floor(h * B) % B];
      b.w += w; b.hs += h * w; b.ss += s * w;
    }
    const n = d.length / 4;
    const avg = [ar / n, ag / n, ab / n];
    const ranked = buckets.map((b, i) => ({ i, ...b })).filter((b) => b.w > 0.6).sort((a, b) => b.w - a.w);
    const chosen = [];
    for (const b of ranked) {
      if (chosen.every((c) => { const dd = Math.abs(c.i - b.i); return Math.min(dd, B - dd) >= 2; })) chosen.push(b);
      if (chosen.length === 3) break;
    }
    const [ah, as] = rgb2hsl(avg[0], avg[1], avg[2]);
    if (!chosen.length) {
      // greyscale artwork: neutral, slightly cool accents
      return { a1: hsl(0.62, 0.35, 0.78), a2: hsl(0.72, 0.3, 0.68), a3: hsl(0.55, 0.35, 0.82), tint: hsl(0.62, 0.2, 0.14) };
    }
    const toCss = (b, shift = 0) => {
      const h = b.hs / b.w + shift;
      const s = Math.max(0.55, Math.min(0.92, (b.ss / b.w) * 1.1));
      return hsl(h, s, 0.64);
    };
    const first = chosen[0];
    const a1 = toCss(first);
    const a2 = chosen[1] ? toCss(chosen[1]) : toCss(first, 0.08);
    const a3 = chosen[2] ? toCss(chosen[2]) : toCss(first, -0.09);
    const tint = hsl(first.hs / first.w, Math.min(0.6, as + 0.15), 0.16);
    void ah;
    return { a1, a2, a3, tint };
  }

  function applyPalette(p) {
    S.palette = p;
    const r = document.documentElement.style;
    r.setProperty('--a1', p.a1);
    r.setProperty('--a2', p.a2);
    r.setProperty('--a3', p.a3);
    r.setProperty('--tint', p.tint || '#16162a');
  }
  const DEFAULT_PALETTE = { a1: '#8b8cff', a2: '#ff7ac6', a3: '#62e0ff', tint: '#16162a' };

  /* ================================================================== */
  /* backdrop + cover                                                   */
  /* ================================================================== */
  let bgFlip = false;
  function setBackdrop(dataUrl) {
    const a = $('#bgA'), b = $('#bgB');
    if (!dataUrl) { a.classList.remove('show'); b.classList.remove('show'); return; }
    const next = bgFlip ? a : b;
    const prev = bgFlip ? b : a;
    bgFlip = !bgFlip;
    next.style.backgroundImage = `url("${dataUrl}")`;
    next.classList.add('show');
    prev.classList.remove('show');
  }

  function showCover(dataUrl) {
    const big = $('#cover'), mini = $('#mini-cover');
    if (!dataUrl) {
      big.classList.remove('show'); mini.classList.remove('show');
      big.removeAttribute('src'); mini.removeAttribute('src');
      setBackdrop(null);
      applyPalette(DEFAULT_PALETTE);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try { applyPalette(extractPalette(img)); } catch (_) { applyPalette(DEFAULT_PALETTE); }
      big.src = dataUrl; mini.src = dataUrl;
      big.classList.add('show'); mini.classList.add('show');
      setBackdrop(dataUrl);
    };
    img.onerror = () => showCover(null);
    img.src = dataUrl;
  }

  async function loadCover(track, token) {
    try {
      const url = await wave.track.cover(track);
      if (token !== S.token) return;
      showCover(url);
    } catch (_) {
      if (token === S.token) showCover(null);
    }
  }

  /* ================================================================== */
  /* lyrics                                                             */
  /* ================================================================== */
  const lyricsBox = $('#lyrics');
  const offsetFor = () => (S.cur ? S.offsets[S.cur.id] || 0 : 0);

  function lyricsMessage(text) {
    lyricsBox.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'lyrics-msg';
    d.textContent = text;
    lyricsBox.appendChild(d);
    S.lines = []; S.times = []; S.lyricIdx = -2;
    $('#offset-ctl').hidden = true;
  }

  function renderLyrics(data) {
    S.lyrics = data;
    S.lines = []; S.times = []; S.lyricIdx = -2;
    $('#offset-ctl').hidden = true;
    lyricsBox.innerHTML = '';

    if (data && data.synced && data.synced.length) {
      const top = document.createElement('div'); top.className = 'pad';
      lyricsBox.appendChild(top);
      data.synced.forEach((l, i) => {
        const el = document.createElement('div');
        el.className = 'line' + (l.text ? '' : ' gap');
        el.textContent = l.text || '• • •';
        el.addEventListener('click', () => { audio.currentTime = Math.max(0, l.t + offsetFor()); });
        lyricsBox.appendChild(el);
        S.lines.push(el); S.times.push(l.t);
        void i;
      });
      const bottom = document.createElement('div'); bottom.className = 'pad';
      lyricsBox.appendChild(bottom);
      $('#lyrics-state').textContent = 'Synced';
      $('#offset-ctl').hidden = false;
      updateOffsetLabel();
      lyricsBox.scrollTop = 0;
    } else if (data && data.plain) {
      const p = document.createElement('div');
      p.className = 'lyrics-plain';
      p.textContent = data.plain;
      lyricsBox.appendChild(p);
      $('#lyrics-state').textContent = 'Not time-synced for this song';
    } else if (data && data.instrumental) {
      lyricsMessage('Instrumental ♪');
      $('#lyrics-state').textContent = '';
    } else {
      lyricsMessage('No lyrics found for this song.');
      $('#lyrics-state').textContent = '';
    }
  }

  async function loadLyrics(track, token) {
    $('#lyrics-state').textContent = 'Searching…';
    lyricsMessage('Looking for lyrics…');
    try {
      const data = await wave.track.lyrics(track);
      if (token !== S.token) return;
      renderLyrics(data);
    } catch (_) {
      if (token !== S.token) return;
      lyricsMessage('Could not load lyrics (offline?).');
      $('#lyrics-state').textContent = '';
    }
  }

  function updateOffsetLabel() {
    const o = offsetFor();
    $('#off-val').textContent = `${o > 0 ? '+' : ''}${o.toFixed(1)}s`;
  }
  function changeOffset(delta) {
    if (!S.cur) return;
    const v = Math.round(((S.offsets[S.cur.id] || 0) + delta) * 10) / 10;
    S.offsets[S.cur.id] = v;
    store.set('offsets', S.offsets);
    updateOffsetLabel();
    S.lyricIdx = -2;
  }

  function currentLineIndex(t) {
    const times = S.times;
    let lo = 0, hi = times.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function updateLyrics() {
    if (!S.lines.length) return;
    const t = audio.currentTime - offsetFor() + 0.18;
    const idx = currentLineIndex(t);
    if (idx === S.lyricIdx) return;
    S.lyricIdx = idx;
    for (let i = 0; i < S.lines.length; i++) {
      const el = S.lines[i];
      const d = i - idx;
      el.className = 'line' + (S.lines[i].textContent === '• • •' ? ' gap' : '') +
        (d === 0 ? ' d0' : d === 1 ? ' d1' : d === 2 ? ' d2' : d < 0 ? ' past' : '');
    }
    scrollToLine(idx);
  }

  function scrollToLine(idx, instant) {
    if (Date.now() - S.lastUserScroll < 3500 && !instant) return;
    if (idx < 0) { lyricsBox.scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' }); return; }
    const el = S.lines[idx];
    if (!el) return;
    const top = el.offsetTop + el.offsetHeight / 2 - lyricsBox.clientHeight * 0.42;
    lyricsBox.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' });
  }
  ['wheel', 'touchmove'].forEach((ev) => lyricsBox.addEventListener(ev, () => { S.lastUserScroll = Date.now(); }, { passive: true }));

  /* ================================================================== */
  /* visualizer                                                         */
  /* ================================================================== */
  const canvas = $('#viz');
  const cctx = canvas.getContext('2d');
  const BARS = 96;
  const vals = new Float32Array(BARS);
  let actx = null, analyser = null, freq = null, bass = 0, dpr = 1;

  function ensureAudioGraph() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      analyser.connect(actx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      actx = null; analyser = null;
    }
  }

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = $('#art-wrap').getBoundingClientRect();
    canvas.width = Math.max(10, Math.round(r.width * dpr));
    canvas.height = Math.max(10, Math.round(r.height * dpr));
  }
  new ResizeObserver(resizeCanvas).observe($('#art-wrap'));
  resizeCanvas();

  const SQ = 5;
  const squircle = (a, half) => half / Math.pow(Math.pow(Math.abs(Math.cos(a)), SQ) + Math.pow(Math.abs(Math.sin(a)), SQ), 1 / SQ);
  const rootStyle = document.documentElement.style;
  let lastBassWritten = -1;

  function drawViz(t) {
    const playing = !audio.paused && !audio.ended;
    if (playing && analyser) analyser.getByteFrequencyData(freq);
    const live = playing && analyser;

    let bassT = 0;
    if (live) { bassT = (freq[1] + freq[2] + freq[3] + freq[4] + freq[5]) / (5 * 255); bassT = Math.pow(bassT, 1.6); }
    else if (playing) { bassT = 0.25 + 0.2 * Math.sin(t / 220); } // graph unavailable: gentle fake pulse
    bass += (bassT - bass) * (bassT > bass ? 0.5 : 0.1);
    if (Math.abs(bass - lastBassWritten) > 0.004) { rootStyle.setProperty('--bass', bass.toFixed(3)); lastBassWritten = bass; }

    let energy = 0;
    for (let i = 0; i < BARS; i++) {
      const u = i < BARS / 2 ? i / (BARS / 2) : (BARS - i) / (BARS / 2); // 0 top .. 1 bottom
      const b = 1 - u; // 0 at bottom (bass) .. 1 at top (treble)
      let target = 0;
      if (live) {
        const bin = 1 + Math.floor(Math.pow(b, 1.6) * 150);
        let v = (freq[bin] / 255) * (1 + b * 0.7);
        target = Math.pow(Math.min(1, v), 1.35);
      } else if (playing) {
        target = 0.25 + 0.2 * Math.sin(t / 260 + i * 0.5);
      }
      vals[i] += (target - vals[i]) * (target > vals[i] ? 0.55 : 0.12);
      energy += vals[i];
    }

    const w = canvas.width, h = canvas.height;
    cctx.clearRect(0, 0, w, h);
    if (energy < 0.02 && !playing) return;

    const cx = w / 2, cy = h / 2;
    const half = w * 0.28;
    const gap = w * 0.03;
    const maxLen = w * 0.185;
    const g = cctx.createConicGradient(-Math.PI / 2, cx, cy);
    g.addColorStop(0, S.palette.a1);
    g.addColorStop(0.33, S.palette.a2);
    g.addColorStop(0.66, S.palette.a3);
    g.addColorStop(1, S.palette.a1);
    cctx.strokeStyle = g;
    cctx.lineWidth = Math.max(2, w * 0.0085);
    cctx.lineCap = 'round';
    cctx.shadowColor = S.palette.a1;
    cctx.shadowBlur = w * 0.035;
    cctx.beginPath();
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
      const r0 = squircle(a, half) + gap;
      const len = w * 0.006 + vals[i] * maxLen;
      const c = Math.cos(a), s = Math.sin(a);
      cctx.moveTo(cx + c * r0, cy + s * r0);
      cctx.lineTo(cx + c * (r0 + len), cy + s * (r0 + len));
    }
    cctx.stroke();
  }

  /* ================================================================== */
  /* main frame loop                                                    */
  /* ================================================================== */
  const seekEl = $('#seek');
  function setRangeFill(el) {
    const p = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--p', `${p}%`);
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dur = audio.duration;
    if (!S.seeking && isFinite(dur) && dur > 0) {
      seekEl.value = Math.round((audio.currentTime / dur) * 1000);
      setRangeFill(seekEl);
      $('#t-cur').textContent = fmt(audio.currentTime);
    }
    updateLyrics();
    drawViz(t);
  }
  requestAnimationFrame(frame);

  /* ================================================================== */
  /* library UI                                                         */
  /* ================================================================== */
  const totalDuration = (tracks) => {
    const ms = tracks.reduce((a, t) => a + (t.durationMs || 0), 0);
    const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
    return h ? `${h} hr ${m} min` : `${m} min`;
  };

  function renderSidebar() {
    const nav = $('#playlists');
    nav.innerHTML = '';
    if (!S.playlists.length) {
      const e = document.createElement('div');
      e.style.cssText = 'color:var(--faint);font-size:13px;padding:8px;line-height:1.5';
      e.textContent = 'Nothing here yet. Paste a Spotify link above.';
      nav.appendChild(e);
      return;
    }
    for (const p of S.playlists) {
      const b = document.createElement('button');
      b.className = 'pl-item' + (p.id === S.viewId ? ' active' : '') + (p.id === S.queuePlaylistId && !audio.paused ? ' playing' : '');
      b.dataset.id = p.id;
      let art;
      if (p.cover) { art = document.createElement('img'); art.src = p.cover; art.alt = ''; art.onerror = () => { art.replaceWith(Object.assign(document.createElement('div'), { className: 'ph' })); }; }
      else art = Object.assign(document.createElement('div'), { className: 'ph' });
      const t = document.createElement('div'); t.className = 't';
      const n = document.createElement('div'); n.className = 'n'; n.textContent = p.name;
      const c = document.createElement('div'); c.className = 'c'; c.textContent = `${p.tracks.length} songs`;
      t.append(n, c);
      b.append(art, t);
      b.addEventListener('click', () => selectPlaylist(p.id));
      nav.appendChild(b);
    }
  }

  function selectPlaylist(id) {
    S.viewId = id;
    store.set('view', id);
    renderSidebar();
    renderPlaylistView();
  }

  function renderPlaylistView() {
    const pl = curPlaylist();
    $('#empty-state').hidden = !!pl;
    $('#pl-view').hidden = !pl;
    if (!pl) return;

    const cover = $('#pl-cover');
    if (pl.cover) { cover.src = pl.cover; cover.style.visibility = 'visible'; cover.onerror = () => { cover.style.visibility = 'hidden'; }; }
    else cover.style.visibility = 'hidden';
    $('#pl-kind').textContent = pl.type === 'album' ? 'Album' : 'Playlist';
    $('#pl-name').textContent = pl.name;
    $('#pl-sub').textContent = [pl.owner, `${pl.tracks.length} songs`, totalDuration(pl.tracks)].filter(Boolean).join('  ·  ');

    const note = $('#limit-note');
    if (pl.tracks.length === 100 && pl.type === 'playlist') {
      note.hidden = false;
      note.textContent = 'Spotify only shares the first 100 songs of a playlist without API keys. If your playlist is longer, add free Spotify API keys in Settings and press refresh.';
    } else note.hidden = true;

    const box = $('#tracks');
    box.innerHTML = '';
    const frag = document.createDocumentFragment();
    pl.tracks.forEach((tr, i) => {
      const row = document.createElement('div');
      row.className = 'track';
      row.dataset.i = i;
      row.dataset.search = `${tr.title} ${tr.artist}`.toLowerCase();

      const num = document.createElement('div'); num.className = 'num';
      const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
      const eq = document.createElement('span'); eq.className = 'eq'; eq.innerHTML = '<i></i><i></i><i></i>';
      const pi = document.createElement('span'); pi.className = 'play-ic'; pi.innerHTML = svg('play');
      num.append(n, eq, pi);

      const info = document.createElement('div'); info.className = 'info';
      const ti = document.createElement('div'); ti.className = 'ti'; ti.textContent = tr.title;
      const ar = document.createElement('div'); ar.className = 'ar'; ar.textContent = tr.artist;
      info.append(ti, ar);

      const dur = document.createElement('div'); dur.className = 'dur'; dur.textContent = fmt((tr.durationMs || 0) / 1000);

      row.append(num, info, dur);
      row.addEventListener('dblclick', () => startPlayback(pl, i));
      pi.addEventListener('click', (e) => { e.stopPropagation(); startPlayback(pl, i); });
      frag.appendChild(row);
    });
    box.appendChild(frag);
    $('#filter').value = '';
    markPlaying();
  }

  function markPlaying() {
    $$('#tracks .track').forEach((r) => r.classList.remove('playing', 'loading'));
    if (S.queuePlaylistId === S.viewId && S.pos >= 0 && S.cur) {
      const qi = S.order[S.pos];
      const row = $(`#tracks .track[data-i="${qi}"]`);
      if (row) {
        row.classList.add('playing');
        if (S.loading) row.classList.add('loading');
      }
    }
    $$('.pl-item').forEach((el) => el.classList.toggle('playing', el.dataset.id === S.queuePlaylistId && !audio.paused));
  }

  $('#filter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('#tracks .track').forEach((r) => { r.style.display = !q || r.dataset.search.includes(q) ? '' : 'none'; });
  });

  /* ---- adding playlists ---- */
  const SPOTIFY_RE = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/|spotify:(playlist|album):|spotify\.link\/|spotify\.app\.link\//i;
  let adding = false;
  async function addPlaylist(url) {
    if (adding) return;
    url = String(url || '').trim();
    if (!url) return;
    adding = true;
    const btn = $('#add-btn');
    btn.disabled = true;
    toast('Reading Spotify link…');
    try {
      const res = await wave.library.add(url);
      S.playlists = await wave.library.get();
      selectPlaylist(res.playlist.id);
      $('#add-input').value = '';
      toast(`Added “${res.playlist.name}” · ${res.playlist.tracks.length} songs`);
      if (res.apiError) toast(`Spotify API keys didn't work (${res.apiError}). Used the public page instead.`, 'error', 6000);
    } catch (e) {
      toast(friendlyError(e.message), 'error', 6000);
    } finally {
      adding = false;
      btn.disabled = false;
    }
  }
  $('#add-form').addEventListener('submit', (e) => { e.preventDefault(); addPlaylist($('#add-input').value); });
  document.addEventListener('paste', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (SPOTIFY_RE.test(text)) { e.preventDefault(); addPlaylist(text); }
  });

  $('#pl-play').addEventListener('click', () => { const p = curPlaylist(); if (p) startPlayback(p, 0); });
  $('#pl-shuffle').addEventListener('click', () => { const p = curPlaylist(); if (p) startPlayback(p, Math.floor(Math.random() * p.tracks.length), { shuffle: true }); });
  $('#pl-refresh').addEventListener('click', async () => {
    const p = curPlaylist(); if (!p) return;
    toast('Refreshing from Spotify…');
    try {
      const res = await wave.library.refresh(p.id);
      S.playlists = await wave.library.get();
      renderSidebar(); renderPlaylistView();
      toast(`Updated · ${res.playlist.tracks.length} songs`);
    } catch (e) { toast(friendlyError(e.message), 'error'); }
  });
  $('#pl-remove').addEventListener('click', async () => {
    const p = curPlaylist(); if (!p) return;
    if (!confirm(`Remove “${p.name}” from your library?`)) return;
    await wave.library.remove(p.id);
    S.playlists = await wave.library.get();
    S.viewId = S.playlists[0] ? S.playlists[0].id : null;
    renderSidebar(); renderPlaylistView();
  });

  /* ================================================================== */
  /* playback                                                           */
  /* ================================================================== */
  function shuffled(n, first) {
    const a = Array.from({ length: n }, (_, i) => i).filter((i) => i !== first);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return first == null ? a : [first, ...a];
  }

  function startPlayback(pl, index, opts = {}) {
    S.queue = pl.tracks;
    S.queuePlaylistId = pl.id;
    if (opts.shuffle != null) { S.shuffle = opts.shuffle; store.set('shuffle', S.shuffle); updateToggles(); }
    S.order = S.shuffle ? shuffled(S.queue.length, index) : S.queue.map((_, i) => i);
    S.pos = S.shuffle ? 0 : index;
    S.failStreak = 0;
    playPos(S.pos);
  }

  function setLoading(on, text) {
    S.loading = on;
    $('#spinner').hidden = !on;
    if (on && text) $('#np-source').textContent = text;
    markPlaying();
  }

  function updateNowUI(track) {
    $('#np-title').textContent = track.title;
    $('#np-title').title = track.title;
    $('#np-artist').textContent = track.artist;
    $('#mini-title').textContent = track.title;
    $('#mini-artist').textContent = track.artist;
    document.title = `${track.title} · ${track.artist} — Wavelength`;
    updateOffsetLabel();
  }

  function showSource() {
    const el = $('#np-source');
    el.textContent = '';
    if (!S.match) return;
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = `YouTube · ${S.match.channel || 'unknown channel'}`;
    a.title = S.match.title;
    a.addEventListener('click', (e) => { e.preventDefault(); wave.openExternal(`https://www.youtube.com/watch?v=${S.match.videoId}`); });
    el.append('Playing audio from ', a);
  }

  async function playPos(pos, { rematch = false } = {}) {
    if (pos < 0 || pos >= S.order.length) return;
    ensureAudioGraph(); // create/resume inside the user's click, before any awaiting
    const my = ++S.token;
    S.pos = pos;
    const track = S.queue[S.order[pos]];
    S.cur = track;
    S.match = null;
    $('#btn-rematch').disabled = true;
    updateNowUI(track);
    audio.pause();
    $('#seek').value = 0; setRangeFill(seekEl);
    $('#t-cur').textContent = '0:00';
    $('#t-dur').textContent = fmt((track.durationMs || 0) / 1000);
    setLoading(true, 'Finding the best match on YouTube…');
    renderLyricsLoading();
    loadCover(track, my);
    loadLyrics(track, my);

    try {
      const res = await wave.track.prepare(track, { rematch });
      if (my !== S.token) return;
      S.match = res.match;
      ensureAudioGraph();
      audio.src = res.url;
      await audio.play();
      if (my !== S.token) return;
      S.failStreak = 0;
      setLoading(false);
      showSource();
      $('#btn-rematch').disabled = !res.match.canRematch;
      prefetchNext();
    } catch (e) {
      if (my !== S.token) return;
      if (e && e.name === 'AbortError') return;
      setLoading(false);
      $('#np-source').textContent = '';
      const row = $(`#tracks .track[data-i="${S.order[pos]}"]`);
      if (row) row.classList.add('failed');
      S.failStreak++;
      toast(`Couldn't play “${track.title}”: ${friendlyError(e.message)}`, 'error', 6000);
      if (S.failStreak < 3 && pos + 1 < S.order.length) setTimeout(() => { if (my === S.token) advance(1, true); }, 1500);
    }
  }
  function renderLyricsLoading() { S.lines = []; S.times = []; S.lyricIdx = -2; }

  function nextPos(auto) {
    let p = S.pos + 1;
    if (p >= S.order.length) p = S.repeat === 'all' || !auto ? 0 : -1;
    return p;
  }

  function prefetchNext() {
    if (S.repeat === 'one') return;
    const p = nextPos(true);
    if (p < 0 || p === S.pos) return;
    const t = S.queue[S.order[p]];
    if (t) wave.track.prepare(t).catch(() => {});
  }

  function advance(dir, auto) {
    if (!S.order.length) return;
    if (auto && S.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
    let p = S.pos + dir;
    if (p >= S.order.length) {
      if (S.repeat === 'all' || !auto) p = 0;
      else { audio.pause(); audio.currentTime = 0; return; }
    }
    if (p < 0) p = S.repeat === 'all' ? S.order.length - 1 : 0;
    playPos(p);
  }

  function togglePlay() {
    if (!S.cur) {
      const pl = curPlaylist();
      if (pl) startPlayback(pl, 0);
      return;
    }
    if (S.loading) return;
    if (audio.paused) { ensureAudioGraph(); audio.play().catch(() => {}); } else audio.pause();
  }

  function prev() {
    if (!S.order.length) return;
    if (audio.currentTime > 3 || S.pos === 0) { audio.currentTime = 0; return; }
    advance(-1, false);
  }

  /* audio element events */
  audio.addEventListener('play', syncPlayState);
  audio.addEventListener('pause', syncPlayState);
  audio.addEventListener('ended', () => advance(1, true));
  audio.addEventListener('loadedmetadata', () => { $('#t-dur').textContent = fmt(audio.duration); });
  audio.addEventListener('error', () => {
    if (!audio.src || S.loading) return;
    toast('The audio file could not be played. Try the “wrong song?” button.', 'error');
  });

  function syncPlayState() {
    const playing = !audio.paused;
    document.body.classList.toggle('is-playing', playing);
    setIcon($('#btn-play'), playing ? 'pause' : 'play');
    markPlaying();
  }

  /* progress events from the main process */
  wave.on('prepare-progress', (ev) => {
    if (!S.cur || ev.id !== S.cur.id || !S.loading) return;
    $('#np-source').textContent = ev.stage === 'downloading'
      ? `Getting audio… ${Math.max(0, Math.min(100, Math.round(ev.percent || 0)))}%`
      : 'Finding the best match on YouTube…';
  });

  let statusTimer = 0;
  wave.on('status', ({ kind, msg }) => {
    const pill = $('#status-pill');
    pill.textContent = msg;
    pill.className = kind === 'error' ? 'error' : '';
    pill.hidden = false;
    clearTimeout(statusTimer);
    if (kind !== 'info') statusTimer = setTimeout(() => { pill.hidden = true; }, kind === 'error' ? 9000 : 3500);
  });

  wave.on('media-key', (a) => {
    if (a === 'playpause') togglePlay();
    else if (a === 'next') advance(1, false);
    else if (a === 'prev') prev();
    else if (a === 'stop') { audio.pause(); audio.currentTime = 0; }
  });

  /* ================================================================== */
  /* controls                                                           */
  /* ================================================================== */
  function updateToggles() {
    $('#btn-shuffle').classList.toggle('on', S.shuffle);
    const r = $('#btn-repeat');
    r.classList.toggle('on', S.repeat !== 'off');
    r.classList.toggle('one', S.repeat === 'one');
    r.title = `Repeat: ${S.repeat} (R)`;
  }

  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-next').addEventListener('click', () => advance(1, false));
  $('#btn-prev').addEventListener('click', prev);
  $('#btn-shuffle').addEventListener('click', toggleShuffle);
  $('#btn-repeat').addEventListener('click', cycleRepeat);
  $('#btn-rematch').addEventListener('click', () => { if (S.cur) { toast('Trying a different YouTube match…'); playPos(S.pos, { rematch: true }); } });

  function toggleShuffle() {
    S.shuffle = !S.shuffle;
    store.set('shuffle', S.shuffle);
    if (S.queue.length && S.cur) {
      const curIdx = S.order[S.pos];
      S.order = S.shuffle ? shuffled(S.queue.length, curIdx) : S.queue.map((_, i) => i);
      S.pos = S.shuffle ? 0 : curIdx;
    }
    updateToggles();
  }
  function cycleRepeat() {
    S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off';
    store.set('repeat', S.repeat);
    updateToggles();
  }

  /* seek */
  seekEl.addEventListener('pointerdown', () => { S.seeking = true; });
  window.addEventListener('pointerup', () => { if (S.seeking) setTimeout(() => { S.seeking = false; }, 60); });
  window.addEventListener('pointercancel', () => { S.seeking = false; });
  seekEl.addEventListener('input', () => {
    setRangeFill(seekEl);
    if (isFinite(audio.duration)) $('#t-cur').textContent = fmt((seekEl.value / 1000) * audio.duration);
  });
  seekEl.addEventListener('change', () => {
    if (isFinite(audio.duration)) audio.currentTime = (seekEl.value / 1000) * audio.duration;
    S.seeking = false;
    S.lyricIdx = -2;
  });

  /* volume */
  const volEl = $('#volume');
  function applyVolume() {
    const v = Number(volEl.value) / 100;
    audio.volume = v * v;
    setRangeFill(volEl);
    setIcon($('#btn-mute'), audio.muted || v === 0 ? 'mute' : 'volume');
    store.set('volume', Number(volEl.value));
  }
  volEl.value = store.get('volume', 80);
  volEl.addEventListener('input', () => { audio.muted = false; applyVolume(); });
  $('#btn-mute').addEventListener('click', () => { audio.muted = !audio.muted; applyVolume(); });
  applyVolume();

  /* lyric offset */
  $('#off-minus').addEventListener('click', () => changeOffset(-0.5));
  $('#off-plus').addEventListener('click', () => changeOffset(0.5));

  /* immersive */
  function toggleImmersive(force) {
    const on = force == null ? !document.body.classList.contains('immersive') : force;
    document.body.classList.toggle('immersive', on);
    setTimeout(() => { resizeCanvas(); S.lyricIdx = -2; scrollToLine(S.lyricIdx < 0 ? currentLineIndex(audio.currentTime) : S.lyricIdx, true); }, 80);
  }
  $('#btn-immersive').addEventListener('click', () => toggleImmersive());
  $('#cover-frame').addEventListener('dblclick', () => toggleImmersive());

  /* window */
  $('#win-min').addEventListener('click', () => wave.win.minimize());
  $('#win-max').addEventListener('click', () => wave.win.maximize());
  $('#win-close').addEventListener('click', () => wave.win.close());

  /* keyboard */
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && e.detail > 0) b.blur(); });
  document.addEventListener('keydown', (e) => {
    const tag = e.target;
    if (tag.matches && tag.matches('input[type=text],input[type=password],input[type=number],textarea')) return;
    if (document.querySelector('dialog[open]')) return;
    const onRange = tag.matches && tag.matches('input[type=range]');
    const k = e.key;
    if (k === ' ' && !(tag.matches && tag.matches('button'))) { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowRight' && !onRange) { e.preventDefault(); e.shiftKey ? advance(1, false) : (audio.currentTime += 5); }
    else if (k === 'ArrowLeft' && !onRange) { e.preventDefault(); e.shiftKey ? prev() : (audio.currentTime = Math.max(0, audio.currentTime - 5)); }
    else if (k === 'ArrowUp' && !onRange) { e.preventDefault(); volEl.value = Math.min(100, Number(volEl.value) + 5); audio.muted = false; applyVolume(); }
    else if (k === 'ArrowDown' && !onRange) { e.preventDefault(); volEl.value = Math.max(0, Number(volEl.value) - 5); applyVolume(); }
    else if (k === 'm' || k === 'M') { audio.muted = !audio.muted; applyVolume(); }
    else if (k === 's' || k === 'S') toggleShuffle();
    else if (k === 'r' || k === 'R') cycleRepeat();
    else if (k === 'f' || k === 'F') toggleImmersive();
    else if (k === 'Escape') toggleImmersive(false);
  });

  /* ================================================================== */
  /* settings                                                           */
  /* ================================================================== */
  const dlg = $('#settings-dlg');
  const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`);

  async function refreshCacheInfo() {
    try { const c = await wave.settings.cacheInfo(); $('#cache-info').textContent = `${c.count} songs cached · ${fmtBytes(c.size)}. Cached songs replay instantly and work offline.`; }
    catch (_) { $('#cache-info').textContent = ''; }
  }

  $('#btn-settings').addEventListener('click', async () => {
    const s = await wave.settings.get();
    $('#set-cid').value = s.spotifyClientId || '';
    $('#set-csec').value = s.spotifyClientSecret || '';
    $('#set-cache').value = s.cacheLimitMB;
    $('#ytdlp-info').textContent = 'Checking…';
    dlg.showModal();
    refreshCacheInfo();
    wave.settings.ytdlpVersion().then((v) => { $('#ytdlp-info').textContent = `Installed version: ${v}`; }).catch((e) => { $('#ytdlp-info').textContent = `Not ready: ${friendlyError(e.message)}`; });
  });
  $('#btn-settings-cancel').addEventListener('click', () => dlg.close());
  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await wave.settings.set({ spotifyClientId: $('#set-cid').value.trim(), spotifyClientSecret: $('#set-csec').value.trim(), cacheLimitMB: Number($('#set-cache').value) });
      toast('Settings saved');
    } catch (err) { toast(err.message, 'error'); }
    dlg.close();
  });
  $('#btn-clear-cache').addEventListener('click', async () => { await wave.settings.clearCache(); refreshCacheInfo(); toast('Audio cache cleared'); });
  $('#btn-ytdlp-update').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Updating…';
    try {
      const msg = await wave.settings.ytdlpUpdate();
      $('#ytdlp-info').textContent = msg || 'Up to date.';
      wave.settings.ytdlpVersion().then((v) => { $('#ytdlp-info').textContent = `Installed version: ${v}`; }).catch(() => {});
    } catch (err) { $('#ytdlp-info').textContent = friendlyError(err.message); }
    btn.disabled = false; btn.textContent = 'Update now';
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-ext]');
    if (a) { e.preventDefault(); wave.openExternal(a.dataset.ext); }
  });

  /* ================================================================== */
  /* boot                                                               */
  /* ================================================================== */
  (async function init() {
    updateToggles();
    syncPlayState();
    applyPalette(DEFAULT_PALETTE);
    try {
      S.playlists = await wave.library.get();
      if (!S.playlists.some((p) => p.id === S.viewId)) S.viewId = S.playlists[0] ? S.playlists[0].id : null;
    } catch (e) { toast(e.message, 'error'); }
    renderSidebar();
    renderPlaylistView();
  })();
})();
