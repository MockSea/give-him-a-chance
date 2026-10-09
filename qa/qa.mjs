// End-to-end QA for the index and both decks, in chromium (390x844, touch)
// and webkit (iPhone 15). Serves the repo itself with python3 -m http.server.
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
import { motionFrames, navigationEdges } from './motion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'qa', 'shots');
const PW = process.argv[2] || process.env.PLAYWRIGHT || 'playwright';
const { chromium, webkit, devices } = await import(PW);

// Where each part lives under the site root.
const P1 = 'give-him-a-chance/';
const P2 = 'worth-your-time/';
const INDEX_TITLE = "Sherita's flowcharts";
// Computed colours of each theme's ground and paper, as the browser reports them.
const PINK = { ground: 'rgb(236, 141, 177)', paper: 'rgb(247, 172, 199)' };
const LILAC = { ground: 'rgb(186, 148, 230)', paper: 'rgb(212, 183, 245)' };

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

const idle = (page) => page.waitForFunction(() => !window.deckApp.animating && !document.documentElement.classList.contains('leaving') && !document.querySelector('.card.flying, .card.returning'));

async function tapAndSettle(page, selector) {
  await page.locator(selector).tap();
  await idle(page);
}

const answer = (page, v) => tapAndSettle(page, v === 'yes' ? '#act-yes' : '#act-no');
const flip = (v) => (v === 'yes' ? 'no' : 'yes');

async function view(page) {
  return page.evaluate(() => {
    const { state, positionAfter, screenOf } = window.deckApp;
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
    themeColor: document.querySelector('meta[name="theme-color"]').content,
    ground: getComputedStyle(document.getElementById('app')).backgroundColor,
    paper: getComputedStyle(document.getElementById('card')).backgroundColor,
    rgbTheme: (() => { const c = document.createElement('i'); c.style.color = document.querySelector('meta[name="theme-color"]').content; document.body.append(c); const v = getComputedStyle(c).color; c.remove(); return v; })(),
  }));
  const theme = opts.theme || PINK;
  t.check(P(`painted in ${opts.theme === LILAC ? 'lilac' : 'pink'}`), head.ground === theme.ground && head.paper === theme.paper, `${head.ground} / ${head.paper}`);
  t.check(P('theme-color meta matches the ground'), head.rgbTheme === theme.ground, head.themeColor);
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
  const series = await page.locator('#card .credit .series').textContent();
  t.check(P('start credit line says which part'), deck.SERIES && series.startsWith(deck.SERIES.label), series);
  if (deck.SERIES && deck.SERIES.prev) {
    await Promise.all([page.waitForURL(`${base}${P1}`), page.locator('#card .credit .series a').first().tap()]);
    await page.waitForFunction(() => !!window.DECK);
    const there = await page.evaluate(() => ({ href: location.href, title: window.DECK && window.DECK.TITLE_TEXT }));
    t.check(P('back-link goes to part 1'), there.href === `${base}${P1}` && there.title === 'Should you give this man a chance?', there.href);
    await page.goto(url);
    await idle(page);
  }
  await Promise.all([page.waitForURL(base), page.locator('#card .credit .series a.all').tap()]);
  await page.waitForFunction(() => document.querySelectorAll('.panel').length > 0);
  const index = await page.evaluate(() => ({ href: location.href, title: document.title, panels: document.querySelectorAll('.panel').length }));
  t.check(P('"all parts" goes to the index'), index.href === base && index.title === INDEX_TITLE && index.panels === 2, `${index.href} ${index.title}`);
  if (deck.NEXT) {
    await page.goto(url);
    await idle(page);
    await start(page);
    await toStep(page, steps, steps.length);
    await Promise.all([page.waitForURL(`${base}${P2}`), page.locator('#card a.next').tap()]);
    await page.waitForFunction(() => !!window.DECK);
    const there = await page.evaluate(() => ({ href: location.href, title: window.DECK && window.DECK.TITLE_TEXT }));
    t.check(P('part 2 link goes to part 2'), there.href === `${base}${P2}` && there.title === 'Is he worth your time?', there.href);
  }

  t.check(P('no console errors or failed requests'), errors.length === 0, errors.join(' | '));
  await page.close();
}

