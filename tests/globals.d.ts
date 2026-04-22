declare global {
  interface Window {
    __TMDB_MAX_RETRIES__?: number;
    __TMDB_RETRY_DELAY_MS__?: number;
    __TMDB_TIMEOUT_MS__?: number;
    __xssFlag?: number;
    CINOVA_CONFIG?: {
      tmdbReadAccessToken?: string;
      tmdb_token?: string;
      token?: string;
    };
    executeSearch?: () => void;
  }
}

export {};
