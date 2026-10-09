# Round 2: transitions everywhere

Changes are uncommitted. The prior sections below describe the previous pass.

- Shared routing now runs on index and direct deck loads. All-parts and browser
  traversal animate the panel/deck relationship in both directions. Part-to-part
  links and traversal use a horizontal handoff with a changing ground colour.
- A temporary paper surface prevents the empty interval between the two text
  treatments. Its endpoint opacity avoids a shadow jump during cleanup. Text
  stays at its own layout size. Scrolled verdict departures preserve geometry.
- Back during index motion reverses the existing clock. Fetch preparation is
  serialized, stale completions are ignored, and page lifecycle/reduced-motion
  changes settle live motion. Direct initialization adds no history entries.
- `qa/qa.mjs` retains the prior deck, layout, history and fallback checks and
  waits for route completion where the formerly instant return now animates.
- `qa/motion.mjs` pauses WAAPI and seeks 0, 16, ... 416, 420ms for both panel
  entries, browser Back/Forward, both all-parts returns and their history edges,
  previous-part/next-part links and their history edges, a direct deck, traversal
  after reload, and a scrolled verdict return. The reduced-motion matrix covers
  both parts, both cross-links, all-parts, and their Back/Forward directions.
- Every sampled flow writes before/live frames, individual PNGs, a JSON record,
  and a `qa/shots/{engine}-{flow}-strip.png` contact sheet. A missing animation
  still writes a before/cut strip and fails. Reduced-motion strips show the
  intentional instant change. Files from earlier runs are not new evidence.
- Checks include first-frame/source and final-frame/live pixel equality,
  intermediate visual states, stable typography, title separation, paper-colour
  coverage in every frame, the other panel painted before return completion,
  theme continuity, cleanup and interactivity. Existing direct-load equality
  and the shadow-raster tolerance from 994b960 are retained.

Validation here: `node --check` passed for `index.js`, `app.js`, `qa/qa.mjs`,
`qa/motion.mjs`; `git diff --check` passed. No server/browser was attempted,
per the sandbox constraint. No new captures or engine pass totals are claimed.
Run `node qa/qa.mjs [path/to/playwright/index.mjs]` to generate evidence in both
engines, then inspect the strips. Deterministic seeking checks appearance,
not real-device frame rate, Safari toolbar changes, or actual bfcache timing.

The visual bar is reasonable for in-site routing. Native Back to a separately
loaded document (or external page), and full-navigation error fallbacks, remain
browser-controlled; the shared router cannot promise animated frames there.

---

# Index expansion validation

## History correction after real-machine QA

The owner reported Chromium timing out on the second Back in
index → part 1 → YES → part 2 → Back → Back. Source inspection confirmed
that next-part links left the router. If the index document is not restored
from bfcache, returning to its pushed part-1 URL loads standalone deck HTML.
That HTML previously had no history reconciliation, so traversing an older
same-document home entry could change the URL while leaving the deck visible.
Reloading a routed deck exposes the same missing reconciliation.

- `index.js` now routes next-part, previous-part and all-parts links, pushing
  one entry and disposing the outgoing deck. Modified clicks retain normal
  link behavior. Index panel URLs resolve against home throughout navigation.
- `app.js` reconciles standalone deck `popstate`/`pageshow` by reloading when
  the route differs from the loaded route. Fragment/query changes and
  `index.html` aliases do not trigger reloads. Direct loads add no entries.
- The original two-Back test is unchanged, with an additional same-document
  assertion. `qa/motion.mjs` now checks Back/Forward after mid-deck reload,
  direct-load Back, previous-part/all-parts navigation, and reload with
  different-deck and home entries ahead in history.
- Syntax checks passed for all four changed JS files; `git diff --check`
  passed. Browser QA was not rerun in this sandbox. The diagnosis follows
  source paths; the owner's rerun must verify actual browser restoration.
- This correction is left uncommitted as requested.

## Diagnosis from source

The old shared card snapshots used the browser's default cross-fade, with
`height: 100%; object-fit: cover` on both snapshots. The index mini and the
full-height start card have different proportions and typography. Both were
therefore visible at different scales/crops during the 420ms interpolation,
consistent with the owner's overlapping-title capture. The group already used
the project's 420ms exponential easing; default group timing was not the cause.

The fallback animated layout dimensions and delayed `location.assign` by 460ms,
then started the deck document load. The destination card was built by deferred
JS, so there was no guarantee it was ready when that sheet finished. No runtime
trace was available to quantify the font/script contribution.

## Change

`index.js` prepares the actual deck before a same-document, 420ms clip reveal.
The outgoing panel fades out by 100ms; the fixed-size destination fades in from
120ms. The final frame is the same live DOM used for interaction. HTML warming
is limited to the selected link on intent, with scripts loaded on activation.
`app.js` now has a mount/dispose lifecycle for timers and keyboard events.
History, direct URLs, reduced motion and page lifecycle cleanup are covered in
code and in the extended QA runner. The old snapshot and sheet paths are removed.

## Checks performed in this session

- `node --check` passed for `index.js`, `app.js`, `qa/qa.mjs`, `qa/motion.mjs`.
- `git diff --check` passed.
- Required command attempted:
  `node qa/qa.mjs /Users/moxy/projects/dsa-6528-viz/node_modules/playwright/index.mjs`
- Runner blocked before browser tests: `listen EPERM` on `127.0.0.1`.
- Independent Chromium launch also blocked: macOS MachPortRendezvousServer
  `bootstrap_check_in ... Permission denied (1100)`.
- Independent WebKit launch aborted with exit code 134.
- Chromium: 0 tests executed; WebKit: 0 tests executed. No pass totals claimed.
- No animation frames were generated or visually inspected. Physical iPhone
  performance, toolbar/safe-area changes and real bfcache restores are unverified.
- `git add` was denied creating the worktree's `index.lock` outside this session's
  writable root. No commit was created. Intended message:
  `fix: make index expansion use the live deck`.

## Pending visual review

Run the required command in a session that can launch browsers, listen locally
and write this worktree's Git metadata. `qa/motion.mjs` samples each part every
16ms and at 420ms in each engine. It also checks title opacity separation,
constant title geometry/theme, exact final-frame/live equality, and equality to
a direct deck load. These are deterministic visual samples, not frame-rate data.

Inspect every generated `qa/shots/{chromium,webkit}-expand-p{1,2}-*.png` frame.
Representative output names to review (not yet generated):

- `qa/shots/chromium-expand-p2-064.png`
- `qa/shots/chromium-expand-p2-208.png`
- `qa/shots/chromium-expand-p2-live.png`
- `qa/shots/webkit-expand-p2-064.png`
- `qa/shots/webkit-expand-p2-208.png`
- `qa/shots/webkit-expand-p2-live.png`

Navigation tests exercise reduced motion, delayed/failed fetches, repeated taps,
Back during expansion, Forward, reload of a pushed URL and a synthetic persisted
pageshow signal. A real iPhone Safari check is still required before calling the
result seamless on-device.
