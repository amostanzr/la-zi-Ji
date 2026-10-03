'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const state = { user: null, journal: [], friends: [] };

// ---------- helpers ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function showError(el, err) {
  el.textContent = err ? err.message || String(err) : '';
  el.hidden = !err;
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

// In-page "Are you sure?" box. Resolves true when the person confirms.
function ask(message, confirmLabel) {
  const dialog = $('#confirm-dialog');
  $('#confirm-message').textContent = message;
  $('#confirm-yes').textContent = confirmLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
  });
}

function fromTemplate(id) {
  return $(id).content.firstElementChild.cloneNode(true);
}

function li(...children) {
  const el = document.createElement('li');
  el.append(...children);
  return el;
}

function button(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function personLabel(p) {
  const span = document.createElement('span');
  span.className = 'grow';
  span.textContent = p.displayName && p.displayName !== p.username ? `${p.displayName} (@${p.username})` : `@${p.username}`;
  return span;
}

function formatDate(sqlDate) {
  return new Date(sqlDate.replace(' ', 'T') + 'Z').toLocaleDateString();
}

// ---------- paste & tidy ----------

const verseForm = $('#verse');
let tidyTimer;
let tidySeq = 0;

async function tidy() {
  const raw = $('#raw').value;
  showError($('#tidy-error'), null);
  if (!raw.trim()) { verseForm.hidden = true; return; }
  const seq = ++tidySeq;
  try {
    const verse = await api('/api/tidy', { method: 'POST', body: { raw } });
    if (seq !== tidySeq) return; // a newer paste is on its way
    verseForm.reference.value = verse.reference || '';
    showSuggestions(verse.reference ? [] : verse.suggestions || []);
    verseForm.text.value = verse.text;
    verseForm.version.value = verse.version || '';
    $('#version-pill').textContent = verse.version || '';
    $('#version-line').hidden = !verse.version;
    $('#ref-missing').hidden = Boolean(verse.reference || ghostReference);
    verseForm.hidden = false;
  } catch (err) {
    if (seq !== tidySeq) return;
    verseForm.hidden = true;
    showError($('#tidy-error'), err);
  }
}

$('#raw').addEventListener('input', (e) => {
  clearTimeout(tidyTimer);
  // Tidy straight away on paste; wait for a pause while typing.
  tidyTimer = setTimeout(tidy, e.inputType === 'insertFromPaste' ? 0 : 500);
});

// When the text has no reference, the best guess shows in grey in the
// Reference box ("ghost") and is used if the person doesn't type their own.
let ghostReference = '';

function showSuggestions(suggestions) {
  ghostReference = suggestions.length ? suggestions[0].reference : '';
  verseForm.reference.placeholder = ghostReference || 'e.g. John 3:16';
  $('#ref-chips').replaceChildren(...suggestions.map((s, i) => {
    const chip = button(s.reference, () => {
      verseForm.reference.value = s.reference;
      $('#ref-missing').hidden = true;
    }, i === 0 ? 'chip best' : 'chip');
    return chip;
  }));
  $('#ref-suggest').hidden = !suggestions.length;
}

verseForm.reference.addEventListener('input', () => { $('#ref-missing').hidden = true; });

function clearVerse() {
  $('#raw').value = '';
  verseForm.reset();
  showSuggestions([]);
  verseForm.hidden = true;
  showError($('#tidy-error'), null);
}

$('#clear').addEventListener('click', clearVerse);

verseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.user) {
    toast('Log in or create an account to save verses.');
    $('#auth').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const body = Object.fromEntries(new FormData(verseForm));
  body.reference = body.reference.trim() || ghostReference;
  if (!body.reference) {
    $('#ref-missing').hidden = false;
    verseForm.reference.focus();
    return;
  }
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const { entry } = await api('/api/journal', { method: 'POST', body });
    toast(`Saved ${entry.reference} to your journal.`);
    clearVerse();
    selectTab('journal');
    await loadJournal();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- auth ----------

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mode = e.submitter.dataset.mode;
  const form = new FormData(e.target);
  showError($('#auth-error'), null);
  try {
    const { user } = await api(mode === 'register' ? '/api/register' : '/api/login', {
      method: 'POST',
      body: Object.fromEntries(form),
    });
    e.target.reset();
    await signedIn(user);
  } catch (err) {
    showError($('#auth-error'), err);
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  render();
});

async function signedIn(user) {
  state.user = user;
  render();
  await refreshAll();
}

function render() {
  const signedInNow = Boolean(state.user);
  $('#auth').hidden = signedInNow;
  $('#app').hidden = !signedInNow;
  $('#whoami').hidden = !signedInNow;
  if (signedInNow) $('#whoami-name').textContent = `@${state.user.username}`;
}

// ---------- tabs ----------

