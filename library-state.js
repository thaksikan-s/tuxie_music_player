(function (root) {
  'use strict';

  function deviceTracks(tracks) {
    return tracks.filter(track => track && track.kind === 'android');
  }

  function mergeDevicePage(existingTracks, pageTracks, options) {
    const existing = Array.isArray(existingTracks) ? existingTracks : [];
    const page = Array.isArray(pageTracks) ? pageTracks : [];
    const queueIds = new Set(options?.queueIds || []);
    const currentId = options?.currentId || null;
    const append = options?.append === true;
    const local = existing.filter(track => track && track.kind === 'local');
    const retained = deviceTracks(existing).filter(track => append || queueIds.has(track.id) || track.id === currentId);
    const merged = new Map([...retained, ...page].filter(Boolean).map(track => [track.id, track]));
    return [...local, ...merged.values()];
  }

  function nextVisibleCount(current, total, pageSize) {
    const size = Math.max(1, Number(pageSize) || 60);
    return Math.min(Math.max(0, Number(total) || 0), Math.max(size, Number(current) || size) + size);
  }

  const api = { mergeDevicePage, nextVisibleCount };
  root.TuxieLibraryState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
