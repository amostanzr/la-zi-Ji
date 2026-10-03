'use strict';

// Works out which verse a piece of text comes from, e.g.
// "for God so love the world" -> John 3:16.
//
// It searches a public-domain King James Version (data/kjv.json). Other
// translations word verses differently, so matching is forgiving: old forms
// count as modern ones ("believeth" = "believes", "thee" = "you"), word
// endings are ignored ("loved" = "love"), and the best match is the verse
// containing most of the typed words, especially rare ones, in the same order.

const BOOK_NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

// King James forms -> the words modern translations use.
const MODERN = {
  thee: 'you', thou: 'you', ye: 'you', thy: 'your', thine: 'your', hath: 'has', hast: 'have',
  doth: 'does', dost: 'do', art: 'are', shalt: 'shall', wilt: 'will', saith: 'says', unto: 'to',
  whosoever: 'whoever', spake: 'spoke', shew: 'show', sheweth: 'shows', wherefore: 'why',
  hither: 'here', thither: 'there', yea: 'yes', nay: 'no', ere: 'before', lo: 'behold',
};
const SUFFIXES = ['eth', 'est', 'ing', 'ed', 'es', 's'];

function normalizeWord(word) {
  let w = MODERN[word] || word;
  for (const suffix of SUFFIXES) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

function tokenize(text) {
  return (String(text).toLowerCase().replace(/['’]/g, '').match(/[a-z]+/g) || []).map(normalizeWord);
}

// Words this common add little when gathering candidates; they still count
// when the shortlisted verses are scored.
const COMMON_DF = 3000;
const MIN_SCORE = 0.55;
const MIN_BEST = 0.65; // no suggestions at all unless the best match is this good
const MIN_SCORE_LONG = 0.45; // longer texts carry more evidence
const LONG_TOKENS = 12;
const RANGE_TOKENS = 20; // longer texts may span several verses
const MAX_RANGE = 30;

function createVerseFinder(books) {
  const verses = []; // { book, chapter, verse, tokens }
  books.forEach((chapters, b) => {
    chapters.forEach((vs, c) => {
      vs.forEach((text, v) => verses.push({ book: b, chapter: c + 1, verse: v + 1, tokens: tokenize(text) }));
    });
  });

  const postings = new Map();
  verses.forEach((v, id) => {
    for (const t of new Set(v.tokens)) {
      let list = postings.get(t);
      if (!list) postings.set(t, (list = []));
      list.push(id);
    }
  });
  const idf = (t) => {
    const list = postings.get(t);
    return list ? Math.log(verses.length / list.length) : 0;
  };

  const label = (v) => `${BOOK_NAMES[v.book]} ${v.chapter}:${v.verse}`;

  function score(queryTokens, verse) {
    const words = new Set(verse.tokens);
    let total = 0;
    let matched = 0;
    for (const t of new Set(queryTokens)) {
      // Unknown words still count against the match, as much as a rare word.
      const weight = postings.has(t) ? idf(t) : Math.log(verses.length);
      total += weight;
      if (words.has(t)) matched += weight;
    }
    const pairs = new Set();
    for (let i = 0; i + 1 < verse.tokens.length; i++) pairs.add(`${verse.tokens[i]} ${verse.tokens[i + 1]}`);
    let inOrder = 0;
    for (let i = 0; i + 1 < queryTokens.length; i++) {
      if (pairs.has(`${queryTokens[i]} ${queryTokens[i + 1]}`)) inOrder++;
    }
    const coverage = total ? matched / total : 0;
    const order = queryTokens.length > 1 ? inOrder / (queryTokens.length - 1) : coverage;
    return 0.7 * coverage + 0.3 * order;
  }

  // Best matching single verses for some tokens, best first.
  function rank(queryTokens, limit) {
    const scores = new Map();
    const distinct = [...new Set(queryTokens)];
    let rare = distinct.filter((t) => postings.has(t) && postings.get(t).length <= COMMON_DF);
    if (!rare.length) rare = distinct.filter((t) => postings.has(t));
    for (const t of rare) {
      const w = idf(t);
      for (const id of postings.get(t)) scores.set(id, (scores.get(id) || 0) + w);
    }
    const shortlist = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([id]) => id);
    return shortlist
      .map((id) => ({ id, score: score(queryTokens, verses[id]) }))
      .sort((a, b) => b.score - a.score || verses[a.id].tokens.length - verses[b.id].tokens.length)
      .slice(0, limit);
  }

  // A long text may run over several verses. Start from the verses that best
  // match its opening words, then grow the range one verse at a time and keep
  // the range that best fits the whole text: it should cover the text's words
  // without bringing in many words the text doesn't have.
  function findRange(queryTokens) {
    const query = new Set(queryTokens);
    const queryWeight = [...query].reduce((sum, t) => sum + (postings.has(t) ? idf(t) : Math.log(verses.length)), 0);
    let best = null;
    for (const start of rank(queryTokens.slice(0, 12), 3)) {
      if (start.score < 0.5) continue;
      const words = new Set();
      for (let id = start.id; id < verses.length && id - start.id <= MAX_RANGE; id++) {
        const v = verses[id];
        if (v.book !== verses[start.id].book || v.chapter !== verses[start.id].chapter) break;
        v.tokens.forEach((t) => words.add(t));
        let found = 0;
        let extra = 0;
        for (const t of words) {
          if (query.has(t)) found += idf(t);
          else extra += idf(t);
        }
        const recall = found / queryWeight;
        const precision = found / (found + extra);
        const fit = (2 * precision * recall) / (precision + recall || 1);
        if (!best || fit > best.fit) best = { fit, from: start.id, to: id };
      }
    }
    if (!best || best.fit < 0.5) return null;
    const a = verses[best.from];
    const b = verses[best.to];
    return { reference: b === a ? label(a) : `${label(a)}-${b.verse}`, score: best.fit };
  }

  // Returns up to `limit` likely references for `text`, best first.
  function find(text, limit = 3) {
    const queryTokens = tokenize(text);
    if (queryTokens.length < 2) return [];
    const results = [];
    if (queryTokens.length > RANGE_TOKENS) {
      const range = findRange(queryTokens);
      if (range) results.push(range);
    }
    const minScore = queryTokens.length >= LONG_TOKENS ? MIN_SCORE_LONG : MIN_SCORE;
    for (const r of rank(queryTokens, limit)) {
      if (r.score >= minScore) results.push({ reference: label(verses[r.id]), score: r.score });
    }
    results.sort((a, b) => b.score - a.score);
    if (!results.length || results[0].score < MIN_BEST) return [];
    return results
      .filter((r, i, all) => all.findIndex((x) => x.reference === r.reference) === i)
      .slice(0, limit)
      .map((r) => ({ reference: r.reference, score: Math.round(r.score * 100) / 100 }));
  }

  return { find };
}

module.exports = { createVerseFinder };
