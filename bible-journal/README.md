# Bible Journal

Look up Bible verses, save them to your own journal, write public or private
notes on them, add friends, and share verses and notes with each other.

No dependencies: it uses Node's built-in HTTP server and SQLite (`node:sqlite`).

```sh
cd bible-journal
npm start          # http://localhost:3000
npm test
```

Requires Node 22.13 or newer. Data is stored in `data.sqlite` (override with `DB_FILE`).

## Features

- **Verse lookup**: type a reference such as `John 3:16` or `Psalm 23:1-3`. NKJV is the default.
- **Version dropdown**: NKJV, KJV, WEB, ASV, BBE, YLT, Darby, NIV, ESV and NLT.
- **Journal**: *Save to my journal* stores the verse text with its reference and version.
- **Notes**: add notes to any saved verse and set each one to 🔒 Private or 🌐 Public.
  Your friends see your public notes in their *Friends' notes* tab.
- **Friends**: search for people by username or name, then send, accept, decline or cancel requests.
  If two people send each other a request, they become friends right away.
- **Sharing**: share a saved verse with a friend, with or without one of your notes and an optional message.
  Sharing a private note shows it only to that friend. The friend can save the verse into their own journal.

## NKJV and other copyrighted translations

The NKJV belongs to Thomas Nelson, so it can't be bundled with the app or fetched
from a free public API. The same goes for NIV, ESV and NLT. The app fetches these
from [API.Bible](https://scripture.api.bible) once you have a key and access to
that translation there:

```sh
API_BIBLE_KEY=your-key BIBLE_ID_NKJV=<api.bible id> npm start
# optional: BIBLE_ID_NIV, BIBLE_ID_ESV, BIBLE_ID_NLT
```

Until a translation is set up, the dropdown marks it "(not licensed here)". Looking
up a verse in it shows the KJV text, with a notice that says so.
The public-domain translations (KJV, WEB, ASV, BBE, YLT, Darby) come from
[bible-api.com](https://bible-api.com) and need no setup.

## Deploying

Set `SECURE_COOKIES=1` when serving over HTTPS. Set `PORT` to change the port.