function selectTab(name) {
  for (const t of document.querySelectorAll('.tabs [role=tab]')) {
    t.setAttribute('aria-selected', String(t.dataset.tab === name));
  }
  for (const panel of document.querySelectorAll('.tab')) {
    panel.hidden = panel.id !== `tab-${name}`;
  }
}

$('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[role=tab]');
  if (!tab) return;
  selectTab(tab.dataset.tab);
  refreshAll();
});

async function refreshAll() {
  await Promise.all([loadJournal(), loadFriends(), loadInbox(), loadFeed()]).catch((err) => {
    if (err.status === 401) { state.user = null; render(); } else toast(err.message);
  });
}

// ---------- journal ----------

async function loadJournal() {
  const { entries } = await api('/api/journal');
  state.journal = entries;
  const list = $('#journal');
  list.replaceChildren(...entries.map(renderEntry));
  $('#journal-empty').hidden = entries.length > 0;
}

// ---------- note editor ----------

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Formatting shows straight away in the note box (a rich-text editor). The
// note is still saved as plain text with simple markers (see format.js),
// kept in the form's hidden textarea.
const FORMAT_BUTTONS = [
  { label: 'B', title: 'Bold', tag: 'b', command: 'bold' },
  { label: 'I', title: 'Italic', tag: 'i', command: 'italic' },
  { label: 'U', title: 'Underline', tag: 'u', command: 'underline' },
  { label: 'H', title: 'Highlight', tag: 'mark', command: 'highlight' },
  { label: '• List', title: 'Bullet list', command: 'insertUnorderedList' },
  { label: '1. List', title: 'Numbered list', command: 'insertOrderedList' },
  { label: '❝ Quote', title: 'Quote', command: 'quote' },
];
const HIGHLIGHT_COLOR = 'rgba(255, 210, 60, 0.45)';

function selectionIn(editor) {
  const sel = document.getSelection();
  return sel && sel.rangeCount && editor.contains(sel.anchorNode) ? sel : null;
}

// The highlighted element around the cursor, if any.
function highlightAt(editor) {
  const sel = selectionIn(editor);
  let node = sel && sel.anchorNode;
  for (; node && node !== editor; node = node.parentNode) {
    if (node.nodeType === 1 && (node.nodeName === 'MARK' || (node.style.backgroundColor && node.style.backgroundColor !== 'transparent'))) {
      return node;
    }
  }
  return null;
}

function inQuote(editor) {
  const sel = selectionIn(editor);
  let node = sel && sel.anchorNode;
  for (; node && node !== editor; node = node.parentNode) if (node.nodeName === 'BLOCKQUOTE') return true;
  return false;
}

function runCommand(editor, command) {
  if (command === 'highlight') {
    const mark = highlightAt(editor);
    if (mark) {
      mark.replaceWith(...mark.childNodes); // remove the highlight
    } else {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('hiliteColor', false, HIGHLIGHT_COLOR);
      document.execCommand('styleWithCSS', false, false);
    }
  } else if (command === 'quote') {
    document.execCommand('formatBlock', false, inQuote(editor) ? 'div' : 'blockquote');
  } else {
    document.execCommand(command, false, null);
  }
}

function isActive(editor, command) {
  if (!selectionIn(editor)) return false;
  if (command === 'highlight') return Boolean(highlightAt(editor));
  if (command === 'quote') return inQuote(editor);
  try { return document.queryCommandState(command); } catch { return false; }
}

// Turns a note form's textarea into a rich-text editor with a toolbar.
function addFormatting(ta) {
  const editor = document.createElement('div');
  editor.className = 'note-editor rich';
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('aria-label', ta.placeholder || 'Note');
  editor.dataset.placeholder = ta.placeholder || '';
  ta.hidden = true;
  ta.removeAttribute('required');

  const bar = document.createElement('div');
  bar.className = 'format-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Formatting');
  const buttons = FORMAT_BUTTONS.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = f.title;
    b.setAttribute('aria-label', f.title);
    b.setAttribute('aria-pressed', 'false');
    if (f.tag) {
      const t = document.createElement(f.tag);
      t.textContent = f.label;
      b.append(t);
    } else {
      b.textContent = f.label;
    }
    // Keep the keyboard up and the selection in place when tapping.
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (!selectionIn(editor)) editor.focus();
      runCommand(editor, f.command);
      sync();
      refreshButtons();
    });
    return { b, f };
  });
  bar.append(...buttons.map((x) => x.b));
  ta.before(bar, editor);

  const empty = () => !editor.textContent.trim() && !editor.querySelector('li');
  function sync() {
    ta.value = empty() ? '' : NoteFormat.fromElement(editor);
    editor.classList.toggle('is-empty', empty());
  }
  function refreshButtons() {
    for (const { b, f } of buttons) b.setAttribute('aria-pressed', String(isActive(editor, f.command)));
  }
  function set(text) {
    editor.innerHTML = text ? NoteFormat.toHtml(text) : '';
    sync();
  }

  editor.addEventListener('focus', () => {
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch { /* not supported */ }
  });
  editor.addEventListener('input', sync);
  document.addEventListener('selectionchange', () => { if (selectionIn(editor)) refreshButtons(); });

  // Paste and drop as plain text, so formatting from other sites can't sneak in.
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  editor.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
  });

  ta.form.addEventListener('reset', () => setTimeout(() => set('')));
  ta.richEditor = { set, focus: () => editor.focus(), isEmpty: empty };
  set(ta.value);
  return ta.richEditor;
}

