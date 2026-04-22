(() => {
  'use strict';

  function createCacheKey(endpoint, params = {}) {
    const normalizedPairs = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [String(key), String(value)])
      .sort((a, b) => a[0].localeCompare(b[0]));

    const search = new URLSearchParams(normalizedPairs);
    return `${endpoint}?${search.toString()}`;
  }

  function createTmdbApi({
    getToken,
    apiBase,
    requestTimeoutMs = 10000,
    rateLimitMaxRetries = 2,
    rateLimitRetryDelayMs = 800,
    defaultCacheTtlMs = 180000
  }) {
    const responseCache = new Map();

    function getCachedResponse(cacheKey) {
      const cached = responseCache.get(cacheKey);
      if (!cached) return null;
      if (cached.expiresAt <= Date.now()) {
        responseCache.delete(cacheKey);
        return null;
      }
      return cached.data;
    }

    function setCachedResponse(cacheKey, data, ttlMs) {
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + ttlMs,
        data
      });
    }

    function clearCache() {
      responseCache.clear();
    }

    async function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function tmdbFetch(endpoint, params = {}, options = {}) {
      const token = typeof getToken === 'function' ? String(getToken() || '') : '';
      if (!token) {
        throw new Error('TMDB token is missing');
      }

      const forceRefresh = Boolean(options.forceRefresh);
      const requestedTtl = Number(options.cacheTtlMs);
      const cacheTtlMs = Number.isFinite(requestedTtl) ? requestedTtl : defaultCacheTtlMs;
      const useCache = !forceRefresh && cacheTtlMs > 0;
      const cacheKey = useCache ? createCacheKey(endpoint, params) : '';

      if (useCache) {
        const cachedData = getCachedResponse(cacheKey);
        if (cachedData) return cachedData;
      }

      const url = new URL(`${apiBase}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      });

      for (let attempt = 0; attempt <= rateLimitMaxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
        let response;

        try {
          response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          });
        } catch (error) {
          if (error && error.name === 'AbortError') {
            throw new Error('TMDB request timed out');
          }
          throw new Error('Network error while contacting TMDB');
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.status === 429) {
          if (attempt >= rateLimitMaxRetries) {
            throw new Error('TMDB Error: 429');
          }
          const retryAfterHeader = Number(response.headers.get('Retry-After'));
          const retryDelay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
            ? retryAfterHeader * 1000
            : rateLimitRetryDelayMs * (attempt + 1);
          await delay(retryDelay);
          continue;
        }

        if (!response.ok) {
          let apiMessage = '';
          try {
            const errorPayload = await response.json();
            apiMessage = typeof errorPayload?.status_message === 'string' ? errorPayload.status_message : '';
          } catch {
            apiMessage = '';
          }
          const suffix = apiMessage ? ` (${apiMessage})` : '';
          throw new Error(`TMDB Error: ${response.status}${suffix}`);
        }

        const payload = await response.json();
        if (useCache) {
          setCachedResponse(cacheKey, payload, cacheTtlMs);
        }
        return payload;
      }

      throw new Error('TMDB request failed');
    }

    return {
      tmdbFetch,
      clearCache
    };
  }

  window.CinovaApi = {
    createTmdbApi
  };
})();
