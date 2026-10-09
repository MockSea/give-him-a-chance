// End-to-end QA for both decks, in chromium (390x844, touch) and webkit
// (iPhone 15). Serves the repo itself with python3 -m http.server.
//
//   node qa/qa.mjs [path/to/playwright/index.mjs]
//
// Optional: BASELINE_DIR=/path/to/a/checkout/of/main compares part 1's
// screens pixel for pixel against that checkout (chromium only).
// Screenshots go to qa/shots/ (gitignored).
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'qa', 'shots');
const PW = process.argv[2] || process.env.PLAYWRIGHT || 'playwright';
const { chromium, webkit, devices } = await import(PW);

fs.mkdirSync(SHOTS, { recursive: true });

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

async function serve(dir) {
  const port = await freePort();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url: `http://127.0.0.1:${port}/`, stop: () => proc.kill() };
}

// ---- tiny test ledger ------------------------------------------------------

function ledger(engine) {
  const results = [];
  return {
    results,
    check(name, ok, detail = '') {
      results.push({ name, ok: !!ok, detail });
      if (!ok) console.log(`  FAIL [${engine}] ${name}${detail ? ` -- ${detail}` : ''}`);
    },
  };
}

// ---- page helpers ------------------------------------------------------------

const idle = (page) => page.waitForFunction(() => !animating && !document.querySelector('.card.flying, .card.returning'));

async function tapAndSettle(page, selector) {
  await page.locator(selector).tap();
  await idle(page);
}

const answer = (page, v) => tapAndSettle(page, v === 'yes' ? '#act-yes' : '#act-no');
const flip = (v) => (v === 'yes' ? 'no' : 'yes');

async function view(page) {
  return page.evaluate(() => {
    const pos = positionAfter(state.history);
    const h1 = document.querySelector('#card h1');
    const note = document.querySelector('#card .note');
    const quote = document.querySelector('#card .quote');
    return {
      screen: screenOf(state),
      pos,
      h1: h1 ? h1.textContent : null,
      note: note ? note.childNodes[0].textContent : null,
      quote: quote ? quote.childNodes[0].textContent : null,
      len: state.history.length,
      marks: document.querySelectorAll('#card .marks li').length,
    };
  });
}

async function start(page) {
  await page.locator('#act-yes').tap();
  await idle(page);
}

async function toStep(page, steps, upTo) {
  // From a fresh first question, pass every main question before `upTo`.
  for (let i = 0; i < upTo; i += 1) await answer(page, steps[i].pass);
}

async function restart(page) {
  await page.locator('#card .btn.quiet').tap();
  await idle(page);
}

// Every element inside the card sits within it, and nothing scrolls.
async function fits(page) {
  return page.evaluate(() => {
    const card = document.getElementById('card');
    const r = card.getBoundingClientRect();
    const clipped = [...card.querySelectorAll('h1, p, ol')].filter((n) => {
      const b = n.getBoundingClientRect();
      return b.bottom > r.bottom + 0.5 || b.right > r.right + 0.5;
    }).map((n) => n.className || n.tagName);
    const doc = document.documentElement;
    return {
      ok: card.scrollHeight <= card.clientHeight + 1 && clipped.length === 0
        && doc.scrollHeight <= window.innerHeight + 1 && doc.scrollWidth <= doc.clientWidth,
      detail: `card ${card.scrollHeight}/${card.clientHeight}, doc ${doc.scrollHeight}/${window.innerHeight}, clipped ${clipped.join(',')}`,
    };
  });
}

const noHScroll = (page) => page.evaluate(() => {
  const d = document.documentElement;
  return { ok: d.scrollWidth <= d.clientWidth && document.body.scrollWidth <= d.clientWidth, detail: `${d.scrollWidth}/${d.clientWidth}` };
});

async function drag(page, dx, steps = 12) {
  const box = await page.locator('#card').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + (dx * i) / steps, y + 4 * i / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150); // let it settle so the release is not a flick
  await page.mouse.up();
  await page.waitForTimeout(30);
  await idle(page);
  await page.waitForTimeout(SNAP_WAIT);
}
const SNAP_WAIT = 360;

