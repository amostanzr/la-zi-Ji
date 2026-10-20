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
  - `icons/` holds the app icons.
  - `prototype-3d/` is a separate, playable 3D mockup (three.js from cdnjs). Nothing in the game links to it.
- **Player's choices to keep:**
  - The Challenge results titles (什么!?, 你可以做得更好, 其实, 非常好) are intentional flavour; don't change them.
  - The splash waits for the music to fully load, rather than capping the wait.
  - The power meter uses the particle fire (`createMeterFire`) on both the splash and Challenge.
- **Previews:** show a preview or mockup before making design changes to the game.
- **Prototypes:** build experimental ideas as separate prototypes, not in the game.
- **Merging:** ask before opening and merging a pull request.
- **Testing:**
  - Use phone emulation (`isMobile: true`).
  - Check the iPhone home-screen (standalone) cases: the viewport is short at launch, the layout is 980 px wide before the viewport meta is parsed, and the keyboard resizes the viewport.
  - The service worker only registers over https, so test it on a local copy with that check removed.
  - First-play hint: clear `localStorage` (or use a fresh browser context) to see it again.

## Next to-dos

1. **Bigger buttons:** several are below Apple's 44 pt minimum: menu icons and settings gear (40), Challenge and Relax (42), and the Relax "Upgrades" button (28). Not yet decided.
2. **Fire over "Power!":** at power-up the fire rises over the label; ask whether to keep it below the text.
3. **iPhone launch images:** remove the black or grey flash before the gold splash appears.
4. **Automated test:** a small check that runs on each pull request, covering the iPhone home-screen cases.
5. **Friends competition:** leaderboards are saved per phone only. Idea: a daily shared plate plus a shareable score card.
6. **3D direction:** after playing `prototype-3d/`, decide between a full 3D rebuild and a middle route (2D with 3D-style flicks and shadows).
7. **Smaller items:**
   - Simplify saving a leaderboard name.
   - Optionally reset the Challenge leaderboard.
   - Add a simple, privacy-friendly visit count.
