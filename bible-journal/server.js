'use strict';

const http = require('node:http');
const path = require('node:path');
const { openDatabase } = require('./src/db');
const { createBibleService } = require('./src/bible');
const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data.sqlite');

const db = openDatabase(dbFile);
const bible = createBibleService();
const app = createApp({ db, bible, secureCookies: process.env.SECURE_COOKIES === '1' });

http.createServer(app).listen(port, () => {
  const nkjv = bible.listVersions().find((v) => v.id === 'NKJV');
  console.log(`Bible Journal running at http://localhost:${port}`);
  if (!nkjv.available) {
    console.log('NKJV is not configured (set API_BIBLE_KEY and BIBLE_ID_NKJV); lookups fall back to KJV.');
  }
});
