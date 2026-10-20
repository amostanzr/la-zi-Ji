// Checks the iPhone home-screen (standalone) cases from CLAUDE.md in an emulated iPhone 14 Pro:
//   1. the viewport is one status bar short at launch, but the game still fills the whole screen;
//   2. the page lays out 980 px wide until the viewport meta is parsed, so nothing may measure before it;
//   3. the on-screen keyboard shrinks the viewport, and the plate must not shrink or stay shifted after.
// Plus: the main menu buttons answer taps across Apple's 44 pt minimum. Run with `npm test`; exits 1 on any failure.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SCREEN = { width: 393, height: 852 };   // iPhone 14 Pro, in CSS px
const STATUS_BAR = 47;                        // how short the viewport is at a home-screen launch
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

function serve(){
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if(!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// what a home-screen launch reports: navigator.standalone and the standalone display mode
function pretendStandalone(){
  Object.defineProperty(navigator, 'standalone', { get: () => true });
  const realMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => /display-mode:\s*standalone/.test(query)
    ? { matches: true, media: query, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } }
    : realMatchMedia(query);
}

const results = [];
function check(name, ok, detail){
  results.push(ok);
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail ? ` (${detail})` : ''}`);
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];

  async function open({ standalone, viewportHeight }){
    const ctx = await browser.newContext({
      viewport: { width: SCREEN.width, height: viewportHeight }, screen: SCREEN,
      deviceScaleFactor: 3, isMobile: true, hasTouch: true
    });
    if(standalone) await ctx.addInitScript(pretendStandalone);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  }
  const cssVar = (page, name) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const splashGone = page => page.waitForSelector('#splash', { state: 'detached', timeout: 40000 });
  const plateWidth = page => page.evaluate(() => Math.round(document.getElementById('plate').getBoundingClientRect().width));
  // resize the viewport the way the keyboard does: the screen itself stays the same size
  // (Playwright's setViewportSize would shrink the emulated screen too)
  const sessions = new WeakMap();
  async function setViewportHeight(page, height){
    if(!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
    await sessions.get(page).send('Emulation.setDeviceMetricsOverride', {
      width: SCREEN.width, height, deviceScaleFactor: 3, mobile: true, screenWidth: SCREEN.width, screenHeight: SCREEN.height
    });
  }

  try {
    // ---- 1. short viewport at a home-screen launch ----
    console.log('Home-screen launch, viewport one status bar short');
    {
      const page = await open({ standalone: true, viewportHeight: SCREEN.height - STATUS_BAR });
      check('splash is laid out at the full screen height from the first frame', await cssVar(page, '--splash-h') === SCREEN.height + 'px', await cssVar(page, '--splash-h'));
      const splashH = await page.evaluate(() => document.getElementById('splash').getBoundingClientRect().height);
      check('splash covers the whole screen', splashH >= SCREEN.height, `${splashH}px`);
      await splashGone(page);
      check('game uses the full screen height after loading', await cssVar(page, '--full-h') === SCREEN.height + 'px', await cssVar(page, '--full-h'));
      const decoH = await page.evaluate(() => document.getElementById('table-deco').getBoundingClientRect().height);
      check('table reaches the bottom of the screen', decoH >= SCREEN.height, `${decoH}px`);
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      check('no sideways scrolling', scrollW <= SCREEN.width, `${scrollW}px wide`);

      // a button may look smaller than 44 px, as long as taps across 44 px reach it
      const small = await page.evaluate(() => ['challenge-btn', 'zen-btn', 'skin-btn', 'leaderboard-btn', 'menu-sound-btn'].map(id => {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, reach = 21.5;
        const hits = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
        const w = hits(cx - reach, cy) && hits(cx + reach, cy) ? 44 : Math.round(r.width);
        const h = hits(cx, cy - reach) && hits(cx, cy + reach) ? 44 : Math.round(r.height);
        return { id, w: Math.max(w, Math.round(r.width)), h: Math.max(h, Math.round(r.height)) };
      }).filter(b => b.w < 44 || b.h < 44));
      check('menu buttons answer taps across at least 44 px', small.length === 0, small.map(b => `${b.id} ${b.w}x${b.h}`).join(', '));
      await page.context().close();
    }

    // ---- 2. 980 px layout before the viewport meta ----
    console.log('Layout before the viewport meta is parsed');
    {
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const meta = html.indexOf('<meta name="viewport"');
      const firstScript = html.indexOf('<script'), firstStyle = html.indexOf('<style');
      check('viewport meta comes before the first script and style', meta > -1 && meta < firstScript && meta < firstStyle);
      // in a Safari tab the early script measures innerHeight; if it ran on the 980 px layout it would
      // get a height far taller than the screen and skip setting --splash-h
      const tabHeight = 660;
      const page = await open({ standalone: false, viewportHeight: tabHeight });
      check('early script measured the phone layout, not 980 px', await cssVar(page, '--splash-h') === tabHeight + 'px', await cssVar(page, '--splash-h') || 'not set');
      check('page is phone width', await page.evaluate(() => document.documentElement.clientWidth) === SCREEN.width);
      await page.context().close();
    }

    // ---- 3. keyboard resizes the viewport ----
    console.log('Keyboard opening and closing over the name field');
    {
      const launchH = SCREEN.height - STATUS_BAR;
      const page = await open({ standalone: true, viewportHeight: launchH });
      await splashGone(page);
      // show the results card with its name field (reaching a ranked score needs real play)
      await page.evaluate(() => {
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('end-screen').classList.remove('hidden');
        document.getElementById('leaderboard-name-entry').classList.remove('hidden');
      });
      await page.waitForTimeout(300);
      const before = await plateWidth(page);
      await page.focus('#leaderboard-name-input');
      await setViewportHeight(page, launchH - 336);   // keyboard up
      await page.waitForTimeout(400);
      check('plate keeps its size while typing', await plateWidth(page) === before, `${before} → ${await plateWidth(page)}`);
      check('full height is kept while typing', await cssVar(page, '--full-h') === SCREEN.height + 'px', await cssVar(page, '--full-h'));
      await page.keyboard.type('ab1');
      check('name is upper-cased', await page.inputValue('#leaderboard-name-input') === 'AB1');
      await page.keyboard.press('Enter');   // Return closes the keyboard
      check('Return closes the keyboard', await page.evaluate(() => document.activeElement.id !== 'leaderboard-name-input'));
      await setViewportHeight(page, launchH);         // keyboard gone
      await page.waitForTimeout(1100);
      check('plate is back to full size', await plateWidth(page) === before, `${before} → ${await plateWidth(page)}`);
      check('page is scrolled back to the top', await page.evaluate(() => window.scrollY) === 0);
      check('full height is the whole screen again', await cssVar(page, '--full-h') === SCREEN.height + 'px', await cssVar(page, '--full-h'));
      await page.context().close();
    }

    check('no script errors', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