// Real touch drag through CDP (chromium only).
async function touchDrag(page, cdp, dx) {
  const box = await page.locator('#card').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.45;
  const send = (type, px) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y }] });
  await send('touchStart', x);
  for (let i = 1; i <= 12; i += 1) { await send('touchMove', x + (dx * i) / 12); await page.waitForTimeout(16); }
  await page.waitForTimeout(150);
  await send('touchEnd', x + dx);
  await page.waitForTimeout(30);
  await idle(page);
}

// ---- one deck in one context -----------------------------------------------

async function runDeck(ctx, base, deckPath, t, label, opts) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const url = base + deckPath;
  await page.goto(url);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const deck = await page.evaluate(() => window.DECK);
  const steps = deck.STEPS;
  const P = (s) => `${label}: ${s}`;

  // head and start card come from the deck
  const head = await page.evaluate(() => ({
    title: document.title,
    og: document.querySelector('meta[property="og:title"]').content,
    font: document.fonts.check('800 40px Bricolage'),
    h1: document.querySelector('#card h1').innerHTML,
    lede: document.querySelector('#card .lede').textContent,
    credit: document.querySelector('#card .credit').textContent,
    reel: [...document.querySelectorAll('#card .credit a')].find((a) => a.textContent === 'watch the reel')?.href,
    byline: !!document.querySelector('#card .credit .byline a[href="https://github.com/MockSea"]'),
    noscriptReel: document.querySelector('noscript').textContent.includes(window.DECK.CREDIT.reel),
  }));
  t.check(P('<title> and og:title match the deck title'), head.title === deck.TITLE_TEXT && head.og === deck.TITLE_TEXT, `${head.title} / ${head.og}`);
  t.check(P('font loads (relative path resolves)'), head.font);
  t.check(P('start title and lede from deck'), head.h1 === deck.TITLE_HTML && head.lede === deck.LEDE);
  t.check(P('watch-the-reel link is this deck\'s reel'), head.reel === deck.CREDIT.reel, head.reel);
  t.check(P('noscript credit points at this deck\'s reel'), head.noscriptReel);
  t.check(P('built-by-Moxy byline present'), head.byline);
  await page.screenshot({ path: path.join(SHOTS, `${opts.engine}-${opts.slug}-start.png`) });
  let h = await noHScroll(page);
  t.check(P(`no horizontal scroll on start at ${opts.width}`), h.ok, h.detail);

  // all-pass path -> YES
  await start(page);
  let v = await view(page);
  t.check(P('start deals question 1'), v.screen === 'question' && v.h1 === steps[0].q);
  t.check(P(`progress marks = ${steps.length}`), v.marks === steps.length, String(v.marks));
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.marks')).gridTemplateColumns.split(' ').length);
  t.check(P('marks grid has one column per question'), cols === steps.length, String(cols));
  h = await noHScroll(page);
  t.check(P(`no horizontal scroll on a question at ${opts.width}`), h.ok, h.detail);
  await toStep(page, steps, steps.length);
  v = await view(page);
  t.check(P('all-pass path reaches YES'), v.screen === 'result' && v.pos.verdict === 'YES' && v.h1 === deck.VERDICT.YES, v.h1);
  t.check(P('YES shows her yes line'), v.quote === deck.YES_LINE);
  const next = await page.locator('#card a.next').count();
  t.check(P(deck.NEXT ? 'YES has the part 2 link' : 'YES has no next-part link'), next === (deck.NEXT ? 1 : 0));
  await page.screenshot({ path: path.join(SHOTS, `${opts.engine}-${opts.slug}-yes.png`), fullPage: true });
  h = await noHScroll(page);
  t.check(P(`no horizontal scroll on result at ${opts.width}`), h.ok, h.detail);

  // share text
  await page.evaluate(() => { window.__shared = null; });
  await page.locator('#card .actions .btn').first().tap();
  await page.waitForFunction(() => window.__shared !== null);
  const shared = await page.evaluate(() => window.__shared);
  t.check(P('share text has the deck title, the verdict and this URL'),
    shared.startsWith(`${deck.TITLE_TEXT} I ran him through ${deck.CREDIT.handle}'s flowchart.`)
    && shared.includes(`Verdict: ${deck.VERDICT.YES}`) && shared.trim().endsWith(url), JSON.stringify(shared));

  // restart from result, then each failure path
  await restart(page);
  v = await view(page);
  t.check(P('restart from result goes to the start card'), v.screen === 'start' && v.h1 === null || v.screen === 'start');

  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    await start(page);
    await toStep(page, steps, i);
    await answer(page, flip(s.pass));
    v = await view(page);
    if (!s.rescue) {
      t.check(P(`Q${i + 1} fail, no rescue -> NO with her why`),
        v.pos.verdict === 'NO' && v.pos.failedAt === i && v.h1 === deck.VERDICT.NO && v.quote === s.why.text, `${v.h1} | ${v.quote}`);
      if (i === 0 || opts.shareEveryNo) {
        await page.evaluate(() => { window.__shared = null; });
        await page.locator('#card .actions .btn').first().tap();
        await page.waitForFunction(() => window.__shared !== null);
        const txt = await page.evaluate(() => window.__shared);
        t.check(P('NO share text has title, verdict, why and URL'),
          txt.startsWith(deck.TITLE_TEXT) && txt.includes(`Verdict: ${deck.VERDICT.NO}`) && txt.includes(s.why.text) && txt.trim().endsWith(url), JSON.stringify(txt));
      }
      await restart(page);
      continue;
    }
    t.check(P(`Q${i + 1} fail -> rescue card`), v.screen === 'question' && v.pos.phase === 'rescue' && v.h1 === s.rescue.q, v.h1);
    t.check(P(`Q${i + 1} rescue note ${s.rescue.note ? 'shown' : 'absent'}`), v.note === (s.rescue.note || null), v.note);
    if (s.rescue.note) await page.screenshot({ path: path.join(SHOTS, `${opts.engine}-${opts.slug}-rescue-${i + 1}.png`) });
    // rescue pass -> continues
    await answer(page, s.rescue.pass);
    v = await view(page);
    const last = i === steps.length - 1;
    t.check(P(`Q${i + 1} rescue pass -> ${last ? 'YES' : `Q${i + 2}`}`),
      last ? v.pos.verdict === 'YES' : v.screen === 'question' && v.h1 === steps[i + 1].q, v.h1);
    // back to the rescue, then fail it
    if (last) await tapAndSettle(page, '#card .undo'); else await tapAndSettle(page, '#back');
    v = await view(page);
    t.check(P(`Q${i + 1} back after rescue pass returns to the rescue`), v.h1 === s.rescue.q && v.pos.phase === 'rescue');
    await answer(page, flip(s.rescue.pass));
    v = await view(page);
    t.check(P(`Q${i + 1} rescue fail -> NO with her why`),
      v.pos.verdict === 'NO' && v.pos.failedAt === i && v.h1 === deck.VERDICT.NO && v.quote === s.why.text, `${v.h1} | ${v.quote}`);
    await restart(page);
  }

  // Back, twice, after each kind of answer
  const ri = steps.findIndex((s) => s.rescue);
  await start(page);
  await answer(page, steps[0].pass); // a pass
  await tapAndSettle(page, '#back');
  v = await view(page);
  t.check(P('back after a pass returns to that question'), v.h1 === steps[0].q && v.len === 0);
  t.check(P('back is disabled on the first question'), await page.locator('#back').isDisabled());
  await toStep(page, steps, ri);
  await answer(page, flip(steps[ri].pass)); // a fail into rescue
  await tapAndSettle(page, '#back');
  v = await view(page);
  t.check(P('back after a fail-into-rescue returns to the main question'), v.h1 === steps[ri].q && v.pos.phase === 'main');
  await tapAndSettle(page, '#back');
  v = await view(page);
  t.check(P('second back returns to the question before'), v.h1 === steps[ri - 1].q && v.len === ri - 1, v.h1);
  await answer(page, steps[ri - 1].pass);
  await answer(page, flip(steps[ri].pass));
  await answer(page, flip(steps[ri].rescue.pass)); // a final NO
  await tapAndSettle(page, '#card .undo');
  v = await view(page);
  t.check(P('Change the last answer from NO returns to the rescue'), v.h1 === steps[ri].rescue.q);
  await tapAndSettle(page, '#back');
  v = await view(page);
  t.check(P('second back from there returns to the main question'), v.h1 === steps[ri].q && v.pos.phase === 'main');
  await restart(page).catch(() => {});
  if ((await view(page)).screen !== 'start') { await page.reload(); await idle(page); }

  // Drag: a short drag snaps back, past threshold answers
  await page.locator('#card').waitFor();
  const box = await page.locator('#card').boundingBox();
  const dragDist = Math.min(0.38 * box.width, 160) + 40;
  await drag(page, dragDist); // on the start card, either way starts
  v = await view(page);
  t.check(P('drag right on start card deals Q1'), v.screen === 'question' && v.h1 === steps[0].q, v.h1);
  await drag(page, 30);
  v = await view(page);
  t.check(P('short drag snaps back without answering'), v.len === 0 && v.h1 === steps[0].q);
  const transform = await page.evaluate(() => document.getElementById('card').style.transform);
  t.check(P('card transform cleared after snap back'), transform === '' || transform === 'none', transform);
  await drag(page, steps[0].pass === 'yes' ? dragDist : -dragDist);
  v = await view(page);
  t.check(P(`drag ${steps[0].pass === 'yes' ? 'right' : 'left'} answers ${steps[0].pass}`), v.len === 1 && v.h1 === steps[1].q, v.h1);
  await drag(page, steps[1].pass === 'yes' ? -dragDist : dragDist);
  v = await view(page);
  t.check(P(`drag ${steps[1].pass === 'yes' ? 'left' : 'right'} answers ${flip(steps[1].pass)}`), v.len === 2 && (v.pos.verdict === 'NO' || v.pos.phase === 'rescue'), JSON.stringify(v.pos));
  if (opts.cdp) {
    await page.reload();
    await idle(page);
    const cdp = await ctx.newCDPSession(page);
    await touchDrag(page, cdp, -dragDist);
    v = await view(page);
    t.check(P('touch drag on start card deals Q1'), v.screen === 'question');
    await touchDrag(page, cdp, steps[0].pass === 'yes' ? dragDist : -dragDist);
    v = await view(page);
    t.check(P('touch drag answers Q1'), v.len === 1 && v.h1 === steps[1].q, v.h1);
    await touchDrag(page, cdp, 25);
    v = await view(page);
    t.check(P('short touch drag snaps back'), v.len === 1);
  }

  // Cross-links
  await page.goto(url);
  await idle(page);
  if (deck.SERIES) {
    const series = await page.locator('#card .credit .series').textContent();
    t.check(P('start credit line says which part'), series.startsWith(deck.SERIES.label), series);
    await Promise.all([page.waitForURL(base), page.locator('#card .credit .series a').tap()]);
    await page.waitForFunction(() => !!window.DECK);
    const there = await page.evaluate(() => ({ href: location.href, title: window.DECK && window.DECK.TITLE_TEXT }));
    t.check(P('back-link goes to part 1'), there.href === base && there.title === 'Should you give this man a chance?', there.href);
  }
  if (deck.NEXT) {
    await start(page);
    await toStep(page, steps, steps.length);
    await Promise.all([page.waitForURL(`${base}worth-your-time/`), page.locator('#card a.next').tap()]);
    await page.waitForFunction(() => !!window.DECK);
    const there = await page.evaluate(() => ({ href: location.href, title: window.DECK && window.DECK.TITLE_TEXT }));
    t.check(P('part 2 link goes to part 2'), there.href === `${base}worth-your-time/` && there.title === 'Is he worth your time?', there.href);
  }

  t.check(P('no console errors or failed requests'), errors.length === 0, errors.join(' | '));
  await page.close();
}

