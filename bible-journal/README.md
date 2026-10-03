# Bible Journal

Paste a Bible verse from any app or website, and the app tidies it up and saves
it to your own journal. You can write public or private notes on your verses,
add friends, and share verses and notes with each other.

No dependencies: it uses Node's built-in HTTP server and SQLite (`node:sqlite`).

```sh
cd bible-journal
npm start          # http://localhost:3000
npm test
```

Requires Node 22.13 or newer. Data is stored in `data.sqlite` (override with `DB_FILE`).

## Features

- **Paste and tidy**: paste a verse copied from YouVersion, BibleGateway or anywhere else.
  The app finds the reference (`Jn 3:16` becomes `John 3:16`) and the version (NKJV, KJV, NIV, ESV and more).
  It removes verse numbers, footnote and cross-reference markers (`[a]`, `(A)`), links,
  copyright lines, hidden characters, wrapping quotes and messy spacing.
  You can check and edit the result before saving. If no reference was found, you type it in.
- **Journal**: *Save to my journal* keeps the verse with its reference and version.
- **Notes**: add notes to any saved verse and set each one to 🔒 Private or 🌐 Public.
  Your friends see your public notes in their *Friends' notes* tab.
- **Friends**: search for people by username or name, then send, accept, decline or cancel requests.
  If two people send each other a request, they become friends right away.
- **Sharing**: share a saved verse with a friend, with or without one of your notes and an optional message.
  Sharing a private note shows it only to that friend. The friend can save the verse into their own journal.

## Installing on a phone

The app can be added to a phone's home screen. It then opens full-screen with its own icon, like an app.

- **iPhone:** open the app in Safari, tap the Share button, then **Add to Home Screen**.
- **Android:** open the app in Chrome, tap the ⋮ menu, then **Add to Home screen** or **Install app**.

Android only offers the full install when the app is served over HTTPS, i.e. once it's online.
On a home Wi‑Fi address (`http://192.168…`) it adds a shortcut instead.

## Deploying

Set `SECURE_COOKIES=1` when serving over HTTPS. Set `PORT` to change the port.
