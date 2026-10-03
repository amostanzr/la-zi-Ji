'use strict';

// Note formatting. Notes are stored as plain text with simple markers, and
// turned into HTML for display:
//
//   **bold**   *italic*   __underline__   ==highlight==   ~~strikethrough~~
//   - bullet list        1. numbered list        > quote
//
// Everything is HTML-escaped first, so the only tags that can appear in the
// output are the handful created here.

(function (exports) {
  const escapeHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const INLINE = [
    [/\*\*\*(?=\S)(.+?)\*\*\*/g, '<strong><em>$1</em></strong>'],
    [/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>'],
    [/__(?=\S)(.+?)__/g, '<u>$1</u>'],
    [/==(?=\S)(.+?)==/g, '<mark>$1</mark>'],
    [/~~(?=\S)(.+?)~~/g, '<s>$1</s>'],
    [/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>'],
  ];

  function inline(line) {
    let html = escapeHtml(line);
    for (const [re, tag] of INLINE) html = html.replace(re, tag);
    return html;
  }

  const BULLET = /^\s*[-•*]\s+(.*)$/;
  const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;
  const QUOTE = /^\s*>\s?(.*)$/;

  function toHtml(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    const takeWhile = (re) => {
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].match(re)[1]);
      return items;
    };
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (BULLET.test(line)) {
        out.push(`<ul>${takeWhile(BULLET).map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      } else if (NUMBER.test(line)) {
        const start = Number(line.match(/\d+/)[0]);
        const items = takeWhile(NUMBER).map((t) => `<li>${inline(t)}</li>`).join('');
        out.push(`<ol${start !== 1 ? ` start="${start}"` : ''}>${items}</ol>`);
      } else if (QUOTE.test(line)) {
        out.push(`<blockquote>${takeWhile(QUOTE).map(inline).join('<br>')}</blockquote>`);
      } else {
        const para = [];
        while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !QUOTE.test(lines[i])) {
          para.push(inline(lines[i++]));
        }
        out.push(`<p>${para.join('<br>')}</p>`);
      }
    }
    return out.join('');
  }

  // Plain text without the markers, for short previews.
  function toPlainText(text) {
    return String(text || '')
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*|__(.+?)__|==(.+?)==|~~(.+?)~~/g, (_, a, b, c, d) => a || b || c || d)
      .replace(/(^|[^*\w])\*([^*]+?)\*(?!\w)/g, '$1$2')
      .replace(/^\s*(?:[-•*]|\d{1,3}[.)]|>)\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasFormatting(text) {
    return toHtml(text) !== `<p>${escapeHtml(String(text || '').trim()).replace(/\n/g, '<br>')}</p>`;
  }

  exports.toHtml = toHtml;
  exports.toPlainText = toPlainText;
  exports.hasFormatting = hasFormatting;
})(typeof module !== 'undefined' ? module.exports : (window.NoteFormat = {}));
