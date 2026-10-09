# Design notes

## The world

A deck of profile cards on Sherita's pink ground. The palette and ink are the reel's: bubblegum pink paper, a marker set of blue, green and red, and one type family (Bricolage Grotesque, self-hosted). The form is a dating app's swipe deck: one card at a time, two more peeking from underneath, a dock of round discs below.

## Tokens

- `--ground #ec8db1`, the page. `--paper #f7acc7` the card. `--paper-under #f09dbd` and `--ground-deep #d9759d` the cards underneath. `--board #f8f9f7` the white rescue card.
- `--ink #17111a`, `--ink-soft #7a2a4e` for secondary text. `--blue #1733b8` questions and title, `--green #06552b` yes, `--red #9e0b27` no.
- Cards: 16px radius, `--card-shadow` (offset 18px, blur 40px, negative spread, plus a tight 2px contact shadow).
- Motion: `--ease cubic-bezier(.16,1,.3,1)`, fly-off 420ms, snap-back 320ms.

## Cards

- Start: title in blue with the last words (the `<em>` in the deck's title) in ink, the lede, a "swipe to start" nudge and the credit line. Part 2's credit line starts with "Part 2 · start with part 1".
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
