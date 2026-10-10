# Round 6: copy phases and endpoint parity

Implemented, **not committed**. The full browser rerun is blocked by this
session's sandbox; the findings below distinguish saved evidence from new checks.

## Diagnosis: mixed causes, including a real paint-order pop

The supplied `qa/brief/r5-qa.log` has 44 Chromium and 31 WebKit failures:
71 endpoint comparisons and four verdict copy-phase failures. Both supplied
JPEG crops were inspected. The final crop is not just a displaced button:
the live card/under-card shadow covers the tops of the white discs, while the
animated snapshot paints those discs above that shadow.

- **Real endpoint paint-order defect:** `copyMotion()` animates `.dock` opacity.
  An opacity animation establishes a stacking context even at its opaque endpoint.
  The live dock previously had no such context, allowing positioned card shadows
  to paint over it after cleanup. `.dock` now has `isolation:isolate` in both live
  and snapshot layouts. This keeps the buttons above the card shadows throughout
  the handoff, without moving or resizing them.
- **First-frame rasterization:** the existing Chromium `expand-p1` PNGs differ
  in 2,108 pixels above the unchanged >16 channel threshold, bounded by
  (155,343)-(375,1531) in device pixels. Those are the two rotated Part badges,
  not a settling deck card. Giving `.part` a persistent `will-change:opacity`
  keeps its compositor preparation consistent with its route fade. This is a
  targeted rasterization correction; its new pixel total requires browser QA.
- **Unlike capture settings also existed:** before/live used
  `animations:'disabled'`; sampled frames did not. Deterministic QA now pins
  `.nudge` and `.card.settle` to their resting CSS pose and disables `.act`,
  `.disc` and `.btn` transitions before the source screenshot. The same stylesheet
  applies to snapshots, live destinations and the direct-load comparison. All
  these screenshots allow animations, so screenshot capture itself never advances
  or resets them. Route WAAPI remains paused/seekable and otherwise unchanged.
  Snapshot CSS also disables transitions so copied computed poses cannot drift.
- **No evidence of route-arrival settle replay:** `mountDeck()` initializes with
  `paint(state, 'none')`; `.settle` is applied only by the explicit restart path.
  Normal route arrival therefore does not start that animation. The real-time
  runner now leaves decorations running and checks for an arrival `.settle`.

For reproducibility, inspection of the existing `qa/shots/` expand-p1 pairs
counted these pixels using the suite's existing >16 channel threshold:

| Saved pair | Chromium | WebKit |
| --- | ---: | ---: |
| before / 000 | 2,108 | 0 |
| 690 / live | 26,821 | 20,644 |

The final differences are in the dock. These saved full-frame artifacts do not
exactly match the approximate counts supplied for the Round 5 JPEG crops; they
are supporting evidence, **not new Round 6 captures or a reproduction of every
Round 5 failure**. In particular the saved Chromium verdict JSON has no phase
violation, while the supplied log reports one. No claim is made that these
artifacts all came from the same run.

## Verdict all-parts

The saved WebKit verdict records identify exactly one stuck outgoing opacity:
copy root 23 remains at 1 from 120 through 690ms, while all nine preceding
outgoing roots fade to zero. The DOM order from `renderResult()` and the
`copyMotion()` selector identifies that final root as `.dock`.
`[data-screen="result"] .dock` is `display:none`. Relying on a WAAPI opacity
effect on this non-rendered root is not portable; it also makes the ledger
report coexistence despite that root having no painted content.

The builder now sets hidden copy roots explicitly to opacity zero and does not
animate them. It retains their copy-role marker, so the existing strict phase
checks still inspect them. Rendered verdict roots still fade out over 120ms,
remain zero during all 450ms of travel, and incoming roots fade in only after
570ms. No visibility filter was added to relax either failing assertion.
Future records include each root's class and display value to make this
attribution explicit. Real-time coverage now includes a scrolled verdict's
all-parts return, in addition to the existing deterministic case.

## Validation

