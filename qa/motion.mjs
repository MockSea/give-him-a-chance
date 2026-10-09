// Sample every animation frame deterministically in both engines. Pausing and
// seeking WAAPI avoids dropping visual states while screenshot encoding runs.
// This checks appearance, not real-device frame rate.
import fs from 'node:fs';
import path from 'node:path';

// The swipe hint wiggles forever; freeze CSS animations for the end-state comparisons.
const still = { animations: 'disabled' };

// Chromium re-rasterises shadows after compositing ends; a few dozen pixels
// shift by a shade. Count clearly different pixels instead of comparing bytes.
async function sameImage(page, a, b, maxPixels = 200) {
  return page.evaluate(async ([a, b, maxPixels]) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    if (A.width !== B.width || A.height !== B.height) return false;
    const px = (i) => { const c = new OffscreenCanvas(i.width, i.height).getContext('2d'); c.drawImage(i, 0, 0); return c.getImageData(0, 0, i.width, i.height).data; };
    const [da, db] = [px(A), px(B)];
    let n = 0;
    for (let k = 0; k < da.length; k += 4) {
      if (Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2])) > 16) n++;
    }
    return n <= maxPixels;
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`, maxPixels]);
}

export async function motionFrames(ctx, base, shots, engine, t) {
  const page = await ctx.newPage();
  for (const [part, slug] of [[1, 'give-him-a-chance/'], [2, 'worth-your-time/']]) {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.captured = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = animate.apply(this, args);
        animation.pause();
        animation.currentTime = 0;
        window.captured.push(animation);
        return animation;
      };
    });
    await page.locator(`.panel:nth-child(${part}) .title a`).tap();
    await page.waitForFunction(() => window.captured.length === 3);
    const records = [];
    let last;
    for (const ms of [...Array.from({ length: 27 }, (_, i) => i * 16), 420]) {
      const frame = await page.evaluate((ms) => {
        window.captured.forEach((a) => { a.currentTime = ms; });
        const old = document.querySelector('.departing-panel');
        const col = document.querySelector('#app .col');
        const rect = document.querySelector('#card h1').getBoundingClientRect();
        return {
          ms, old: +getComputedStyle(old).opacity, next: +getComputedStyle(col).opacity,
          clip: getComputedStyle(document.querySelector('#app')).clipPath,
          background: getComputedStyle(document.querySelector('#app')).backgroundColor,
          title: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }, ms);
      records.push(frame);
      last = await page.screenshot({ path: path.join(shots, `${engine}-expand-p${part}-${String(ms).padStart(3, '0')}.png`), ...(ms === 420 ? still : {}) });
    }
    t.check(`motion part ${part}: titles never overlap`, records.every((f) => f.old === 0 || f.next === 0));
    t.check(`motion part ${part}: destination typography never scales`, records.every((f) => JSON.stringify(f.title) === JSON.stringify(records[0].title)));
    const colour = part === 1 ? 'rgb(236, 141, 177)' : 'rgb(186, 148, 230)';
    t.check(`motion part ${part}: ground stays in the chosen theme`, records.every((f) => f.background === colour));
    fs.writeFileSync(path.join(shots, `${engine}-expand-p${part}.json`), JSON.stringify(records, null, 2));
    await page.evaluate(() => window.captured.forEach((a) => a.finish()));
    await page.waitForFunction(() => !document.documentElement.classList.contains('leaving'));
    const live = await page.screenshot({ path: path.join(shots, `${engine}-expand-p${part}-live.png`), ...still });
    t.check(`motion part ${part}: final animation frame equals live page`, await sameImage(page, last, live));
    await page.goto(base + slug);
    await page.evaluate(() => document.fonts.ready);
    const direct = await page.screenshot(still);
    t.check(`motion part ${part}: expanded deck equals direct load`, await sameImage(page, live, direct));
  }
  await page.close();
}

export async function navigationEdges(browser, options, base, t) {
  const ctx = await browser.newContext({ ...options, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => { window.sameDocument = true; });
  await page.locator('.panel:nth-child(2) .title a').tap();
  await page.waitForURL(base + 'worth-your-time/');
  const instant = await page.evaluate(() => window.sameDocument && !document.querySelector('.route-deck, .departing-panel') && !document.documentElement.classList.contains('leaving'));
  t.check('reduced motion: instant same-document deck', instant);
  await page.locator('#act-yes').tap();
  t.check('reduced motion: mounted deck accepts input', await page.locator('#app').getAttribute('data-screen') === 'question');
  await page.goBack();
  await page.goForward();
  t.check('reduced motion: forward starts a fresh deck', await page.locator('#app').getAttribute('data-screen') === 'start');
  await page.locator('#act-yes').tap();
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('#card h1'));
  t.check('reload after pushState loads real deck HTML', await page.evaluate(() => !window.sameDocument && !!window.deckApp));
  await page.goBack();
  await page.waitForFunction((url) => location.href === url && !!document.querySelector('.parts') && !document.querySelector('.index-page').hidden, base);
  t.check('back after mid-deck reload restores home', await page.locator('#app').count() === 0);
  await page.goForward();
  await page.waitForFunction(() => window.DECK?.TITLE_TEXT === 'Is he worth your time?' && !!document.querySelector('#card h1'));
  t.check('forward after reload restores part 2', await page.locator('#app').getAttribute('data-screen') === 'start');

  // Direct deck navigation must not manufacture an extra home entry.
  await page.goto(base);
  await page.goto(base + 'give-him-a-chance/');
  await page.goBack();
  await page.waitForSelector('.parts');
  t.check('back from a directly loaded deck returns to prior index', page.url() === base);

  await page.evaluate(() => { window.sameDocument = true; });
  await page.locator('.panel:nth-child(2) .title a').tap();
  await page.waitForURL(base + 'worth-your-time/');
  await page.locator('#card .credit a').filter({ hasText: 'start with part 1' }).tap();
  await page.waitForURL(base + 'give-him-a-chance/');
  t.check('previous-part link stays in the index document', await page.evaluate(() => !!window.sameDocument && window.DECK.TITLE_TEXT === 'Should you give this man a chance?'));
  await page.locator('#card a.all').tap();
  await page.waitForSelector('.parts');
  t.check('all parts pushes home in the same document', await page.evaluate((url) => location.href === url && !!window.sameDocument && !window.deckApp, base));
  await page.goBack();
  await page.waitForFunction(() => window.DECK?.TITLE_TEXT === 'Should you give this man a chance?');
  await page.goBack();
  await page.waitForFunction(() => window.DECK?.TITLE_TEXT === 'Is he worth your time?');
  // Reload with both home and a different deck in the forward history.
  await page.reload();
  await page.waitForSelector('#card h1');
  await page.goForward();
  await page.waitForFunction(() => window.DECK?.TITLE_TEXT === 'Should you give this man a chance?');
  await page.goForward();
  await page.waitForSelector('.parts');
  t.check('forward after reload traverses another deck and all parts', page.url() === base);

  await page.goto(base);
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  await page.route('**/give-him-a-chance/', async (route) => {
    if (route.request().resourceType() === 'fetch') await waiting;
    await route.continue();
  });
  await page.locator('.panel:nth-child(1) .title a').tap();
  t.check('slow fetch: index remains visible until deck is ready', await page.evaluate(() => !document.querySelector('#app') && !document.querySelector('.index-page').hidden));
  release();
  await page.waitForURL(base + 'give-him-a-chance/');
  await page.unrouteAll({ behavior: 'wait' });

  await page.goto(base);
  await page.route('**/worth-your-time/', (route) => route.request().resourceType() === 'fetch'
    ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
  await page.locator('.panel:nth-child(2) .title a').tap();
  await page.waitForURL(base + 'worth-your-time/');
  await page.waitForFunction(() => !!document.querySelector('#card h1'));
  t.check('failed enhancement falls back to real deck navigation', await page.locator('.index-page').count() === 0);
  await page.goto(base + 'index.html?from=qa#parts');
  await page.evaluate(() => { window.aliasDocument = true; });
  await page.waitForTimeout(150);
  t.check('index.html, query and fragment do not trigger a reload loop', await page.evaluate(() => !!window.aliasDocument && !document.querySelector('.index-page').hidden));
  await ctx.close();
}
