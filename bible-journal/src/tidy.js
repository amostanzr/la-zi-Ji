'use strict';

// Cleans up a Bible verse pasted from an app or website (YouVersion,
// BibleGateway, Bible Hub, a plain copy...). It finds the reference and the
// version, then strips everything that isn't the verse itself: verse numbers,
// footnote and cross-reference markers, links, copyright lines, invisible
// characters, stray quotes and messy whitespace.

// [canonical name, aliases, numbered editions]
const BOOKS = [
  ['Genesis', 'gen ge gn'], ['Exodus', 'exod exo ex'], ['Leviticus', 'lev le lv'],
  ['Numbers', 'num nu nm nb'], ['Deuteronomy', 'deut deu dt'], ['Joshua', 'josh jos jsh'],
  ['Judges', 'judg jdg jg'], ['Ruth', 'rth ru'], ['Samuel', 'sam sa sm', [1, 2]],
  ['Kings', 'kgs kin ki', [1, 2]], ['Chronicles', 'chron chr ch', [1, 2]], ['Ezra', 'ezr'],
  ['Nehemiah', 'neh ne'], ['Esther', 'esth est es'], ['Job', 'jb'],
  ['Psalms', 'psalm ps psa pss psm'], ['Proverbs', 'prov pro prv pr'],
  ['Ecclesiastes', 'eccles eccl ecc qoh'],
  ['Song of Solomon', 'song|song of songs|songs|sos|song of sol|canticles'],
  ['Isaiah', 'isa is'], ['Jeremiah', 'jer je jr'], ['Lamentations', 'lam la'],
  ['Ezekiel', 'ezek eze ezk'], ['Daniel', 'dan da dn'], ['Hosea', 'hos ho'], ['Joel', 'jl'],
  ['Amos', 'am'], ['Obadiah', 'obad ob'], ['Jonah', 'jon jnh'], ['Micah', 'mic mc'],
  ['Nahum', 'nah na'], ['Habakkuk', 'hab hb'], ['Zephaniah', 'zeph zep zp'], ['Haggai', 'hag hg'],
  ['Zechariah', 'zech zec zc'], ['Malachi', 'mal ml'], ['Matthew', 'matt mat mt'],
  ['Mark', 'mrk mar mk mr'], ['Luke', 'luk lk'], ['John', 'joh jhn jn', [0, 1, 2, 3]],
  ['Acts', 'act ac'], ['Romans', 'rom ro rm'], ['Corinthians', 'cor co', [1, 2]],
  ['Galatians', 'gal ga'], ['Ephesians', 'eph ephes'], ['Philippians', 'phil php pp'],
  ['Colossians', 'col'], ['Thessalonians', 'thess thes th', [1, 2]], ['Timothy', 'tim ti', [1, 2]],
  ['Titus', 'tit'], ['Philemon', 'philem phm pm'], ['Hebrews', 'heb'], ['James', 'jas jm'],
  ['Peter', 'pet pe pt', [1, 2]], ['Jude', 'jud jd'], ['Revelation', 'rev re rv revelations'],
];

// alias -> { name, numbers, full }. `full` marks the spelled-out name, which
// is the only form trusted without a verse (so "Psalm 23" works but a stray
// "Am 3" in the text doesn't).
const BOOK_ALIASES = new Map();
for (const [name, aliases, numbers] of BOOKS) {
  const book = { name, numbers: numbers || [0] };
  BOOK_ALIASES.set(name.toLowerCase(), { ...book, full: true });
  for (const alias of aliases.split(aliases.includes('|') ? '|' : ' ')) {
    if (!BOOK_ALIASES.has(alias)) BOOK_ALIASES.set(alias, { ...book, full: alias === 'psalm' });
  }
}

const PREFIX_NUMBERS = { 1: 1, 2: 2, 3: 3, i: 1, ii: 2, iii: 3, '1st': 1, '2nd': 2, '3rd': 3, first: 1, second: 2, third: 3 };

