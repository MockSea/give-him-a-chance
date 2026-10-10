// Sample every animation frame deterministically in both engines. Pausing and
// seeking WAAPI avoids dropping visual states while screenshot encoding runs.
// This checks appearance, not real-device frame rate.
import fs from 'node:fs';
import path from 'node:path';

// Never let screenshot() fast-forward/reset animations at just the endpoints.
// The same CSS pose applies to live DOM and clones for the entire sample.
const still = { animations: 'allow' };
const decorativePose = `
  .nudge, .card.settle { animation: none !important; }
  .act, .act .disc, .btn { transition: none !important; }
`;
async function pinDecorations(page) {
  await page.evaluate((css) => {
    if (document.getElementById('qa-decorative-pose')) return;
    const style = document.createElement('style');
    style.id = 'qa-decorative-pose'; style.textContent = css;
    document.head.append(style);
  }, decorativePose);
}

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

const DURATION = 690, EXIT = 120, LAND = 570;
const TIMES = [...new Set([...Array.from({ length: 44 }, (_, i) => i * 16), 119, 120, 121, 569, 570, 571, DURATION])].sort((a, b) => a - b);

const P1 = 'give-him-a-chance/';
const P2 = 'worth-your-time/';
const settled = (page) => page.waitForFunction(() =>
  !window.routeBusy && !document.documentElement.classList.contains('leaving') && !window.deckApp?.animating);
const ready = async (page) => {
  await page.evaluate(() => window.routerReady);
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
};

// A contact sheet and pixel measurements of every frame, without a PNG library.
async function evidence(page, buffers, labels, regions = []) {
  return page.evaluate(async ({ urls, labels, regions }) => {
    const images = await Promise.all(urls.map((src) => new Promise((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src;
    })));
    const width = 156, height = Math.round(width * images[0].height / images[0].width);
    const sheet = document.createElement('canvas');
    sheet.width = width * 7; sheet.height = (height + 24) * Math.ceil(images.length / 7);
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#17111a'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    const paper = [[247, 172, 199], [212, 183, 245], [248, 249, 247]];
    const metrics = images.map((img, n) => {
      const x = n % 7 * width, y = Math.floor(n / 7) * (height + 24);
      ctx.drawImage(img, x, y + 24, width, height);
      ctx.fillStyle = 'white'; ctx.font = '12px sans-serif'; ctx.fillText(labels[n], x + 4, y + 17);
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let paperPixels = 0; const colours = [0, 0, 0];
      for (let k = 0; k < px.length; k += 4) {
        const match = paper.findIndex((rgb) => rgb.every((v, j) => Math.abs(px[k + j] - v) < 12));
        if (match !== -1) { paperPixels++; colours[match]++; }
      }
      const region = regions[n];
      let count = 0, luminance = 0, ink = 0, groundLeaks = 0;
      if (region) {
        const sx = c.width / region.viewport.width, sy = c.height / region.viewport.height;
        // Stay inside the rounded moving boundary, not the legitimate dark
        // masthead/gutters outside it. Sample at CSS-pixel density on DPR 2/3.
        const at = (x, y) => (Math.floor(y * sy) * c.width + Math.floor(x * sx)) * 4;
        const exposedGround = (k) => [3, 255, 7].every((v, j) => Math.abs(px[k + j] - v) < 5);
        const b = region.coverage;
        for (let y = Math.max(8, b.top + 32); y < Math.min(region.viewport.height - 8, b.bottom - 32); y += 2) {
          for (let x = Math.max(8, b.left + 32); x < Math.min(region.viewport.width - 8, b.right - 32); x += 2) {
            const k = at(x, y);
            count++;
            luminance += (.2126 * px[k] + .7152 * px[k + 1] + .0722 * px[k + 2]) / 255;
            if (Math.max(px[k], px[k + 1], px[k + 2]) < 190 && Math.min(px[k], px[k + 1], px[k + 2]) < 110) ink++;
            // Probe-only paint marks page ground and sibling content green.
            // Black glyphs/buttons are legitimate ink, never a ground leak.
            if (exposedGround(k)) groundLeaks++;
          }
        }
      }
      return { samples: count, luminance: count ? luminance / count : null,
        textFraction: count ? ink / count : null, groundLeaks,
        paperFraction: paperPixels / (c.width * c.height), colours: colours.map((n) => n / (c.width * c.height)) };
    });
    return { png: sheet.toDataURL('image/png').split(',')[1], metrics };
  }, { urls: buffers.map((b) => `data:image/png;base64,${b.toString('base64')}`), labels, regions });
}

