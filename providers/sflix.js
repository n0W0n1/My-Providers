var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/sflix/http.js
var require_http = __commonJS({
  "src/sflix/http.js"(exports2, module2) {
    var BASE_URL = "https://sflix.to";
    var DEFAULT_HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    };
    var AJAX_HEADERS = {
      ...DEFAULT_HEADERS,
      "X-Requested-With": "XMLHttpRequest",
      Referer: BASE_URL + "/"
    };
    async function fetchTitle2(tmdbId, mediaType) {
      const type = mediaType === "movie" ? "movie" : "tv";
      const url = `https://www.themoviedb.org/${type}/${tmdbId}`;
      const res = await fetch(url, { headers: DEFAULT_HEADERS });
      const html = await res.text();
      const ogMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (ogMatch) {
        return ogMatch[1].replace(/\s*[—–-]\s*The Movie Database.*$/i, "").replace(/\s*\(\d{4}\)\s*$/, "").trim();
      }
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      if (titleMatch) {
        return titleMatch[1].replace(/\s*[—–-]\s*.*$/, "").replace(/\s*\(\d{4}\)\s*$/, "").trim();
      }
      throw new Error(`[SFlix] Could not extract title for tmdbId=${tmdbId}`);
    }
    async function searchSFlix2(title) {
      const url = `${BASE_URL}/ajax/search?keyword=${encodeURIComponent(title)}`;
      const res = await fetch(url, { headers: AJAX_HEADERS });
      const json = await res.json();
      return json.html || "";
    }
    async function fetchMovieEpisodes2(mediaNumId) {
      const url = `${BASE_URL}/ajax/movie/episodes/${mediaNumId}`;
      const res = await fetch(url, { headers: AJAX_HEADERS });
      const json = await res.json();
      return json.html || json || "";
    }
    async function fetchTvSeasons2(mediaNumId) {
      const url = `${BASE_URL}/ajax/v2/tv/seasons/${mediaNumId}`;
      const res = await fetch(url, { headers: AJAX_HEADERS });
      const json = await res.json();
      return json.html || "";
    }
    async function fetchSeasonEpisodes2(seasonId) {
      const url = `${BASE_URL}/ajax/v2/season/episodes/${seasonId}`;
      const res = await fetch(url, { headers: AJAX_HEADERS });
      const json = await res.json();
      return json.html || "";
    }
    async function fetchEpisodeServers2(episodeId) {
      const url = `${BASE_URL}/ajax/v2/episode/servers/${episodeId}`;
      const res = await fetch(url, { headers: AJAX_HEADERS });
      const json = await res.json();
      return json.html || "";
    }
    async function fetchSourceLink2(sourceId) {
      const url = `${BASE_URL}/ajax/v2/episode/sources?id=${sourceId}`;
      const res = await fetch(url, { headers: AJAX_HEADERS });
      return await res.json();
    }
    module2.exports = {
      BASE_URL,
      DEFAULT_HEADERS,
      AJAX_HEADERS,
      fetchTitle: fetchTitle2,
      searchSFlix: searchSFlix2,
      fetchMovieEpisodes: fetchMovieEpisodes2,
      fetchTvSeasons: fetchTvSeasons2,
      fetchSeasonEpisodes: fetchSeasonEpisodes2,
      fetchEpisodeServers: fetchEpisodeServers2,
      fetchSourceLink: fetchSourceLink2
    };
  }
});

// src/sflix/extractor.js
var require_extractor = __commonJS({
  "src/sflix/extractor.js"(exports2, module2) {
    var CryptoJS = require("crypto-js");
    var { DEFAULT_HEADERS } = require_http();
    var RABBIT_BASE = "https://rabbitstream.net";
    var KEY_URL = "https://raw.githubusercontent.com/theonlymo/keys/e4/key";
    async function fetchDecryptionKey() {
      try {
        const res = await fetch(KEY_URL, {
          headers: { ...DEFAULT_HEADERS, "Cache-Control": "no-cache" }
        });
        const key = (await res.text()).trim();
        if (key && key.length >= 8) return key;
      } catch (_) {
      }
      return "8LmxXFX3tPkYRiGN";
    }
    async function extractFromRabbitStream2(embedUrl) {
      const urlObj = new URL(embedUrl);
      const sourceId = urlObj.pathname.split("/").pop();
      if (!sourceId) throw new Error("[RabbitStream] Could not parse source ID from embed URL");
      const sourcesUrl = `${RABBIT_BASE}/ajax/embed-4/getSources?id=${sourceId}`;
      const res = await fetch(sourcesUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          "X-Requested-With": "XMLHttpRequest",
          Referer: embedUrl,
          Origin: RABBIT_BASE
        }
      });
      const data = await res.json();
      let sourcesArr;
      if (data.encrypted && typeof data.sources === "string") {
        const key = await fetchDecryptionKey();
        try {
          const decrypted = CryptoJS.AES.decrypt(data.sources, key).toString(
            CryptoJS.enc.Utf8
          );
          sourcesArr = JSON.parse(decrypted);
        } catch (e) {
          throw new Error(`[RabbitStream] Decryption failed: ${e.message}`);
        }
      } else if (Array.isArray(data.sources)) {
        sourcesArr = data.sources;
      } else {
        throw new Error("[RabbitStream] Unexpected sources format");
      }
      if (!sourcesArr || !sourcesArr.length) return [];
      return sourcesArr.filter((s) => s.file && s.file.includes("m3u8")).map((s) => ({
        name: "SFlix",
        title: resolveQualityLabel(s.type, s.label) + " \xB7 RabbitStream",
        url: s.file,
        quality: resolveQualityLabel(s.type, s.label),
        headers: {
          Referer: RABBIT_BASE + "/",
          Origin: RABBIT_BASE,
          "User-Agent": DEFAULT_HEADERS["User-Agent"]
        }
      }));
    }
    function resolveQualityLabel(type, label) {
      if (label) return label;
      if (type === "hls") return "Auto";
      return type || "Stream";
    }
    module2.exports = { extractFromRabbitStream: extractFromRabbitStream2 };
  }
});

