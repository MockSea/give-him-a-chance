// Exercise the shipped copy-phase builder, including engines that do not
// apply animation effects to display:none nodes (the result-screen dock).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  function copyMotion('), source.indexOf('  function transition('));
const effects = new Map();
const ctx = vm.createContext({
  exitEnd: 120 / 690, moveEnd: 570 / 690,
  getComputedStyle: (el) => ({ display: el.display, opacity: el.opacity }),
  animate: (el, frames) => effects.set(el, frames),
});
vm.runInContext(code, ctx);
const roots = (role) => {
  const nodes = ['block', 'block', 'none'].map((display) => ({ display, opacity: '1', dataset: {}, style: {} }));
  ctx.copyMotion({ querySelectorAll: () => nodes }, role);
  assert.equal(nodes[2].style.opacity, '0');
  assert.equal(effects.has(nodes[2]), false, 'hidden dock must not depend on WAAPI');
  return nodes;
};
const outgoing = roots('outgoing'), incoming = roots('incoming');
function opacity(el, ms) {
  if (el.display === 'none') return +(el.style.opacity ?? el.opacity);
  const frames = effects.get(el), progress = ms / 690;
  const next = frames.findIndex((f) => f.offset >= progress);
  if (next === 0) return +frames[0].opacity;
  const a = frames[next - 1], b = frames[next];
  return +a.opacity + (+b.opacity - +a.opacity) * (progress - a.offset) / (b.offset - a.offset);
}
for (const ms of [0, 60, 119, 120, 121, 336, 569, 570, 571, 630, 690]) {
  const out = outgoing.map((el) => opacity(el, ms));
  const inc = incoming.map((el) => opacity(el, ms));
  assert.ok(!(out.some((v) => v > 0) && inc.some((v) => v > 0)), `copy overlap at ${ms}`);
  if (ms >= 120) assert.ok(out.every((v) => v === 0));
  if (ms <= 570) assert.ok(inc.every((v) => v === 0));
}
assert.equal(opacity(outgoing[0], 60), .5);
assert.ok(Math.abs(opacity(incoming[0], 630) - .5) < 1e-12);
console.log('PASS: verdict hidden dock, disjoint copy phases, zero copy during travel, real fades');
