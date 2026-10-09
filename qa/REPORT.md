# Round 3: continuous coloured surfaces

Implemented, uncommitted. Browser verification is pending your run. No browser
or server was launched; existing `qa/shots/` files are round-2 evidence.

## Changes

- Replaced the independently fading preview, temporary paper and deck column
  with opaque DOM snapshots at their measured live dimensions and scroll offset.
  Index snapshots also retain the dark page background; deck snapshots pin their
  theme. The destination layout is established before animation. Cleanup removes
  the overlay rather than changing a fixed deck back into a different layout.
  These changes address the reported first-frame and final-frame mismatches;
  pixel equality still needs confirmation in Chromium and WebKit. Incidental
  CSS animation poses are copied rather than restarted, and destination motion
  pauses until the overlay is removed to preserve the handoff pose.
- The selected panel's ground expands to the viewport in 450ms with
  `cubic-bezier(.4,0,.2,1)`. It progressively covers its siblings, which reappear
  as it contracts on all-parts links and history returns. This uses the brief's
  expressly allowed “covered” alternative to flex-squeezing the siblings, so
  their text keeps its original size and wrapping. The selected panel is removed
  from the underlying snapshot's paint, preventing doubled rounded edges.
- Preview and deck text occupy complementary clips on that solid surface.
  Neither layer changes opacity or scales. Part-to-part navigation uses a solid
  destination-colour sweep, in part order, over the outgoing deck.
- Kept the existing distinct pink/lilac panel and deck grounds. Each panel already
  exactly matches its destination ground; no palette change was necessary.
- Kept direct-load/reload routing, serialized preparation, history entry behavior,
  stale-fetch protection, same-clock reversal for index transitions, and instant
  reduced motion. Corrected the reversal's deck scroll target when the index was
  scrolled. Snapshots are inert and have no IDs.
- Updated DESIGN.md to describe the implemented motion.

## QA changes

`qa/motion.mjs` retains the full link/history/direct-load/reload/verdict matrix,
with touch activation in both engines. It now samples 0, 16, …, 448, 450ms and
checks source/first-frame and final-frame/live equality using the existing
200-pixel, 16-channel-value raster tolerance. The tolerance was not enlarged.
It also checks reference timing/easing, many distinct intermediate states,
constant typography, opaque layers, monotonic expansion/contraction, complementary
text clips, solid part sweeps, cleanup and direct-load appearance equality.

Every sampled frame is inspected inside the moving surface (the whole viewport
for part sweeps). Legitimate dark index gutters outside that surface are excluded.
The pixel check detects page-ground-coloured patches using a centre and eight
neighbours, spaced 7 CSS pixels apart, distinguishing holes from ordinary glyph
strokes. A 32px interior margin excludes rounded-edge antialiasing. Any detected
patch fails. This is a sampled interior-patch check, not a proof against every
single-pixel seam or an unsampled temporal frame.

The same region records weighted RGB luminance and dark/coloured ink presence.
A luminance dip exceeding 0.08 below the lower endpoint fails; visible ink must
remain above both 0.05% of the region and 10% of the lower endpoint's ink fraction.
These are explicit heuristics for blank/dim handoffs, not OCR or perceptual proof.
JSON measurements and before/frame/live contact sheets remain available for
review. `qa/qa.mjs` now recognizes the new stage in lifecycle checks and runs the
new motion checks alongside the existing functional and reduced-motion matrix.

## Brief conflict and limits

The reference requests outgoing text fading away and incoming text fading in
only after landing. The no-flash brief expressly forbids that disappearance and
reappearance, including a blank text interval. Both cannot be implemented
literally. I prioritized no-flash: fixed-size destination content is revealed by
clips during growth, with no separate 300ms text fade or blank ground beat.
The surface still uses the reference's 450ms timing and colour continuity.

Native traversal between separate documents and network-error full-navigation
fallbacks remain browser-controlled. Mid-transition index reversal is continuous;
an interruption of a part-to-part sweep settles the pending route before handling
the next history intent, as in the existing router. Deterministic frame seeking
checks appearance, not real-device frame rate, browser chrome or actual bfcache
restoration. Review the strips and interruption behavior on-device.

## Validation and handoff

Passed: `node --check index.js`, `node --check app.js`,
`node --check qa/motion.mjs`, `node --check qa/qa.mjs`, and `git diff --check`.
No engine pass totals or new screenshots are claimed.

Run:

```sh
node qa/qa.mjs [path/to/playwright/index.mjs]
```

The runner starts its own local server and executes Chromium (390×844 touch)
and WebKit (iPhone 15, tap). Inspect the regenerated strips in `qa/shots/`,
particularly part 2 expansion and the scrolled-verdict returns.