async function instrument(page) {
  await ready(page);
  // Freeze only incidental CSS motion. Never use animations:disabled on a
  // paused route: Playwright would finish the very animations being sampled.
  await pinDecorations(page);
  await page.evaluate(() => {
    if (window.motionInstrumented) return;
    window.motionInstrumented = true;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const a = animate.apply(this, args);
      if (window.holdMotion) {
        a.pause(); a.currentTime = 0; window.captured.push(a);
      }
      return a;
    };
  });
}

async function sample(page, action, name, destination, shots, engine, t) {
  await instrument(page);
  // Match the viewport tap() will use, particularly on a scrolling verdict.
  if (typeof action === 'string') await page.locator(action).scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const prefix = `${engine}-${name}`;
  const before = await page.screenshot({ path: path.join(shots, `${prefix}-before.png`), ...still });
  await page.evaluate(() => { window.captured = []; window.holdMotion = true; });
  if (typeof action === 'string') await page.locator(action).tap(); else await action();
  await page.waitForURL(destination);
  // A cut fails explicitly instead of hanging the entire suite indefinitely.
  const moving = await page.waitForFunction(() => window.captured?.length > 0 &&
    document.documentElement.classList.contains('leaving'), null, { timeout: 2500 }).then(() => true, () => false);
  t.check(`${name}: navigation animates`, moving);
  if (!moving) {
    await page.evaluate(() => { window.holdMotion = false; });
    const cut = await page.screenshot({ path: path.join(shots, `${prefix}-cut.png`), ...still });
    const { png } = await evidence(page, [before, cut], ['before', 'no animation']);
    fs.writeFileSync(path.join(shots, `${prefix}-strip.png`), Buffer.from(png, 'base64'));
    return;
  }
  const probeStyle = await page.addStyleTag({ content: `
    html.route-ground-probe, html.route-ground-probe body,
    .route-ground-probe .route-stage,
    .route-ground-probe .route-stage > .route-view:has(.index-page) { background: rgb(3,255,7) !important; }
    .route-ground-probe .route-stage .index-page .panel:not([data-route-selected]),
    .route-ground-probe .route-stage .index-page .panel:not([data-route-selected]) * { background: rgb(3,255,7) !important; color: rgb(3,255,7) !important; }
  ` });
  const records = [], buffers = [before], labels = ['before'], probes = [];
  let last;
  for (const ms of TIMES) {
    records.push(await page.evaluate((ms) => {
      window.captured.forEach((a) => { a.currentTime = ms; });
      const rect = (el) => {
        const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const stage = document.querySelector('.route-stage');
      const surface = stage.querySelector('.route-surface');
      const titles = [...stage.querySelectorAll('h1, .title')].map((el) => ({
        text: el.textContent, ...rect(el), font: getComputedStyle(el).fontSize,
      }));
      const layers = [...stage.querySelectorAll('.route-view, .route-preview, .route-surface')];
      const clips = layers.map((el) => getComputedStyle(el).clipPath);
      const moving = layers.map((el) => {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return { a: m.a, b: m.b, c: m.c, d: m.d };
      });
      const clip = getComputedStyle(surface).clipPath;
      const insets = (clip) => {
        const values = clip.slice(6).split(')')[0].split('round')[0].trim().split(/\s+/);
        const [a, b = a, c = a, d = b] = values;
        return [a, b, c, d].map((v, i) => parseFloat(v) *
          (v.endsWith('%') ? (i % 2 ? innerWidth : innerHeight) / 100 : 1));
      };
      const inset = insets(clip);
      const coverage = stage.dataset.kind === 'swap'
        ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        : { left: inset[3], top: inset[0], right: innerWidth - inset[1], bottom: innerHeight - inset[2] };
      return { ms, kind: stage.dataset.kind, titles, moving, clips, coverage,
        copy: [...stage.querySelectorAll('[data-route-copy]')].map((el) => ({
          role: el.dataset.routeCopy, opacity: +getComputedStyle(el).opacity,
          element: el.className, display: getComputedStyle(el).display,
        })),
        material: stage.dataset.kind === 'index' ? {
          papers: stage.querySelectorAll('.route-paper').length,
          paperVisible: getComputedStyle(stage.querySelector('.route-paper')).visibility,
          endpointVisibility: [...stage.querySelectorAll('.route-preview, .route-surface > .route-view')]
            .map((el) => getComputedStyle(el).visibility),
          paper: rect(stage.querySelector('.route-paper')),
        } : null,
        viewport: { width: innerWidth, height: innerHeight },
        opacity: layers.map((el) => +getComputedStyle(el).opacity),
        background: getComputedStyle(surface).backgroundColor,
        timings: window.captured.filter((a) => a.effect.getKeyframes().some((f) => f.clipPath)).map((a) => ({
          duration: a.effect.getTiming().duration, frames: a.effect.getKeyframes().map((f) => ({ offset: f.computedOffset, easing: f.easing })),
        })),
      };
    }, ms));
    last = await page.screenshot({ path: path.join(shots, `${prefix}-${String(ms).padStart(3, '0')}.png`) });
    buffers.push(last); labels.push(`${ms}ms`);
    await page.evaluate(() => document.documentElement.classList.add('route-ground-probe'));
    probes.push(await page.screenshot());
    await page.evaluate(() => document.documentElement.classList.remove('route-ground-probe'));
  }
  t.check(`${name}: first frame preserves the source`, await sameImage(page, before, buffers[1]));
  t.check(`${name}: intermediate frame differs from both endpoints`,
    !(await sameImage(page, buffers[1 + TIMES.indexOf(336)], buffers[1])) && !(await sameImage(page, buffers[1 + TIMES.indexOf(336)], last)));
  t.check(`${name}: motion has many intermediate states`, new Set(records.map((f) => JSON.stringify(f.clips))).size > 10);
  t.check(`${name}: typography never scales`, records.every((f) =>
    f.moving.every((m) => Math.abs(m.a - 1) < .001 && Math.abs(m.d - 1) < .001 && Math.abs(m.b) < .001 && Math.abs(m.c) < .001) &&
    f.titles.every((title, i) => Math.abs(title.width - records[0].titles[i].width) < .1 &&
      Math.abs(title.height - records[0].titles[i].height) < .1 && title.font === records[0].titles[i].font)));
  t.check(`${name}: solid layers never fade`, records.every((f) => f.opacity.every((v) => v === 1)));
  t.check(`${name}: 450ms material motion between 120ms text phases`, records.every((f) =>
    f.timings.length > 0 && f.timings.every((v) => v.duration === DURATION &&
      v.frames.length === 4 && Math.abs(v.frames[1].offset * v.duration - EXIT) < .001 &&
      Math.abs(v.frames[2].offset * v.duration - LAND) < .001 &&
      v.frames[1].easing.replaceAll(' ', '') === 'cubic-bezier(0.4,0,0.2,1)')));
  t.check(`${name}: outgoing and incoming copy never coexist`, records.every((f) =>
    f.copy.length > 0 && !(f.copy.some((c) => c.role === 'outgoing' && c.opacity > 0) &&
      f.copy.some((c) => c.role === 'incoming' && c.opacity > 0))));
  t.check(`${name}: text fully exits before movement and enters only after landing`, records.every((f) =>
    f.copy.every((c) => (c.role === 'outgoing' ? f.ms < EXIT : f.ms > LAND) || c.opacity === 0)));
  t.check(`${name}: text phases are fades, not cuts`, ['outgoing', 'incoming'].every((role) =>
    records.some((f) => f.copy.some((c) => c.role === role && c.opacity > .1 && c.opacity < .9))));
  const clipAt = (ms) => JSON.stringify(records.find((f) => f.ms === ms).clips);
  t.check(`${name}: surface is stationary throughout both text fades`,
    clipAt(0) === clipAt(EXIT) && clipAt(LAND) === clipAt(DURATION));
  if (records[0].kind === 'index') {
    t.check(`${name}: travel paints one rounded paper and no endpoint slabs`, records
      .filter((f) => f.ms > EXIT && f.ms < LAND).every((f) =>
        f.material.papers === 1 && f.material.paperVisible === 'visible' &&
        f.material.endpointVisibility.every((v) => v === 'hidden') &&
        f.material.paper.width > 0 && f.material.paper.height > 0));
    t.check(`${name}: selected ground stays one colour`, records.every((f) => f.background === records[0].background));
    const areas = records.map((f) => (f.coverage.right - f.coverage.left) * (f.coverage.bottom - f.coverage.top));
    const sign = Math.sign(areas.at(-1) - areas[0]);
    t.check(`${name}: selected surface grows or contracts monotonically`, sign !== 0 && areas.every((v, i) => !i || sign * (v - areas[i - 1]) >= -.1));

  } else {
    t.check(`${name}: part to part uses an opaque sweep`, records.every((f) => f.opacity.every((v) => v === 1)) &&
      records[0].clips.at(-1) !== records.at(-1).clips.at(-1));
  }
  await page.evaluate(() => { window.holdMotion = false; window.captured.forEach((a) => a.finish()); });
  await settled(page);
  const live = await page.screenshot({ path: path.join(shots, `${prefix}-live.png`), ...still });
  buffers.push(live); labels.push('live');
  t.check(`${name}: final animation frame equals live page`, await sameImage(page, last, live));
  t.check(`${name}: cleanup leaves one interactive destination`, await page.evaluate(() =>
    !document.querySelector('.route-stage') &&
    (document.querySelector('#app') ? !document.querySelector('#app').inert && document.querySelector('.index-page').hidden :
      !document.querySelector('.index-page').inert && !document.querySelector('.index-page').hidden)));
  await probeStyle.evaluate((el) => el.remove());
  const { png, metrics } = await evidence(page, buffers, labels, [null, ...records, null]);
  const sampled = metrics.slice(1, -1);
  const probe = await evidence(page, probes, TIMES.map((ms) => `${ms}ms probe`), records);
  t.check(`${name}: no page ground or sibling paints inside the selected surface`,
    probe.metrics.every((m) => m.samples > 0 && m.groundLeaks === 0), JSON.stringify(probe.metrics));
  fs.writeFileSync(path.join(shots, `${prefix}-probe-strip.png`), Buffer.from(probe.png, 'base64'));
  const floor = Math.min(sampled[0].luminance, sampled.at(-1).luminance);
  t.check(`${name}: card-area luminance does not dip and recover`, sampled.every((m) => m.luminance >= floor - .08));
  fs.writeFileSync(path.join(shots, `${prefix}-strip.png`), Buffer.from(png, 'base64'));
  fs.writeFileSync(path.join(shots, `${prefix}.json`), JSON.stringify({ records, metrics, probe: probe.metrics }, null, 2));
  return live;
}

async function verdict(page) {
  await ready(page);
  const steps = await page.evaluate(() => window.DECK.STEPS);
  for (const pass of ['yes', ...steps.map((s) => s.pass)]) {
    await page.locator(`#act-${pass}`).tap(); await settled(page);
  }
  await page.waitForTimeout(1450); // includes the final heart's 500ms delay + 900ms burst
}

export async function motionFrames(ctx, base, shots, engine, t) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const capture = (name, action, target) => sample(page, action, name, base + target, shots, engine, t);
  for (const [part, slug] of [[1, P1], [2, P2]]) {
    await page.goto(base);
    const live = await capture(`expand-p${part}`, `.panel:nth-child(${part}) .title a`, slug);
    await capture(`p${part}-browser-back-index`, () => page.goBack(), '');
    await capture(`index-browser-forward-p${part}`, () => page.goForward(), slug);
    await capture(`p${part}-all-parts`, '#card a.all', '');
    await capture(`all-parts-back-p${part}`, () => page.goBack(), slug);
    await capture(`all-parts-forward-index-p${part}`, () => page.goForward(), '');
    // Keep the original direct-load equality check.
    await page.goto(base + slug); await ready(page); await pinDecorations(page);
    const direct = await page.screenshot(still);
    if (live) t.check(`motion part ${part}: expanded deck equals direct load`, await sameImage(page, live, direct));
  }
  // Both cross-part links and both directions of traversal across those entries.
  await page.goto(base + P2);
  await capture('direct-p2-start-with-p1', '#card .series a:not(.all)', P1);
  await capture('previous-link-back-p2', () => page.goBack(), P2);
  await capture('previous-link-forward-p1', () => page.goForward(), P1);
  await verdict(page);
  await capture('p1-verdict-next-p2', '#card a.next', P2);
  await capture('next-link-back-p1', () => page.goBack(), P1);
  await capture('next-link-forward-p2', () => page.goForward(), P2);
  await capture('direct-document-all-parts', '#card a.all', '');
  await page.goBack(); await ready(page);
  await page.reload(); await ready(page);
  await capture('reloaded-deck-forward-index', () => page.goForward(), '');
  await capture('reloaded-index-back-deck', () => page.goBack(), P2);
  // Returning from a long, scrolled verdict must also preserve its first frame.
  await page.goto(base + P1); await verdict(page);
  await capture('verdict-all-parts', '#card a.all', '');
  t.check('motion flows: no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

// Wall-clock capture complements deterministic seeking: a route that is built
// correctly but immediately cancelled by history/lifecycle events must fail.
export async function realtimeFrames(ctx, base, shots, engine, t) {
  const page = await ctx.newPage();
  await page.goto(base); await ready(page);
  // Keep decorative motion running here; deterministic pose normalization
  // belongs only to motionFrames, so it cannot conceal a live landing replay.
  for (const [name, action, target, setup] of [
    ['open', '.panel:nth-child(1) .title a', P1],
    ['all-parts', '#card a.all', ''],
    ['open2', '.panel:nth-child(2) .title a', P2],
    ['browser-back', () => page.goBack({ waitUntil: 'commit' }), ''],
    ['verdict-open', '.panel:nth-child(1) .title a', P1],
    ['verdict-all-parts', '#card a.all', '', () => verdict(page)],
  ]) {
    if (setup) await setup();
    await ready(page);
    if (typeof action === 'string') await page.locator(action).scrollIntoViewIfNeeded();
    const buffers = [await page.screenshot()], labels = ['before'];
    await page.evaluate(() => {
      window.routeTrace = [];
      window.traceRoute = true;
      const frame = (now) => {
        if (!window.traceRoute) return;
        const stage = document.querySelector('.route-stage');
        if (stage) {
          const surface = stage.querySelector('.route-surface');
          const copy = [...stage.querySelectorAll('[data-route-copy]')];
          const visible = (role) => copy.some((el) => el.dataset.routeCopy === role && +getComputedStyle(el).opacity > 0);
          window.routeTrace.push({ now, clip: getComputedStyle(surface).clipPath,
            returning: stage.dataset.returning, overlap: visible('outgoing') && visible('incoming') });
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    // Record concurrently with the browser history command; waiting for a
    // navigation promise first can omit the very frames under investigation.
    const actionPromise = typeof action === 'string' ? page.locator(action).tap() : action();
    const start = Date.now();
    for (let n = 0; n < 20; n++) {
      await page.waitForTimeout(50);
      buffers.push(await page.screenshot()); labels.push(`${Date.now() - start}ms`);
      const done = await page.evaluate(() => window.routeTrace.length && !window.routeBusy);
      if (done) break;
    }
    await actionPromise;
    await page.waitForURL(base + target); await ready(page);
    const trace = await page.evaluate(() => { window.traceRoute = false; return window.routeTrace; });
    t.check(`realtime ${name}: complete transition survives history/lifecycle events`,
      trace.length > 10 && trace.at(-1).now - trace[0].now >= DURATION - 50);
    t.check(`realtime ${name}: many painted surface sizes`, new Set(trace.map((f) => f.clip)).size > 10);
    t.check(`realtime ${name}: no simultaneous outgoing/incoming text`, trace.length > 0 && trace.every((f) => !f.overlap));
    if (name.endsWith('all-parts') || name === 'browser-back') {
      t.check(`realtime ${name}: uses the reverse index transition`, trace.length > 0 && trace.every((f) => f.returning === 'true'));
    }
    t.check(`realtime ${name}: landing does not replay card settle`,
      await page.locator('#app .card.settle').count() === 0);
    const { png } = await evidence(page, buffers, labels);
    fs.writeFileSync(path.join(shots, `${engine}-realtime-${name}-strip.png`), Buffer.from(png, 'base64'));
    fs.writeFileSync(path.join(shots, `${engine}-realtime-${name}.json`), JSON.stringify(trace, null, 2));
  }
  await page.close();
}

export async function navigationEdges(browser, options, base, t, shots, engine) {
  const ctx = await browser.newContext({ ...options, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => { window.sameDocument = true; });
  await page.locator('.panel:nth-child(2) .title a').tap();
  await page.waitForURL(base + 'worth-your-time/');
  const instantLanding = await page.evaluate(() => window.sameDocument && !document.querySelector('.route-stage') && !document.documentElement.classList.contains('leaving'));
  t.check('reduced motion: instant same-document deck', instantLanding);
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
  await page.evaluate(() => { window.fallbackDocument = true; });
  await page.route('**/worth-your-time/', (route) => route.request().resourceType() === 'fetch'
    ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
  await page.locator('.panel:nth-child(2) .title a').tap();
  await page.waitForURL(base + 'worth-your-time/');
  await page.waitForFunction(() => !!document.querySelector('#card h1'));
  t.check('failed enhancement falls back to real deck navigation', await page.evaluate(() => !window.fallbackDocument && !!window.deckApp));
  await page.goto(base + 'index.html?from=qa#parts');
  await page.evaluate(() => { window.aliasDocument = true; });
  await page.waitForTimeout(150);
  t.check('index.html, query and fragment do not trigger a reload loop', await page.evaluate(() => !!window.aliasDocument && !document.querySelector('.index-page').hidden));
  // The same complete flow matrix under reduced motion: zero route animations,
  // no overlay, correct destination, and no replacement of the document.
  await page.unrouteAll({ behavior: 'wait' });
  const instant = async (name, action, target) => {
    await ready(page);
    if (typeof action === 'string') await page.locator(action).scrollIntoViewIfNeeded();
    const before = await page.screenshot(still);
    await page.evaluate(() => {
      window.instantDocument = true;
      window.routeAnimationCalls = 0;
      if (!window.countAnimations) {
        window.countAnimations = true;
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (...args) { window.routeAnimationCalls++; return animate.apply(this, args); };
      }
    });
    if (typeof action === 'string') await page.locator(action).tap(); else await action();
    await page.waitForURL(base + target);
    t.check(`reduced motion ${name}: instant and same document`, await page.evaluate((isHome) =>
      window.instantDocument && window.routeAnimationCalls === 0 &&
      !document.documentElement.classList.contains('leaving') &&
      !document.querySelector('.route-stage') &&
      (isHome ? !window.deckApp && !document.querySelector('.index-page').hidden :
        !!window.deckApp && !document.querySelector('#app').inert), target === ''));
    const after = await page.screenshot(still);
    const { png } = await evidence(page, [before, after], ['before', 'instant']);
    fs.writeFileSync(path.join(shots, `${engine}-reduced-${name}-strip.png`), Buffer.from(png, 'base64'));
  };
  for (const [n, slug] of [[1, P1], [2, P2]]) {
    await page.goto(base);
    await instant(`index-p${n}`, `.panel:nth-child(${n}) .title a`, slug);
    await instant(`p${n}-browser-back`, () => page.goBack(), '');
    await instant(`p${n}-browser-forward`, () => page.goForward(), slug);
    await instant(`p${n}-all-parts`, '#card a.all', '');
    await instant(`p${n}-all-parts-back`, () => page.goBack(), slug);
    await instant(`p${n}-all-parts-forward`, () => page.goForward(), '');
  }
  await page.goto(base + P2);
  await instant('previous-part', '#card .series a:not(.all)', P1);
  await instant('previous-part-back', () => page.goBack(), P2);
  await instant('previous-part-forward', () => page.goForward(), P1);
  await verdict(page);
  await instant('next-part', '#card a.next', P2);
  await instant('next-part-back', () => page.goBack(), P1);
  await instant('next-part-forward', () => page.goForward(), P2);
  await ctx.close();
}
