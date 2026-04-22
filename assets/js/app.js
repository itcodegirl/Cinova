(() => {
  'use strict';

  const stateModule = window.CinovaState;
  const apiModule = window.CinovaApi;
  const render = window.CinovaRender;
  const watchlistModule = window.CinovaWatchlist;
  const modalModule = window.CinovaModal;

  if (!stateModule || !apiModule || !render || !watchlistModule || !modalModule) {
    console.error('Cinova failed to initialize: required modules are missing.');
    return;
  }

  const {
    state,
    constants,
    getSafeTmdbPath,
    getTmdbImageUrl,
    getYouTubeEmbedUrl,
    resolveApiToken,
    refreshApiToken,
    persistWatchlist
  } = stateModule;

  const REQUEST_TIMEOUT_MS = Number(window.__TMDB_TIMEOUT_MS__) > 0
    ? Number(window.__TMDB_TIMEOUT_MS__)
    : 10000;
  const RATE_LIMIT_MAX_RETRIES = Number(window.__TMDB_MAX_RETRIES__) >= 0
    ? Number(window.__TMDB_MAX_RETRIES__)
    : 2;
  const RATE_LIMIT_RETRY_DELAY_MS = Number(window.__TMDB_RETRY_DELAY_MS__) > 0
    ? Number(window.__TMDB_RETRY_DELAY_MS__)
    : 800;

  const { tmdbFetch, clearCache } = apiModule.createTmdbApi({
    getToken: () => state.apiToken,
    apiBase: constants.API_BASE,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    rateLimitMaxRetries: RATE_LIMIT_MAX_RETRIES,
    rateLimitRetryDelayMs: RATE_LIMIT_RETRY_DELAY_MS,
    defaultCacheTtlMs: 180000
  });

  const setupErrorEl = document.getElementById('setupError');
  const setupRetryBtn = document.getElementById('setupRetryBtn');
  const setupOverlayEl = document.getElementById('setupOverlay');
  const mainContentEl = document.getElementById('mainContent');
  const modalOverlayEl = document.getElementById('modalOverlay');
  const modalContentEl = document.getElementById('modalContent');
  const searchFormEl = document.getElementById('searchForm');
  const searchInputEl = document.getElementById('searchInput');
  const searchClearBtnEl = document.getElementById('searchClear');
  const searchStatusEl = document.getElementById('searchStatus');
  const heroSectionEl = document.getElementById('heroSection');
  const heroBackdropEl = document.getElementById('heroBackdrop');
  const heroInfoEl = document.getElementById('heroInfo');
  const watchlistCountEl = document.getElementById('watchlistCount');

  let isInitializing = false;

  const watchlistController = watchlistModule.createWatchlistController({
    state,
    persistWatchlist,
    countElement: watchlistCountEl
  });

  const modalController = modalModule.createModalController({
    overlayEl: modalOverlayEl,
    contentEl: modalContentEl,
    apiFetch: tmdbFetch,
    escapeHtml: render.escapeHtml,
    getTmdbImageUrl,
    getYouTubeEmbedUrl
  });

  function setMainBusy(isBusy) {
    mainContentEl.setAttribute('aria-busy', String(Boolean(isBusy)));
  }

  function setSearchStatus(message = '') {
    if (!searchStatusEl) return;
    searchStatusEl.textContent = String(message || '');
  }

  function getActionId(actionEl) {
    const id = Number(actionEl.dataset.id);
    return Number.isFinite(id) ? id : null;
  }

  function getBrowseLabel() {
    return state.currentType === 'movie' ? 'movies' : 'TV shows';
  }

  function getRenderContext() {
    return {
      currentType: state.currentType,
      watchlist: state.watchlist,
      genreMap: state.genreMap,
      getTmdbImageUrl,
      getSafeTmdbPath
    };
  }

  function getRecommendationSeed() {
    if (state.watchlist.length === 0) return null;
    const reversed = [...state.watchlist].reverse();
    const sameTypeSeed = reversed.find(item => item.type === state.currentType);
    return sameTypeSeed || reversed[0];
  }

  function showSetupError(message) {
    setupErrorEl.textContent = message;
    setupErrorEl.style.display = 'block';
    setupOverlayEl.style.display = 'flex';
    setupRetryBtn.disabled = false;
    setSearchStatus('TMDB setup is required before browsing titles.');
  }

  function hideSetupError() {
    setupErrorEl.textContent = '';
    setupErrorEl.style.display = 'none';
  }

  function setSetupLoading(isLoading) {
    setupRetryBtn.disabled = isLoading;
    setupRetryBtn.textContent = isLoading ? 'Checking Configuration...' : 'Reload Configuration';
  }

  function getSetupMessageFromError(error) {
    const message = String(error?.message || '');
    if (message.includes('TMDB Error: 401')) {
      return 'TMDB rejected your token. Update config.local.js with a valid TMDB Read Access Token, then reload.';
    }
    if (message.includes('TMDB Error: 403')) {
      return 'TMDB access is forbidden for this token. Confirm your TMDB Read Access Token and try again.';
    }
    return 'Cinova could not connect to TMDB. Check config.local.js and your internet connection, then reload.';
  }

  async function loadGenres() {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbFetch('/genre/movie/list', {}, { cacheTtlMs: 3600000 }),
      tmdbFetch('/genre/tv/list', {}, { cacheTtlMs: 3600000 })
    ]);

    state.genreMap = {};
    [...(movieGenres.genres || []), ...(tvGenres.genres || [])].forEach(genre => {
      state.genreMap[genre.id] = genre.name;
    });
  }

  async function retrySetup() {
    if (isInitializing) return;
    state.apiToken = '';
    clearCache();
    await init({ forceTokenRefresh: true });
  }

  async function init({ forceTokenRefresh = false } = {}) {
    if (isInitializing) return;
    isInitializing = true;
    setSetupLoading(true);
    hideSetupError();

    try {
      if (forceTokenRefresh || !state.apiToken) {
        state.apiToken = forceTokenRefresh ? refreshApiToken() : resolveApiToken();
      }

      if (!state.apiToken) {
        showSetupError('No TMDB token found. Create config.local.js from config.example.js, add your token, then click "Reload Configuration".');
        return;
      }

      await loadGenres();
      loadHero();
      loadSections();
      watchlistController.updateCount();
      setupOverlayEl.style.display = 'none';
      setSearchStatus(`Browsing ${getBrowseLabel()}.`);
    } catch (error) {
      console.error('Initialization failed:', error);
      showSetupError(getSetupMessageFromError(error));
    } finally {
      isInitializing = false;
      setSetupLoading(false);
    }
  }

  async function loadHero(forceRefresh = false) {
    try {
      const data = await tmdbFetch(`/trending/${state.currentType}/week`, {}, { cacheTtlMs: 120000, forceRefresh });
      const featured = (data.results || []).find(item => item.backdrop_path) || (data.results || [])[0];
      if (!featured) throw new Error('No featured title');

      heroBackdropEl.style.backgroundImage = `url(${constants.IMG_BASE}w1280${featured.backdrop_path})`;
      heroInfoEl.innerHTML = render.renderHeroContent(featured, getRenderContext());
    } catch (error) {
      console.error('Hero load failed:', error);
      heroBackdropEl.style.backgroundImage = 'none';
      heroInfoEl.innerHTML = render.renderHeroError();
    }
  }

  function retryHero() {
    loadHero(true);
  }

  function getSectionConfigs() {
    if (state.currentType === 'movie') {
      return [
        { title: 'Now Playing', endpoint: '/movie/now_playing' },
        { title: 'Popular', endpoint: '/movie/popular' },
        { title: 'Top Rated', endpoint: '/movie/top_rated' },
        { title: 'Upcoming', endpoint: '/movie/upcoming' }
      ];
    }

    return [
      { title: 'Airing Today', endpoint: '/tv/airing_today' },
      { title: 'Popular', endpoint: '/tv/popular' },
      { title: 'Top Rated', endpoint: '/tv/top_rated' },
      { title: 'On The Air', endpoint: '/tv/on_the_air' }
    ];
  }

  async function loadRecommendationsIntoSection(sectionEl, seedItem, forceRefresh = false) {
    try {
      const data = await tmdbFetch(`/${seedItem.type}/${seedItem.id}/recommendations`, {}, { cacheTtlMs: 180000, forceRefresh });
      sectionEl.innerHTML = render.renderRecommendationContent(seedItem, data?.results || [], getRenderContext());
    } catch (error) {
      console.error('Failed to load personalized recommendations:', error);
      sectionEl.innerHTML = render.renderRecommendationError(seedItem);
    }
  }

  async function loadSections(forceRefresh = false) {
    setMainBusy(true);
    mainContentEl.innerHTML = '';

    const recommendationSeed = getRecommendationSeed();
    if (recommendationSeed) {
      const recommendationSectionEl = document.createElement('div');
      recommendationSectionEl.className = 'section section-recommendations';
      mainContentEl.appendChild(recommendationSectionEl);
      await loadRecommendationsIntoSection(recommendationSectionEl, recommendationSeed, forceRefresh);
    }

    for (const section of getSectionConfigs()) {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'section';
      try {
        const data = await tmdbFetch(section.endpoint, {}, { cacheTtlMs: 180000, forceRefresh });
        sectionEl.innerHTML = render.renderSectionContent(section.title, data.results || [], getRenderContext());
      } catch (error) {
        console.error(`Failed to load ${section.title}:`, error);
        sectionEl.innerHTML = render.renderSectionError(section.title, section.endpoint);
      }
      mainContentEl.appendChild(sectionEl);
    }

    setMainBusy(false);
  }

  async function retryRecommendations(triggerEl) {
    const id = Number(triggerEl?.dataset?.id);
    const type = triggerEl?.dataset?.type === 'tv' ? 'tv' : 'movie';
    const title = String(triggerEl?.dataset?.title || 'Saved title');
    const sectionEl = triggerEl?.closest?.('.section');

    if (!sectionEl || !Number.isFinite(id)) {
      await loadSections(true);
      return;
    }

    await loadRecommendationsIntoSection(sectionEl, { id, type, title, poster: '' }, true);
  }

  async function retrySection(endpoint, title, triggerEl) {
    const sectionEl = triggerEl?.closest?.('.section');
    if (!sectionEl) {
      await loadSections(true);
      return;
    }

    try {
      const data = await tmdbFetch(endpoint, {}, { forceRefresh: true });
      sectionEl.innerHTML = render.renderSectionContent(title, data.results || [], getRenderContext());
    } catch (error) {
      console.error(`Retry failed for ${title}:`, error);
      sectionEl.innerHTML = render.renderSectionError(title, endpoint);
    }
  }

  function handleSearchInputState() {
    const hasValue = searchInputEl.value.length > 0;
    searchClearBtnEl.classList.toggle('visible', hasValue);
    searchClearBtnEl.disabled = !hasValue;
    searchClearBtnEl.setAttribute('aria-hidden', String(!hasValue));
  }

  function executeSearch() {
    const query = searchInputEl.value.trim();
    if (!query) {
      goHome();
      return;
    }

    state.currentQuery = query;
    state.currentPage = 1;
    setSearchStatus(`Searching for ${state.currentQuery}.`);
    performSearch();
  }

  function clearSearch() {
    searchInputEl.value = '';
    searchClearBtnEl.classList.remove('visible');
    searchClearBtnEl.disabled = true;
    searchClearBtnEl.setAttribute('aria-hidden', 'true');
    state.currentQuery = '';
    setSearchStatus('');
    goHome();
  }

  async function performSearch(forceRefresh = false) {
    setMainBusy(true);
    heroSectionEl.style.display = 'none';

    try {
      const data = await tmdbFetch('/search/multi', {
        query: state.currentQuery,
        page: state.currentPage
      }, {
        cacheTtlMs: 30000,
        forceRefresh
      });

      state.searchTotalPages = Number.isInteger(data?.total_pages) ? data.total_pages : 1;
      const filtered = (data.results || []).filter(result => result.media_type === 'movie' || result.media_type === 'tv');
      const totalResults = Number.isFinite(Number(data.total_results)) ? Number(data.total_results) : filtered.length;

      mainContentEl.innerHTML = render.renderSearchResults(state.currentQuery, data, filtered, getRenderContext());
      setSearchStatus(
        filtered.length
          ? `Showing ${filtered.length} of ${totalResults} results for ${state.currentQuery}.`
          : `No results found for ${state.currentQuery}.`
      );
    } catch (error) {
      mainContentEl.innerHTML = render.renderSearchError(state.currentQuery, error.message);
      setSearchStatus(`Search failed for ${state.currentQuery}.`);
    } finally {
      setMainBusy(false);
    }
  }

  function retrySearch() {
    if (!state.currentQuery) return;
    performSearch(true);
  }

  function toggleWatchlist(actionEl) {
    const id = getActionId(actionEl);
    if (id === null) return;

    const type = actionEl.dataset.type || state.currentType;
    const title = actionEl.dataset.title || '';
    const poster = getSafeTmdbPath(actionEl.dataset.poster || '');

    watchlistController.toggle({
      id,
      type,
      title,
      poster,
      buttonEl: actionEl
    });
  }

  function showWatchlist() {
    setMainBusy(true);
    heroSectionEl.style.display = 'none';

    if (watchlistController.isEmpty()) {
      mainContentEl.innerHTML = `
        <div style="margin-top: 32px;">
          ${render.renderEmptyState('Your watchlist is empty', 'Save a movie or TV show with the heart button to see it here.')}
        </div>
      `;
      setSearchStatus('Your watchlist is empty.');
      setMainBusy(false);
      return;
    }

    mainContentEl.innerHTML = render.renderWatchlistSection(watchlistController.getItems(), getRenderContext());
    setSearchStatus(`Showing ${state.watchlist.length} watchlist item${state.watchlist.length === 1 ? '' : 's'}.`);
    setMainBusy(false);
  }

  function removeFromWatchlist(id) {
    watchlistController.remove(id);
    showWatchlist();
  }

  function goToPage(page) {
    const nextPage = Math.floor(Number(page));
    if (!Number.isFinite(nextPage)) return;
    if (nextPage < 1 || nextPage > state.searchTotalPages || nextPage === state.currentPage) return;

    state.currentPage = nextPage;
    performSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function switchType(type, buttonEl) {
    state.currentType = type === 'tv' ? 'tv' : 'movie';

    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-pressed', 'false');
    });

    buttonEl.classList.add('active');
    buttonEl.setAttribute('aria-pressed', 'true');

    state.currentQuery = '';
    searchInputEl.value = '';
    searchClearBtnEl.classList.remove('visible');
    searchClearBtnEl.disabled = true;
    searchClearBtnEl.setAttribute('aria-hidden', 'true');

    goHome();
  }

  function goHome() {
    heroSectionEl.style.display = 'block';
    state.currentQuery = '';
    state.currentPage = 1;
    loadHero();
    loadSections();
    setSearchStatus(`Browsing ${getBrowseLabel()}.`);
  }

  function handleAction(actionEl, event) {
    const action = actionEl.dataset.action;
    if (!action) return;

    switch (action) {
      case 'go-home':
        event?.preventDefault?.();
        goHome();
        break;
      case 'switch-type':
        switchType(actionEl.dataset.type, actionEl);
        break;
      case 'show-watchlist':
        showWatchlist();
        break;
      case 'clear-search':
        clearSearch();
        break;
      case 'open-detail': {
        const id = getActionId(actionEl);
        const type = actionEl.dataset.type || state.currentType;
        if (id !== null) {
          modalController.openDetail(id, type);
        }
        break;
      }
      case 'toggle-watchlist':
        toggleWatchlist(actionEl);
        break;
      case 'remove-watchlist': {
        const id = getActionId(actionEl);
        if (id !== null) {
          removeFromWatchlist(id);
        }
        break;
      }
      case 'retry-hero':
        retryHero();
        break;
      case 'retry-search':
        retrySearch();
        break;
      case 'retry-section':
        retrySection(actionEl.dataset.endpoint || '', actionEl.dataset.title || '', actionEl);
        break;
      case 'retry-recommendations':
        retryRecommendations(actionEl);
        break;
      case 'go-page':
        goToPage(actionEl.dataset.page);
        break;
      case 'retry-setup':
        retrySetup();
        break;
      case 'close-modal':
        modalController.closeModal();
        break;
      default:
        break;
    }
  }

  function bindEventListeners() {
    document.addEventListener('click', event => {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      handleAction(actionEl, event);
    });

    modalOverlayEl.addEventListener('click', event => {
      if (event.target === modalOverlayEl) {
        modalController.closeModal();
      }
    });

    searchFormEl.addEventListener('submit', event => {
      event.preventDefault();
      executeSearch();
    });

    searchInputEl.addEventListener('input', handleSearchInputState);
    searchInputEl.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        executeSearch();
      }
    });

    document.addEventListener('keydown', event => {
      modalController.handleDocumentKeydown(event);
    });
  }

  window.executeSearch = executeSearch;

  bindEventListeners();
  init();
})();
