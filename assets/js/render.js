(() => {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildDataAttributes(data = {}) {
    return Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`)
      .join('');
  }

  function getHeartIcon(isSaved = false) {
    const heartPath = 'M12.1 20.3l-.1.1-.1-.1C7.14 16.24 4 13.39 4 9.99 4 7.5 5.99 5.5 8.5 5.5c1.54 0 3.04.73 4 1.87.96-1.14 2.46-1.87 4-1.87 2.51 0 4.5 2 4.5 4.49 0 3.4-3.14 6.25-7.9 10.31z';
    if (isSaved) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${heartPath}" /></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${heartPath}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
  }

  function getCloseIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M8.5 8.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    `;
  }

  function getGenreNames(ids, genreMap = {}) {
    return (ids || [])
      .slice(0, 2)
      .map(id => genreMap[id] || '')
      .filter(Boolean)
      .join(', ');
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

  function createCard(item, index, context) {
    const titleValue = item.title || item.name || 'Untitled';
    const safeTitle = escapeHtml(titleValue);
    const date = item.release_date || item.first_air_date || '';
    const year = date ? new Date(date).getFullYear() : '';
    const type = item.media_type || context.currentType;
    const safeType = escapeHtml(type);
    const isSaved = context.watchlist.some(entry => entry.id === item.id);
    const safePosterPath = context.getSafeTmdbPath(item.poster_path);
    const posterUrl = context.getTmdbImageUrl(item.poster_path, 'w342');
    const poster = posterUrl
      ? `<img src="${posterUrl}" alt="${safeTitle}" loading="lazy">`
      : '<div class="no-poster">&#127909;</div>';

    return `
      <div class="movie-card" style="animation-delay: ${index * 0.05}s" data-action="open-detail" data-id="${item.id}" data-type="${safeType}">
        <div class="card-poster">
          ${poster}
          ${item.vote_average ? `
          <div class="card-rating">
            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${typeof item.vote_average === 'number' ? item.vote_average.toFixed(1) : 'N/A'}
          </div>` : ''}
          <button class="card-watchlist ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? `Remove ${safeTitle} from watchlist` : `Add ${safeTitle} to watchlist`}" aria-pressed="${isSaved ? 'true' : 'false'}" data-action="toggle-watchlist" data-id="${item.id}" data-type="${safeType}" data-title="${safeTitle}" data-poster="${escapeHtml(safePosterPath)}" type="button">${getHeartIcon(isSaved)}</button>
        </div>
        <div class="card-info">
          <div class="card-title">${safeTitle}</div>
          <div class="card-meta">
            <span>${year}</span>
            <span>${escapeHtml(getGenreNames(item.genre_ids, context.genreMap))}</span>
          </div>
          <button class="card-open" type="button" aria-label="View details for ${safeTitle}" data-action="open-detail" data-id="${item.id}" data-type="${safeType}">View details</button>
        </div>
      </div>
    `;
  }

  function renderSectionContent(title, results, context) {
    const sectionItems = Array.isArray(results) ? results.slice(0, 12) : [];
    const sectionBody = sectionItems.length
      ? sectionItems.map((item, index) => createCard(item, index, context)).join('')
      : renderEmptyState(`No ${title.toLowerCase()} titles yet`, 'Check back in a little while for fresh updates.');

    return `
      <div class="section-header">
        <h2 class="section-title section-title-decorated">${escapeHtml(title)}</h2>
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
        <h2 class="section-title section-title-decorated">${safeTitle}</h2>
      </div>
      ${renderInlineError(`Could not load ${title}.`, 'Retry Section', 'retry-section', { endpoint, title })}
    `;
  }

  function normalizeRecommendationResults(results, mediaType) {
    if (!Array.isArray(results)) return [];
    return results
      .filter(item => item && typeof item === 'object')
      .map(item => ({ ...item, media_type: item.media_type || mediaType }))
      .filter(item => Number.isFinite(Number(item.id)));
  }

  function renderRecommendationContent(seedItem, results, context) {
    const recommendationItems = normalizeRecommendationResults(results, seedItem.type).slice(0, 12);
    const sectionBody = recommendationItems.length
      ? recommendationItems.map((item, index) => createCard(item, index, context)).join('')
      : renderEmptyState('No similar titles yet', `TMDB does not have recommendations for ${seedItem.title} right now.`);
    const watchlistLabel = seedItem.type === 'tv' ? 'From your TV watchlist' : 'From your movie watchlist';

    return `
      <div class="section-header recommendation-header">
        <div>
          <h2 class="section-title section-title-decorated">Recommended for You</h2>
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
          <h2 class="section-title section-title-decorated">Recommended for You</h2>
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

  function renderHeroContent(featured, context) {
    const title = featured.title || featured.name || 'Untitled';
    const safeTitle = escapeHtml(title);
    const date = featured.release_date || featured.first_air_date || '';
    const year = date ? new Date(date).getFullYear() : '';

    return `
      <div class="hero-badge">&#128293; Trending This Week</div>
      <h1 class="hero-title">${safeTitle}</h1>
      <p class="hero-overview">${escapeHtml(featured.overview || 'No overview available.')}</p>
      <div class="hero-meta">
        <div class="hero-rating">
          <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          ${typeof featured.vote_average === 'number' ? featured.vote_average.toFixed(1) : 'N/A'}
        </div>
        <span class="hero-date">${year}</span>
        <span class="hero-genre">${escapeHtml(getGenreNames(featured.genre_ids, context.genreMap))}</span>
        <button class="hero-btn" data-action="open-detail" data-id="${featured.id}" data-type="${escapeHtml(context.currentType)}" type="button">
          View Details &rarr;
        </button>
      </div>
    `;
  }

  function renderHeroError() {
    return `<div class="hero-error">${renderInlineError('Could not load the featured title right now.', 'Retry Hero', 'retry-hero')}</div>`;
  }

  function renderSearchResults(query, data, filteredResults, context) {
    return `
      <div class="section" style="margin-top: 32px;">
        <div class="section-header">
          <h2 class="section-title">Results for "<span>${escapeHtml(query)}</span>"</h2>
          <span class="section-link">${Number(data.total_results) || filteredResults.length} found</span>
        </div>
        <div class="movie-grid">
          ${filteredResults.length
            ? filteredResults.map((item, index) => createCard(item, index, context)).join('')
            : renderEmptyState('No results found', 'Try a different keyword, or switch between Movies and TV Shows.')}
        </div>
        ${data.total_pages > 1 ? createPagination(data.page, data.total_pages) : ''}
      </div>
    `;
  }

  function renderSearchError(query, errorMessage) {
    return `
      <div class="section" style="margin-top: 32px;">
        <div class="section-header">
          <h2 class="section-title">Results for "<span>${escapeHtml(query)}</span>"</h2>
        </div>
        ${renderInlineError(`Search failed: ${errorMessage}`, 'Retry Search', 'retry-search')}
      </div>
    `;
  }

  function renderWatchlistSection(watchlist, context) {
    return `
      <div class="section" style="margin-top: 32px;">
        <div class="section-header">
          <h2 class="section-title">My <span>Watchlist</span></h2>
          <span class="section-link">${watchlist.length} saved</span>
        </div>
        <div class="movie-grid">
          ${watchlist.map((item, index) => {
            const itemPosterUrl = context.getTmdbImageUrl(item.poster, 'w342');
            return `
              <div class="movie-card" style="animation-delay: ${index * 0.05}s" data-action="open-detail" data-id="${item.id}" data-type="${escapeHtml(item.type)}">
                <div class="card-poster">
                  ${itemPosterUrl
                    ? `<img src="${itemPosterUrl}" alt="${escapeHtml(item.title)}" loading="lazy">`
                    : '<div class="no-poster">&#127909;</div>'}
                  <button class="card-watchlist saved" aria-label="Remove ${escapeHtml(item.title)} from watchlist" aria-pressed="true" data-action="remove-watchlist" data-id="${item.id}" type="button">${getHeartIcon(true)}</button>
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
  }

  function createPagination(current, total) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeCurrent = Math.min(Math.max(1, Math.floor(Number(current) || 1)), safeTotal);
    const maxPageButtons = 10;
    const startPage = Math.max(1, Math.min(safeCurrent - 4, safeTotal - maxPageButtons + 1));
    const endPage = Math.min(safeTotal, startPage + maxPageButtons - 1);
    let buttons = '';

    buttons += `<button class="page-btn" data-action="go-page" data-page="${safeCurrent - 1}" ${safeCurrent <= 1 ? 'disabled' : ''}>&lsaquo;</button>`;

    if (startPage > 1) {
      buttons += `<button class="page-btn ${safeCurrent === 1 ? 'active' : ''}" data-action="go-page" data-page="1">1</button>`;
      if (startPage > 2) {
        buttons += '<button class="page-btn" disabled>&hellip;</button>';
      }
    }

    for (let page = startPage; page <= endPage; page += 1) {
      buttons += `<button class="page-btn ${page === safeCurrent ? 'active' : ''}" data-action="go-page" data-page="${page}">${page}</button>`;
    }

    if (endPage < safeTotal) {
      if (endPage < safeTotal - 1) {
        buttons += '<button class="page-btn" disabled>&hellip;</button>';
      }
      buttons += `<button class="page-btn ${safeTotal === safeCurrent ? 'active' : ''}" data-action="go-page" data-page="${safeTotal}">${safeTotal}</button>`;
    }

    buttons += `<button class="page-btn" data-action="go-page" data-page="${safeCurrent + 1}" ${safeCurrent >= safeTotal ? 'disabled' : ''}>&rsaquo;</button>`;

    return `<div class="pagination">${buttons}</div>`;
  }

  window.CinovaRender = {
    escapeHtml,
    buildDataAttributes,
    getHeartIcon,
    getCloseIcon,
    getGenreNames,
    renderInlineError,
    renderEmptyState,
    createCard,
    renderSectionContent,
    renderSectionError,
    renderRecommendationContent,
    renderRecommendationError,
    renderHeroContent,
    renderHeroError,
    renderSearchResults,
    renderSearchError,
    renderWatchlistSection,
    createPagination
  };
})();