const REFERENCE_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9])(?:([123]|III|II|I|1st|2nd|3rd|First|Second|Third)\s*)?` +
    String.raw`([A-Za-z]+(?:\s+of\s+[A-Za-z]+)?)\.?\s*(\d{1,3})` +
    String.raw`(?:\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3}))?)?(?![\d:])`,
  'g'
);

// Abbreviation -> full name. Longer names are matched first.
const VERSIONS = {
  NKJV: 'New King James Version', KJV: 'King James Version', NIV: 'New International Version',
  ESV: 'English Standard Version', NLT: 'New Living Translation', NASB: 'New American Standard Bible',
  NASB1995: null, NASB2020: null, LSB: 'Legacy Standard Bible', CSB: 'Christian Standard Bible',
  HCSB: 'Holman Christian Standard Bible', AMP: 'Amplified Bible', AMPC: 'Amplified Bible, Classic Edition',
  MSG: null, NRSV: 'New Revised Standard Version', NRSVUE: null, RSV: 'Revised Standard Version',
  ASV: 'American Standard Version', WEB: 'World English Bible', NET: 'New English Translation',
  TPT: 'The Passion Translation', GNT: 'Good News Translation', CEV: 'Contemporary English Version',
  NCV: 'New Century Version', ICB: 'International Children’s Bible', ERV: 'Easy-to-Read Version',
  NIRV: 'New International Reader’s Version', BSB: 'Berean Standard Bible', MEV: 'Modern English Version',
  TLB: 'The Living Bible', YLT: "Young's Literal Translation", NABRE: 'New American Bible (Revised Edition)',
};
const VERSION_IDS = new Set(Object.keys(VERSIONS));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']/g, "['’]");
const FULL_NAMES = Object.entries(VERSIONS)
  .filter(([, name]) => name)
  .sort((a, b) => b[1].length - a[1].length);
const ABBREV_RE = new RegExp(
  String.raw`\(?\b(${[...VERSION_IDS].sort((a, b) => b.length - a.length).join('|')})\b\)?`
);

const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g;
const BOILERPLATE_RE = /copyright|©|all rights reserved|used by permission|scripture (quotations?|taken)|read full chapter|bible gateway|^\s*in context\b|^\s*share\s*$/i;
const TRAILING_SECTION_RE = /^\s*(footnotes|cross references|cross-references)\s*:?\s*$/i;

function parseReferenceAt(match) {
  const [, prefix, rawName, chapter, verse, endChapter, endVerse] = match;
  const book = BOOK_ALIASES.get(rawName.toLowerCase().replace(/\s+/g, ' '));
  if (!book) return null;
  let number = 0;
  if (prefix) number = PREFIX_NUMBERS[prefix.toLowerCase()];
  if (!book.numbers.includes(number)) return null;
  if (!verse && !book.full) return null;

  const name = number ? `${number} ${book.name}` : book.name;
  let text = `${name === 'Psalms' ? 'Psalm' : name} ${Number(chapter)}`;
  if (verse) text += `:${Number(verse)}`;
  if (endVerse) text += `-${endChapter ? `${Number(endChapter)}:` : ''}${Number(endVerse)}`;
  return {
    text,
    chapter: Number(chapter),
    verse: verse ? Number(verse) : null,
    endVerse: endVerse && !endChapter ? Number(endVerse) : null,
    crossesChapter: Boolean(endChapter),
  };
}

// Finds the first Bible reference in `text`.
function findReference(text) {
  REFERENCE_RE.lastIndex = 0;
  let m;
  while ((m = REFERENCE_RE.exec(text))) {
    const ref = parseReferenceAt(m);
    if (ref) return { ...ref, index: m.index, length: m[0].length };
    // "Gospel of John 3:16": retry from the next word so "John 3:16" is found.
    REFERENCE_RE.lastIndex = m.index + 1;
  }
  return null;
}

// Normalises a reference typed by the user, e.g. "jn 3:16" -> "John 3:16".
function parseReference(input) {
  const s = String(input || '').replace(INVISIBLE_RE, '').trim();
  const ref = findReference(s);
  if (!ref || s.slice(0, ref.index).trim() || s.slice(ref.index + ref.length).trim()) return null;
  return ref.text;
}

function findVersion(text) {
  for (const [id, name] of FULL_NAMES) {
    const re = new RegExp(String.raw`\b${escapeRe(name)}\b(?:\s*\(${id}\))?`, 'i');
    const m = re.exec(text);
    if (m) return { id, index: m.index, length: m[0].length };
  }
  const m = ABBREV_RE.exec(text);
  if (m) return { id: m[1], index: m.index, length: m[0].length };
  return null;
}

function cut(text, found) {
  return `${text.slice(0, found.index)} ${text.slice(found.index + found.length)}`;
}

function stripVerseNumbers(text, ref) {
  // Superscript numbers are only ever verse numbers.
  let out = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, ' ');
  const startsWord = String.raw`(?=\s*[A-Za-z“"‘'(\[])`;

  if (!ref || !ref.verse) return out.replace(new RegExp(String.raw`^\s*\d{1,3}\s*${startsWord}`), '');

  // BibleGateway shows a chapter's first verse as the chapter number.
  if (ref.verse === 1) out = out.replace(new RegExp(String.raw`^\s*${ref.chapter}\s+${startsWord}`), '');

  // Remove the expected numbers in order: the first must lead the text,
  // the rest must follow it, so numbers inside the verse survive.
  let pos = 0;
  const last = ref.endVerse && ref.endVerse >= ref.verse && ref.endVerse - ref.verse < 200 ? ref.endVerse : ref.verse;
  for (let n = ref.verse; n <= last; n++) {
    const re = n === ref.verse
      ? new RegExp(String.raw`^(\s*[“"‘']?\s*)${n}\s*${startsWord}`)
      : new RegExp(String.raw`([\s“"‘'(\[.,;:!?—])${n}\s*${startsWord}`, 'g');
    re.lastIndex = pos;
    const m = re.exec(out);
    if (!m) continue;
    out = out.slice(0, m.index) + m[1] + ' ' + out.slice(m.index + m[0].length);
    pos = m.index + m[1].length;
  }
  return out;
}

// True when the quote at the start of `t` is closed by its last character,
// i.e. the whole text is one quotation (not “Rejoice” and “be glad”).
function isWrappedInQuotes(t) {
  if (t.length < 2) return false;
  if (t.startsWith('"') && t.endsWith('"')) return !t.slice(1, -1).includes('"');
  if (!t.startsWith('“') || !t.endsWith('”')) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '“') depth++;
    else if (t[i] === '”') depth--;
    if (depth === 0 && i < t.length - 1) return false;
  }
  return depth === 0;
}