function renderEntry(entry) {
  const el = fromTemplate('#entry-tpl');
  $('.ref', el).textContent = entry.reference;
  $('.version', el).textContent = entry.version;
  $('.version', el).hidden = !entry.version;
  $('.text', el).textContent = entry.text;
  $('.notes', el).replaceChildren(...entry.notes.map(renderNote));

  $('.share', el).addEventListener('click', () => openShare(entry));
  $('.delete', el).addEventListener('click', async () => {
    if (!(await ask(`Remove ${entry.reference} and its notes from your journal?`, 'Remove'))) return;
    await api(`/api/journal/${entry.id}`, { method: 'DELETE' });
    loadJournal();
  });
  addFormatting($('.note-form textarea', el));
  $('.note-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.target.body.value.trim()) {
      e.target.body.richEditor.focus();
      return;
    }
    const form = new FormData(e.target);
    try {
      await api(`/api/journal/${entry.id}/notes`, { method: 'POST', body: Object.fromEntries(form) });
      loadJournal();
    } catch (err) {
      toast(err.message);
    }
  });
  return el;
}

function renderNote(note) {
  const el = fromTemplate('#note-tpl');
  $('.body', el).innerHTML = NoteFormat.toHtml(note.body);
  addFormatting($('.edit-form textarea', el));
  $('.when', el).textContent = formatDate(note.updatedAt);
  const vis = $('.vis', el);
  vis.value = note.visibility;
  vis.addEventListener('change', async () => {
    try {
      await api(`/api/notes/${note.id}`, { method: 'PATCH', body: { visibility: vis.value } });
      toast(vis.value === 'public' ? 'Note is now public to your friends.' : 'Note is now private.');
    } catch (err) {
      toast(err.message);
      vis.value = note.visibility;
    }
  });
  const editForm = $('.edit-form', el);
  const setEditing = (on) => {
    editForm.hidden = !on;
    $('.body', el).hidden = on;
    if (on) {
      editForm.body.richEditor.set(note.body);
      editForm.body.richEditor.focus();
    }
  };
  $('.edit', el).addEventListener('click', () => setEditing(true));
  $('.cancel', editForm).addEventListener('click', () => setEditing(false));
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editForm.body.value.trim()) {
      editForm.body.richEditor.focus();
      return;
    }
    try {
      await api(`/api/notes/${note.id}`, { method: 'PATCH', body: { body: editForm.body.value } });
      loadJournal();
    } catch (err) {
      toast(err.message);
    }
  });
  $('.delete', el).addEventListener('click', async () => {
    if (!(await ask('Delete this note?', 'Delete'))) return;
    await api(`/api/notes/${note.id}`, { method: 'DELETE' });
    loadJournal();
  });
  return el;
}

// ---------- sharing ----------

let shareEntry = null;

function openShare(entry) {
  if (!state.friends.length) {
    toast('Add a friend first — you can share with friends only.');
    selectTab('friends');
    return;
  }
  shareEntry = entry;
  const form = $('#share-form');
  $('#share-ref').textContent = entry.reference;
  form.username.replaceChildren(...state.friends.map((f) => new Option(f.displayName || f.username, f.username)));
  form.noteId.replaceChildren(
    new Option('Just the verse', ''),
    ...entry.notes.map((n) => new Option(
      `${n.visibility === 'private' ? '🔒 ' : ''}${truncate(NoteFormat.toPlainText(n.body), 60)}`, n.id
    ))
  );
  form.message.value = '';
  showError($('#share-error'), null);
  $('#share-dialog').showModal();
}

$('#share-cancel').addEventListener('click', () => $('#share-dialog').close());

$('#share-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await api('/api/shares', {
      method: 'POST',
      body: {
        username: form.username.value,
        entryId: shareEntry.id,
        noteId: form.noteId.value ? Number(form.noteId.value) : null,
        message: form.message.value,
      },
    });
    $('#share-dialog').close();
    toast(`Shared with @${form.username.value}.`);
  } catch (err) {
    showError($('#share-error'), err);
  }
});

