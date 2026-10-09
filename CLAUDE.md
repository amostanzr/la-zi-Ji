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
  - `sw.js` is the service worker. Bump its cache name when the cached files change.
  - `manifest.webmanifest` is the app manifest.
  - `icons/` holds the app icons.
- **Previews:** show a preview or mockup before making design changes to the game.
- **Prototypes:** build experimental ideas as separate prototypes, not in the game.
- **Merging:** ask before opening and merging a pull request.
- **Testing:**
  - Use phone emulation (`isMobile: true`).
  - Check the iPhone home-screen (standalone) cases: the viewport is short at launch, the layout is 980 px wide before the viewport meta is parsed, and the keyboard resizes the viewport.
