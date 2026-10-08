# Design notes

## What it is

Sherita Janielle's "Should I give this man a chance?" whiteboard, served one question at a time. The page is her stack of pink construction-paper sheets: each answer peels the top sheet off and the next question is what was underneath. It deliberately avoids the pastel card-quiz with a progress bar and a confetti result.

## World

- Ground: bubblegum pink edge to edge (`--ground`). Sheets are a lighter pink (`--paper`), with two rotated sheets peeking out underneath.
- Ink is the marker set from the board: questions in marker blue, Yes in green, No in red, the verdict boxed in red or green and rotated two degrees like a hand-drawn box.
- Rescue questions arrive on a white sheet (the board showing through the paper) with her line "Every no doesn't mean it's over."
- One type family, Bricolage Grotesque (variable, self-hosted, OFL). Display weight for questions and verdicts, text weight for everything else.
- Controls are sharp-cornered like cut paper. No radius anywhere.

## Motion

One authored motion: the peel. On an answer the current sheet rotates and lifts off the top-left (`cubic-bezier(0.16, 1, 0.3, 1)`, 560ms) while the next sheet settles in beneath it. Back runs the same animation in reverse. `prefers-reduced-motion` swaps both for a plain replace.

## Result

The verdict in her words, the question he fell on (and the rescue he missed, if there was one), "No hard feelings", and an itemised tally of every answer. "Send it to the friend" uses the Web Share API and falls back to the clipboard.

## Accessibility and craft floor

- All text passes 4.5:1 on its own sheet (ink-soft 5.2, blue 5.3, red 4.6, green 5.0 on pink; higher on the white sheet).
- Tap targets: choices 76px tall, Start and result buttons 64px, Back 44px.
- Focus rings in marker blue; selection themed; tap highlight cleared; `theme-color` and `color-scheme` set.
- The new sheet's heading takes focus so screen readers announce it; the sheet is `aria-live="polite"`.
- Keyboard: Y, N, and Backspace work on question sheets.
- No horizontal scroll at 390px (rotated under-sheets are clipped by `overflow-x: clip`).
- Icons are inline SVG, not emoji.

## Content fidelity

Question wording is transcribed from the board in the reel. Question marks are added where the board omits them ("Is he employed", "Did he text you after the date", "Was he nice to the wait staff"). The therapy note on the yes-via-therapy result paraphrases what she says in the audio ("if we get to this point and the therapy is what's holding us up, we have to decide on ourselves").

## Finish review

No finish-reviewer agent exists in the harness this was built in, so the review was an in-thread pass against the craft floor and the direction contract, at 390x844 and 1440x900. One batch of fixes (question size, sheet height, result copy, hover states, stray heading focus ring), one recheck. Verdict: ships.
