# Cat Beat

`cat-beat.html` is a free, four-lane browser rhythm game, linked from the homepage. Play with D/F/J/K, pointer/touch taps, or the focused pad buttons. Physical fidgets do not send game input. No sign-in, purchases, or inventory availability are required to play.

Cozy, Groove and Zoomies run at 90, 110 and 128 BPM. Each chart has 32 beats after a 2.4-second lead-in; harder charts add half-beat notes and occasional chords. Charts use a seeded generator. Original music and Clicky/Creamy effects are synthesized with Web Audio, not recordings of the products. Audio starts through a user interaction and can be muted; the game also works without audio support.

Timing scores: within 55 ms = 1,000 points; within 100 ms = 700; within 160 ms = 400. Missed notes break the combo; stray taps break the combo and subtract 100 points without going below zero. Accuracy includes missed notes and penalties. Personal bests are stored per difficulty in `clickerlab_cat_beat_scores_v1`, separate from the shopping cart. Scores are local and are not suitable for a trusted leaderboard or purchase rewards. Copy-score uses the clipboard, with selectable status text as a fallback.

Pause freezes the chart and audio. Changing tabs, losing focus, or opening cart/search pauses the round; resuming requires an explicit click. Settings lock during a round. Reduced-motion styling removes decorative pad transitions; falling notes remain part of gameplay.

Players choose from the 11 existing keycap images, either switch style, and five light colors per key. “Build my clicker” passes four-key light-up selections to Build Your Own. The builder validates the entire preset, uses existing prices, and retains normal live inventory and cart checks. Invalid presets are ignored. Visiting either page never adds or reserves stock automatically. Server Checkout still validates all product selections and prices.

## Verification

Run the existing suite plus game scoring tests:

```sh
node --test tests/*.test.mjs tests/*.test.cjs
python tests/orders.test.py
```

For the browser smoke test, serve the checkout locally on port 8791 and use Playwright Core with Chromium. The test mocks inventory and never contacts payment or shipping providers:

```sh
python -m http.server 8791 --bind 127.0.0.1
# In a separate terminal; use the installed Playwright Core module:
PLAYWRIGHT_MODULE=/workspace/.clickerlab-browser-tools/node_modules/playwright-core node tests/cat-beat.browser.cjs
```

Optional variables: `CAT_BEAT_URL`, `CHROMIUM_EXECUTABLE`, `CAT_BEAT_ARTIFACT_DIR` (defaults to `/tmp`). Browser checks cover desktop/mobile layouts, touch/keyboard scoring, repeat-key suppression, pause/resume/restart, separate persistent scores, pictured keycap selection, builder/cart handoff, malformed presets, and failed inventory checks. Screenshots are written outside the checkout.

Review and approve merge/deployment before publishing. This feature changes static assets and builder preset handling; it requires no Worker code changes or D1 migration.