// The series index: panels, colours, and the trips into each deck and back.
async function runIndex(ctx, base, t, opts) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
  const P = (s) => `index${opts.tag ? ` (${opts.tag})` : ''}: ${s}`;
  const shot = (k) => page.screenshot({ path: path.join(SHOTS, `${opts.engine}-index${opts.tag ? `-${opts.tag}` : ''}-${k}.png`) });

  await page.goto(base);
  await page.evaluate(() => { window.indexDocument = true; });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const info = await page.evaluate(() => {
    const bg = (el) => getComputedStyle(el).backgroundColor;
    const panels = [...document.querySelectorAll('.panel')].map((p) => {
      const r = p.getBoundingClientRect();
      return {
        part: p.querySelector('.part').textContent.trim(),
        title: p.querySelector('.title').textContent.trim(),
        href: p.querySelector('.title a').getAttribute('href'),
        lede: p.querySelector('.lede').textContent.trim(),
        credit: (p.querySelector('.credit a[href*="instagram.com/sheritajanielle"]') || {}).textContent || '',
        ground: bg(p),
        paper: bg(p.querySelector('.mini')),
        shown: r.width > 200 && r.height > 150 && r.right <= window.innerWidth + 0.5,
      };
    });
    return {
      panels,
      title: document.title,
      og: (document.querySelector('meta[property="og:title"]') || {}).content,
      desc: (document.querySelector('meta[name="description"]') || {}).content || '',
      themeColor: (document.querySelector('meta[name="theme-color"]') || {}).content,
      noscript: !!document.querySelector('noscript'),
      byline: !!document.querySelector('.colophon .byline a[href="https://github.com/MockSea"]'),
      font: document.fonts.check('800 40px Bricolage'),
      native: 'PageRevealEvent' in window,
      eagerDeck: performance.getEntriesByType('resource').some((r) => /\/(app|deck)\.js$/.test(r.name)),
    };
  });
  t.check(P('static title, description and og tags'), info.title === INDEX_TITLE && info.og === INDEX_TITLE && info.desc.length > 20, `${info.title} / ${info.og}`);
  t.check(P('font loads'), info.font);
  t.check(P('initial index does not load deck scripts'), !info.eagerDeck);
  t.check(P('two panels, in order, pointing at their decks'), info.panels.length === 2
    && info.panels[0].part === 'Part 1' && info.panels[0].href === P1
    && info.panels[1].part === 'Part 2' && info.panels[1].href === P2, JSON.stringify(info.panels.map((p) => [p.part, p.href])));
  t.check(P('part 1 panel is pink'), info.panels[0].ground === PINK.ground && info.panels[0].paper === PINK.paper, `${info.panels[0].ground} / ${info.panels[0].paper}`);
  t.check(P('part 2 panel is lilac'), info.panels[1].ground === LILAC.ground && info.panels[1].paper === LILAC.paper, `${info.panels[1].ground} / ${info.panels[1].paper}`);
  t.check(P('each panel shows title, lede and the Sherita credit'), info.panels.every((p) => p.shown && p.title.length > 8 && p.lede.length > 10 && p.credit.includes('@sheritajanielle')));
  t.check(P('built-by-Moxy byline present'), info.byline);
  t.check(P('noscript note present'), info.noscript);
  t.check(P('navigation does not require cross-document view transitions'), !opts.fallback || !info.native);
  let h = await noHScroll(page);
  t.check(P(`no horizontal scroll at ${opts.width}`), h.ok, h.detail);
  await shot('start');
  if (opts.quick) {
    t.check(P('no console errors or failed requests'), errors.length === 0, errors.join(' | '));
    await page.close();
    return;
  }

  // ---- in and out of each deck
  const atRest = () => page.evaluate(() => ({
    url: location.href,
    leaving: document.documentElement.classList.contains('leaving'),
    sheets: document.querySelectorAll('.takeover').length,
    panels: document.querySelectorAll('.panel').length,
    first: document.querySelector('.panel').getBoundingClientRect().width,
  }));
  const restOk = (r) => r.url === base && !r.leaving && r.sheets === 0 && r.panels === 2 && r.first > 200;
  const restDetail = (r) => `${r.url} leaving=${r.leaving} sheets=${r.sheets} panels=${r.panels}`;
  const landed = () => page.evaluate(() => {
    const card = document.getElementById('card');
    const r = card ? card.getBoundingClientRect() : { width: 0, height: 0 };
    return {
      url: location.href,
      title: window.DECK && window.DECK.TITLE_TEXT,
      screen: document.getElementById('app') && document.getElementById('app').dataset.screen,
      card: r.width > 200 && r.height > 300 && !!card.querySelector('h1'),
    };
  });
  const open = async (n, deckPath) => {
    await Promise.all([page.waitForURL(`${base}${deckPath}`), page.locator(`.panel:nth-child(${n}) .title a`).tap()]);
    await page.waitForFunction(() => !!window.DECK && !!document.querySelector('#card h1') && !document.documentElement.classList.contains('leaving'));
    t.check(P('panel opens without replacing the document'), await page.evaluate(() => !!window.indexDocument));
    return landed();
  };
  const back = async () => {
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForFunction((b) => location.href === b && !!document.querySelector('.parts'), base);
    await page.waitForTimeout(700); // let any transition finish
    return atRest();
  };

  const decks = [[1, P1, 'Should you give this man a chance?'], [2, P2, 'Is he worth your time?']];
  for (const [n, deckPath, title] of decks) {
    for (let round = 1; round <= 2; round += 1) {
      const d = await open(n, deckPath);
      t.check(P(`tap panel ${n} lands on part ${n}'s start card (round ${round})`), d.url === `${base}${deckPath}` && d.title === title && d.screen === 'start' && d.card, `${d.url} ${d.screen}`);
      const r = await back();
      t.check(P(`back from part ${n} returns to the index at rest (round ${round})`), restOk(r), restDetail(r));
    }
  }

  // mid-transition frame, if one can be caught
  try {
    const tapping = page.locator('.panel:nth-child(2) .title a').tap();
    await page.waitForTimeout(opts.fallback ? 200 : 160);
    await shot('mid');
    await tapping;
    await page.waitForURL(`${base}${P2}`);
    await page.waitForFunction(() => !!window.DECK);
  } catch (e) {
    console.log(`  note [${opts.engine}] no mid-transition frame: ${String(e).split('\n')[0]}`);
    if (!page.url().startsWith(`${base}${P2}`)) await page.waitForURL(`${base}${P2}`);
  }
  let r = await back();
  t.check(P('back after the mid-transition shot returns to rest'), restOk(r), restDetail(r));

  // index -> part 1 -> YES -> part 2 link -> part 2, back, back
  let d = await open(1, P1);
  const steps = await page.evaluate(() => window.DECK.STEPS);
  await start(page);
  await toStep(page, steps, steps.length);
  await Promise.all([page.waitForURL(`${base}${P2}`), page.locator('#card a.next').tap()]);
  await page.waitForFunction(() => !!window.DECK && !!document.querySelector('#card h1'));
  d = await landed();
  t.check(P('index -> part 1 -> YES -> part 2'), d.url === `${base}${P2}` && d.title === 'Is he worth your time?' && d.screen === 'start' && d.card, d.url);
  t.check(P('next-part link stays in the index document'), await page.evaluate(() => !!window.indexDocument));
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForFunction((u) => location.href === u && !!window.DECK, `${base}${P1}`);
  const mid = await page.evaluate(() => ({ url: location.href, title: window.DECK.TITLE_TEXT }));
  t.check(P('first back lands on part 1'), mid.url === `${base}${P1}` && mid.title === 'Should you give this man a chance?', mid.url);
  r = await back();
  t.check(P('second back lands on the index at rest'), restOk(r), restDetail(r));

  // two quick taps: one navigation, one history entry, nothing stuck.
  // Two fresh gotos first, so the index is the last history entry and the
  // count can only grow: after the Backs above there are forward entries, and
  // a navigation from mid-history drops them (a goto to the current URL only
  // replaces, so step off the index and back on).
  await page.goto(`${base}${P1}`);
  await page.goto(base);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const box = await page.locator('.panel:nth-child(1) .title').boundingBox();
  const before = await page.evaluate(() => history.length);
  const nav = page.waitForURL(`${base}${P1}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  if (opts.fallback) {
    const apps = await page.locator('#app').count();
    t.check(P('double tap mounts one deck, not two'), apps <= 1, String(apps));
  }
  await nav;
  await page.waitForFunction(() => !!window.DECK);
  const after = await page.evaluate(() => history.length);
  t.check(P('double tap navigates once'), page.url() === `${base}${P1}` && after - before === 1, `history ${before} -> ${after}`);
  r = await back();
  t.check(P('back after a double tap returns to rest'), restOk(r), restDetail(r));

  // Forward uses the same document and a fresh, interactive start card.
  await page.goForward();
  await page.waitForFunction(() => !!document.querySelector('#card h1'));
  d = await landed();
  t.check(P('forward restores the deck start card'), d.screen === 'start' && d.card);
  await back();

  // Exercise the persisted-pageshow cleanup signal while expansion is active.
  await page.locator('.panel:nth-child(2) .title a').tap();
  await page.waitForFunction(() => !!document.querySelector('.route-deck'));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  const restored = await page.evaluate(() => ({
    leaving: document.documentElement.classList.contains('leaving'),
    overlays: document.querySelectorAll('.route-deck, .departing-panel').length,
    inert: document.getElementById('app').inert,
  }));
  t.check(P('persisted pageshow settles the live deck'), !restored.leaving && !restored.overlays && !restored.inert, JSON.stringify(restored));
  await back();

  // Back during motion cancels the pending completion instead of hiding index.
  await page.locator('.panel:nth-child(1) .title a').tap();
  await page.waitForFunction(() => document.documentElement.classList.contains('leaving'));
  r = await back();
  t.check(P('back during expansion leaves the index interactive'), restOk(r), restDetail(r));

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
  await runIndex(ctx, base, t, { engine: name, width });
  await runDeck(ctx, base, P1, t, 'part 1', { engine: name, slug: 'p1', width, cdp: name === 'chromium' });
  await runDeck(ctx, base, P2, t, 'part 2', { engine: name, slug: 'p2', width, cdp: name === 'chromium', theme: LILAC });
  const small = await browser.newContext(smallOpts);
  await small.addInitScript(INIT);
  await runIndex(small, base, t, { engine: name, width: smallOpts.viewport.width, tag: 'small', quick: true });
  for (const [deckPath, label] of [[P1, 'part 1'], [P2, 'part 2']]) {
    await fitWalk(small, base, deckPath, t, label, `${smallOpts.viewport.width}x${smallOpts.viewport.height}`);
    await fitWalk(ctx, base, deckPath, t, label, `${width}x${ctxOpts.viewport.height}`);
  }
  if (name === 'chromium') {
    // The same index checks with cross-document view transitions hidden from
    // the page, proving the same-document path is independent of that API.
    const plain = await browser.newContext(ctxOpts);
    await plain.addInitScript(INIT);
    await plain.addInitScript(() => { delete window.PageRevealEvent; });
    await runIndex(plain, base, t, { engine: name, width, tag: 'fallback', fallback: true });
  }
  await motionFrames(ctx, base, SHOTS, name, t);
  await navigationEdges(browser, ctxOpts, base, t);
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
    await page.goto(tag === 'new' ? root + P1 : root);
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
