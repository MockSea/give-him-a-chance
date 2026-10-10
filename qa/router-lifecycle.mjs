// Browser-independent regression checks for the router's actual lifecycle code.
// This does not substitute for WebKit/Chromium rendering and history QA.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const code = [
  between('  function cleanup()', '  function restDeck()'),
  between('  function animate(', '  function pose('),
  between('  async function navigate(', '  const ready = init();'),
].join('\n');
function harness(time = 100) {
  const frames = new Map();
  let id = 0, removed = 0, completed = 0;
  const makeAnimation = () => ({
    currentTime: time, playbackRate: 1, playState: 'running', finished: new Promise(() => {}),
    pause() { this.playState = 'paused'; },
    play() { this.playState = 'running'; },
    cancel() { this.playState = 'idle'; this.cancelListener?.(); },
    addEventListener(type, listener) { if (type === 'cancel') this.cancelListener = listener; },
  });
  const ctx = vm.createContext({
    animations: [], extras: [{ remove() { removed++; } }], pausedLive: [], finishFrame: null,
    complete: null, motion: { kind: 'index', from: 'home', to: 'deck', deckScroll: 0 },
    home: 'home', current: 'deck', duration: 690, revision: 0, pending: true,
    reduced: { matches: false }, original: {}, routes: new Map(), timing: {},
    root: { classList: { remove() {} } },
    index: { inert: true, removeAttribute() {} }, app: null,
    document: { querySelectorAll() { return [{ remove() { removed++; } }]; } },
    metadata() {}, restIndex() { completed++; },
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key) { frames.delete(key); },
  });
  vm.runInContext(code, ctx);
  const a = ctx.animate({ animate: makeAnimation }, []);
  const b = ctx.animate({ animate: makeAnimation }, []);
  return { ctx, a, b, removed: () => removed, completed: () => completed,
    tick() { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); } };
}
for (const time of [0, null]) {
  const h = harness(time);
  await h.ctx.navigate('home');
  assert.equal(h.ctx.pending, false);
  assert.equal(h.ctx.animations.length, 0);
  assert.equal(h.removed(), 2);
  assert.equal(h.completed(), 1);
}
{
  const h = harness(100);
  await h.ctx.navigate('home');
  assert.equal(h.a.currentTime, 100);
  assert.equal(h.b.currentTime, 100);
  assert.equal(h.a.playbackRate, -1);
  assert.equal(h.ctx.pending, true);
  h.a.playState = 'finished';
  h.tick();
  assert.equal(h.ctx.pending, false);
  assert.equal(h.completed(), 1);
  assert.equal(h.removed(), 2);
  h.b.cancel(); // late events from retired animations cannot settle again
  assert.equal(h.removed(), 2);
}
{
  const h = harness();
  h.ctx.complete = () => {};
  h.b.cancel();
  assert.equal(h.ctx.pending, false);
  assert.equal(h.ctx.animations.length, 0);
  assert.equal(h.removed(), 2);
}
{
  const h = harness();
  h.ctx.watchFinish(0);
  h.ctx.revision++;
  h.a.playState = 'finished';
  h.tick();
  assert.equal(h.removed(), 0); // stale completion does not own the new intent
}
console.log('PASS: zero/null-time Back, shared reversal, finish cleanup, cancellation, stale callbacks');
