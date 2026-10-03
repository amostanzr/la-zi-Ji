'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { openDatabase } = require('../src/db');
const { createBibleService, htmlToText } = require('../src/bible');
const { createApp } = require('../src/app');

// Fake upstream Bible APIs so tests never hit the network.
function fakeFetch(calls) {
  return async (url, opts = {}) => {
    calls.push({ url, opts });
    const json = (status, body) => ({ status, ok: status < 400, json: async () => body });
    if (url.startsWith('https://bible-api.com/')) {
      const u = new URL(url);
      const ref = decodeURIComponent(u.pathname.slice(1));
      if (ref.startsWith('Nowhere')) return json(404, { error: 'not found' });
      return json(200, {
        reference: ref,
        text: `[${u.searchParams.get('translation')}] For God so loved the world\n`,
      });
    }
    if (url.startsWith('https://api.scripture.api.bible/')) {
      return json(200, {
        data: { passages: [{ reference: 'John 3:16', content: '<p><span class="v">16</span>For God so loved the world</p>' }] },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

async function startServer(env = {}) {
  const calls = [];
  const db = openDatabase(':memory:');
  const bible = createBibleService({ fetchImpl: fakeFetch(calls), env });
  const server = http.createServer(createApp({ db, bible }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, close: () => new Promise((r) => server.close(r)) };
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

test('NKJV is the default and falls back to KJV with a notice when not licensed', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const versions = await c('GET', '/api/versions');
    assert.equal(versions.body.defaultVersion, 'NKJV');
    assert.ok(versions.body.versions.length >= 5);
    assert.equal(versions.body.versions.find((v) => v.id === 'NKJV').available, false);

    const r = await c('GET', '/api/verse?ref=John%203:16');
    assert.equal(r.status, 200);
    assert.equal(r.body.version, 'KJV');
    assert.match(r.body.notice, /NKJV/);
    assert.equal(r.body.text, '[kjv] For God so loved the world');
  } finally {
    await s.close();
  }
});

test('NKJV is fetched from API.Bible when a key and bible id are configured', async () => {
  const s = await startServer({ API_BIBLE_KEY: 'k', BIBLE_ID_NKJV: 'nkjv-id' });
  try {
    const r = await client(s.base)('GET', '/api/verse?ref=John%203:16&version=NKJV');
    assert.equal(r.status, 200);
    assert.equal(r.body.version, 'NKJV');
    assert.equal(r.body.notice, undefined);
    assert.equal(r.body.text, 'For God so loved the world');
    const call = s.calls.at(-1);
    assert.match(call.url, /bibles\/nkjv-id\/search/);
    assert.equal(call.opts.headers['api-key'], 'k');
  } finally {
    await s.close();
  }
});

test('version dropdown choices are honoured; bad input is rejected', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    assert.equal((await c('GET', '/api/verse?ref=John%203:16&version=WEB')).body.version, 'WEB');
    assert.equal((await c('GET', '/api/verse?ref=John%203:16&version=XYZ')).status, 400);
    assert.equal((await c('GET', '/api/verse?ref=%3Cscript%3E')).status, 400);
    assert.equal((await c('GET', '/api/verse?ref=Nowhere%201:1&version=KJV')).status, 404);
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

    const saved = await alice('POST', '/api/journal', { reference: 'John 3:16', version: 'WEB' });
    assert.equal(saved.status, 201);
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

    const { body: { entry } } = await alice('POST', '/api/journal', { reference: 'Psalm 23:1', version: 'KJV' });
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

    const { body: { entry } } = await alice('POST', '/api/journal', { reference: 'John 3:16', version: 'KJV' });
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
  } finally {
    await s.close();
  }
});

test('htmlToText strips API.Bible markup and verse numbers', () => {
  assert.equal(htmlToText('<p><span class="v">1</span>In the beginning&nbsp;God</p>'), 'In the beginning God');
});
