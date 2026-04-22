(() => {
  'use strict';

  function createWatchlistController({
    state,
    persistWatchlist,
    countElement,
    getHeartIcon
  }) {
    function updateCount() {
      if (!countElement) return;
      countElement.textContent = state.watchlist.length;
      countElement.classList.toggle('visible', state.watchlist.length > 0);
    }

    function toggle({ id, type, title, poster, buttonEl }) {
      const normalizedType = type === 'tv' ? 'tv' : 'movie';
      const itemTitle = String(title || 'this title').trim() || 'this title';
      const existingIndex = state.watchlist.findIndex(item => item.id === id);

      if (existingIndex > -1) {
        state.watchlist.splice(existingIndex, 1);
        if (buttonEl) {
          buttonEl.classList.remove('saved');
          buttonEl.innerHTML = typeof getHeartIcon === 'function' ? getHeartIcon(false) : '';
          buttonEl.setAttribute('aria-pressed', 'false');
          buttonEl.setAttribute('aria-label', `Add ${itemTitle} to watchlist`);
        }
      } else {
        state.watchlist.push({
          id,
          type: normalizedType,
          title: String(title || ''),
          poster
        });
        if (buttonEl) {
          buttonEl.classList.add('saved');
          buttonEl.innerHTML = typeof getHeartIcon === 'function' ? getHeartIcon(true) : '';
          buttonEl.setAttribute('aria-pressed', 'true');
          buttonEl.setAttribute('aria-label', `Remove ${itemTitle} from watchlist`);
        }
      }

      persistWatchlist();
      updateCount();
    }

    function remove(id) {
      state.watchlist = state.watchlist.filter(item => item.id !== id);
      persistWatchlist();
      updateCount();
    }

    function getItems() {
      return state.watchlist;
    }

    function isEmpty() {
      return state.watchlist.length === 0;
    }

    return {
      updateCount,
      toggle,
      remove,
      getItems,
      isEmpty
    };
  }

  window.CinovaWatchlist = {
    createWatchlistController
  };
})();
