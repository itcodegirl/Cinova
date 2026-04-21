function movieResult(id, type = 'movie') {
  const isTv = type === 'tv';
  return {
    id,
    media_type: type,
    title: isTv ? undefined : `Movie ${id}`,
    name: isTv ? `Series ${id}` : undefined,
    overview: `Overview for ${isTv ? 'series' : 'movie'} ${id}.`,
    release_date: isTv ? undefined : '2025-01-01',
    first_air_date: isTv ? '2025-01-01' : undefined,
    vote_average: 8.1,
    genre_ids: isTv ? [18, 35] : [28, 18],
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg'
  };
}

function pageResults(pageNumber, type = 'movie') {
  const base = (pageNumber - 1) * 100;
  return Array.from({ length: 12 }, (_, index) => movieResult(base + index + 1, type));
}

async function mockTmdb(page) {
  await page.route('https://api.themoviedb.org/3/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const pageNumber = Number(url.searchParams.get('page') || '1');

    if (path.endsWith('/genre/movie/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ genres: [{ id: 28, name: 'Action' }, { id: 18, name: 'Drama' }] })
      });
    }

    if (path.endsWith('/genre/tv/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ genres: [{ id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }] })
      });
    }

    if (path.endsWith('/trending/movie/week') || path.endsWith('/trending/tv/week')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [movieResult(1, path.includes('/tv/') ? 'tv' : 'movie')] })
      });
    }

    if (/\/movie\/(now_playing|popular|top_rated|upcoming)$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: pageResults(pageNumber, 'movie') })
      });
    }

    if (/\/tv\/(airing_today|popular|top_rated|on_the_air)$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: pageResults(pageNumber, 'tv') })
      });
    }

    if (path.endsWith('/search/multi')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          page: pageNumber,
          total_pages: 20,
          total_results: 240,
          results: pageResults(pageNumber, 'movie')
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });
}

module.exports = { mockTmdb };
