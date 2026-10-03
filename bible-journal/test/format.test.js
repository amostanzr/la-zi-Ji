'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toHtml, toPlainText, hasFormatting } = require('../public/format');

test('inline styles', () => {
  assert.equal(
    toHtml('**Bold** and *italic* and __under__ and ==glow== and ~~old~~'),
    '<p><strong>Bold</strong> and <em>italic</em> and <u>under</u> and <mark>glow</mark> and <s>old</s></p>'
  );
  assert.equal(toHtml('***both***'), '<p><strong><em>both</em></strong></p>');
});

test('lists, quotes and paragraphs', () => {
  assert.equal(toHtml('- one\n- **two**'), '<ul><li>one</li><li><strong>two</strong></li></ul>');
  assert.equal(toHtml('1. first\n2. second'), '<ol><li>first</li><li>second</li></ol>');
  assert.equal(toHtml('3. third'), '<ol start="3"><li>third</li></ol>');
  assert.equal(toHtml('> be still\n> and know'), '<blockquote>be still<br>and know</blockquote>');
  assert.equal(toHtml('line one\nline two\n\nnew para'), '<p>line one<br>line two</p><p>new para</p>');
});

test('ordinary text is left alone', () => {
  assert.equal(toHtml('2 * 3 = 6 and 5*4'), '<p>2 * 3 = 6 and 5*4</p>');
  assert.equal(toHtml('snake_case_word'), '<p>snake_case_word</p>');
  assert.equal(toHtml('John 3:16 - read it'), '<p>John 3:16 - read it</p>');
  assert.equal(hasFormatting('just words'), false);
  assert.equal(hasFormatting('just **words**'), true);
});

test('HTML in notes is shown as text, never run', () => {
  assert.equal(
    toHtml('<img src=x onerror=alert(1)> **<b>hi</b>**'),
    '<p>&lt;img src=x onerror=alert(1)&gt; <strong>&lt;b&gt;hi&lt;/b&gt;</strong></p>'
  );
  assert.equal(toHtml('> <script>'), '<blockquote>&lt;script&gt;</blockquote>');
  assert.ok(!toHtml('"onmouseover="alert(1)').includes('"onmouseover'));
});

test('plain text drops the markers', () => {
  assert.equal(toPlainText('**Grace** is ==enough==\n- for *me*'), 'Grace is enough for me');
});
