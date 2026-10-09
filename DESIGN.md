# Design notes

## The world

A deck of profile cards on Sherita's pink ground. The palette and ink are the reel's: bubblegum pink paper, a marker set of blue, green and red, and one type family (Bricolage Grotesque, self-hosted). The form is a dating app's swipe deck: one card at a time, two more peeking from underneath, a dock of round discs below.

Each part has its own colour family; the ink and the marker set stay the same across them. Part 1 is the pink. Part 2 is a lilac (`data-theme="lilac"`), same lightness and saturation as the pink so the mood carries over, chosen so the five text colours all clear WCAG AA on the new paper (ink 10.5:1, ink-soft 6.2, blue 5.4, green 5.1, red 4.7; the pink paper's figures are within a few tenths of those).

## Tokens

- Pink (default): `--ground #ec8db1`, the page. `--paper #f7acc7` the card. `--paper-under #f09dbd` and `--ground-deep #d9759d` the cards underneath. `--board #f8f9f7` the white rescue card.
- Lilac (`[data-theme="lilac"]`): `--ground #ba94e6`, `--paper #d4b7f5`, `--paper-under #c7a4ef`, `--ground-deep #a479d5`, `--ink-soft #4f297a`. The shadow tint (`--shade`, an rgb triple) moves with the theme too.
- `--ink #17111a`, `--ink-soft #7a2a4e` for secondary text. `--blue #1733b8` questions and title, `--green #06552b` yes, `--red #9e0b27` no.
- Cards: 16px radius, `--card-shadow` (offset 18px, blur 40px, negative spread, plus a tight 2px contact shadow), tinted by `--shade`.
- Motion: `--ease cubic-bezier(.16,1,.3,1)`, fly-off 420ms, snap-back 320ms.

## Cards

- Start: title in blue with the last words (the `<em>` in the deck's title) in ink, the lede, a "swipe to start" nudge and the credit line. The credit line opens with the part and the way out: "Part 1 · all parts", "Part 2 · start with part 1 · all parts".
- Question: one progress mark per main question across the top (done in ink, current in blue), the question in blue display type a little above centre. Rescue cards look the same; when a rescue has a `note`, her aside sits under the question in 17px `--ink-soft`, signed "— Sherita". The longest note still fits at 375x667. No labels above the question.
- Stamps: YES (green, top left, tilted -16deg) and NOPE (red, top right, tilted 16deg) inside a 4px border, opacity driven by `--yes` and `--no` as the card moves.
- Result: the verdict in a rubber-stamp box, rotated -4deg, slamming in from 1.8x scale. Green for yes, red for no. A yes throws eight small hearts out of the stamp once. Her quote is the headline under it; Moxy's one-liner follows in smaller, lighter type behind a dashed rule, signed "— Moxy". On part 1's yes, a small blue "Part 2: is he worth your time? →" link follows. Then the tally, a "Change the last answer" link, the credit line, share and restart.

## Interaction

- Pointer events only, no libraries. Pointer down captures the card; move translates it (vertical damped to 35%) and rotates up to 16deg; `--p` on the deck scales the under-card up as the top one leaves.
- Release past `min(38% of card width, 160px)`, or a flick faster than 0.6px/ms with at least 40px of travel, commits the answer and flies the card off at 28deg. Otherwise it snaps back.
- The discs, Y / N and Backspace drive the same `swipe()` and `back()` as the drag. Back flies the previous card in from the side its answer went. Backspace works on the result screen too.
- `prefers-reduced-motion`: no transitions, answers commit immediately, no heart burst.

## Layout

- `.app` is `100dvh` with safe-area padding and `overflow: hidden` on the start and question screens, so nothing scrolls at 390x844 or 375x667. `html, body` have `overflow-x: clip`.
- The column is 440px max; the deck takes the remaining height (capped at 640px on desktop); the dock is a fixed 112px.
- On the result screen the app releases its height and the page scrolls; the dock and under-cards hide.
- The keyboard hint shows only on wide pointer-and-hover devices.

## Browser surfaces

Selection is blue on white, focus rings are 3px blue with offset (hidden on programmatically focused headings), tap highlight is off, `color-scheme: light`.

## The index

The site root is the series: a dark `--ink` page with a small masthead and one tall panel per part, each panel in its part's ground colour holding a mini of that deck's start card (part stamp, title, lede, Sherita credit) on its paper with the next card peeking out from under. The whole panel is the tap target (a stretched link off the title); the credit link inside is its own tap. Panels stack on a phone and fill the height between the masthead and the "built by moxy" colophon; from 720px they sit side by side.

All in-site links share `index.js`, including links from directly loaded deck HTML. The index still warms only the selected part's HTML on intent and loads the engine/data on activation. A direct deck keeps its live card while it fetches the index markup. Initialization adds no history entry. Script preparation is serialized because each deck exports through `window.DECK`; stale loads cannot mount over a later history intent.

Opening a part expands the coloured boundary for 420ms with the existing exponential ease. A separate paper surface moves between the mini and deck card's bounds while the fixed-size index title fades out (0–100ms) and the live deck column fades in (120–360ms). Paper carries the interval between the titles; its opacity is zero at both endpoints to avoid doubling the live card's shadow. No text scales.

Returning to all parts reverses that spatial relationship: the deck column fades out, paper and the clipped ground return to the chosen panel, and its mini fades in at 300–400ms. The other panel is already laid out beneath the shrinking deck and becomes visible during the return. A scrolled verdict retains its viewport position on departure. Back during this transition reverses the existing animation clock in place.

Part-to-part links and history traversals slide the two columns horizontally in part order while the ground changes colour. An inert, theme-pinned copy retains the outgoing card (including a verdict); the incoming card is the live deck. Copies have no IDs and are removed on completion. Only paper geometry changes size; columns translate without scaling.

Back/Forward use the same transitions without adding entries. New deck mounts start fresh, matching the established history behavior. All-parts pushes one home entry. Reloaded decks initialize the same router and can traverse existing same-document history without reloading each destination. Page lifecycle events settle interrupted motion, and reduced motion skips route animations entirely. Modified/external links retain native behavior; failed enhancement falls back to a real navigation. Browser traversal between separately loaded documents remains browser-controlled, rather than a same-document animation guarantee. No View Transition API is required.
