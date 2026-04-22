		// ══════════════════════════════════════════
		// STATE
		// ══════════════════════════════════════════
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
			return safePath ? `${IMG_BASE}${size}${safePath}` : '';
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

		const STORAGE_KEYS = {
			token: 'cinova_tmdb_token',
			tokenLegacy: 'screenscout_token',
			watchlist: 'cinova_watchlist',
			watchlistLegacy: 'screenscout_watchlist'
		};
		const RUNTIME_TOKEN_KEYS = ['tmdbReadAccessToken', 'tmdb_token', 'token'];

		function normalizeToken(rawValue) {
			if (typeof rawValue !== 'string') return '';
			const trimmed = rawValue.trim();
			return trimmed.length > 0 ? trimmed : '';
		}

		function getRuntimeConfigToken() {
			const config = globalThis.CINOVA_CONFIG;
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

		let API_TOKEN = resolveApiToken();
		let currentType = 'movie'; // 'movie' or 'tv'
		let currentPage = 1;
		let currentQuery = '';
		let searchTotalPages = 1;
		let watchlist = parseStoredWatchlist(getStorageItem(STORAGE_KEYS.watchlist, getStorageItem(STORAGE_KEYS.watchlistLegacy, '[]')));
		let genreMap = {};
		if (!getStorageItem(STORAGE_KEYS.watchlist, '') && watchlist.length > 0) {
			setStorageItem(STORAGE_KEYS.watchlist, JSON.stringify(watchlist));
		}

		const IMG_BASE = 'https://image.tmdb.org/t/p/';
		const API_BASE = 'https://api.themoviedb.org/3';
		const REQUEST_TIMEOUT_MS = Number(globalThis.__TMDB_TIMEOUT_MS__) > 0
			? Number(globalThis.__TMDB_TIMEOUT_MS__)
			: 10000;
		const RATE_LIMIT_MAX_RETRIES = Number(globalThis.__TMDB_MAX_RETRIES__) >= 0
			? Number(globalThis.__TMDB_MAX_RETRIES__)
			: 2;
		const RATE_LIMIT_RETRY_DELAY_MS = Number(globalThis.__TMDB_RETRY_DELAY_MS__) > 0
			? Number(globalThis.__TMDB_RETRY_DELAY_MS__)
			: 800;
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
		let isInitializing = false;
		let modalPreviouslyFocusedEl = null;

		function delay(ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		}

		function escapeHtml(value) {
			return String(value ?? '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}

		function setMainBusy(isBusy) {
			mainContentEl.setAttribute('aria-busy', String(Boolean(isBusy)));
		}

		function setSearchStatus(message = '') {
			if (!searchStatusEl) return;
			searchStatusEl.textContent = String(message || '');
		}

		function getFocusableElements(container) {
			return [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
				.filter(el => !el.hasAttribute('hidden') && el.offsetParent !== null);
		}

		function buildDataAttributes(data = {}) {
			return Object.entries(data)
				.filter(([, value]) => value !== undefined && value !== null && value !== '')
				.map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`)
				.join('');
		}

		function getActionId(actionEl) {
			const id = Number(actionEl.dataset.id);
			return Number.isFinite(id) ? id : null;
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
					const type = actionEl.dataset.type || currentType;
					if (id !== null) openDetail(id, type);
					break;
				}
				case 'toggle-watchlist': {
					const id = getActionId(actionEl);
					const type = actionEl.dataset.type || currentType;
					if (id !== null) {
						toggleWatchlist(id, type, actionEl.dataset.title || '', actionEl.dataset.poster || '', actionEl);
					}
					break;
				}
				case 'remove-watchlist': {
					const id = getActionId(actionEl);
					if (id !== null) removeFromWatchlist(id);
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
				if (event.target === modalOverlayEl) closeModal();
			});

			searchFormEl.addEventListener('submit', event => {
				event.preventDefault();
				executeSearch();
			});

			searchInputEl.addEventListener('input', handleSearch);
			searchInputEl.addEventListener('keydown', event => {
				if (event.key === 'Enter') {
					event.preventDefault();
					executeSearch();
				}
			});

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

		function setSetupLoading(loading) {
			setupRetryBtn.disabled = loading;
			setupRetryBtn.textContent = loading ? 'Checking Configuration...' : 'Reload Configuration';
		}

		// ----------------------------------------
		// INIT
		// ----------------------------------------
		bindEventListeners();
		init();

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

		async function retrySetup() {
			if (isInitializing) return;
			API_TOKEN = '';
			await init({ forceTokenRefresh: true });
		}

		async function init({ forceTokenRefresh = false } = {}) {
			if (isInitializing) return;
			isInitializing = true;
			setSetupLoading(true);
			hideSetupError();
			try {
				if (forceTokenRefresh || !API_TOKEN) {
					API_TOKEN = resolveApiToken();
				}
				if (!API_TOKEN) {
					showSetupError('No TMDB token found. Create config.local.js from config.example.js, add your token, then click "Reload Configuration".');
					return;
				}
				await loadGenres();
				loadHero();
				loadSections();
				updateWatchlistCount();
				setupOverlayEl.style.display = 'none';
				setSearchStatus(`Browsing ${currentType === 'movie' ? 'movies' : 'TV shows'}.`);
			} catch (error) {
				console.error('Initialization failed:', error);
				showSetupError(getSetupMessageFromError(error));
			} finally {
				isInitializing = false;
				setSetupLoading(false);
			}
		}

		// ----------------------------------------
		// API HELPER
		// ----------------------------------------
		async function tmdbFetch(endpoint, params = {}) {
			if (!API_TOKEN) {
				throw new Error('TMDB token is missing');
			}

			const url = new URL(`${API_BASE}${endpoint}`);
			Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

			for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt += 1) {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
				let res;

				try {
					res = await fetch(url, {
						headers: {
							'Authorization': `Bearer ${API_TOKEN}`,
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

				if (res.status === 429) {
					if (attempt >= RATE_LIMIT_MAX_RETRIES) {
						throw new Error('TMDB Error: 429');
					}
					const retryAfterHeader = Number(res.headers.get('Retry-After'));
					const retryDelay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
						? retryAfterHeader * 1000
						: RATE_LIMIT_RETRY_DELAY_MS * (attempt + 1);
					await delay(retryDelay);
					continue;
				}

				if (!res.ok) {
					let apiMessage = '';
					try {
						const errorPayload = await res.json();
						apiMessage = typeof errorPayload?.status_message === 'string' ? errorPayload.status_message : '';
					} catch {
						apiMessage = '';
					}
					const suffix = apiMessage ? ` (${apiMessage})` : '';
					throw new Error(`TMDB Error: ${res.status}${suffix}`);
				}
				return res.json();
			}
		}

		// ══════════════════════════════════════════
		// GENRES
		// ══════════════════════════════════════════
		async function loadGenres() {
			const [movieGenres, tvGenres] = await Promise.all([
				tmdbFetch('/genre/movie/list'),
				tmdbFetch('/genre/tv/list')
			]);
			[...movieGenres.genres, ...tvGenres.genres].forEach(g => {
				genreMap[g.id] = g.name;
			});
		}

		function getGenreNames(ids) {
			return (ids || []).slice(0, 2).map(id => genreMap[id] || '').filter(Boolean).join(', ');
		}

		function renderInlineError(message, retryLabel, action, actionData = {}) {
			const safeMessage = escapeHtml(message);
			const safeLabel = escapeHtml(retryLabel || 'Retry');
			const retryButton = action
				? `<button class="inline-retry-btn" type="button" data-action="${escapeHtml(action)}"${buildDataAttributes(actionData)}>${safeLabel}</button>`
				: '';
			return `<div class="inline-error"><p>${safeMessage}</p>${retryButton}</div>`;
		}

		function renderEmptyState(title, message) {
			return `
				<div class="empty-state" role="status" aria-live="polite">
					<h3>${escapeHtml(title)}</h3>
					<p>${escapeHtml(message)}</p>
				</div>
			`;
		}

		function renderSectionContent(title, results) {
			const sectionItems = Array.isArray(results) ? results.slice(0, 12) : [];
			const sectionBody = sectionItems.length
				? sectionItems.map((item, i) => createCard(item, i)).join('')
				: renderEmptyState(`No ${title.toLowerCase()} titles yet`, 'Check back in a little while for fresh updates.');
			return `
				<div class="section-header">
					<h2 class="section-title">${escapeHtml(title)} <span>&rsaquo;</span></h2>
				</div>
				<div class="movie-grid">
					${sectionBody}
				</div>
			`;
		}

		function renderSectionError(title, endpoint) {
			const safeTitle = escapeHtml(title);
			return `
				<div class="section-header">
					<h2 class="section-title">${safeTitle} <span>›</span></h2>
				</div>
				${renderInlineError(`Could not load ${title}.`, 'Retry Section', 'retry-section', { endpoint, title })}
			`;
		}

		// ══════════════════════════════════════════
		// HERO
		// ══════════════════════════════════════════
		function getRecommendationSeed() {
			if (watchlist.length === 0) return null;
			const reversed = [...watchlist].reverse();
			const sameTypeSeed = reversed.find(item => item.type === currentType);
			return sameTypeSeed || reversed[0];
		}

		function normalizeRecommendationResults(results, mediaType) {
			if (!Array.isArray(results)) return [];
			return results
				.filter(item => item && typeof item === 'object')
				.map(item => ({ ...item, media_type: item.media_type || mediaType }))
				.filter(item => Number.isFinite(Number(item.id)));
		}

		function renderRecommendationContent(seedItem, results) {
			const recommendationItems = normalizeRecommendationResults(results, seedItem.type).slice(0, 12);
			const sectionBody = recommendationItems.length
				? recommendationItems.map((item, i) => createCard(item, i)).join('')
				: renderEmptyState(
					'No similar titles yet',
					`TMDB does not have recommendations for ${seedItem.title} right now.`
				);
			const watchlistLabel = seedItem.type === 'tv' ? 'From your TV watchlist' : 'From your movie watchlist';
			return `
				<div class="section-header recommendation-header">
					<div>
						<h2 class="section-title">Recommended for You <span>&rsaquo;</span></h2>
						<p class="recommendation-context">Because you saved <strong>${escapeHtml(seedItem.title)}</strong></p>
					</div>
					<span class="recommendation-pill">${watchlistLabel}</span>
				</div>
				<div class="movie-grid">
					${sectionBody}
				</div>
			`;
		}

		function renderRecommendationError(seedItem) {
			return `
				<div class="section-header recommendation-header">
					<div>
						<h2 class="section-title">Recommended for You <span>&rsaquo;</span></h2>
						<p class="recommendation-context">Because you saved <strong>${escapeHtml(seedItem.title)}</strong></p>
					</div>
				</div>
				${renderInlineError(
				'Could not load your personalized recommendations.',
				'Retry Recommendations',
				'retry-recommendations',
				{ id: seedItem.id, type: seedItem.type, title: seedItem.title }
			)}
			`;
		}

		async function loadRecommendationsIntoSection(sectionEl, seedItem) {
			try {
				const data = await tmdbFetch(`/${seedItem.type}/${seedItem.id}/recommendations`);
				sectionEl.innerHTML = renderRecommendationContent(seedItem, data?.results || []);
			} catch (error) {
				console.error('Failed to load personalized recommendations:', error);
				sectionEl.innerHTML = renderRecommendationError(seedItem);
			}
		}

		async function loadHero() {
			const backdrop = document.getElementById('heroBackdrop');
			const heroInfo = document.getElementById('heroInfo');
			try {
				const data = await tmdbFetch(`/trending/${currentType}/week`);
				const featured = data.results.find(m => m.backdrop_path) || data.results[0];
				if (!featured) throw new Error('No featured title');
				backdrop.style.backgroundImage = `url(${IMG_BASE}w1280${featured.backdrop_path})`;

				const title = featured.title || featured.name;
				const date = featured.release_date || featured.first_air_date || '';
				const year = date ? new Date(date).getFullYear() : '';

				heroInfo.innerHTML = `
                    <div class="hero-badge">🔥 Trending This Week</div>
                    <h1 class="hero-title">${escapeHtml(title)}</h1>
                    <p class="hero-overview">${escapeHtml(featured.overview)}</p>
                    <div class="hero-meta">
                        <div class="hero-rating">
                            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            ${typeof featured.vote_average === 'number' ? featured.vote_average.toFixed(1) : 'N/A'}
                        </div>
                        <span class="hero-date">${year}</span>
                        <span class="hero-genre">${escapeHtml(getGenreNames(featured.genre_ids))}</span>
                        <button class="hero-btn" data-action="open-detail" data-id="${featured.id}" data-type="${escapeHtml(currentType)}" type="button">
                            View Details →
                        </button>
                    </div>
                `;
			} catch (e) {
				console.error('Hero load failed:', e);
				backdrop.style.backgroundImage = 'none';
				heroInfo.innerHTML = `<div class="hero-error">${renderInlineError('Could not load the featured title right now.', 'Retry Hero', 'retry-hero')}</div>`;
			}
		}

		function retryHero() {
			loadHero();
		}

		// ══════════════════════════════════════════
		// SECTIONS
		// ══════════════════════════════════════════
		async function loadSections() {
			setMainBusy(true);
			mainContentEl.innerHTML = '';

			const recommendationSeed = getRecommendationSeed();
			if (recommendationSeed) {
				const recommendationSectionEl = document.createElement('div');
				recommendationSectionEl.className = 'section section-recommendations';
				mainContentEl.appendChild(recommendationSectionEl);
				await loadRecommendationsIntoSection(recommendationSectionEl, recommendationSeed);
			}

			const sections = currentType === 'movie'
				? [
					{ title: 'Now Playing', endpoint: '/movie/now_playing' },
					{ title: 'Popular', endpoint: '/movie/popular' },
					{ title: 'Top Rated', endpoint: '/movie/top_rated' },
					{ title: 'Upcoming', endpoint: '/movie/upcoming' }
				]
				: [
					{ title: 'Airing Today', endpoint: '/tv/airing_today' },
					{ title: 'Popular', endpoint: '/tv/popular' },
					{ title: 'Top Rated', endpoint: '/tv/top_rated' },
					{ title: 'On The Air', endpoint: '/tv/on_the_air' }
				];

			for (const section of sections) {
				const sectionEl = document.createElement('div');
				sectionEl.className = 'section';
				try {
					const data = await tmdbFetch(section.endpoint);
					sectionEl.innerHTML = renderSectionContent(section.title, data.results || []);
				} catch (e) {
					console.error(`Failed to load ${section.title}:`, e);
					sectionEl.innerHTML = renderSectionError(section.title, section.endpoint);
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
				await loadSections();
				return;
			}

			await loadRecommendationsIntoSection(sectionEl, { id, type, title, poster: '' });
		}

		async function retrySection(endpoint, title, triggerEl) {
			const sectionEl = triggerEl?.closest?.('.section');
			if (!sectionEl) {
				await loadSections();
				return;
			}

			try {
				const data = await tmdbFetch(endpoint);
				sectionEl.innerHTML = renderSectionContent(title, data.results || []);
			} catch (e) {
				console.error(`Retry failed for ${title}:`, e);
				sectionEl.innerHTML = renderSectionError(title, endpoint);
			}
		}

		// ══════════════════════════════════════════
		// SEARCH
		// ══════════════════════════════════════════
		function handleSearch() {
			const val = searchInputEl.value;
			const clearBtn = searchClearBtnEl;
			const hasValue = val.length > 0;
			clearBtn.classList.toggle('visible', hasValue);
			clearBtn.disabled = !hasValue;
			clearBtn.setAttribute('aria-hidden', String(!hasValue));
		}

		function executeSearch() {
			const query = searchInputEl.value.trim();
			if (!query) {
				goHome();
				return;
			}
			currentQuery = query;
			currentPage = 1;
			setSearchStatus(`Searching for ${currentQuery}.`);
			performSearch();
		}

		function clearSearch() {
			searchInputEl.value = '';
			const clearBtn = searchClearBtnEl;
			clearBtn.classList.remove('visible');
			clearBtn.disabled = true;
			clearBtn.setAttribute('aria-hidden', 'true');
			currentQuery = '';
			setSearchStatus('');
			goHome();
		}

		async function performSearch() {
			setMainBusy(true);
			document.getElementById('heroSection').style.display = 'none';

			try {
				const data = await tmdbFetch('/search/multi', {
					query: currentQuery,
					page: currentPage
				});
				searchTotalPages = Number.isInteger(data?.total_pages) ? data.total_pages : 1;

				const filtered = data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
				const totalResults = Number.isFinite(Number(data.total_results)) ? Number(data.total_results) : filtered.length;
				const resultMessage = filtered.length
					? `Showing ${filtered.length} of ${totalResults} results for ${currentQuery}.`
					: `No results found for ${currentQuery}.`;

				mainContentEl.innerHTML = `
                    <div class="section" style="margin-top: 32px;">
                        <div class="section-header">
                            <h2 class="section-title">Results for "<span>${escapeHtml(currentQuery)}</span>"</h2>
                            <span class="section-link">${data.total_results} found</span>
                        </div>
                        <div class="movie-grid">
                            ${filtered.length
								? filtered.map((item, i) => createCard(item, i)).join('')
								: renderEmptyState('No results found', 'Try a different keyword, or switch between Movies and TV Shows.')}
                        </div>
						${data.total_pages > 1 ? createPagination(data.page, data.total_pages) : ''}
                    </div>
                `;
				setSearchStatus(resultMessage);
			} catch (e) {
				mainContentEl.innerHTML = `
					<div class="section" style="margin-top: 32px;">
						<div class="section-header">
							<h2 class="section-title">Results for "<span>${escapeHtml(currentQuery)}</span>"</h2>
						</div>
						${renderInlineError(`Search failed: ${e.message}`, 'Retry Search', 'retry-search')}
					</div>
				`;
				setSearchStatus(`Search failed for ${currentQuery}.`);
			} finally {
				setMainBusy(false);
			}
		}

		function retrySearch() {
			if (!currentQuery) return;
			performSearch();
		}

		// ══════════════════════════════════════════
		// CARD
		// ══════════════════════════════════════════
		function createCard(item, index) {
			const title = item.title || item.name;
			const safeTitle = escapeHtml(title);
			const date = item.release_date || item.first_air_date || '';
			const year = date ? new Date(date).getFullYear() : '';
			const type = item.media_type || currentType;
			const safeType = escapeHtml(type);
			const isSaved = watchlist.some(w => w.id === item.id);
			const safePosterPath = getSafeTmdbPath(item.poster_path);
			const posterUrl = getTmdbImageUrl(item.poster_path, 'w342');
			const poster = posterUrl
				? `<img src="${posterUrl}" alt="${safeTitle}" loading="lazy">`
				: `<div class="no-poster">🎬</div>`;

			return `
                <div class="movie-card" style="animation-delay: ${index * 0.05}s" data-action="open-detail" data-id="${item.id}" data-type="${safeType}">
                    <div class="card-poster">
                        ${poster}
                        ${item.vote_average ? `
                        <div class="card-rating">
                            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            ${typeof item.vote_average === 'number' ? item.vote_average.toFixed(1) : 'N/A'}
                        </div>` : ''}
                            <button class="card-watchlist ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? `Remove ${safeTitle} from watchlist` : `Add ${safeTitle} to watchlist`}" aria-pressed="${isSaved ? 'true' : 'false'}" data-action="toggle-watchlist" data-id="${item.id}" data-type="${safeType}" data-title="${safeTitle}" data-poster="${escapeHtml(safePosterPath)}" type="button">
                            ${isSaved ? '♥' : '♡'}
                        </button>
                    </div>
                    <div class="card-info">
                        <div class="card-title">${safeTitle}</div>
                        <div class="card-meta">
                            <span>${year}</span>
                            <span>${escapeHtml(getGenreNames(item.genre_ids))}</span>
                        </div>
						<button class="card-open" type="button" aria-label="View details for ${safeTitle}" data-action="open-detail" data-id="${item.id}" data-type="${safeType}">View details</button>
                    </div>
                </div>
            `;
		}

		// ══════════════════════════════════════════
		// DETAIL MODAL
		// ══════════════════════════════════════════
		function focusModalContent() {
			const focusableEls = getFocusableElements(modalContentEl);
			if (focusableEls.length > 0) {
				focusableEls[0].focus();
			} else {
				modalContentEl.focus();
			}
		}

		function trapModalFocus(event) {
			if (!modalOverlayEl.classList.contains('open') || event.key !== 'Tab') return;
			const focusableEls = getFocusableElements(modalContentEl);
			if (focusableEls.length === 0) {
				event.preventDefault();
				modalContentEl.focus();
				return;
			}

			const firstEl = focusableEls[0];
			const lastEl = focusableEls[focusableEls.length - 1];
			if (event.shiftKey && document.activeElement === firstEl) {
				event.preventDefault();
				lastEl.focus();
			} else if (!event.shiftKey && document.activeElement === lastEl) {
				event.preventDefault();
				firstEl.focus();
			}
		}

		async function openDetail(id, type) {
			const mediaType = type === 'tv' ? 'tv' : 'movie';
			modalPreviouslyFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			modalOverlayEl.classList.add('open');
			modalOverlayEl.setAttribute('aria-hidden', 'false');
			document.body.style.overflow = 'hidden';
			modalContentEl.setAttribute('aria-busy', 'true');
			modalContentEl.removeAttribute('aria-labelledby');
			modalContentEl.removeAttribute('aria-describedby');
			modalContentEl.setAttribute('aria-label', 'Loading title details');
			modalContentEl.innerHTML = `<div style="padding:60px; text-align:center; color:var(--text-muted)">Loading...</div>`;
			modalContentEl.focus();

			try {
				const [detail, credits, videos] = await Promise.all([
					tmdbFetch(`/${mediaType}/${id}`),
					tmdbFetch(`/${mediaType}/${id}/credits`),
					tmdbFetch(`/${mediaType}/${id}/videos`)
				]);

				const rawTitle = detail.title || detail.name || 'Title details';
				const title = escapeHtml(rawTitle);
				const date = detail.release_date || detail.first_air_date || '';
				const year = date ? new Date(date).getFullYear() : '';
				const runtime = detail.runtime ? `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m` : '';
				const seasons = detail.number_of_seasons ? `${detail.number_of_seasons} Season${detail.number_of_seasons > 1 ? 's' : ''}` : '';
				const genres = (detail.genres || []).map(g => `<span class="modal-tag">${escapeHtml(g.name)}</span>`).join('');
				const trailers = (videos.results || [])
					.filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
					.map(v => ({ ...v, embedUrl: getYouTubeEmbedUrl(v.key) }))
					.filter(v => Boolean(v.embedUrl))
					.slice(0, 2);
				const cast = (credits.cast || []).slice(0, 10);
				const backdropUrl = getTmdbImageUrl(detail.backdrop_path, 'w1280');

				const backdropImg = backdropUrl
					? `<img src="${backdropUrl}" alt="${title}">`
					: `<div style="height:100%; background: var(--bg-card);"></div>`;

				modalContentEl.setAttribute('aria-busy', 'false');
				modalContentEl.removeAttribute('aria-label');
				modalContentEl.setAttribute('aria-labelledby', 'modalTitle');
				modalContentEl.setAttribute('aria-describedby', 'modalOverview');
				modalContentEl.innerHTML = `
                    <div class="modal-backdrop">
                        ${backdropImg}
                        <button class="modal-close" aria-label="Close details modal" data-action="close-modal" type="button">X</button>
                    </div>
                    <div class="modal-body">
                        <h1 class="modal-title" id="modalTitle">${title}</h1>
                        <div class="modal-meta">
                            ${detail.vote_average ? `
                            <span class="modal-rating">
                                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                ${typeof detail.vote_average === 'number' ? detail.vote_average.toFixed(1) : 'N/A'} / 10
                            </span>` : ''}
                            ${year ? `<span class="modal-tag">${year}</span>` : ''}
                            ${runtime ? `<span class="modal-tag">${runtime}</span>` : ''}
                            ${seasons ? `<span class="modal-tag">${escapeHtml(seasons)}</span>` : ''}
                            ${genres}
                        </div>
                        <p class="modal-overview" id="modalOverview">${escapeHtml(detail.overview || 'No overview available.')}</p>

                        ${cast.length ? `
                        <h3 class="modal-section-title">Cast</h3>
                        <div class="cast-row">
                            ${cast.map(c => {
						const castPhotoUrl = getTmdbImageUrl(c.profile_path, 'w185');
						return `
                                <div class="cast-card">
                                    <div class="cast-photo">
                                        ${castPhotoUrl
						? `<img src="${castPhotoUrl}" alt="${escapeHtml(c.name)}">`
						: `<div class="no-photo">👤</div>`
					}
                                    </div>
                                    <div class="cast-name">${escapeHtml(c.name)}</div>
                                    <div class="cast-character">${escapeHtml(c.character || c.roles?.[0]?.character || '')}</div>
                                </div>
                            `;
					}).join('')}
                        </div>` : ''}

                        ${trailers.length ? `
                        <h3 class="modal-section-title">Trailers</h3>
                        <div class="trailer-grid">
                            ${trailers.map(t => `
                                <div class="trailer-card">
                                    <iframe title="Trailer: ${escapeHtml(t.name || 'Video')}" src="${escapeHtml(t.embedUrl)}" loading="lazy" allowfullscreen></iframe>
                                </div>
                            `).join('')}
                        </div>` : ''}
                    </div>
                `;
				focusModalContent();
			} catch (e) {
				modalContentEl.setAttribute('aria-busy', 'false');
				modalContentEl.removeAttribute('aria-labelledby');
				modalContentEl.removeAttribute('aria-describedby');
				modalContentEl.setAttribute('aria-label', 'Error loading title details');
				modalContentEl.innerHTML = `<div style="padding:40px; text-align:center;"><p style="color:var(--accent); margin-bottom:12px;">Failed to load details</p><p style="color:var(--text-muted); font-size:13px;">${escapeHtml(e.message)}</p><button class="modal-close" aria-label="Close details modal" data-action="close-modal" type="button" style="position:relative; margin-top:16px;">X Close</button></div>`;
				focusModalContent();
			}
		}

		function closeModal() {
			modalOverlayEl.classList.remove('open');
			modalOverlayEl.setAttribute('aria-hidden', 'true');
			document.body.style.overflow = '';
			if (modalPreviouslyFocusedEl && document.contains(modalPreviouslyFocusedEl)) {
				modalPreviouslyFocusedEl.focus();
			}
			modalPreviouslyFocusedEl = null;
		}

		// WATCHLIST
		// ══════════════════════════════════════════
		function toggleWatchlist(id, type, title, poster, btn) {
			const normalizedType = type === 'tv' ? 'tv' : 'movie';
			const labelTitle = String(title || 'this title').trim() || 'this title';
			const idx = watchlist.findIndex(w => w.id === id);
			if (idx > -1) {
				watchlist.splice(idx, 1);
				btn.classList.remove('saved');
				btn.innerHTML = '&#9825;';
				btn.setAttribute('aria-pressed', 'false');
				btn.setAttribute('aria-label', `Add ${labelTitle} to watchlist`);
			} else {
				watchlist.push({ id, type: normalizedType, title: String(title || ''), poster: getSafeTmdbPath(poster) });
				btn.classList.add('saved');
				btn.innerHTML = '&#9829;';
				btn.setAttribute('aria-pressed', 'true');
				btn.setAttribute('aria-label', `Remove ${labelTitle} from watchlist`);
			}
			setStorageItem(STORAGE_KEYS.watchlist, JSON.stringify(watchlist));
			updateWatchlistCount();
		}

		function updateWatchlistCount() {
			const el = document.getElementById('watchlistCount');
			el.textContent = watchlist.length;
			el.classList.toggle('visible', watchlist.length > 0);
		}

		function showWatchlist() {
			setMainBusy(true);
			document.getElementById('heroSection').style.display = 'none';

			if (watchlist.length === 0) {
				mainContentEl.innerHTML = `
                    <div style="margin-top: 32px;">
						${renderEmptyState('Your watchlist is empty', 'Save a movie or TV show with the heart button to see it here.')}
					</div>
                `;
				setSearchStatus('Your watchlist is empty.');
				setMainBusy(false);
				return;
			}

			mainContentEl.innerHTML = `
                <div class="section" style="margin-top: 32px;">
                    <div class="section-header">
                        <h2 class="section-title">My <span>Watchlist</span></h2>
                        <span class="section-link">${watchlist.length} saved</span>
                    </div>
                    <div class="movie-grid">
                        ${watchlist.map((item, i) => {
					const itemPosterUrl = getTmdbImageUrl(item.poster, 'w342');
					return `
                            <div class="movie-card" style="animation-delay: ${i * 0.05}s" data-action="open-detail" data-id="${item.id}" data-type="${escapeHtml(item.type)}">
                                <div class="card-poster">
                                    ${itemPosterUrl
					? `<img src="${itemPosterUrl}" alt="${escapeHtml(item.title)}" loading="lazy">`
					: `<div class="no-poster">🎬</div>`
				}
                                    <button class="card-watchlist saved" aria-label="Remove ${escapeHtml(item.title)} from watchlist" aria-pressed="true" data-action="remove-watchlist" data-id="${item.id}" type="button">&#9829;</button>
                                </div>
                                <div class="card-info">
                                    <div class="card-title">${escapeHtml(item.title)}</div>
                                    <div class="card-meta"><span>${item.type === 'tv' ? 'TV Show' : 'Movie'}</span></div>
									<button class="card-open" type="button" aria-label="View details for ${escapeHtml(item.title)}" data-action="open-detail" data-id="${item.id}" data-type="${escapeHtml(item.type)}">View details</button>
                                </div>
                            </div>
                        `;
				}).join('')}
                    </div>
                </div>
            `;
			setSearchStatus(`Showing ${watchlist.length} watchlist item${watchlist.length === 1 ? '' : 's'}.`);
			setMainBusy(false);
		}

		function removeFromWatchlist(id) {
			watchlist = watchlist.filter(w => w.id !== id);
			setStorageItem(STORAGE_KEYS.watchlist, JSON.stringify(watchlist));
			updateWatchlistCount();
			showWatchlist();
		}

		// ══════════════════════════════════════════
		// PAGINATION
		// ══════════════════════════════════════════
		function createPagination(current, total) {
			const safeTotal = Math.max(1, Number(total) || 1);
			const safeCurrent = Math.min(Math.max(1, Math.floor(Number(current) || 1)), safeTotal);
			const maxPageButtons = 10;
			const startPage = Math.max(1, Math.min(safeCurrent - 4, safeTotal - maxPageButtons + 1));
			const endPage = Math.min(safeTotal, startPage + maxPageButtons - 1);
			let buttons = '';

			buttons += `<button class="page-btn" data-action="go-page" data-page="${safeCurrent - 1}" ${safeCurrent <= 1 ? 'disabled' : ''}>‹</button>`;

			if (startPage > 1) {
				buttons += `<button class="page-btn ${1 === safeCurrent ? 'active' : ''}" data-action="go-page" data-page="1">1</button>`;
				if (startPage > 2) {
					buttons += `<button class="page-btn" disabled>…</button>`;
				}
			}

			for (let i = startPage; i <= endPage; i++) {
				buttons += `<button class="page-btn ${i === safeCurrent ? 'active' : ''}" data-action="go-page" data-page="${i}">${i}</button>`;
			}

			if (endPage < safeTotal) {
				if (endPage < safeTotal - 1) {
					buttons += `<button class="page-btn" disabled>…</button>`;
				}
				buttons += `<button class="page-btn ${safeTotal === safeCurrent ? 'active' : ''}" data-action="go-page" data-page="${safeTotal}">${safeTotal}</button>`;
			}

			buttons += `<button class="page-btn" data-action="go-page" data-page="${safeCurrent + 1}" ${safeCurrent >= safeTotal ? 'disabled' : ''}>›</button>`;

			return `<div class="pagination">${buttons}</div>`;
		}
		function goToPage(page) {
			const nextPage = Math.floor(Number(page));
			if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > searchTotalPages || nextPage === currentPage) return;
			currentPage = nextPage;
			performSearch();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}

		// ══════════════════════════════════════════
		// NAV HELPERS
		// ══════════════════════════════════════════
		function switchType(type, btn) {
			currentType = type;
			document.querySelectorAll('.nav-tab').forEach(t => {
				t.classList.remove('active');
				t.setAttribute('aria-pressed', 'false');
			});
			btn.classList.add('active');
			btn.setAttribute('aria-pressed', 'true');
			currentQuery = '';
			searchInputEl.value = '';
			const clearBtn = searchClearBtnEl;
			clearBtn.classList.remove('visible');
			clearBtn.disabled = true;
			clearBtn.setAttribute('aria-hidden', 'true');
			goHome();
		}

		function goHome() {
			document.getElementById('heroSection').style.display = 'block';
			currentQuery = '';
			currentPage = 1;
			loadHero();
			loadSections();
			setSearchStatus(`Browsing ${currentType === 'movie' ? 'movies' : 'TV shows'}.`);
		}

		// Close modal on ESC
		document.addEventListener('keydown', e => {
			if (e.key === 'Escape' && modalOverlayEl.classList.contains('open')) {
				closeModal();
				return;
			}
			trapModalFocus(e);
		});
	