// Walk every question card (each main, and each rescue) at a small size and
// check it all fits without scrolling or clipping.
async function fitWalk(ctx, base, deckPath, t, label, size) {
  const page = await ctx.newPage();
  await page.goto(base + deckPath);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const steps = await page.evaluate(() => window.DECK.STEPS);
  const P = (s) => `${label} @${size}: ${s}`;
  let f = await fits(page);
  t.check(P('start card fits'), f.ok, f.detail);
  await start(page);
  for (let i = 0; i < steps.length; i += 1) {
    f = await fits(page);
    t.check(P(`Q${i + 1} fits`), f.ok, f.detail);
    if (steps[i].rescue) {
      await answer(page, flip(steps[i].pass));
      f = await fits(page);
      t.check(P(`Q${i + 1} rescue fits`), f.ok, f.detail);
      await answer(page, steps[i].rescue.pass);
    } else {
      await answer(page, steps[i].pass);
    }
  }
  const h = await noHScroll(page);
  t.check(P('no horizontal scroll on result'), h.ok, h.detail);
  await page.close();
}

const INIT = () => {
  window.__shared = null;
  Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ text }) => { window.__shared = text; } });
};

async function engineRun(name, browserType, ctxOpts, smallOpts, base) {
  const t = ledger(name);
  const browser = await browserType.launch();
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(INIT);
  const width = ctxOpts.viewport.width;
  await runDeck(ctx, base, '', t, 'part 1', { engine: name, slug: 'p1', width, cdp: name === 'chromium' });
  await runDeck(ctx, base, 'worth-your-time/', t, 'part 2', { engine: name, slug: 'p2', width, cdp: name === 'chromium' });
  const small = await browser.newContext(smallOpts);
  await small.addInitScript(INIT);
  for (const [deckPath, label] of [['', 'part 1'], ['worth-your-time/', 'part 2']]) {
    await fitWalk(small, base, deckPath, t, label, `${smallOpts.viewport.width}x${smallOpts.viewport.height}`);
    await fitWalk(ctx, base, deckPath, t, label, `${width}x${ctxOpts.viewport.height}`);
  }
  await browser.close();
  return t.results;
}

