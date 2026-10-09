# Should you give this man a chance?

Sherita Janielle's flowchart ([the reel](https://www.instagram.com/reel/DeKs-qdvu4l/), [@sheritajanielle](https://www.instagram.com/sheritajanielle/)) as a swipe deck: one question per card, right for yes, left for no.

Part 2, "Is he worth your time?" ([the reel](https://www.instagram.com/reel/DeSKNONvs7q/)), is at `/worth-your-time/`.

Static site, one shared engine for both decks: `style.css`, `app.js`, one self-hosted font (Bricolage Grotesque, OFL, in `fonts/`). Each deck is a page plus a `deck.js` that sets `window.DECK` (questions, verdicts, title, lede, credit) and loads before `app.js`: `index.html` + `deck.js` for part 1, `worth-your-time/` for part 2. A new deck is a new folder with those two files. The `<head>` tags and the `<noscript>` credit stay in each page's HTML, since link previews and no-JS readers never run `deck.js`. No backend, no tracking, no external scripts.

The question wording in the deck files is hers, from the reels. Design notes are in `DESIGN.md`.

QA: `node qa/qa.mjs path/to/playwright/index.mjs` runs both decks in chromium (390x844, touch) and webkit (iPhone 15, iPhone SE for the 375x667 fit check). `BASELINE_DIR=<checkout>` adds a pixel comparison of part 1 against another checkout.
