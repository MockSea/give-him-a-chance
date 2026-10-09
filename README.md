# Sherita's flowcharts

Sherita Janielle's dating flowcharts ([@sheritajanielle](https://www.instagram.com/sheritajanielle/)) as swipe decks: one question per card, right for yes, left for no. The site root is an index with one panel per part; tapping a panel opens that part.

- Part 1, "Should you give this man a chance?" ([the reel](https://www.instagram.com/reel/DeKs-qdvu4l/)), at `/give-him-a-chance/`. Pink.
- Part 2, "Is he worth your time?" ([the reel](https://www.instagram.com/reel/DeSKNONvs7q/)), at `/worth-your-time/`. Lilac.

Static site, one shared engine for every deck: `style.css`, `app.js`, one self-hosted font (Bricolage Grotesque, OFL, in `fonts/`). Each deck is a folder with an `index.html` and a `deck.js` that sets `window.DECK` (questions, verdicts, title, lede, credit, and which part it is) and loads before `../app.js`. The `<head>` tags and the `<noscript>` credit stay in each page's HTML, since link previews and no-JS readers never run `deck.js`. A deck's colour is `data-theme` on its `<html>` (no attribute means pink; `lilac` is defined in `style.css`). No backend, no tracking, no external scripts.

The index is `index.html` + `index.css` + `index.js` at the root. Adding a part is one new folder and one new `<li>` in the index (there is a comment above the list saying what to change); if it wants its own colour, add a `[data-theme="..."]` block to `style.css` and use it on both the deck's `<html>` and its panel.

The question wording in the deck files is hers, from the reels. Design notes are in `DESIGN.md`.

QA: `node qa/qa.mjs path/to/playwright/index.mjs` runs the index and both decks in chromium (390x844, touch) and webkit (iPhone 15; iPhone SE and 375x667 for the fit checks), plus the index once more in chromium with cross-document view transitions hidden so the JS fallback is exercised. `BASELINE_DIR=<checkout>` adds a pixel comparison of part 1 against another checkout. Screenshots go to `qa/shots/`.
