# Bible Journal

Paste a Bible verse from any app or website, and the app tidies it up and saves
it to your own journal. You can write public or private notes on your verses,
add friends, and share verses and notes with each other.

## Trying it on your computer

1. Install Node.js (the **LTS** version) from https://nodejs.org. Version 22.13 or newer is needed.
2. Double-click **Start Bible Journal.command** (Mac) or **Start Bible Journal.bat** (Windows).
   - Mac: if it says the file is from an unidentified developer, right-click it, choose **Open**, then **Open** again.
   - Windows: if a blue "Windows protected your PC" box appears, click **More info**, then **Run anyway**.
   - If your computer asks whether to allow incoming network connections, click **Allow**. The phone needs this.
3. The window shows two addresses. Open the first in your computer's browser.
   To use your phone, connect it to the same Wi‑Fi and open the "On your phone" address.
4. Keep the window open while you use the app. Close it, or press Ctrl+C, to stop.

Everything you save is kept in `data.sqlite` in this folder. Delete that file to start again with no accounts.

## For developers

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
  You can check and edit the result before saving.
- **Reference from the words**: if there's no reference, the app works out which verse it is from the words alone.
  Typing just `for God so love the world` suggests John 3:16, shown in grey in the Reference box.
  It's used if you don't type your own, and other likely verses appear as buttons to tap.
  Longer passages get a range, such as `Psalm 23:1-3`.
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

## Bible text

Verse matching searches the King James Version, which is public domain (`data/kjv.json`,
from [thiagobodruk/bible](https://github.com/thiagobodruk/bible), MIT licence).
Matching allows for modern wording, so NKJV, NIV or ESV quotes are usually recognised too.
A verse worded very differently from the KJV may not be. For example, "love is patient" is "charity suffereth long" in the KJV.

## Deploying

Set `SECURE_COOKIES=1` when serving over HTTPS. Set `PORT` to change the port.
