(() => {
  'use strict';

  function createModalController({
    overlayEl,
    contentEl,
    apiFetch,
    escapeHtml,
    renderModalError,
    getTmdbImageUrl,
    getYouTubeEmbedUrl,
    getCloseIcon
  }) {
    let previouslyFocusedEl = null;

    function getFocusableElements(container) {
      return [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hasAttribute('hidden') && element.offsetParent !== null);
    }

    function focusModalContent() {
      const focusableElements = getFocusableElements(contentEl);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        contentEl.focus();
      }
    }

    function trapFocus(event) {
      if (!overlayEl.classList.contains('open') || event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(contentEl);
      if (focusableElements.length === 0) {
        event.preventDefault();
        contentEl.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    async function openDetail(id, type) {
      const mediaType = type === 'tv' ? 'tv' : 'movie';
      previouslyFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      overlayEl.classList.add('open');
      overlayEl.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      contentEl.setAttribute('aria-busy', 'true');
      contentEl.removeAttribute('aria-labelledby');
      contentEl.removeAttribute('aria-describedby');
      contentEl.setAttribute('aria-label', 'Loading title details');
      contentEl.innerHTML = '<div style="padding:60px; text-align:center; color:var(--text-muted)">Loading...</div>';
      contentEl.focus();

      try {
        const [detail, credits, videos] = await Promise.all([
          apiFetch(`/${mediaType}/${id}`, {}, { cacheTtlMs: 300000 }),
          apiFetch(`/${mediaType}/${id}/credits`, {}, { cacheTtlMs: 300000 }),
          apiFetch(`/${mediaType}/${id}/videos`, {}, { cacheTtlMs: 300000 })
        ]);

        const rawTitle = detail.title || detail.name || 'Title details';
        const title = escapeHtml(rawTitle);
        const date = detail.release_date || detail.first_air_date || '';
        const year = date ? new Date(date).getFullYear() : '';
        const runtime = detail.runtime ? `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m` : '';
        const seasons = detail.number_of_seasons ? `${detail.number_of_seasons} Season${detail.number_of_seasons > 1 ? 's' : ''}` : '';
        const genres = (detail.genres || []).map(genre => `<span class="modal-tag">${escapeHtml(genre.name)}</span>`).join('');
        const trailers = (videos.results || [])
          .filter(video => video.site === 'YouTube' && (video.type === 'Trailer' || video.type === 'Teaser'))
          .map(video => ({ ...video, embedUrl: getYouTubeEmbedUrl(video.key) }))
          .filter(video => Boolean(video.embedUrl))
          .slice(0, 2);
        const cast = (credits.cast || []).slice(0, 10);
        const backdropUrl = getTmdbImageUrl(detail.backdrop_path, 'w1280');

        const backdropImage = backdropUrl
          ? `<img src="${backdropUrl}" alt="${title}">`
          : '<div style="height:100%; background: var(--bg-card);"></div>';

        contentEl.setAttribute('aria-busy', 'false');
        contentEl.removeAttribute('aria-label');
        contentEl.setAttribute('aria-labelledby', 'modalTitle');
        contentEl.setAttribute('aria-describedby', 'modalOverview');

        contentEl.innerHTML = `
          <div class="modal-backdrop">
            ${backdropImage}
            <button class="modal-close" aria-label="Close details modal" data-action="close-modal" type="button">${typeof getCloseIcon === 'function' ? getCloseIcon() : '&times;'}</button>
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
              ${cast.map(member => {
                const castPhotoUrl = getTmdbImageUrl(member.profile_path, 'w185');
                return `
                  <div class="cast-card">
                    <div class="cast-photo">
                      ${castPhotoUrl
                        ? `<img src="${castPhotoUrl}" alt="${escapeHtml(member.name)}">`
                        : '<div class="no-photo">&#128100;</div>'}
                    </div>
                    <div class="cast-name">${escapeHtml(member.name)}</div>
                    <div class="cast-character">${escapeHtml(member.character || member.roles?.[0]?.character || '')}</div>
                  </div>
                `;
              }).join('')}
            </div>` : ''}

            ${trailers.length ? `
            <h3 class="modal-section-title">Trailers</h3>
            <div class="trailer-grid">
              ${trailers.map(trailer => `
                <div class="trailer-card">
                  <iframe title="Trailer: ${escapeHtml(trailer.name || 'Video')}" src="${escapeHtml(trailer.embedUrl)}" loading="lazy" allowfullscreen></iframe>
                </div>
              `).join('')}
            </div>` : ''}
          </div>
        `;

        focusModalContent();
      } catch (error) {
        contentEl.setAttribute('aria-busy', 'false');
        contentEl.removeAttribute('aria-labelledby');
        contentEl.removeAttribute('aria-describedby');
        contentEl.setAttribute('aria-label', 'Error loading title details');
        if (typeof renderModalError === 'function') {
          contentEl.innerHTML = renderModalError(error.message, typeof getCloseIcon === 'function' ? getCloseIcon() : '&times;');
        } else {
          contentEl.innerHTML = `<div class="modal-error-state"><p class="modal-error-title">Failed to load details</p><p class="modal-error-message">${escapeHtml(error.message)}</p><button class="modal-close modal-error-close" aria-label="Close details modal" data-action="close-modal" type="button">${typeof getCloseIcon === 'function' ? getCloseIcon() : '&times;'}</button></div>`;
        }
        focusModalContent();
      }
    }

    function closeModal() {
      overlayEl.classList.remove('open');
      overlayEl.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (previouslyFocusedEl && document.contains(previouslyFocusedEl)) {
        previouslyFocusedEl.focus();
      }
      previouslyFocusedEl = null;
    }

    function handleDocumentKeydown(event) {
      trapFocus(event);
    }

    return {
      openDetail,
      closeModal,
      handleDocumentKeydown
    };
  }

  window.CinovaModal = {
    createModalController
  };
})();
