'use strict';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Bible Journal needs Node.js 22.13 or newer, but this computer has ${process.version}.`);
  console.error('Download the LTS version from https://nodejs.org, install it, then try again.');
  process.exit(1);
}

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./src/db');
const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data.sqlite');

const db = openDatabase(dbFile);
const app = createApp({ db, secureCookies: process.env.SECURE_COOKIES === '1' });

// Addresses other devices on the same Wi-Fi can use to reach this computer.
function networkAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

const server = http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Bible Journal may already be running in another window.`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  console.log('');
  console.log('Bible Journal is running.');
  console.log('');
  console.log(`  On this computer:  http://localhost:${port}`);
  for (const address of networkAddresses()) {
    console.log(`  On your phone:     http://${address}:${port}   (phone must be on the same Wi-Fi)`);
  }
  console.log('');
  console.log('Keep this window open while you use the app. Press Ctrl+C to stop.');
});
