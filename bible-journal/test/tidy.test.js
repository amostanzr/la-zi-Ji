'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tidyVerse, parseReference } = require('../src/tidy');

const JOHN_3_16 =
  'For God so loved the world that He gave His only begotten Son, that whoever believes in Him should not perish but have everlasting life.';

test('YouVersion copy: invisible characters, trailing reference and share link', () => {
  const raw = `“${JOHN_3_16}” \u202D\u202DJohn\u202C \u202D3\u202C:\u202D16\u202C \u202DNKJV\u202C\u202C\n\nhttps://bible.com/bible/114/jhn.3.16.NKJV`;
  assert.deepEqual(tidyVerse(raw), { reference: 'John 3:16', version: 'NKJV', text: JOHN_3_16 });
});

test('BibleGateway copy: heading, verse numbers, footnotes, cross references, copyright', () => {
  const raw = [
    'John 3:16-17',
    'New King James Version',
    '16 For God so loved the world that He gave His only begotten Son, that whoever believes in Him should not [a]perish but have everlasting life. 17 For God did not send His Son into the world (A)to condemn the world, but that the world through Him might be saved.',
    '',
    'Read full chapter',
    'Footnotes',
    'John 3:16 be lost',
    'Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.',
  ].join('\n');
  assert.deepEqual(tidyVerse(raw), {
    reference: 'John 3:16-17',
    version: 'NKJV',
    text: `${JOHN_3_16} For God did not send His Son into the world to condemn the world, but that the world through Him might be saved.`,
  });
});

test('poetry line breaks are joined and verse numbers removed', () => {
  const raw = 'Psalm 23:1-3 The Lord is my shepherd;\nI shall not want.\n2 He makes me to lie down in green pastures;\nHe leads me beside the still waters.\n3 He restores my soul;';
  assert.deepEqual(tidyVerse(raw), {
    reference: 'Psalm 23:1-3',
    version: null,
    text: 'The Lord is my shepherd; I shall not want. He makes me to lie down in green pastures; He leads me beside the still waters. He restores my soul;',
  });
});

test('abbreviated books and versions in brackets are recognised', () => {
  assert.deepEqual(tidyVerse('Phil 4:13 (NKJV) I can do all things through Christ who strengthens me.'), {
    reference: 'Philippians 4:13',
    version: 'NKJV',
    text: 'I can do all things through Christ who strengthens me.',
  });
  assert.equal(tidyVerse('1 Cor 13:4 Love suffers long and is kind').reference, '1 Corinthians 13:4');
  assert.equal(tidyVerse('¹⁶For God so loved the world - Jn 3:16 KJV').text, 'For God so loved the world');
});

test('numbers that are part of the verse are kept', () => {
  const raw = 'Matthew 10:1-2 1 And when He had called His twelve disciples to Him, He gave them power. 2 Now the names of the 12 apostles are these';
  assert.equal(
    tidyVerse(raw).text,
    'And when He had called His twelve disciples to Him, He gave them power. Now the names of the 12 apostles are these'
  );
  assert.equal(tidyVerse('And Jesus chose 12 disciples').text, 'And Jesus chose 12 disciples');
});

test('text with no reference still gets cleaned', () => {
  assert.deepEqual(tidyVerse('  "Jesus   wept."  '), { reference: null, version: null, text: 'Jesus wept.' });
});

test('inner quotes survive when the outer quotes are removed', () => {
  assert.equal(
    tidyVerse('“Jesus said to him, “I am the way, the truth, and the life.”” John 14:6').text,
    'Jesus said to him, “I am the way, the truth, and the life.”'
  );
  assert.equal(tidyVerse('“Rejoice” and “be glad”').text, '“Rejoice” and “be glad”');
});

test('parseReference normalises what users type', () => {
  assert.equal(parseReference('jn 3:16'), 'John 3:16');
  assert.equal(parseReference('1 cor 13:4-7'), '1 Corinthians 13:4-7');
  assert.equal(parseReference('II Timothy 3:16'), '2 Timothy 3:16');
  assert.equal(parseReference('psalms 23'), 'Psalm 23');
  assert.equal(parseReference('Song of Songs 2:1'), 'Song of Solomon 2:1');
  assert.equal(parseReference('John 3:16-4:2'), 'John 3:16-4:2');
  assert.equal(parseReference('hello'), null);
  assert.equal(parseReference('4 John 1:1'), null);
  assert.equal(parseReference('John 3:16 and more'), null);
});
