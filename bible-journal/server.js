'use strict';

const http = require('node:http');
const path = require('node:path');
const { openDatabase } = require('./src/db');
const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data.sqlite');

const db = openDatabase(dbFile);
const app = createApp({ db, secureCookies: process.env.SECURE_COOKIES === '1' });

http.createServer(app).listen(port, () => {
  console.log(`Bible Journal running at http://localhost:${port}`);
});