// src/sflix/index.js
var load = require("cheerio-without-node-native").load;
var {
  fetchTitle,
  searchSFlix,
  fetchMovieEpisodes,
  fetchTvSeasons,
  fetchSeasonEpisodes,
  fetchEpisodeServers,
  fetchSourceLink
} = require_http();
var { extractFromRabbitStream } = require_extractor();
async function findMediaId(title, mediaType) {
  const html = await searchSFlix(title);
  const $ = load(html);
  const typePrefix = mediaType === "movie" ? "/movie/" : "/tv/";
  let mediaNumId = null;
  $("a.nav-item").each((_i, el) => {
    if (mediaNumId) return false;
    const href = $(el).attr("href") || "";
    if (href.includes(typePrefix)) {
      const parts = href.split("-");
      mediaNumId = parts[parts.length - 1].split("?")[0];
    }
  });
  if (!mediaNumId) {
    throw new Error(`[SFlix] "${title}" not found (type=${mediaType})`);
  }
  return mediaNumId;
}
async function resolveEpisodeId(mediaNumId, mediaType, season, episode) {
  if (mediaType === "movie") {
    const html = await fetchMovieEpisodes(mediaNumId);
    const $ = load(html);
    const epId = $("ul.ulTabLinks li a[data-id]").first().attr("data-id") || $("[data-id]").first().attr("data-id");
    if (!epId) throw new Error("[SFlix] Could not find movie episode ID");
    return epId;
  }
  const seasonsHtml = await fetchTvSeasons(mediaNumId);
  const $s = load(seasonsHtml);
  const seasonIds = [];
  $s("li a[data-id]").each((_i, el) => {
    seasonIds.push($s(el).attr("data-id"));
  });
  const targetSeasonId = seasonIds[season - 1];
  if (!targetSeasonId) {
    throw new Error(`[SFlix] Season ${season} not found (total=${seasonIds.length})`);
  }
  const episodesHtml = await fetchSeasonEpisodes(targetSeasonId);
  const $e = load(episodesHtml);
  const episodeIds = [];
  $e("ul.ulTabLinks li a[data-id], li.nav-item a[data-id]").each((_i, el) => {
    episodeIds.push($e(el).attr("data-id"));
  });
  const targetEpisodeId = episodeIds[episode - 1];
  if (!targetEpisodeId) {
    throw new Error(
      `[SFlix] Episode ${episode} not found (total=${episodeIds.length}) in S${season}`
    );
  }
  return targetEpisodeId;
}
async function resolveEmbedUrl(episodeId) {
  const html = await fetchEpisodeServers(episodeId);
  const $ = load(html);
  const servers = [];
  $("ul.fss-list li a[data-id], ul.ul-server li.nav-item a[data-id]").each((_i, el) => {
    servers.push({
      name: $(el).find("span").text().trim() || $(el).text().trim(),
      id: $(el).attr("data-id")
    });
  });
  if (!servers.length) throw new Error("[SFlix] No servers found for episode");
  const preferred = ["upcloud", "vidcloud"];
  let chosen = null;
  for (const pref of preferred) {
    chosen = servers.find((s) => s.name.toLowerCase().includes(pref));
    if (chosen) break;
  }
  if (!chosen) chosen = servers[0];
  console.log(`[SFlix] Using server: ${chosen.name} (id=${chosen.id})`);
  const sourceData = await fetchSourceLink(chosen.id);
  if (!sourceData.link) throw new Error("[SFlix] Server returned no embed link");
  return sourceData.link;
}
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
