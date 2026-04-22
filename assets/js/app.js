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
    defaultCacheTtlMs: 300000
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
  const searchHintEl = document.getElementById('searchHint');
  const heroSectionEl = document.getElementById('heroSection');
  const heroBackdropEl = document.getElementById('heroBackdrop');
  const heroInfoEl = document.getElementById('heroInfo');
  const watchlistCountEl = document.getElementById('watchlistCount');

  let isInitializing = false;
  let currentView = 'home';
  let isRestoringHistory = false;

  const watchlistController = watchlistModule.createWatchlistController({
    state,
    persistWatchlist,
    countElement: watchlistCountEl,
    getHeartIcon: render.getHeartIcon
  });

  const modalController = modalModule.createModalController({
    overlayEl: modalOverlayEl,
    contentEl: modalContentEl,
    apiFetch: tmdbFetch,
    escapeHtml: render.escapeHtml,
    renderModalError: render.renderModalError,
    getTmdbImageUrl,
    getYouTubeEmbedUrl,
    getCloseIcon: render.getCloseIcon
  });

  function setMainBusy(isBusy) {
    mainContentEl.setAttribute('aria-busy', String(Boolean(isBusy)));
  }

  function setSearchStatus(message = '') {
    if (!searchStatusEl) return;
    searchStatusEl.textContent = String(message || '');
  }

  function setSearchHintVisible(isVisible) {
    if (!searchHintEl) return;
    searchHintEl.classList.toggle('visible', isVisible);
    searchHintEl.setAttribute('aria-hidden', String(!isVisible));
  }

  function scrollToTopSmooth() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  function syncTypeTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      const isActive = tab.dataset.type === state.currentType;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-pressed', String(isActive));
    });
  }

  function buildHistoryState(overrides = {}) {
    return {
      view: currentView,
      type: state.currentType,
      query: state.currentQuery,
      page: state.currentPage,
      modal: null,
      ...overrides
    };
  }

  function commitHistory(mode = 'push', overrides = {}) {
    if (isRestoringHistory || mode === 'none') return;
    const nextState = buildHistoryState(overrides);
    if (mode === 'replace') {
      history.replaceState(nextState, '', window.location.href);
      return;
    }
    history.pushState(nextState, '', window.location.href);
  }

  function normalizeHistoryState(rawState) {
    const stateLike = rawState && typeof rawState === 'object' ? rawState : {};
    const view = ['home', 'watchlist', 'search'].includes(stateLike.view) ? stateLike.view : 'home';
    const type = stateLike.type === 'tv' ? 'tv' : 'movie';
    const query = typeof stateLike.query === 'string' ? stateLike.query : '';
    const pageValue = Math.floor(Number(stateLike.page));
    const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;

    let modal = null;
    if (stateLike.modal && typeof stateLike.modal === 'object') {
      const modalId = Number(stateLike.modal.id);
      if (Number.isFinite(modalId)) {
        modal = {
          id: modalId,
          type: stateLike.modal.type === 'tv' ? 'tv' : 'movie'
        };
      }
    }

    return {
      view,
      type,
      query,
      page,
      modal
    };
  }

  function handleSearchInputState() {
    const hasValue = searchInputEl.value.length > 0;
    searchClearBtnEl.classList.toggle('visible', hasValue);
    searchClearBtnEl.disabled = !hasValue;
    searchClearBtnEl.setAttribute('aria-hidden', String(!hasValue));

    const shouldShowHint = document.activeElement === searchInputEl && !hasValue;
    setSearchHintVisible(shouldShowHint);
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
      watchlistController.updateCount();
      setupOverlayEl.style.display = 'none';
      goHome({ historyMode: 'replace', scroll: false });
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
      const data = await tmdbFetch(`/trending/${state.currentType}/week`, {}, { cacheTtlMs: 300000, forceRefresh });
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
      const data = await tmdbFetch(`/${seedItem.type}/${seedItem.id}/recommendations`, {}, { cacheTtlMs: 300000, forceRefresh });
      sectionEl.innerHTML = render.renderRecommendationContent(seedItem, data?.results || [], getRenderContext());
    } catch (error) {
      console.error('Failed to load personalized recommendations:', error);
      sectionEl.innerHTML = render.renderRecommendationError(seedItem);
    }
  }

  async function loadSections(forceRefresh = false) {
    setMainBusy(true);
    mainContentEl.innerHTML = '';

    const sectionEntries = [];
    const recommendationSeed = getRecommendationSeed();
    if (recommendationSeed) {
      const recommendationSectionEl = document.createElement('div');
      recommendationSectionEl.className = 'section section-recommendations';
      recommendationSectionEl.innerHTML = render.renderSectionSkeleton('Recommended for You', 6);
      mainContentEl.appendChild(recommendationSectionEl);
      sectionEntries.push({
        kind: 'recommendation',
        sectionEl: recommendationSectionEl,
        seedItem: recommendationSeed
      });
    }

    for (const sectionConfig of getSectionConfigs()) {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'section';
      sectionEl.innerHTML = render.renderSectionSkeleton(sectionConfig.title);
      mainContentEl.appendChild(sectionEl);
      sectionEntries.push({
        kind: 'standard',
        sectionEl,
        sectionConfig
      });
    }

    const tasks = sectionEntries.map(async entry => {
      if (entry.kind === 'recommendation') {
        const data = await tmdbFetch(`/${entry.seedItem.type}/${entry.seedItem.id}/recommendations`, {}, { cacheTtlMs: 300000, forceRefresh });
        return {
          entry,
          html: render.renderRecommendationContent(entry.seedItem, data?.results || [], getRenderContext())
        };
      }

      const data = await tmdbFetch(entry.sectionConfig.endpoint, {}, { cacheTtlMs: 300000, forceRefresh });
      return {
        entry,
        html: render.renderSectionContent(entry.sectionConfig.title, data.results || [], getRenderContext())
      };
    });

    const settled = await Promise.allSettled(tasks);
    settled.forEach((result, index) => {
      const entry = sectionEntries[index];
      if (result.status === 'fulfilled') {
        entry.sectionEl.innerHTML = result.value.html;
        return;
      }

      if (entry.kind === 'recommendation') {
        entry.sectionEl.innerHTML = render.renderRecommendationError(entry.seedItem);
      } else {
        entry.sectionEl.innerHTML = render.renderSectionError(entry.sectionConfig.title, entry.sectionConfig.endpoint);
      }
    });

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

  function executeSearch({ historyMode = 'push', scroll = true, forceRefresh = false } = {}) {
    const query = searchInputEl.value.trim();
    if (!query) {
      goHome({ historyMode, scroll, forceRefresh });
      return;
    }

    currentView = 'search';
    state.currentQuery = query;
    state.currentPage = 1;
    if (scroll) scrollToTopSmooth();
    setSearchStatus(`Searching for ${state.currentQuery}.`);
    setSearchHintVisible(false);
    commitHistory(historyMode);
    performSearch({ forceRefresh });
  }

  function clearSearch() {
    searchInputEl.value = '';
    handleSearchInputState();
    state.currentQuery = '';
    setSearchStatus('');
    goHome({ historyMode: 'push', scroll: true });
  }

  async function performSearch({ forceRefresh = false } = {}) {
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
    performSearch({ forceRefresh: true });
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

  function showWatchlist({ historyMode = 'push', scroll = true } = {}) {
    currentView = 'watchlist';
    if (scroll) scrollToTopSmooth();
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
      commitHistory(historyMode);
      return;
    }

    mainContentEl.innerHTML = render.renderWatchlistSection(watchlistController.getItems(), getRenderContext());
    setSearchStatus(`Showing ${state.watchlist.length} watchlist item${state.watchlist.length === 1 ? '' : 's'}.`);
    setMainBusy(false);
    commitHistory(historyMode);
  }

  function removeFromWatchlist(id) {
    watchlistController.remove(id);
    showWatchlist({ historyMode: 'replace', scroll: false });
  }

  function goToPage(page) {
    const nextPage = Math.floor(Number(page));
    if (!Number.isFinite(nextPage)) return;
    if (nextPage < 1 || nextPage > state.searchTotalPages || nextPage === state.currentPage) return;

    currentView = 'search';
    state.currentPage = nextPage;
    scrollToTopSmooth();
    commitHistory('push');
    performSearch();
  }

  function switchType(type) {
    state.currentType = type === 'tv' ? 'tv' : 'movie';
    syncTypeTabs();
    state.currentQuery = '';
    searchInputEl.value = '';
    handleSearchInputState();
    goHome({ historyMode: 'push', scroll: true });
  }

  function goHome({ historyMode = 'push', scroll = true, forceRefresh = false } = {}) {
    currentView = 'home';
    if (scroll) scrollToTopSmooth();
    heroSectionEl.style.display = 'block';
    state.currentQuery = '';
    state.currentPage = 1;
    searchInputEl.value = '';
    handleSearchInputState();
    loadHero(forceRefresh);
    loadSections(forceRefresh);
    setSearchStatus(`Browsing ${getBrowseLabel()}.`);
    commitHistory(historyMode);
  }

  function openDetail(id, type, { historyMode = 'push' } = {}) {
    const mediaType = type === 'tv' ? 'tv' : 'movie';
    commitHistory(historyMode, {
      modal: {
        id,
        type: mediaType
      }
    });
    modalController.openDetail(id, mediaType);
  }

  function closeModal({ fromHistory = false } = {}) {
    modalController.closeModal();
    if (!fromHistory) {
      const historyState = normalizeHistoryState(history.state);
      if (historyState.modal) {
        commitHistory('replace', { modal: null });
      }
    }
  }

  function applyHistoryState(rawState) {
    const nextState = normalizeHistoryState(rawState);
    state.currentType = nextState.type;
    syncTypeTabs();

    if (nextState.view === 'search') {
      currentView = 'search';
      state.currentQuery = nextState.query;
      state.currentPage = nextState.page;
      searchInputEl.value = state.currentQuery;
      handleSearchInputState();
      setSearchHintVisible(false);
      performSearch();
    } else if (nextState.view === 'watchlist') {
      state.currentQuery = '';
      state.currentPage = 1;
      searchInputEl.value = '';
      handleSearchInputState();
      setSearchHintVisible(false);
      showWatchlist({ historyMode: 'none', scroll: false });
    } else {
      goHome({ historyMode: 'none', scroll: false });
    }

    if (nextState.modal) {
      openDetail(nextState.modal.id, nextState.modal.type, { historyMode: 'none' });
    } else {
      closeModal({ fromHistory: true });
    }
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
        switchType(actionEl.dataset.type);
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
          openDetail(id, type);
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
        closeModal();
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
        closeModal();
      }
    });

    searchFormEl.addEventListener('submit', event => {
      event.preventDefault();
      executeSearch();
    });

    searchInputEl.addEventListener('input', handleSearchInputState);
    searchInputEl.addEventListener('focus', handleSearchInputState);
    searchInputEl.addEventListener('blur', () => {
      setSearchHintVisible(false);
    });
    searchInputEl.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        setSearchHintVisible(false);
        executeSearch();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modalOverlayEl.classList.contains('open')) {
        closeModal();
        return;
      }
      modalController.handleDocumentKeydown(event);
    });

    window.addEventListener('popstate', event => {
      isRestoringHistory = true;
      try {
        applyHistoryState(event.state);
      } finally {
        isRestoringHistory = false;
      }
    });
  }

  window.executeSearch = executeSearch;

  bindEventListeners();
  init();
})();