async function loadInbox() {
  const { shares } = await api('/api/shares/inbox');
  $('#inbox').replaceChildren(...shares.map((s) => {
    const card = document.createElement('li');
    card.className = 'card';
    const from = document.createElement('div');
    from.className = 'from';
    from.textContent = `From ${s.fromDisplayName} (@${s.fromUsername}) · ${formatDate(s.createdAt)}${s.message ? ` — “${s.message}”` : ''}`;
    const head = document.createElement('div');
    head.className = 'entry-head';
    const ref = document.createElement('strong');
    ref.textContent = s.reference;
    const ver = document.createElement('span');
    ver.className = 'pill';
    ver.textContent = s.version;
    ver.hidden = !s.version;
    head.append(ref, ver);
    const quote = document.createElement('blockquote');
    quote.textContent = s.text;
    card.append(from, head, quote);
    if (s.noteBody) {
      const note = document.createElement('div');
      note.className = 'shared-note rich';
      note.innerHTML = NoteFormat.toHtml(s.noteBody);
      card.append(note);
    }
    card.append(
      button('Save to my journal', async () => {
        await api(`/api/shares/${s.id}/save`, { method: 'POST' });
        toast(`Saved ${s.reference} to your journal.`);
        loadJournal();
      }),
      button('Dismiss', async () => {
        await api(`/api/shares/${s.id}`, { method: 'DELETE' });
        loadInbox();
      }, 'link')
    );
    return card;
  }));
  $('#inbox-empty').hidden = shares.length > 0;
  $('#inbox-count').textContent = shares.length;
  $('#inbox-count').hidden = shares.length === 0;
}

async function loadFeed() {
  const { items } = await api('/api/feed');
  $('#feed').replaceChildren(...items.map((n) => {
    const card = document.createElement('li');
    card.className = 'card';
    const from = document.createElement('div');
    from.className = 'from';
    from.textContent = `${n.displayName} (@${n.username}) · ${formatDate(n.updatedAt)}`;
    const head = document.createElement('div');
    head.className = 'entry-head';
    const ref = document.createElement('strong');
    ref.textContent = n.reference;
    const ver = document.createElement('span');
    ver.className = 'pill';
    ver.textContent = n.version;
    ver.hidden = !n.version;
    head.append(ref, ver);
    const quote = document.createElement('blockquote');
    quote.textContent = n.text;
    const body = document.createElement('div');
    body.className = 'shared-note rich';
    body.innerHTML = NoteFormat.toHtml(n.body);
    card.append(from, head, quote, body);
    return card;
  }));
  $('#feed-empty').hidden = items.length > 0;
}

// ---------- friends ----------

async function loadFriends() {
  const { friends, incoming, outgoing } = await api('/api/friends');
  state.friends = friends;
  const act = (fn) => async () => { await fn().catch((err) => toast(err.message)); refreshAll(); };

  $('#incoming').replaceChildren(...incoming.map((p) => li(
    personLabel(p),
    button('Accept', act(() => api(`/api/friends/requests/${p.id}/accept`, { method: 'POST' }))),
    button('Decline', act(() => api(`/api/friends/${p.id}`, { method: 'DELETE' })), 'link danger')
  )));
  $('#outgoing').replaceChildren(...outgoing.map((p) => li(
    personLabel(p),
    Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Request sent' }),
    button('Cancel', act(() => api(`/api/friends/${p.id}`, { method: 'DELETE' })), 'link')
  )));
  $('#friends').replaceChildren(...friends.map((p) => li(
    personLabel(p),
    button('Remove', act(async () => {
      if (await ask(`Remove @${p.username} from your friends?`, 'Remove')) await api(`/api/friends/${p.id}`, { method: 'DELETE' });
    }), 'link danger')
  )));
  $('#friends-empty').hidden = friends.length > 0;
  $('#request-count').textContent = incoming.length;
  $('#request-count').hidden = incoming.length === 0;
}

$('#friend-search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { users } = await api(`/api/users/search?q=${encodeURIComponent($('#friend-q').value)}`);
  const known = new Set(state.friends.map((f) => f.id));
  const results = users.map((u) => li(
    personLabel(u),
    known.has(u.id)
      ? Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Friend' })
      : button('Add friend', async (ev) => {
          try {
            const { status } = await api('/api/friends/requests', { method: 'POST', body: { username: u.username } });
            toast(status === 'accepted' ? `You and @${u.username} are now friends.` : `Friend request sent to @${u.username}.`);
            ev.target.disabled = true;
            loadFriends();
          } catch (err) {
            toast(err.message);
          }
        })
  ));
  if (!results.length) results.push(li(Object.assign(document.createElement('span'), { className: 'muted', textContent: 'No one found.' })));
  $('#search-results').replaceChildren(...results);
});

// ---------- boot ----------

(async function boot() {
  try {
    const { user } = await api('/api/me');
    await signedIn(user);
  } catch {
    render();
  }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
