const BASE_URL = 'https://sflix.to';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const AJAX_HEADERS = {
  ...DEFAULT_HEADERS,
  'X-Requested-With': 'XMLHttpRequest',
  Referer: BASE_URL + '/',
};

/**
 * Fetch the TMDB page and extract the title from the og:title meta tag.
 * No API key required — TMDB serves SSR HTML with Open Graph tags.
 */
async function fetchTitle(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const url = `https://www.themoviedb.org/${type}/${tmdbId}`;

  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  const html = await res.text();

  // og:title is "Movie Title (2023) — The Movie Database (TMDB)"
  const ogMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (ogMatch) {
    // Strip everything after " — " (TMDB suffix) and strip year "(2023)"
    return ogMatch[1]
      .replace(/\s*[—–-]\s*The Movie Database.*$/i, '')
      .replace(/\s*\(\d{4}\)\s*$/, '')
      .trim();
  }

  // Fallback: <title> tag
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    return titleMatch[1]
      .replace(/\s*[—–-]\s*.*$/, '')
      .replace(/\s*\(\d{4}\)\s*$/, '')
      .trim();
  }

  throw new Error(`[SFlix] Could not extract title for tmdbId=${tmdbId}`);
}

/**
 * Search SFlix AJAX endpoint by title keyword.
 * Returns the raw HTML string from the response.
 */
async function searchSFlix(title) {
  const url = `${BASE_URL}/ajax/search?keyword=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: AJAX_HEADERS });
  const json = await res.json();
  // Response shape: { "html": "<html string>" }
  return json.html || '';
}

/**
 * Fetch the episode list for a movie (returns raw HTML).
 */
async function fetchMovieEpisodes(mediaNumId) {
  const url = `${BASE_URL}/ajax/movie/episodes/${mediaNumId}`;
  const res = await fetch(url, { headers: AJAX_HEADERS });
  const json = await res.json();
  return json.html || json || '';
}

/**
 * Fetch the seasons list for a TV show (returns raw HTML).
 */
async function fetchTvSeasons(mediaNumId) {
  const url = `${BASE_URL}/ajax/v2/tv/seasons/${mediaNumId}`;
  const res = await fetch(url, { headers: AJAX_HEADERS });
  const json = await res.json();
  return json.html || '';
}

/**
 * Fetch the episodes for a given season ID (returns raw HTML).
 */
async function fetchSeasonEpisodes(seasonId) {
  const url = `${BASE_URL}/ajax/v2/season/episodes/${seasonId}`;
  const res = await fetch(url, { headers: AJAX_HEADERS });
  const json = await res.json();
  return json.html || '';
}

/**
 * Fetch the servers list for a given episode ID (returns raw HTML).
 */
async function fetchEpisodeServers(episodeId) {
  const url = `${BASE_URL}/ajax/v2/episode/servers/${episodeId}`;
  const res = await fetch(url, { headers: AJAX_HEADERS });
  const json = await res.json();
  return json.html || '';
}

/**
 * Fetch the source link object for a given server source ID.
 * Returns { link: "https://rabbitstream.net/embed-4/..." }
 */
async function fetchSourceLink(sourceId) {
  const url = `${BASE_URL}/ajax/v2/episode/sources?id=${sourceId}`;
  const res = await fetch(url, { headers: AJAX_HEADERS });
  return await res.json();
}

module.exports = {
  BASE_URL,
  DEFAULT_HEADERS,
  AJAX_HEADERS,
  fetchTitle,
  searchSFlix,
  fetchMovieEpisodes,
  fetchTvSeasons,
  fetchSeasonEpisodes,
  fetchEpisodeServers,
  fetchSourceLink,
};
