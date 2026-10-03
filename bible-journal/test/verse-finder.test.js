'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createVerseFinder } = require('../src/verse-finder');

const finder = createVerseFinder(require('../data/kjv.json'));
const best = (text) => (finder.find(text)[0] || {}).reference;

test('finds a verse from a few remembered words', () => {
  assert.equal(best('for God so love the world'), 'John 3:16');
  assert.equal(best('Jesus wept'), 'John 11:35');
  assert.equal(best('be still and know that I am God'), 'Psalm 46:10');
  assert.equal(best('the wages of sin is death'), 'Romans 6:23');
});

test('finds verses quoted in modern translations (NKJV)', () => {
  assert.equal(best('I can do all things through Christ who strengthens me.'), 'Philippians 4:13');
  assert.equal(best('Come to Me, all you who labor and are heavy laden, and I will give you rest.'), 'Matthew 11:28');
  assert.equal(
    best('For I know the thoughts that I think toward you, says the LORD, thoughts of peace and not of evil, to give you a future and a hope.'),
    'Jeremiah 29:11'
  );
});

test('finds verse ranges in longer passages', () => {
  assert.equal(
    best('Trust in the LORD with all your heart, And lean not on your own understanding; In all your ways acknowledge Him, And He shall direct your paths.'),
    'Proverbs 3:5-6'
  );
  assert.equal(
    best('The LORD is my shepherd; I shall not want. He makes me to lie down in green pastures; He leads me beside the still waters. He restores my soul; He leads me in the paths of righteousness For His name’s sake.'),
    'Psalm 23:1-3'
  );
  assert.equal(
    best('Be anxious for nothing, but in everything by prayer and supplication, with thanksgiving, let your requests be made known to God; and the peace of God, which surpasses all understanding, will guard your hearts and minds through Christ Jesus.'),
    'Philippians 4:6-7'
  );
});

test('does not guess for text that is not scripture', () => {
  for (const text of [
    'I went to the store this morning to buy some bread and milk for the family before work.',
    'Please remember to bring your Bible and a notebook to small group on Friday night.',
    'God is good all the time and all the time God is good',
    'hello',
    '',
  ]) {
    assert.deepEqual(finder.find(text), [], text);
  }
});

test('offers other likely verses after the best one', () => {
  const results = finder.find('Jesus wept');
  assert.ok(results.length > 1);
  assert.ok(results.every((r, i) => i === 0 || r.score <= results[i - 1].score));
});