Passed: `node qa/router-copy.mjs`, `node qa/router-lifecycle.mjs`, syntax checks
for the changed JavaScript, and `git diff --check`. The new regression runs the
actual copy builder with a hidden dock that receives no animation effect; it
checks phase boundaries, zero overlap, zero copy during travel and intermediate
fade values. It is not a browser rendering test.

Attempted the full runner:

```sh
node qa/qa.mjs /Users/moxy/projects/dsa-6528-viz/node_modules/playwright/index.mjs
```

It fails before engine tests with `listen EPERM: operation not permitted
127.0.0.1`. A standalone Chromium launch also fails with macOS
`bootstrap_check_in ... Permission denied (1100)`. Browser execution remains
unverified here; no new pass totals or screenshots are claimed. The unchanged
200-pixel endpoint limit, >16 channel threshold, phase timing, zero-leak probe
checks and full navigation matrix remain in place. The command above still
needs to pass in a browser-capable session before calling Round 6 browser-clean.

---

# Round 5: cleanup and surface fixes

Implemented, **not committed**. Browser verification remains blocked in this
session; no round-5 browser pass totals or new frame sheets are claimed.

## Supplied evidence and fixes

- `qa/brief/r4-qa.log` records two failures for Back after a double tap
  (`leaving=true`, five panels), followed by a strict locator crash on two
  worth-your-time links. The old `sheets` count only looked for `.takeover`,
  so its zero did not rule out a surviving `.route-stage` and cloned panels.
- Reversal now handles zero or unresolved animation time as the index endpoint.
  Calling `play()` with negative playback at that boundary can auto-rewind to
  the other end. Interior reversals pause, set a shared time/direction and resume.
  Completion observes the shared animation clock instead of awaiting an aggregate
  of per-animation promises across direction changes. These address lifecycle
  hazards found in the code; the exact browser failure is not reproduced here.
- Finish, cancellation of any owned animation, superseding navigation and page
  lifecycle interruption use the same cleanup. Ownership is cleared before
  cancelling animations; stale cancellation callbacks cannot settle a newer route.
  Cleanup cancels the completion observer, removes owned stages plus orphan stages,
  restores inert/pointer state and resumes paused live animations.
- Inspected `qa/brief/r4-webkit-realtime.jpg`. The stepped shapes correspond to
  the horizontal exchange of two different endpoint layouts, including their
  offset paper/under-card stacks. Index motion now uses one rounded paper proxy,
  interpolating its measured endpoint rectangle inside the opaque moving ground.
  Both endpoint layouts stay hidden during travel. The stationary index and deck
  layouts paint only during their respective text phases. Siblings remain beneath
  the opaque surface. Text timing (120/450/120ms), easing and return direction stay
  unchanged; browser rendering of this correction still needs verification.

## Strict regression checks

- Keep the existing double-tap checks, 700ms return window and strict link locators.
  Count all route snapshot nodes at rest, including `.route-stage`, rather than
  only the obsolete `.takeover` selector.
- Add cancellation during expansion and Back/Forward/Back interruption checks.
  Require zero snapshot nodes, exactly two panels and restored interaction.
- Deterministic motion samples now also require exactly one visible material paper
  with positive dimensions and hidden endpoint layouts during travel. Existing
  endpoint pixel tolerance (200 pixels at >16 channel difference), zero probe
  leaks, typography, phase timing, luminance and real-time checks remain intact.
- `qa/router-lifecycle.mjs` exercises the actual lifecycle functions in a small
  Node VM harness: zero/null-time reversal, shared interior reversal, finish,
  cancellation and stale callbacks. This checks ownership/control flow, not native
  WAAPI timing, browser history, layout or rendering.

## Validation

Passed: `node qa/router-lifecycle.mjs`, syntax checks for `index.js`, `app.js`,
`qa/qa.mjs`, `qa/motion.mjs`, `qa/router-lifecycle.mjs`, and `git diff --check`.

