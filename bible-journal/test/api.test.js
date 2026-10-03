'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { createVerseFinder } = require('../src/verse-finder');

const finder = createVerseFinder(require('../data/kjv.json'));

async function startServer() {
  const db = openDatabase(':memory:');
  const server = http.createServer(createApp({ db, finder }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

function client(base) {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

async function signUp(base, username) {
  const c = client(base);
  const r = await c('POST', '/api/register', { username, password: 'password123', displayName: username.toUpperCase() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return c;
}

async function befriend(a, b, bName) {
  const sent = await a('POST', '/api/friends/requests', { username: bName });
  assert.equal(sent.body.status, 'pending');
  const { body } = await b('GET', '/api/friends');
  const r = await b('POST', `/api/friends/requests/${body.incoming[0].id}/accept`);
  assert.equal(r.status, 200);
}

test('pasted verses are tidied without signing in', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const r = await c('POST', '/api/tidy', { raw: '16 For God so loved the world [a]... - John 3:16 (NKJV)' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { reference: 'John 3:16', version: 'NKJV', text: 'For God so loved the world...', suggestions: [] });

    // No reference in the text: suggest one.
    const guess = await c('POST', '/api/tidy', { raw: 'for God so love the world' });
    assert.equal(guess.body.reference, null);
    assert.equal(guess.body.suggestions[0].reference, 'John 3:16');
    assert.equal((await c('POST', '/api/tidy', { raw: '   ' })).status, 400);
    assert.equal((await c('POST', '/api/tidy', { raw: 'x'.repeat(20001) })).status, 400);
  } finally {
    await s.close();
  }
});

test('journal: save verse, add notes, toggle visibility, isolation between users', async () => {
  const s = await startServer();
  try {
    const anon = client(s.base);
    assert.equal((await anon('GET', '/api/journal')).status, 401);

    const alice = await signUp(s.base, 'alice');
    const bob = await signUp(s.base, 'bob');

    assert.equal((await alice('POST', '/api/journal', { reference: 'not a verse', text: 'x' })).status, 400);
    assert.equal((await alice('POST', '/api/journal', { reference: 'John 3:16', text: '  ' })).status, 400);
    assert.equal((await alice('POST', '/api/journal', { reference: 'John 3:16', text: 'x', version: 'ZZZ' })).status, 400);

    const saved = await alice('POST', '/api/journal', { reference: 'jn 3:16', version: 'nkjv', text: 'For God so loved the world' });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.entry.reference, 'John 3:16');
    assert.equal(saved.body.entry.version, 'NKJV');
    assert.equal(saved.body.entry.text, 'For God so loved the world');
    const noVersion = await alice('POST', '/api/journal', { reference: 'Psalm 23:1', text: 'The Lord is my shepherd' });
    assert.equal(noVersion.body.entry.version, '');
    await alice('DELETE', `/api/journal/${noVersion.body.entry.id}`);
    const entryId = saved.body.entry.id;

    const note = await alice('POST', `/api/journal/${entryId}/notes`, { body: 'Loved', visibility: 'private' });
    assert.equal(note.status, 201);
    assert.equal(note.body.note.visibility, 'private');
    assert.equal((await alice('POST', `/api/journal/${entryId}/notes`, { body: 'x', visibility: 'secret' })).status, 400);

    const patched = await alice('PATCH', `/api/notes/${note.body.note.id}`, { visibility: 'public' });
    assert.equal(patched.body.note.visibility, 'public');
    assert.equal(patched.body.note.body, 'Loved');

    const journal = await alice('GET', '/api/journal');
    assert.equal(journal.body.entries.length, 1);
    assert.equal(journal.body.entries[0].notes.length, 1);

    // Bob can't see or touch Alice's journal.
    assert.equal((await bob('GET', '/api/journal')).body.entries.length, 0);
    assert.equal((await bob('POST', `/api/journal/${entryId}/notes`, { body: 'hi' })).status, 404);
    assert.equal((await bob('PATCH', `/api/notes/${note.body.note.id}`, { body: 'hacked' })).status, 404);
    assert.equal((await bob('DELETE', `/api/journal/${entryId}`)).status, 404);
  } finally {
    await s.close();
  }
});

test('friends: request, accept, feed shows only friends\' public notes', async () => {
  const s = await startServer();
  try {
    const alice = await signUp(s.base, 'alice');
    const bob = await signUp(s.base, 'bob');
    const carol = await signUp(s.base, 'carol');

    const { body: { entry } } = await alice('POST', '/api/journal', { reference: 'Psalm 23:1', version: 'KJV', text: 'The LORD is my shepherd' });
    await alice('POST', `/api/journal/${entry.id}/notes`, { body: 'public thought', visibility: 'public' });
    await alice('POST', `/api/journal/${entry.id}/notes`, { body: 'private thought', visibility: 'private' });

    assert.equal((await alice('POST', '/api/friends/requests', { username: 'alice' })).status, 400);
    await befriend(alice, bob, 'bob');
    assert.equal((await alice('POST', '/api/friends/requests', { username: 'bob' })).status, 409);

    const bobFeed = await bob('GET', '/api/feed');
    assert.deepEqual(bobFeed.body.items.map((i) => i.body), ['public thought']);
    assert.equal((await carol('GET', '/api/feed')).body.items.length, 0);

    const search = await carol('GET', '/api/users/search?q=al');
    assert.deepEqual(search.body.users.map((u) => u.username), ['alice']);

    // Reciprocal request auto-accepts.
    await carol('POST', '/api/friends/requests', { username: 'alice' });
    assert.equal((await alice('POST', '/api/friends/requests', { username: 'carol' })).body.status, 'accepted');
    assert.equal((await alice('GET', '/api/friends')).body.friends.length, 2);
  } finally {
    await s.close();
  }
});

test('sharing: only with friends, includes notes, recipient can save to journal', async () => {
  const s = await startServer();
  try {
    const alice = await signUp(s.base, 'alice');
    const bob = await signUp(s.base, 'bob');
    const carol = await signUp(s.base, 'carol');
    await befriend(alice, bob, 'bob');

    const { body: { entry } } = await alice('POST', '/api/journal', { reference: 'John 3:16', version: 'KJV', text: 'For God so loved the world' });
    const { body: { note } } = await alice('POST', `/api/journal/${entry.id}/notes`, { body: 'for you', visibility: 'private' });

    assert.equal((await alice('POST', '/api/shares', { username: 'carol', entryId: entry.id })).status, 403);
    assert.equal((await bob('POST', '/api/shares', { username: 'alice', entryId: entry.id })).status, 404);

    const shared = await alice('POST', '/api/shares', { username: 'bob', entryId: entry.id, noteId: note.id, message: 'Read this' });
    assert.equal(shared.status, 201);

    const inbox = await bob('GET', '/api/shares/inbox');
    assert.equal(inbox.body.shares.length, 1);
    const item = inbox.body.shares[0];
    assert.equal(item.fromUsername, 'alice');
    assert.equal(item.noteBody, 'for you');
    assert.equal(item.message, 'Read this');
    assert.equal((await carol('GET', '/api/shares/inbox')).body.shares.length, 0);

    assert.equal((await carol('POST', `/api/shares/${item.id}/save`)).status, 404);
    const copy = await bob('POST', `/api/shares/${item.id}/save`);
    assert.equal(copy.status, 201);
    assert.equal((await bob('GET', '/api/journal')).body.entries[0].reference, 'John 3:16');

    assert.equal((await bob('DELETE', `/api/shares/${item.id}`)).status, 200);
    assert.equal((await bob('GET', '/api/shares/inbox')).body.shares.length, 0);
  } finally {
    await s.close();
  }
});

test('auth: login, logout, wrong password, duplicate username, non-JSON writes rejected', async () => {
  const s = await startServer();
  try {
    await signUp(s.base, 'alice');
    const c = client(s.base);
    assert.equal((await c('POST', '/api/register', { username: 'ALICE', password: 'password123' })).status, 409);
    assert.equal((await c('POST', '/api/login', { username: 'alice', password: 'nope-nope' })).status, 401);
    assert.equal((await c('POST', '/api/login', { username: 'alice', password: 'password123' })).status, 200);
    assert.equal((await c('GET', '/api/me')).body.user.username, 'alice');
    await c('POST', '/api/logout');
    assert.equal((await c('GET', '/api/me')).status, 401);

    const form = await fetch(`${s.base}/api/login`, { method: 'POST', body: 'username=alice' });
    assert.equal(form.status, 415);
  } finally {
    await s.close();
  }
});

test('static UI is served', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Bible Journal/);
    assert.equal((await fetch(`${s.base}/..%2Fserver.js`)).status, 404);

    // Home-screen install files.
    const manifest = await fetch(`${s.base}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    const { icons } = await manifest.json();
    for (const icon of icons) {
      const res = await fetch(`${s.base}/${icon.src}`);
      assert.equal(res.headers.get('content-type'), 'image/png', icon.src);
    }
    assert.match((await fetch(`${s.base}/sw.js`)).headers.get('content-type'), /javascript/);
  } finally {
    await s.close();
  }
});
