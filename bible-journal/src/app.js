'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verifyPassword, createSession, userForToken, destroySession } = require('./auth');
const { BibleError } = require('./bible');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE = 'bj_session';
const MAX_BODY = 64 * 1024;
const MAX_NOTE = 10000;
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- small HTTP helpers ----------

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(data);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, {
    'Content-Type': STATIC_TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---------- app ----------

function createApp({ db, bible, secureCookies = false }) {
  const routes = [];
  const route = (method, pattern, handler, { auth = true } = {}) => {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$'
    );
    routes.push({ method, re, keys, handler, auth });
  };

  const sessionCookie = (token, maxAge) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  // ----- queries -----

  const q = {
    userByName: db.prepare('SELECT id, username, display_name AS displayName FROM users WHERE username = ?'),
    friendship: db.prepare(
      `SELECT requester_id AS requesterId, addressee_id AS addresseeId, status FROM friendships
        WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
    ),
    entry: db.prepare('SELECT * FROM journal_entries WHERE id = ?'),
    note: db.prepare('SELECT * FROM notes WHERE id = ?'),
  };

  function areFriends(a, b) {
    const row = q.friendship.get(a, b, b, a);
    return Boolean(row && row.status === 'accepted');
  }

  function ownedEntry(user, id) {
    const entry = q.entry.get(Number(id));
    if (!entry || entry.user_id !== user.id) throw new HttpError(404, 'Journal entry not found.');
    return entry;
  }

  function ownedNote(user, id) {
    const note = q.note.get(Number(id));
    if (!note || note.user_id !== user.id) throw new HttpError(404, 'Note not found.');
    return note;
  }

  function noteJson(n) {
    return {
      id: n.id,
      entryId: n.entry_id,
      body: n.body,
      visibility: n.visibility,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    };
  }

  function entryJson(e) {
    return { id: e.id, reference: e.reference, version: e.version, text: e.text, createdAt: e.created_at };
  }

  function requireText(value, field, max) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new HttpError(400, `${field} is required.`);
    if (text.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
    return text;
  }

  function requireVisibility(value) {
    if (value !== 'public' && value !== 'private') {
      throw new HttpError(400, 'Visibility must be "public" or "private".');
    }
    return value;
  }

  // ----- auth -----

  route('POST', '/api/register', async ({ body, res }) => {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const displayName = String(body.displayName || '').trim() || username;
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
      throw new HttpError(400, 'Username must be 3-30 letters, numbers or underscores.');
    }
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    if (displayName.length > 60) throw new HttpError(400, 'Display name is too long.');
    if (q.userByName.get(username)) throw new HttpError(409, 'That username is taken.');
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username, displayName, hashPassword(password));
    const session = createSession(db, Number(lastInsertRowid));
    sendJson(res, 201, { user: { id: Number(lastInsertRowid), username, displayName } }, {
      'Set-Cookie': sessionCookie(session.token, session.maxAge),
    });
  }, { auth: false });

  route('POST', '/api/login', async ({ body, res }) => {
    const row = db
      .prepare('SELECT id, username, display_name AS displayName, password_hash AS hash FROM users WHERE username = ?')
      .get(String(body.username || '').trim());
    if (!row || !verifyPassword(String(body.password || ''), row.hash)) {
      throw new HttpError(401, 'Wrong username or password.');
    }
    const session = createSession(db, row.id);
    sendJson(res, 200, { user: { id: row.id, username: row.username, displayName: row.displayName } }, {
      'Set-Cookie': sessionCookie(session.token, session.maxAge),
    });
  }, { auth: false });

  route('POST', '/api/logout', async ({ token, res }) => {
    destroySession(db, token);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }, { auth: false });

  route('GET', '/api/me', async ({ user }) => ({ user }));

  // ----- bible -----

  route('GET', '/api/versions', async () => ({
    defaultVersion: bible.defaultVersion,
    versions: bible.listVersions(),
  }), { auth: false });

  route('GET', '/api/verse', async ({ query }) => bible.lookup(query.get('ref'), query.get('version') || bible.defaultVersion), { auth: false });

  // ----- journal -----

  route('GET', '/api/journal', async ({ user }) => {
    const entries = db
      .prepare('SELECT * FROM journal_entries WHERE user_id = ? ORDER BY created_at DESC, id DESC')
      .all(user.id);
    const notes = db
      .prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at ASC, id ASC')
      .all(user.id);
    return {
      entries: entries.map((e) => ({
        ...entryJson(e),
        notes: notes.filter((n) => n.entry_id === e.id).map(noteJson),
      })),
    };
  });

  route('POST', '/api/journal', async ({ user, body, res }) => {
    // Re-fetch the verse server-side so the stored text is authentic.
    const verse = await bible.lookup(body.reference, body.version || bible.defaultVersion);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO journal_entries (user_id, reference, version, text) VALUES (?, ?, ?, ?)')
      .run(user.id, verse.reference, verse.version, verse.text);
    sendJson(res, 201, { entry: { ...entryJson(q.entry.get(Number(lastInsertRowid))), notes: [] } });
  });

  route('DELETE', '/api/journal/:id', async ({ user, params }) => {
    const entry = ownedEntry(user, params.id);
    db.prepare('DELETE FROM journal_entries WHERE id = ?').run(entry.id);
    return { ok: true };
  });

  // ----- notes -----

  route('POST', '/api/journal/:id/notes', async ({ user, params, body, res }) => {
    const entry = ownedEntry(user, params.id);
    const text = requireText(body.body, 'Note', MAX_NOTE);
    const visibility = requireVisibility(body.visibility || 'private');
    const { lastInsertRowid } = db
      .prepare('INSERT INTO notes (entry_id, user_id, body, visibility) VALUES (?, ?, ?, ?)')
      .run(entry.id, user.id, text, visibility);
    sendJson(res, 201, { note: noteJson(q.note.get(Number(lastInsertRowid))) });
  });

  route('PATCH', '/api/notes/:id', async ({ user, params, body }) => {
    const note = ownedNote(user, params.id);
    const text = body.body === undefined ? note.body : requireText(body.body, 'Note', MAX_NOTE);
    const visibility = body.visibility === undefined ? note.visibility : requireVisibility(body.visibility);
    db.prepare("UPDATE notes SET body = ?, visibility = ?, updated_at = datetime('now') WHERE id = ?")
      .run(text, visibility, note.id);
    return { note: noteJson(q.note.get(note.id)) };
  });

  route('DELETE', '/api/notes/:id', async ({ user, params }) => {
    const note = ownedNote(user, params.id);
    db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
    return { ok: true };
  });

  // ----- friends -----

  route('GET', '/api/friends', async ({ user }) => {
    const rows = db
      .prepare(
        `SELECT f.status, f.requester_id AS requesterId, u.id, u.username, u.display_name AS displayName
           FROM friendships f
           JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
          WHERE f.requester_id = ? OR f.addressee_id = ?
          ORDER BY u.username`
      )
      .all(user.id, user.id, user.id);
    const person = (r) => ({ id: r.id, username: r.username, displayName: r.displayName });
    return {
      friends: rows.filter((r) => r.status === 'accepted').map(person),
      incoming: rows.filter((r) => r.status === 'pending' && r.requesterId !== user.id).map(person),
      outgoing: rows.filter((r) => r.status === 'pending' && r.requesterId === user.id).map(person),
    };
  });

  route('GET', '/api/users/search', async ({ user, query }) => {
    const term = String(query.get('q') || '').trim();
    if (term.length < 2) return { users: [] };
    const users = db
      .prepare(
        `SELECT id, username, display_name AS displayName FROM users
          WHERE id != ? AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')
          ORDER BY username LIMIT 20`
      )
      .all(user.id, ...Array(2).fill(`%${term.replace(/[\\%_]/g, '\\$&')}%`));
    return { users };
  });

  route('POST', '/api/friends/requests', async ({ user, body, res }) => {
    const target = q.userByName.get(String(body.username || '').trim());
    if (!target) throw new HttpError(404, 'No user with that username.');
    if (target.id === user.id) throw new HttpError(400, "You can't add yourself.");
    const existing = q.friendship.get(user.id, target.id, target.id, user.id);
    if (existing) {
      if (existing.status === 'accepted') throw new HttpError(409, 'You are already friends.');
      if (existing.requesterId === user.id) throw new HttpError(409, 'Friend request already sent.');
      // They already asked us: sending one back accepts it.
      db.prepare("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?")
        .run(target.id, user.id);
      return sendJson(res, 200, { status: 'accepted' });
    }
    db.prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')")
      .run(user.id, target.id);
    sendJson(res, 201, { status: 'pending' });
  });

  route('POST', '/api/friends/requests/:userId/accept', async ({ user, params }) => {
    const { changes } = db
      .prepare(
        "UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'"
      )
      .run(Number(params.userId), user.id);
    if (!changes) throw new HttpError(404, 'Friend request not found.');
    return { status: 'accepted' };
  });

  // Declines an incoming request, cancels an outgoing one, or unfriends.
  route('DELETE', '/api/friends/:userId', async ({ user, params }) => {
    const other = Number(params.userId);
    const { changes } = db
      .prepare(
        `DELETE FROM friendships
          WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
      )
      .run(user.id, other, other, user.id);
    if (!changes) throw new HttpError(404, 'Not found.');
    return { ok: true };
  });

  // Public notes from friends, newest first.
  route('GET', '/api/feed', async ({ user }) => {
    const rows = db
      .prepare(
        `SELECT n.id, n.body, n.updated_at AS updatedAt, e.reference, e.version, e.text,
                u.username, u.display_name AS displayName
           FROM notes n
           JOIN journal_entries e ON e.id = n.entry_id
           JOIN users u ON u.id = n.user_id
           JOIN friendships f ON f.status = 'accepted'
                AND ((f.requester_id = ? AND f.addressee_id = n.user_id)
                  OR (f.addressee_id = ? AND f.requester_id = n.user_id))
          WHERE n.visibility = 'public'
          ORDER BY n.updated_at DESC, n.id DESC
          LIMIT 100`
      )
      .all(user.id, user.id);
    return { items: rows };
  });

  // ----- sharing -----

  route('POST', '/api/shares', async ({ user, body, res }) => {
    const recipient = q.userByName.get(String(body.username || '').trim());
    if (!recipient || !areFriends(user.id, recipient.id)) {
      throw new HttpError(403, 'You can only share with friends.');
    }
    const entry = ownedEntry(user, body.entryId);
    let noteId = null;
    if (body.noteId !== undefined && body.noteId !== null) {
      const note = ownedNote(user, body.noteId);
      if (note.entry_id !== entry.id) throw new HttpError(400, 'That note belongs to a different verse.');
      noteId = note.id;
    }
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    const { lastInsertRowid } = db
      .prepare('INSERT INTO shares (sender_id, recipient_id, entry_id, note_id, message) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, recipient.id, entry.id, noteId, message);
    sendJson(res, 201, { share: { id: Number(lastInsertRowid) } });
  });

  // Sharing a note explicitly grants the recipient read access to it, even
  // if it is private.
  route('GET', '/api/shares/inbox', async ({ user }) => {
    const rows = db
      .prepare(
        `SELECT s.id, s.message, s.created_at AS createdAt,
                u.username AS fromUsername, u.display_name AS fromDisplayName,
                e.reference, e.version, e.text, n.body AS noteBody
           FROM shares s
           JOIN users u ON u.id = s.sender_id
           JOIN journal_entries e ON e.id = s.entry_id
           LEFT JOIN notes n ON n.id = s.note_id
          WHERE s.recipient_id = ?
          ORDER BY s.created_at DESC, s.id DESC`
      )
      .all(user.id);
    return { shares: rows };
  });

  route('POST', '/api/shares/:id/save', async ({ user, params, res }) => {
    const share = db
      .prepare(
        `SELECT e.reference, e.version, e.text FROM shares s JOIN journal_entries e ON e.id = s.entry_id
          WHERE s.id = ? AND s.recipient_id = ?`
      )
      .get(Number(params.id), user.id);
    if (!share) throw new HttpError(404, 'Share not found.');
    const { lastInsertRowid } = db
      .prepare('INSERT INTO journal_entries (user_id, reference, version, text) VALUES (?, ?, ?, ?)')
      .run(user.id, share.reference, share.version, share.text);
    sendJson(res, 201, { entry: { ...entryJson(q.entry.get(Number(lastInsertRowid))), notes: [] } });
  });

  route('DELETE', '/api/shares/:id', async ({ user, params }) => {
    const { changes } = db.prepare('DELETE FROM shares WHERE id = ? AND recipient_id = ?').run(Number(params.id), user.id);
    if (!changes) throw new HttpError(404, 'Share not found.');
    return { ok: true };
  });

  // ----- dispatcher -----

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && serveStatic(req, res)) return;
        throw new HttpError(404, 'Not found.');
      }

      let match = null;
      let methodMismatch = false;
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        if (r.method !== req.method) { methodMismatch = true; continue; }
        match = { r, m };
        break;
      }
      if (!match) throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Method not allowed.' : 'Not found.');

      // CSRF defence for cookie auth: state-changing requests must be JSON,
      // which a cross-site form cannot send without a CORS preflight.
      if (req.method !== 'GET' && !String(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, 'Requests must use Content-Type: application/json.');
      }

      const token = parseCookies(req.headers.cookie)[COOKIE];
      const user = userForToken(db, token);
      if (match.r.auth && !user) throw new HttpError(401, 'Please log in.');

      const params = {};
      match.r.keys.forEach((k, i) => { params[k] = decodeURIComponent(match.m[i + 1]); });
      const body = req.method === 'GET' ? {} : await readJson(req);

      const result = await match.r.handler({ req, res, user, token, params, body, query: url.searchParams });
      if (result !== undefined && !res.headersSent) sendJson(res, 200, result);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError || err instanceof BibleError) {
        return sendJson(res, err.status, { error: err.message });
      }
      console.error(err);
      sendJson(res, 500, { error: 'Something went wrong.' });
    }
  };
}

module.exports = { createApp };
