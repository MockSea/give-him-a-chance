# Round 4: motion fixes

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