// Pixel compare part 1 against a baseline checkout, roasts pinned.
async function compareBaseline(base, baseDir) {
  const t = ledger('baseline');
  const old = await serve(baseDir);
  const browser = await chromium.launch();
  const opts = { viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce', deviceScaleFactor: 2 };
  const shots = {};
  for (const [tag, root] of [['new', base], ['old', old.url]]) {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(() => { Math.random = () => 0; });
    const page = await ctx.newPage();
    await page.goto(root);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    const snap = async (k) => { await page.waitForTimeout(400); shots[`${tag}-${k}`] = await page.screenshot({ fullPage: true, animations: 'disabled' }); };
    const tap = async (sel) => { await page.locator(sel).tap(); await page.waitForTimeout(400); };
    await snap('start');
    await tap('#act-yes'); await snap('q1');
    await tap('#act-yes'); await tap('#act-no'); await tap('#act-no'); await snap('rescue3');
    await tap('#act-no'); await snap('no3');
    await tap('#card .btn.quiet'); await tap('#act-yes');
    for (const a of ['yes', 'no', 'yes', 'yes', 'yes', 'yes', 'yes']) await tap(`#act-${a}`);
    await tap('#act-no'); await snap('rescue8');
    await tap('#act-yes'); await snap('yes');
    await ctx.close();
  }
  for (const k of ['start', 'q1', 'rescue3', 'no3', 'rescue8', 'yes']) {
    const same = shots[`new-${k}`].equals(shots[`old-${k}`]);
    fs.writeFileSync(path.join(SHOTS, `baseline-old-${k}.png`), shots[`old-${k}`]);
    fs.writeFileSync(path.join(SHOTS, `baseline-new-${k}.png`), shots[`new-${k}`]);
    t.check(`part 1 ${k} identical to baseline`, same);
  }
  await browser.close();
  old.stop();
  return t.results;
}

const srv = await serve(ROOT);
const summary = {};
try {
  summary.chromium = await engineRun('chromium', chromium,
    { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
    { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, srv.url);
  summary.webkit = await engineRun('webkit', webkit, { ...devices['iPhone 15'] }, { ...devices['iPhone SE'] }, srv.url);
  if (process.env.BASELINE_DIR) summary.baseline = await compareBaseline(srv.url, process.env.BASELINE_DIR);
} finally {
  srv.stop();
}

let failed = 0;
for (const [k, rs] of Object.entries(summary)) {
  const bad = rs.filter((r) => !r.ok);
  failed += bad.length;
  console.log(`${k}: ${rs.length - bad.length} passed, ${bad.length} failed`);
}
process.exit(failed ? 1 : 0);
