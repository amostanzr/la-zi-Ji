// Renders the iPhone launch images (icons/launch/) from the splash in index.html, so a home-screen
// launch shows the gold splash straight away instead of a black or grey screen.
// The title and loading bar are left off: the system fonts here differ from the iPhone's, so the
// page draws those itself a moment later. Re-run after changing the splash's background or chili.
//
//   npm install && node tools/make-launch-images.js
//
// Each size here needs a matching <link rel="apple-touch-startup-image"> in index.html.
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

// CSS width, height and pixel ratio of every iPhone screen since the first SE (portrait only)
const DEVICES = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [390, 844, 3],
  [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [420, 912, 3]
];

(async () => {
  const root = path.join(__dirname, '..');
  const browser = await chromium.launch();
  for (const [w, h, dpr] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.route('**/audio/**', r => r.abort());   // keeps the splash up
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.addStyleTag({ content: `
      .splash .cn-title, .splash-name, #splash-load{visibility:hidden !important;}
      .splash-chili{animation:none !important; transform:rotate(-3deg);}   /* where its bob starts */
    ` });
    await page.waitForTimeout(150);
    const file = path.join(root, 'icons', 'launch', `launch-${w * dpr}x${h * dpr}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(path.relative(root, file));
    await ctx.close();
  }
  await browser.close();
})();
