(() => {
  'use strict';

  const STORAGE_KEYS = {
    token: 'cinova_tmdb_token',
    tokenLegacy: 'screenscout_token',
    watchlist: 'cinova_watchlist',
    watchlistLegacy: 'screenscout_watchlist'
  };

  const RUNTIME_TOKEN_KEYS = ['tmdbReadAccessToken', 'tmdb_token', 'token'];

  const CONSTANTS = {
    IMG_BASE: 'https://image.tmdb.org/t/p/',
    API_BASE: 'https://api.themoviedb.org/3'
  };

  function getStorageItem(key, fallback = '') {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      console.warn(`Storage read failed for "${key}"`, error);
      return fallback;
    }
  }

  function setStorageItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`Storage write failed for "${key}"`, error);
    }
  }

  function getSafeTmdbPath(pathValue) {
    if (typeof pathValue !== 'string') return '';
    const trimmed = pathValue.trim();
    return /^\/[A-Za-z0-9/_\-.]+$/.test(trimmed) ? trimmed : '';
  }

  function getTmdbImageUrl(pathValue, size) {
    const safePath = getSafeTmdbPath(pathValue);
    return safePath ? `${CONSTANTS.IMG_BASE}${size}${safePath}` : '';
  }

  function getYouTubeEmbedUrl(videoKey) {
    if (typeof videoKey !== 'string') return '';
    const trimmed = videoKey.trim();
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(trimmed)) return '';
    return `https://www.youtube.com/embed/${encodeURIComponent(trimmed)}`;
  }

  function parseStoredWatchlist(rawValue) {
    let parsed;
    try {
      parsed = JSON.parse(rawValue || '[]');
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    const normalized = [];
    const seen = new Set();

    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const id = Number(entry.id);
      if (!Number.isFinite(id)) continue;

      const type = entry.type === 'tv' ? 'tv' : 'movie';
      const title = String(entry.title || '').trim() || 'Untitled';
      const poster = getSafeTmdbPath(entry.poster);
      const dedupeKey = `${type}:${id}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      normalized.push({ id, type, title, poster });
    }

    return normalized;
  }

  function normalizeToken(rawValue) {
    if (typeof rawValue !== 'string') return '';
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : '';
  }

  function getRuntimeConfigToken() {
    const config = window.CINOVA_CONFIG;
    if (!config || typeof config !== 'object') return '';
    for (const key of RUNTIME_TOKEN_KEYS) {
      const token = normalizeToken(config[key]);
      if (token) return token;
    }
    return '';
  }

  function getStoredToken() {
    const token = normalizeToken(getStorageItem(STORAGE_KEYS.token, getStorageItem(STORAGE_KEYS.tokenLegacy, '')));
    if (token && !getStorageItem(STORAGE_KEYS.token, '')) {
      setStorageItem(STORAGE_KEYS.token, token);
    }
    return token;
  }

  function resolveApiToken() {
    const runtimeToken = getRuntimeConfigToken();
    if (runtimeToken) {
      setStorageItem(STORAGE_KEYS.token, runtimeToken);
      return runtimeToken;
    }
    return getStoredToken();
  }

  const state = {
    apiToken: resolveApiToken(),
    currentType: 'movie',
    currentPage: 1,
    currentQuery: '',
    searchTotalPages: 1,
    watchlist: parseStoredWatchlist(getStorageItem(STORAGE_KEYS.watchlist, getStorageItem(STORAGE_KEYS.watchlistLegacy, '[]'))),
    genreMap: {}
  };

  if (!getStorageItem(STORAGE_KEYS.watchlist, '') && state.watchlist.length > 0) {
    setStorageItem(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
  }

  function refreshApiToken() {
    state.apiToken = resolveApiToken();
    return state.apiToken;
  }

  function persistWatchlist() {
    setStorageItem(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
  }

  window.CinovaState = {
    state,
    constants: CONSTANTS,
    storageKeys: STORAGE_KEYS,
    getStorageItem,
    setStorageItem,
    getSafeTmdbPath,
    getTmdbImageUrl,
    getYouTubeEmbedUrl,
    parseStoredWatchlist,
    normalizeToken,
    getRuntimeConfigToken,
    getStoredToken,
    resolveApiToken,
    refreshApiToken,
    persistWatchlist
  };
})();