function stripWrappingQuotes(text) {
  let t = text;
  while (isWrappedInQuotes(t)) t = t.slice(1, -1).trim();
  return t;
}

function tidyVerse(raw) {
  let text = String(raw || '')
    .normalize('NFC')
    .replace(INVISIBLE_RE, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u3000]/g, ' ')
    .replace(/\r\n?/g, '\n');

  // Detect the version before links go, since YouVersion links end in ".NKJV".
  const version = findVersion(text);

  text = text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ');

  // Drop footnote sections and copyright / site boilerplate lines.
  const lines = [];
  for (const line of text.split('\n')) {
    if (TRAILING_SECTION_RE.test(line)) break;
    if (BOILERPLATE_RE.test(line)) continue;
    lines.push(line);
  }
  text = lines.join('\n');

  const versionInText = findVersion(text);
  if (versionInText) text = cut(text, versionInText);

  const ref = findReference(text);
  if (ref) text = cut(text, ref);

  text = text
    .replace(/\n+/g, ' ')
    .replace(/\[[a-z]{1,2}\]|\[\d{1,3}\]/g, '') // footnotes: [a] [12]
    .replace(/\([A-Z]{1,2}\)/g, '') // BibleGateway cross references: (A) (BC)
    .replace(/\s+/g, ' ')
    .trim();

  text = stripVerseNumbers(text, ref).replace(/\s+/g, ' ').trim();

  text = text
    .replace(/^[\s\-–—~:|,.()]+/, '') // left over around a removed reference
    .replace(/[\s\-–—~:|(]+$/, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:!?”’)])/g, '$1')
    .replace(/([“‘(])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  text = stripWrappingQuotes(text);

  return {
    reference: ref ? ref.text : null,
    version: version ? version.id : null,
    text,
  };
}

module.exports = { tidyVerse, parseReference, VERSION_IDS };