Attempted the full browser runner; it exits before browser tests with
`listen EPERM: operation not permitted 127.0.0.1`. Approval escalation is disabled
in this session. Run the unchanged full runner in an environment that permits it:

```sh
node qa/qa.mjs /Users/moxy/projects/dsa-6528-viz/node_modules/playwright/index.mjs
```

Review regenerated WebKit and Chromium real-time sheets, especially middle
frames of expansion/return, and confirm the cancellation/interruption checks.
Supplied round-4 evidence remains untouched.

---

# Round 4: motion fixes (historical report)

Implemented, not committed. **Browser verification is blocked in this session.**
The supplied round-3 WebKit frame sheet and existing `qa/shots/` PNG/JSON evidence
were inspected; those files are not round-4 results.

## Motion changes

- All index, all-parts, history and cross-part transitions now use three phases:
  outgoing text fades to zero in 120ms; opaque material moves for 450ms with the
  original `cubic-bezier(.4,0,.2,1)` easing; incoming text fades in over 120ms
  after landing. Total: 690ms. Typography keeps its endpoint size and wrapping.
  Sibling/masthead copy follows the same phases. Paper and ground layers never
  fade. This follows the latest user instruction, superseding the contradictory
  text-presence requirement in `qa/brief/no-flash.md`.
- Snapshot views have isolated stacking contexts, and the moving surface stacks
  above the index. Previously `.mini`/`.credit` z-indices escaped the index view
  and painted over the deck, including the first return frame. This explains
  the visible sibling overlap and apparent near-cut on Back. Browser Back and
  the all-parts link still invoke the same return builder and shrink keyframes.
  Every animation shares a start time; Back during an expansion reverses that
  clock without settling to the deck first.
- The selected original panel paints the stationary index endpoint. Only during
  travel does the clipped proxy replace it. This avoids the extra rounded-edge
  antialiasing seen when clipping an already rounded panel over another ground.
- Snapshots pin the resolved `--card-shadow` before the root theme changes.
  Lilac shadows previously changed to pink during navigation: the shadow custom
  property was resolved at its defining ancestor, not its consuming descendant.
- Source snapshots preserve computed focus outlines. Return focus is established
  before capturing the index destination, avoiding a focus ring appearing only
  at cleanup. Keyboard focus remains available; the check was not suppressed.

## Each supplied failure

`qa/brief/r3-failures.txt` contains **23 lines, all WebKit**, not the full reported
52 Chromium + 57 WebKit failures. Every supplied line is classified below.
The abbreviated `no sampled page` labels refer to the existing ground-patch check.
No unprovided failure names or new engine totals are inferred.

