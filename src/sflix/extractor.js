const CryptoJS = require('crypto-js');
const { DEFAULT_HEADERS } = require('./http');

const RABBIT_BASE = 'https://rabbitstream.net';

// Community-maintained key repo — updated when the key rotates
const KEY_URL =
  'https://raw.githubusercontent.com/theonlymo/keys/e4/key';

/**
 * Fetch the current AES decryption key for RabbitStream sources.
 * Falls back to a hardcoded recent key if the fetch fails.
 */
async function fetchDecryptionKey() {
  try {
    const res = await fetch(KEY_URL, {
      headers: { ...DEFAULT_HEADERS, 'Cache-Control': 'no-cache' },
    });
    const key = (await res.text()).trim();
    if (key && key.length >= 8) return key;
  } catch (_) {
    // ignore, use fallback
  }
  // Fallback — may become stale; update if streams stop working
  return '8LmxXFX3tPkYRiGN';
}

/**
 * Given a RabbitStream embed URL, extract all available m3u8 streams.
 *
 * Flow:
 *   1. Parse the source ID from the embed URL
 *   2. Call /ajax/embed-4/getSources?id={id}
 *   3. If encrypted → fetch key → AES-decrypt → parse JSON
 *   4. Return stream objects
 */
async function extractFromRabbitStream(embedUrl) {
  // embedUrl: https://rabbitstream.net/embed-4/{id}?z=
  const urlObj = new URL(embedUrl);
  const sourceId = urlObj.pathname.split('/').pop();
  if (!sourceId) throw new Error('[RabbitStream] Could not parse source ID from embed URL');

  const sourcesUrl = `${RABBIT_BASE}/ajax/embed-4/getSources?id=${sourceId}`;

  const res = await fetch(sourcesUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: embedUrl,
      Origin: RABBIT_BASE,
    },
  });

  const data = await res.json();

  // data.sources is either:
  //   - a string (AES-encrypted, when data.encrypted === true)
  //   - an array of { file, type } objects (plain)
  let sourcesArr;

  if (data.encrypted && typeof data.sources === 'string') {
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
    throw new Error('[RabbitStream] Unexpected sources format');
  }

  if (!sourcesArr || !sourcesArr.length) return [];

  // Map to Nuvio stream objects
  return sourcesArr
    .filter((s) => s.file && s.file.includes('m3u8'))
    .map((s) => ({
      name: 'SFlix',
      title: resolveQualityLabel(s.type, s.label) + ' · RabbitStream',
      url: s.file,
      quality: resolveQualityLabel(s.type, s.label),
      headers: {
        Referer: RABBIT_BASE + '/',
        Origin: RABBIT_BASE,
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
      },
    }));
}

/** Turn raw type/label fields into a human-readable quality string. */
function resolveQualityLabel(type, label) {
  if (label) return label;
  if (type === 'hls') return 'Auto';
  return type || 'Stream';
}

module.exports = { extractFromRabbitStream };
