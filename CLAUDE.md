# Instructions for Claude

## Analyzing complex topics

When analyzing any complex topic, problem, or decision, do not provide a single uniform answer. Instead, break down your response into 5 distinct viewpoints:

1. **The Pragmatist / Operator:** Focuses on execution, feasibility, cost, and real-world implementation.
2. **The Visionary / Futurist:** Focuses on long-term potential, innovation, paradigm shifts, and scaling.
3. **The Skeptic / Risk Analyst:** Focuses on failure modes, hidden flaws, downside risks, and second-order negative effects.
4. **The End-User / Customer:** Focuses on usability, emotional resonance, friction points, and human experience.
5. **The Economist / Strategist:** Focuses on ROI, competitive advantage, resource allocation, and market dynamics.

## Working on this project

- **The game:** 辣子鸡 — Find The Chicken. It is a single-file mobile web game (`index.html`, with inline CSS and JS and no build step), hosted on GitHub Pages and installed on iPhone as a home-screen app.
- **Supporting files:**
  - `audio/music.mp3` is the background music. The splash shows its download on a power-meter bar and waits for it to finish (at least 2 s, at most 30 s).
  - `sw.js` is the service worker. Bump its cache name when the cached files change. Pages are network-first and saved under their own address; other files are cache-first.
  - `manifest.webmanifest` is the app manifest.
  - `icons/` holds the app icons. `icons/launch/` holds the iPhone launch images (the gold splash without its text). Re-make them with `npm run launch-images` after changing the splash background or chili.
  - `tests/iphone-home-screen.js` checks the iPhone home-screen cases and the 44 px menu buttons. It runs on every pull request (`.github/workflows/iphone-checks.yml`), or locally with `npm install && npm test`.
  - `prototype-3d/` is a separate, playable 3D mockup (three.js from cdnjs). Nothing in the game links to it.
- **Player's choices to keep:**
  - The Challenge results titles (什么!?, 你可以做得更好, 其实, 非常好) are intentional flavour; don't change them.
  - The splash waits for the music to fully load, rather than capping the wait.
  - The power meter uses the particle fire (`createMeterFire`) on both the splash and Challenge.
  - At power-up the fire rises over "Power!"; keep it. The word punches in, beats and ripples instead.
  - Buttons meet Apple's 44 pt minimum: icons, the gear, back buttons, Challenge and Relax are 44 px. Upgrades and the plate-screen back button keep their look, with an invisible 44 px tap area.
  - A ranked Challenge run is saved straight away under the last name used (or "YOU"); typing a name renames it. The leaderboard has a two-tap Reset, which also clears the best Challenge score.
  - Tossed chilies tumble off the plate (`tumbleOffPlate`): they arc up, flip end over end, land on the table with a small bounce, rest, then fade. The player approved the speed and timing; no landing sound.
- **Performance (hot phone, then a laggy look):** the plate holds about 400 pieces, so per-frame work on it is expensive, and iPhone Safari is stricter than desktop Chrome.
  - Nothing inside the plate's `.layer` animates continuously. Free chicken have a steady gold glow (set once when freed), and rainbow pieces keep their own colour (a little brighter, warm gold rim) with a soft, still rainbow halo behind.
  - Don't add `will-change` or running animations to pieces inside the pile: Safari then splits every overlapping piece above them into its own layer, which made the game lag badly. The one exception is the dragged chili, which is the topmost piece while held.
  - Never animate `filter` or `box-shadow`. Set a filter once if needed, and animate only `transform` and `opacity`.
  - Tossed chilies fly in `.flight-layer`, above the plate, with a fixed drop-shadow.
  - Desktop Chromium numbers don't prove it's smooth on the phone. Always ask the player to try it on the iPhone.
- **Previews:** show a preview or mockup before making design changes to the game.
- **Prototypes:** build experimental ideas as separate prototypes, not in the game.
- **Merging:** ask before opening and merging a pull request.
- **Testing:**
  - Use phone emulation (`isMobile: true`).
  - Check the iPhone home-screen (standalone) cases: the viewport is short at launch, the layout is 980 px wide before the viewport meta is parsed, and the keyboard resizes the viewport.
  - The service worker only registers over https, so test it on a local copy with that check removed.
  - First-play hint: clear `localStorage` (or use a fresh browser context) to see it again.

## Next to-dos

0. **In progress, not merged** (branch `claude/gifted-planck-x80p4w`): the tumbling toss (first version) with the steady-glow approach above. An earlier attempt with a pulsing halo and extra layers lagged badly on the iPhone and was reverted. Next: the player tries it on the phone, then get approval and merge.
1. **Friends competition:** leaderboards are saved per phone only. Idea: a daily shared plate plus a shareable score card.
2. **3D direction:** the middle route (2D with the 3D-style tumble) is being tried first, see item 0. The full 3D rebuild (`prototype-3d/`) is on hold.
3. **Visit count:** a simple, privacy-friendly count (for example GoatCounter, which needs a sign-up and a change to the page's Content-Security-Policy). Skipped for now.
4. **Smaller buttons still under 44 px** (not on the original list): the plate-screen arrows (32), the Music and Sound "On" toggles, and the plate dots.
