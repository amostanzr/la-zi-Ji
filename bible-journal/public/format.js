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

  // ----- editor content -> marker text (browser only) -----

  const BLOCK_TAGS = new Set(['DIV', 'P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE']);

  function isHighlighted(el) {
    if (el.nodeName === 'MARK') return true;
    const bg = el.style && el.style.backgroundColor;
    return Boolean(bg) && bg !== 'transparent' && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg);
  }

  // The markers an element stands for, innermost first.
  function markersFor(el) {
    const tag = el.nodeName;
    const st = el.style || {};
    const deco = `${st.textDecoration || ''} ${st.textDecorationLine || ''}`;
    const weight = String(st.fontWeight || '');
    const out = [];
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || deco.includes('line-through')) out.push('~~');
    if (isHighlighted(el)) out.push('==');
    if (tag === 'U' || deco.includes('underline')) out.push('__');
    if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') out.push('*');
    if (tag === 'B' || tag === 'STRONG' || weight === 'bold' || Number(weight) >= 600) out.push('**');
    return out;
  }

  // Markers must hug the text and can't span lines, so wrap each line's text
  // and leave surrounding spaces outside.
  function wrapMarker(text, marker) {
    return text
      .split('\n')
      .map((seg) => {
        const m = seg.match(/^(\s*)([\s\S]*?)(\s*)$/);
        return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : seg;
      })
      .join('\n');
  }

  function inlineOf(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ').replace(/\n/g, ' ');
    if (node.nodeType !== 1) return '';
    if (node.nodeName === 'BR') return '\n';
    if (BLOCK_TAGS.has(node.nodeName)) return `\n${linesOf(node).join('\n')}\n`;
    let text = Array.from(node.childNodes).map(inlineOf).join('');
    for (const marker of markersFor(node)) text = wrapMarker(text, marker);
    return text;
  }

  function linesOf(root) {
    const lines = [];
    let buf = null;
    const flush = () => {
      if (buf === null) return;
      const parts = buf.split('\n');
      if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop(); // a block's closing <br>
      lines.push(...parts);
      buf = null;
    };
    const kids = Array.from(root.childNodes);
    kids.forEach((node, i) => {
      if (node.nodeType !== 1 || !BLOCK_TAGS.has(node.nodeName)) {
        buf = (buf || '') + inlineOf(node);
        return;
      }
      flush();
      const tag = node.nodeName;
      if (tag === 'UL' || tag === 'OL') {
        let n = Number(node.getAttribute('start')) || 1;
        for (const li of Array.from(node.children)) {
          for (const line of linesOf(li).filter((l) => l.trim())) {
            const nested = /^(?:- |\d{1,3}\. |> )/.test(line);
            lines.push(nested ? line : tag === 'UL' ? `- ${line}` : `${n++}. ${line}`);
          }
        }
      } else if (tag === 'BLOCKQUOTE') {
        for (const line of linesOf(node)) if (line.trim()) lines.push(`> ${line.replace(/^> /, '')}`);
      } else {
        lines.push(...linesOf(node));
        // Keep the gap between paragraphs.
        if (tag === 'P' && kids[i + 1] && kids[i + 1].nodeName === 'P') lines.push('');
      }
    });
    flush();
    return lines;
  }

  function fromElement(root) {
    return linesOf(root)
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  exports.fromElement = fromElement;
  exports.toHtml = toHtml;
  exports.toPlainText = toPlainText;
  exports.hasFormatting = hasFormatting;
})(typeof module !== 'undefined' ? module.exports : (window.NoteFormat = {}));
