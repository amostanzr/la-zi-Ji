'use strict';

// Bible text lookup.
//
// Public-domain translations come from https://bible-api.com (no key needed).
// Copyrighted translations (NKJV, NIV, ESV, NLT) cannot be bundled or fetched
// from a free API; they are served through API.Bible (https://scripture.api.bible)
// once you have a key and the publisher's licence for that translation:
//
//   API_BIBLE_KEY=...            your API.Bible key
//   BIBLE_ID_NKJV=...            the API.Bible id of the NKJV text you licensed
//   BIBLE_ID_NIV=... BIBLE_ID_ESV=... BIBLE_ID_NLT=...   (optional)
//
// When a licensed translation is not configured the lookup falls back to the
// KJV and says so in `notice`, so the app still works out of the box.

const VERSIONS = [
  { id: 'NKJV', name: 'New King James Version', source: 'licensed' },
  { id: 'KJV', name: 'King James Version', source: 'public', apiId: 'kjv' },
  { id: 'WEB', name: 'World English Bible', source: 'public', apiId: 'web' },
  { id: 'ASV', name: 'American Standard Version (1901)', source: 'public', apiId: 'asv' },
  { id: 'BBE', name: 'Bible in Basic English', source: 'public', apiId: 'bbe' },
  { id: 'YLT', name: "Young's Literal Translation", source: 'public', apiId: 'ylt' },
  { id: 'DARBY', name: 'Darby Translation', source: 'public', apiId: 'darby' },
  { id: 'NIV', name: 'New International Version', source: 'licensed' },
  { id: 'ESV', name: 'English Standard Version', source: 'licensed' },
  { id: 'NLT', name: 'New Living Translation', source: 'licensed' },
];

const DEFAULT_VERSION = 'NKJV';
const FALLBACK_VERSION = 'KJV';

// "John 3:16", "1 Cor 13:4-7", "Psalm 23", "Song of Solomon 2:1"
const REFERENCE_RE = /^[1-3]?\s?[A-Za-z][A-Za-z .]{1,30}\s\d{1,3}(:\d{1,3}(-\d{1,3})?)?$/;

class BibleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeReference(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function isValidReference(ref) {
  return REFERENCE_RE.test(ref);
}

function htmlToText(html) {
  return String(html)
    .replace(/<span[^>]*class="v"[^>]*>.*?<\/span>/g, ' ') // verse numbers
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function createBibleService({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  function licensedBibleId(versionId) {
    if (!env.API_BIBLE_KEY) return null;
    return env[`BIBLE_ID_${versionId}`] || null;
  }

  function listVersions() {
    return VERSIONS.map((v) => ({
      id: v.id,
      name: v.name,
      available: v.source === 'public' || Boolean(licensedBibleId(v.id)),
    }));
  }

  async function fromBibleApiCom(reference, version) {
    const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${version.apiId}`;
    const res = await fetchImpl(url);
    if (res.status === 404) throw new BibleError(404, `Could not find "${reference}".`);
    if (!res.ok) throw new BibleError(502, 'The Bible service is unavailable. Please try again.');
    const body = await res.json();
    if (body.error || !body.text) throw new BibleError(404, `Could not find "${reference}".`);
    return { reference: body.reference, text: body.text.replace(/\s+/g, ' ').trim() };
  }

  async function fromApiBible(reference, bibleId) {
    const url = `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bibleId)}/search?query=${encodeURIComponent(reference)}`;
    const res = await fetchImpl(url, { headers: { 'api-key': env.API_BIBLE_KEY } });
    if (!res.ok) throw new BibleError(502, 'The Bible service is unavailable. Please try again.');
    const body = await res.json();
    const passages = (body.data && body.data.passages) || [];
    if (!passages.length) throw new BibleError(404, `Could not find "${reference}".`);
    return {
      reference: passages[0].reference || reference,
      text: passages.map((p) => htmlToText(p.content)).join(' '),
    };
  }

  async function lookup(rawReference, versionId = DEFAULT_VERSION) {
    const reference = normalizeReference(rawReference);
    if (!isValidReference(reference)) {
      throw new BibleError(400, 'Enter a reference like "John 3:16" or "Psalm 23:1-3".');
    }
    const requested = VERSIONS.find((v) => v.id === String(versionId).toUpperCase());
    if (!requested) throw new BibleError(400, `Unknown version "${versionId}".`);

    if (requested.source === 'licensed') {
      const bibleId = licensedBibleId(requested.id);
      if (bibleId) {
        const found = await fromApiBible(reference, bibleId);
        return { ...found, version: requested.id };
      }
      const fallback = VERSIONS.find((v) => v.id === FALLBACK_VERSION);
      const found = await fromBibleApiCom(reference, fallback);
      return {
        ...found,
        version: fallback.id,
        notice: `${requested.id} is a licensed translation and is not configured on this server, so the ${fallback.id} is shown instead.`,
      };
    }

    const found = await fromBibleApiCom(reference, requested);
    return { ...found, version: requested.id };
  }

  return { listVersions, lookup, defaultVersion: DEFAULT_VERSION };
}

module.exports = { createBibleService, BibleError, isValidReference, htmlToText, VERSIONS };