| Line | Flow | Failed check | Classification and correction |
| --- | --- | --- | --- |
| 1 | all-parts-forward-index-p2 | final frame = live | Real defect: doubled rounded endpoint edge; original-panel endpoint handoff. |
| 2 | all-parts-forward-index-p2 | no sampled page | Broken check: ink mistaken for page ground; diagnostic probe replaces colour inference. |
| 3 | direct-p2-start-with-p1 | first frame = source | Real defect: source shadow changes theme; pin resolved shadow. |
| 4 | direct-p2-start-with-p1 | no sampled page | Broken check: black title strokes; diagnostic probe. |
| 5 | previous-link-back-p2 | no sampled page | Broken check: foreground ink treated as a hole; diagnostic probe. |
| 6 | previous-link-forward-p1 | first frame = source | Real defect: source shadow changes theme; pin resolved shadow. |
| 7 | previous-link-forward-p1 | no sampled page | Broken check: foreground ink treated as a hole; diagnostic probe. |
| 8 | p1-verdict-next-p2 | no sampled page | Broken check: legitimate verdict/button/title ink; diagnostic probe. |
| 9 | next-link-back-p1 | first frame = source | Real defect: source shadow changes theme; pin resolved shadow. |
| 10 | next-link-back-p1 | no sampled page | Broken check: foreground ink treated as a hole; diagnostic probe. |
| 11 | next-link-forward-p2 | no sampled page | Broken check: foreground ink treated as a hole; diagnostic probe. |
| 12 | direct-document-all-parts | first frame = source | Real defect: sibling paints above deck; isolate and order snapshot layers (also pin source shadow). |
| 13 | direct-document-all-parts | final frame = live | Real defect: doubled rounded endpoint edge; original-panel endpoint handoff. |
| 14 | direct-document-all-parts | no sampled page | Broken check: foreground ink mistaken for holes, even on the incorrectly layered sibling; diagnostic probe now tests sibling occlusion explicitly. |
| 15 | reloaded-deck-forward-index | first frame = source | Real defect: sibling paints above deck; isolate and order layers (also pin source shadow). |
| 16 | reloaded-deck-forward-index | final frame = live | Real defect: late focus ring plus rounded endpoint mismatch; capture destination focus and use original panel. |
| 17 | reloaded-deck-forward-index | no sampled page | Broken check: foreground ink mistaken for holes; diagnostic probe. |
| 18 | reloaded-index-back-deck | first frame = source | Real defect: clone loses focus ring plus rounded endpoint mismatch; preserve outline and use original panel. |
| 19 | reloaded-index-back-deck | final frame = live | Real defect: sibling remains above final deck; isolate/order layers. |
| 20 | reloaded-index-back-deck | no sampled page | Broken check: foreground ink mistaken for holes; diagnostic probe. |
| 21 | verdict-all-parts | first frame = source | Real defect: sibling overlays scrolled verdict; isolate/order layers. |
| 22 | verdict-all-parts | final frame = live | Real defect: doubled rounded endpoint edge; original-panel endpoint handoff. |
| 23 | verdict-all-parts | no sampled page | Broken check: ink includes solid black button fill; diagnostic probe. |

Evidence from the existing PNGs, using the unchanged >16 channel-difference
threshold: lines 3/6/9 each differ in 2,899 pixels concentrated in the under-card
shadow; lines 1/13 differ in 1,197 rounded-edge pixels; line 22 in 1,161.
Lines 16/18 additionally show the missing/late title focus outline. Lines
12/15/19/21 differ in more than 700,000 pixels because a sibling paints on top.
These are product defects, not reasons to widen the 200-pixel tolerance.

The old nine-point ground detector also returns false positives on legitimate
foreground: in `webkit-direct-p2-start-with-p1-000.png`, its three hits are at
CSS coordinates (208,106), (214,106), (216,106), inside the black title. On the
scrolled verdict its hit at (194,486) is in the black share button. Ground and
ink both use `#17111a`; colour alone cannot identify the painting layer.

## QA corrections and additions

`qa/motion.mjs` retains the complete link/history/direct-load/reload/scrolled-
verdict matrix and the same endpoint tolerance (200 pixels; >16 channel delta).
No failing endpoint check was loosened or removed.

- Sample the full 690ms at roughly 16ms intervals, plus 119/120/121 and
  569/570/571ms to test phase boundaries. Require the 450ms material segment and
  original easing, monotonic geometry, constant typography and opaque grounds.
- Replace the complementary-text-clips and continuous-text-presence assertions.
  They measured the superseded brief and allowed two different titles on screen
  at once. Require zero overlap of outgoing/incoming copy, zero copy opacity
  throughout movement, intermediate fade values, and stationary geometry during
  both text fades. Keep luminance measurements and their original 0.08 bound.
- Replace ambiguous black-patch detection with a separate diagnostic render at
  each paused frame. Temporarily colour page ground and unselected index panels
  `rgb(3,255,7)` without changing layout, clipping, opacity, visibility or stacking.
  Any sampled probe colour inside the selected surface fails. It distinguishes
  legitimate ink from actual holes and detects sibling paint above the surface.
  Keep the 32px rounded-edge exclusion and 2 CSS-pixel sample spacing; require
  nonempty samples and **zero** leaks. Ordinary frame PNGs remain unmodified.
  Save probe contact sheets and metrics alongside the normal evidence.
