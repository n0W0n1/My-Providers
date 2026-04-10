/**
 * SFlix provider for Nuvio
 *
 * Engine: FlixHQ clone (RabbitStream / UpCloud)
 * Supports: Movies + TV Shows  |  Language: English
 *
 * Flow:
 *   1. Resolve title from TMDB page (no API key needed)
 *   2. Search SFlix AJAX endpoint to get the internal numeric media ID
 *   3. Retrieve episode ID (movies: /ajax/movie/episodes, TV: seasons → episodes)
 *   4. List servers for the episode
 *   5. Resolve the RabbitStream embed URL from the preferred server
 *   6. Extract & decrypt the m3u8 playlist URL from RabbitStream
 */

const load = require('cheerio-without-node-native').load;

const {
  fetchTitle,
  searchSFlix,
  fetchMovieEpisodes,
  fetchTvSeasons,
  fetchSeasonEpisodes,
  fetchEpisodeServers,
  fetchSourceLink,
} = require('./http');

const { extractFromRabbitStream } = require('./extractor');

// ─── Step 2 ─────────────────────────────────────────────────────────────────
/**
 * Search SFlix by title, then return the internal numeric ID for the
 * matching media (filtered by movie/tv type).
 */
async function findMediaId(title, mediaType) {
  const html = await searchSFlix(title);
  const $ = load(html);

  const typePrefix = mediaType === 'movie' ? '/movie/' : '/tv/';
  let mediaNumId = null;

  $('a.nav-item').each((_i, el) => {
    if (mediaNumId) return false; // break
    const href = $(el).attr('href') || '';
    if (href.includes(typePrefix)) {
      // href: /movie/watch-avengers-endgame-39110  →  numId = "39110"
      const parts = href.split('-');
      mediaNumId = parts[parts.length - 1].split('?')[0];
    }
  });

  if (!mediaNumId) {
    throw new Error(`[SFlix] "${title}" not found (type=${mediaType})`);
  }

  return mediaNumId;
}

// ─── Step 3 ─────────────────────────────────────────────────────────────────
/**
 * Resolve the SFlix internal episode ID.
 * For movies this is straightforward; for TV we navigate seasons → episodes.
 */
async function resolveEpisodeId(mediaNumId, mediaType, season, episode) {
  if (mediaType === 'movie') {
    const html = await fetchMovieEpisodes(mediaNumId);
    const $ = load(html);
    // <ul class="ulTabLinks"><li><a data-id="EPISODE_ID">
    const epId =
      $('ul.ulTabLinks li a[data-id]').first().attr('data-id') ||
      $('[data-id]').first().attr('data-id');
    if (!epId) throw new Error('[SFlix] Could not find movie episode ID');
    return epId;
  }

  // TV: fetch seasons list
  const seasonsHtml = await fetchTvSeasons(mediaNumId);
  const $s = load(seasonsHtml);
  const seasonIds = [];
  $s('li a[data-id]').each((_i, el) => {
    seasonIds.push($s(el).attr('data-id'));
  });

  const targetSeasonId = seasonIds[season - 1];
  if (!targetSeasonId) {
    throw new Error(`[SFlix] Season ${season} not found (total=${seasonIds.length})`);
  }

  // Fetch episode list for the target season
  const episodesHtml = await fetchSeasonEpisodes(targetSeasonId);
  const $e = load(episodesHtml);
  const episodeIds = [];
  $e('ul.ulTabLinks li a[data-id], li.nav-item a[data-id]').each((_i, el) => {
    episodeIds.push($e(el).attr('data-id'));
  });

  const targetEpisodeId = episodeIds[episode - 1];
  if (!targetEpisodeId) {
    throw new Error(
      `[SFlix] Episode ${episode} not found (total=${episodeIds.length}) in S${season}`
    );
  }

  return targetEpisodeId;
}

// ─── Step 4 + 5 ──────────────────────────────────────────────────────────────
/**
 * Given an episode ID, fetch the server list and pick the best available one.
 * Server preference: UpCloud > VidCloud > first available.
 */
async function resolveEmbedUrl(episodeId) {
  const html = await fetchEpisodeServers(episodeId);
  const $ = load(html);

  const servers = [];
  $('ul.fss-list li a[data-id], ul.ul-server li.nav-item a[data-id]').each((_i, el) => {
    servers.push({
      name: $(el).find('span').text().trim() || $(el).text().trim(),
      id: $(el).attr('data-id'),
    });
  });

  if (!servers.length) throw new Error('[SFlix] No servers found for episode');

  // Pick best server
  const preferred = ['upcloud', 'vidcloud'];
  let chosen = null;
  for (const pref of preferred) {
    chosen = servers.find((s) => s.name.toLowerCase().includes(pref));
    if (chosen) break;
  }
  if (!chosen) chosen = servers[0];

  console.log(`[SFlix] Using server: ${chosen.name} (id=${chosen.id})`);

  const sourceData = await fetchSourceLink(chosen.id);
  if (!sourceData.link) throw new Error('[SFlix] Server returned no embed link');

  return sourceData.link;
}

// ─── Public API ──────────────────────────────────────────────────────────────
async function getStreams(tmdbId, mediaType, season, episode) {
  console.log(`[SFlix] getStreams tmdbId=${tmdbId} type=${mediaType} S${season}E${episode}`);

  const title = await fetchTitle(tmdbId, mediaType);
  console.log(`[SFlix] Resolved title: "${title}"`);

  const mediaNumId = await findMediaId(title, mediaType);
  console.log(`[SFlix] Internal media ID: ${mediaNumId}`);

  const episodeId = await resolveEpisodeId(mediaNumId, mediaType, season, episode);
  console.log(`[SFlix] Episode ID: ${episodeId}`);

  const embedUrl = await resolveEmbedUrl(episodeId);
  console.log(`[SFlix] Embed URL: ${embedUrl}`);

  const streams = await extractFromRabbitStream(embedUrl);
  console.log(`[SFlix] Streams found: ${streams.length}`);

  return streams;
}

module.exports = { getStreams };
