'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res || !res.ok) throw new Error((res && res.error) || 'Something went wrong.');
  return res.data;
}

const EVENTS = new Set(['status', 'prepare-progress', 'media-key']);

contextBridge.exposeInMainWorld('wave', {
  library: {
    get: () => call('library:get'),
    add: (url) => call('library:add', url),
    refresh: (id) => call('library:refresh', id),
    remove: (id) => call('library:remove', id),
  },
  track: {
    prepare: (track, opts) => call('track:prepare', track, opts),
    cover: (track) => call('track:cover', track),
    lyrics: (track) => call('track:lyrics', track),
  },
  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', patch),
    cacheInfo: () => call('cache:info'),
    clearCache: () => call('cache:clear'),
    ytdlpVersion: () => call('ytdlp:version'),
    ytdlpUpdate: () => call('ytdlp:update'),
  },
  openExternal: (url) => call('shell:open', url),
  win: {
    minimize: () => call('win:minimize'),
    maximize: () => call('win:maximize'),
    close: () => call('win:close'),
  },
  on(channel, cb) {
    if (!EVENTS.has(channel)) return () => {};
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