- Add `realtimeFrames` to both engines: actual taps and browser Back, no WAAPI
  pause/seek, screenshots about 50ms apart plus a requestAnimationFrame trace.
  Require many intermediate sizes, a sustained transition, no simultaneous copy,
  and the reverse index path for all-parts and Back. Start capturing concurrently
  with the history command, so awaiting its promise cannot hide the transition.
- Existing reduced-motion, rapid navigation, history, reload, failed-fetch,
  lifecycle and functional deck checks remain in the runner.

## Validation and limits

Passed: `node --check index.js`, `node --check app.js`,
`node --check qa/motion.mjs`, `node --check qa/qa.mjs`, `git diff --check`.
Old evidence was analysed with Pillow; no new browser screenshot is claimed.

Attempted the full runner with the installed Playwright at
`/Users/moxy/projects/dsa-6528-viz/node_modules/playwright/index.mjs`.
It fails before serving with `listen EPERM: operation not permitted 127.0.0.1`.
A separate WebKit launch also aborts (`Abort trap: 6`, exit 134). This session
cannot request an elevated run. New runtime assertions and visual outcomes
therefore remain unverified; **no round-4 pass totals are claimed**.

Run outside this restricted session:

```sh
node qa/qa.mjs /Users/moxy/projects/dsa-6528-viz/node_modules/playwright/index.mjs
```

Review the regenerated deterministic, probe and `*-realtime-*-strip.png` sheets,
especially WebKit browser Back and scrolled-verdict returns. Raster sampling is
not proof of every pixel or real-device frame pacing. Traversals between separate
native documents remain browser-controlled; the same-document router covers the
reported index/open/all-parts/open2/Back sequence.

---

# Round 7: Safari bar tint during route motion

The fixed `.route-stage` now receives the destination snapshot's resolved ground
color before insertion. Previously its own background was transparent, with the
opaque index snapshot supplying the dark paint at both viewport edges throughout
most of an index expansion. The destination page theme and theme-color metadata
were already updated; repeating that metadata update would not address this
fixed overlay.

The brief's hypothesis is consistent with the code and WebKit's explanation of
[fixed/sticky edge color extension](https://bugs.webkit.org/show_bug.cgi?id=301756#c2).
It is not a confirmed diagnosis on the reported phone. This change gives the
viewport-fixed container an explicit destination background for that mechanism:
pink or lilac on entry, ink on all-parts/Back, and the next part's ground on a
part-to-part move. Active Back/Forward reversal exchanges the saved source and
destination tints immediately, without restarting or seeking the motion.

The new background sits underneath the existing opaque snapshots. No snapshot
background, stacking order, clipping, dimensions, text fade, easing, duration,
scroll behavior or endpoint handoff was changed. No CSS change was necessary.
The intended in-viewport output is identical to Round 6; pixel parity has not
been measured in this session. Cleanup removes the stage and its tint together.
Reduced-motion navigation still uses the destination page directly.

Passed: `node qa/router-copy.mjs`, `node qa/router-lifecycle.mjs`,
`node --check index.js`, and `git diff --check`. The lifecycle regression now
also checks tint changes through Back/Forward/Back on the shared clock.
No server or browser was launched, as requested. The full browser suite and
its thresholds are unchanged; no new Chromium/WebKit pass totals are claimed.

Human verification: run `qa/qa.mjs` in both engines and compare the motion to
Round 6. On the reported iPhone, record entry into each part, all-parts and
browser Back (including from a scrolled verdict), both part-to-part directions,
and rapid Back/Forward during expansion. With the bars expanded and collapsed,
check that both edges adopt the destination tint from the first motion frame,
with no change to the viewport animation. Record the iOS version and Safari
bar layout. Browser chrome sampling and update timing are Safari-controlled:
if it still takes the descendant snapshot's paint instead of the container's
background, this targeted fix will need revision; desktop WebKit QA alone
cannot establish that it worked.
