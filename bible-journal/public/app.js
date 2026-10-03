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
    verseForm.text.value = verse.text;
    verseForm.version.value = verse.version || '';
    $('#version-pill').textContent = verse.version || '';
    $('#version-line').hidden = !verse.version;
    $('#ref-missing').hidden = Boolean(verse.reference);
    verseForm.hidden = false;
    if (!verse.reference) verseForm.reference.focus();
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

verseForm.reference.addEventListener('input', () => { $('#ref-missing').hidden = true; });

function clearVerse() {
  $('#raw').value = '';
  verseForm.reset();
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
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const { entry } = await api('/api/journal', { method: 'POST', body: Object.fromEntries(new FormData(verseForm)) });
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

function renderEntry(entry) {
  const el = fromTemplate('#entry-tpl');
  $('.ref', el).textContent = entry.reference;
  $('.version', el).textContent = entry.version;
  $('.version', el).hidden = !entry.version;
  $('.text', el).textContent = entry.text;
  $('.notes', el).replaceChildren(...entry.notes.map(renderNote));

  $('.share', el).addEventListener('click', () => openShare(entry));
  $('.delete', el).addEventListener('click', async () => {
    if (!confirm(`Remove ${entry.reference} and its notes from your journal?`)) return;
    await api(`/api/journal/${entry.id}`, { method: 'DELETE' });
    loadJournal();
  });
  $('.note-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
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
  $('.body', el).textContent = note.body;
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
  $('.edit', el).addEventListener('click', async () => {
    const body = prompt('Edit note', note.body);
    if (body === null || !body.trim()) return;
    await api(`/api/notes/${note.id}`, { method: 'PATCH', body: { body } }).catch((err) => toast(err.message));
    loadJournal();
  });
  $('.delete', el).addEventListener('click', async () => {
    if (!confirm('Delete this note?')) return;
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
      `${n.visibility === 'private' ? '🔒 ' : ''}${n.body.slice(0, 60)}${n.body.length > 60 ? '…' : ''}`, n.id
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
      const note = document.createElement('p');
      note.className = 'shared-note';
      note.textContent = s.noteBody;
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
    const body = document.createElement('p');
    body.className = 'shared-note';
    body.textContent = n.body;
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
      if (confirm(`Remove @${p.username} from your friends?`)) await api(`/api/friends/${p.id}`, { method: 'DELETE' });
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
