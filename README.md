# ViewCast

Paste a YouTube link, get a full projected performance report — growth
forecast, engagement benchmarks, a title/thumbnail scorecard, and
actionable tips. Runs entirely client-side; no build step, no server, no
API key required to try it.

## Running it

Just open `index.html` in a browser. For the metadata fetch (real video
title/thumbnail via YouTube's oEmbed endpoint) to work reliably, serve it
over `http://` instead of opening it directly as a `file://` path — most
browsers are fine with the fetch either way, but a local server avoids any
edge-case CORS restriction on `file://` origins:

```
cd ViewCast
python -m http.server 8080     # or: npx serve .
# then open http://localhost:8080
```

If the oEmbed fetch fails for any reason (offline, invalid ID, blocked
request), the app falls back to a deterministic synthetic title/channel so
the flow never breaks.

## What's real vs. synthetic right now

- **Real**: URL/ID parsing, the oEmbed metadata lookup, all UI, charts,
  history, and insights logic.
- **Synthetic (by design, for now)**: every prediction number. There is no
  trained model wired in yet — `engine.js` generates a deterministic mock
  forecast seeded from the video ID (and category), so the same link always
  reproduces the same "prediction" for a stable demo.

## The model swap-in seam

Everything downstream of the prediction consumes one plain object shape,
returned from a single function:

```js
// engine.js
function getSyntheticPrediction(videoId, opts) { … }
```

To wire in a real model later: replace the body of that function (or the
call site in `app.js`'s `renderResultsPage`) with a `fetch()` to your
model's API, keep the returned shape the same (`score`, `verdict`,
`checkpoints[]`, `engagement`, `checklist[]`, `similar[]`, `tips[]`), and
every screen — results, history, insights — updates with zero other
changes. The Settings page has a disabled "Model endpoint" / "API key" pair
already in place as the visual marker for where that plugs in.

## Project structure

```
index.html    — app shell: sidebar nav + script includes
styles.css    — design tokens (light/dark) + all component styles
engine.js     — URL parsing, oEmbed fetch, the synthetic prediction engine
charts.js     — hand-rolled SVG chart renderers (no external chart library)
app.js        — router, localStorage-backed history, and all five page views
```

## Pages

- **Predict** — paste a link (or try the demo video), pick a category, get
  a report.
- **Results** — score gauge, growth chart with confidence band, day 1/7/30
  stat tiles, engagement vs. channel/category benchmarks, title & thumbnail
  checklist, similar videos, and prioritized tips.
- **History** — every past prediction, sortable/filterable, with a
  select-up-to-3 growth-curve comparison overlay.
- **Insights** — aggregate KPIs, score distribution, average score by
  category, and simple correlation call-outs across your prediction
  history.
- **Settings** — theme (system/light/dark), prediction-engine status (and
  the model swap-in seam), and a data/privacy note (everything lives in
  `localStorage`, nothing is uploaded anywhere).
