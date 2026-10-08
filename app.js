// Sherita Janielle's whiteboard, transcribed. Wording is hers; question marks
// added where the board drops them. Each main question can carry one rescue
// question that runs when the main answer fails.
const CREDIT = Object.freeze({
  name: 'Sherita Janielle',
  handle: '@sheritajanielle',
  profile: 'https://www.instagram.com/sheritajanielle/',
  reel: 'https://www.instagram.com/reel/DeKs-qdvu4l/',
});

const STEPS = Object.freeze([
  { q: 'Are you attracted to him?', pass: 'yes' },
  { q: 'Is he the hottest man you have ever seen?', pass: 'no' },
  { q: 'Did he plan the date?', pass: 'yes', rescue: { q: 'Did he ask for your input?', pass: 'yes' } },
  { q: 'Did he pay the check?', pass: 'yes', rescue: { q: 'Did he offer?', pass: 'yes' } },
  { q: 'Did he make you laugh?', pass: 'yes', rescue: { q: 'Was he nice to the wait staff?', pass: 'yes' } },
  { q: 'Is he employed?', pass: 'yes', rescue: { q: 'Did he just sell his tech company?', pass: 'yes' } },
  { q: 'Did he text you after the date?', pass: 'yes', rescue: { q: 'Did he call?', pass: 'yes' } },
  {
    q: 'Is he emotionally available?', pass: 'yes',
    rescue: {
      q: 'Is he in therapy?', pass: 'yes',
      note: 'If you get to this point and the therapy is what is holding you up, that is a call you make for yourself.',
    },
  },
]);

const VERDICT = Object.freeze({ NO: "It's a NO for me", YES: 'Give him a chance' });
const PEEL_MS = 560;

// State is replaced, never mutated. `history` is the list of answers given so
// far, in order; the screen is derived from it.
const initialState = Object.freeze({ screen: 'start', history: Object.freeze([]) });
let state = initialState;
let animating = false;

const $sheet = document.getElementById('sheet');
const $bar = document.getElementById('bar');
const $back = document.getElementById('back');
const $marks = document.getElementById('marks');
const $stage = document.getElementById('stage');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---- derive the current position from history ----------------------------

function positionAfter(history) {
  // Walk the answers to find where we are: { step, phase } or a verdict.
  let step = 0;
  let phase = 'main';
  for (const { answer } of history) {
    const main = STEPS[step];
    if (phase === 'main') {
      if (answer === main.pass) { step += 1; continue; }
      if (main.rescue) { phase = 'rescue'; continue; }
      return { verdict: 'NO', failedAt: step };
    }
    if (answer === main.rescue.pass) { step += 1; phase = 'main'; continue; }
    return { verdict: 'NO', failedAt: step, rescued: false };
  }
  if (step >= STEPS.length) return { verdict: 'YES' };
  return { step, phase };
}

function questionAt(pos) {
  const main = STEPS[pos.step];
  return pos.phase === 'rescue' ? main.rescue : main;
}

// ---- rendering --------------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>';
const ICON_RESTART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/></svg>';

function creditLine() {
  return el('p', { class: 'credit', html:
    `Flowchart by <a href="${CREDIT.profile}" rel="noopener">${CREDIT.name} (${CREDIT.handle})</a>` +
    ` &middot; <a href="${CREDIT.reel}" rel="noopener">watch the reel</a>` });
}

function renderStart() {
  return [
    el('h1', { class: 'title', html: 'Should you give this man <em>a chance?</em>' }),
    el('p', { class: 'lede' }, ['Eight questions, a few rescue questions, two verdicts. She built the flowchart so you don’t have to guess.']),
    el('div', { class: 'spacer' }),
    creditLine(),
    el('button', { class: 'btn', type: 'button', onclick: start }, ['Start']),
  ];
}

function renderQuestion(pos) {
  const q = questionAt(pos);
  const parts = [el('h1', { class: 'q' }, [q.q])];
  if (pos.phase === 'rescue') {
    parts.push(el('p', { class: 'sub' }, ['Every no doesn’t mean it’s over. He gets one rescue question.']));
  }
  parts.push(el('div', { class: 'spacer' }));
  parts.push(el('div', { class: 'choices' }, [
    el('button', { class: 'choice yes', type: 'button', onclick: () => answer('yes') }, ['Yes', el('span', { html: ICON_CHECK })]),
    el('button', { class: 'choice no', type: 'button', onclick: () => answer('no') }, ['No', el('span', { html: ICON_X })]),
  ]));
  return parts;
}

function tallyList(history) {
  const items = [];
  let step = 0;
  let phase = 'main';
  for (const { answer } of history) {
    const main = STEPS[step];
    const q = phase === 'main' ? main : main.rescue;
    const ok = answer === q.pass;
    items.push(el('li', { class: phase === 'rescue' ? 'rescue' : '' }, [
      el('span', {}, [q.q]),
      el('span', { class: `a ${ok ? 'yes' : 'no'}` }, [answer === 'yes' ? 'Yes' : 'No']),
    ]));
    if (ok) { step += 1; phase = 'main'; }
    else if (phase === 'main' && main.rescue) phase = 'rescue';
    else break;
  }
  return el('ol', { class: 'tally', 'aria-label': 'Your answers' }, items);
}

function renderResult(pos) {
  const isNo = pos.verdict === 'NO';
  const parts = [el('h1', { class: `verdict ${isNo ? 'no' : 'yes'}` }, [isNo ? VERDICT.NO : VERDICT.YES])];

  if (isNo) {
    const main = STEPS[pos.failedAt];
    const rescueFailed = main.rescue && pos.rescued === false;
    const html = rescueFailed
      ? `He fell at <strong>${main.q}</strong> Then he missed the rescue. <strong>${main.rescue.q}</strong> No hard feelings.`
      : `He fell at <strong>${main.q}</strong> No hard feelings.`;
    parts.push(el('p', { class: 'fell', html }));
  } else {
    parts.push(el('p', { class: 'fell' }, ['He made it through all eight.']));
    const last = state.history[state.history.length - 1];
    const viaTherapy = state.history.length > 0 && usedTherapyRescue(state.history);
    if (viaTherapy && last) {
      parts.push(el('blockquote', { class: 'quote' }, [
        STEPS[7].rescue.note, ' ', el('cite', {}, [`— ${CREDIT.name}, in the reel`]),
      ]));
    }
  }

  parts.push(tallyList(state.history));
  parts.push(el('div', { class: 'spacer' }));
  parts.push(creditLine());
  parts.push(el('div', { class: 'actions' }, [
    el('button', { class: 'btn', type: 'button', onclick: share }, [el('span', { html: ICON_SHARE }), 'Send it to the friend']),
    el('button', { class: 'btn quiet', type: 'button', onclick: restart }, [el('span', { html: ICON_RESTART }), 'Start over']),
  ]));
  return parts;
}

function usedTherapyRescue(history) {
  const pos = positionAfter(history.slice(0, -1));
  return pos.step === 7 && pos.phase === 'rescue';
}

function renderMarks(pos) {
  $marks.replaceChildren(...STEPS.map((_, i) => {
    const cls = pos.verdict ? 'done' : i < pos.step ? 'done' : i === pos.step ? 'now' : '';
    return el('li', { class: cls, 'aria-label': `Question ${i + 1}` });
  }));
}

function sheetFor(s) {
  const pos = positionAfter(s.history);
  const sheet = el('section', { class: 'sheet', id: 'sheet', tabindex: '-1', 'aria-live': 'polite' });
  if (s.screen === 'start') sheet.append(...renderStart());
  else if (pos.verdict) sheet.append(...renderResult(pos));
  else {
    if (pos.phase === 'rescue') sheet.classList.add('board');
    sheet.append(...renderQuestion(pos));
  }
  return { sheet, pos };
}

function paint(next, direction) {
  const old = document.getElementById('sheet');
  const { sheet, pos } = sheetFor(next);
  const showBar = next.screen !== 'start';
  $bar.hidden = !showBar;
  $back.disabled = next.history.length === 0;
  renderMarks(pos.verdict ? { ...pos, step: STEPS.length } : pos);

  const instant = reduceMotion.matches || direction === 'none';
  if (instant) {
    old.replaceWith(sheet);
    focusSheet(sheet);
    return;
  }

  animating = true;
  if (direction === 'forward') {
    // New sheet is inserted under the old one, which peels away.
    sheet.classList.add('enter');
    $stage.insertBefore(sheet, old);
    old.classList.add('leave');
    old.removeAttribute('id');
    old.setAttribute('aria-hidden', 'true');
    old.addEventListener('animationend', () => { old.remove(); animating = false; }, { once: true });
  } else {
    // Previous sheet comes back down on top of the current one.
    sheet.classList.add('return');
    $stage.append(sheet);
    old.removeAttribute('id');
    old.setAttribute('aria-hidden', 'true');
    sheet.addEventListener('animationend', () => { old.remove(); sheet.classList.remove('return'); animating = false; }, { once: true });
  }
  // Safety net if animationend never fires.
  window.setTimeout(() => { if (old.isConnected) old.remove(); animating = false; }, PEEL_MS + 120);
  focusSheet(sheet);
}

function focusSheet(sheet) {
  const h = sheet.querySelector('h1');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---- actions ----------------------------------------------------------------

function setState(next, direction) {
  state = Object.freeze(next);
  paint(state, direction);
}

function start() {
  setState({ screen: 'play', history: Object.freeze([]) }, 'forward');
}

function answer(value) {
  if (animating) return;
  const history = Object.freeze([...state.history, Object.freeze({ answer: value })]);
  setState({ screen: 'play', history }, 'forward');
}

function back() {
  if (animating) return;
  if (state.history.length === 0) return;
  const history = Object.freeze(state.history.slice(0, -1));
  setState({ screen: 'play', history }, 'back');
}

function restart() {
  if (animating) return;
  setState(initialState, 'forward');
}

function shareText() {
  const pos = positionAfter(state.history);
  const verdict = pos.verdict === 'NO' ? VERDICT.NO : VERDICT.YES;
  const where = pos.verdict === 'NO' ? `\nHe fell at: ${STEPS[pos.failedAt].q}` : '\nHe made it through all eight.';
  return `Should you give this man a chance? I ran him through ${CREDIT.handle}'s flowchart.\n\nVerdict: ${verdict}${where}\n\n${location.href}`;
}

async function share(event) {
  const btn = event.currentTarget;
  const text = shareText();
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    flash(btn, 'Copied, go paste it');
  } catch {
    flash(btn, 'Could not copy. Screenshot it instead');
  }
}

function flash(btn, label) {
  const original = btn.innerHTML;
  btn.classList.add('copied');
  btn.textContent = label;
  window.setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1800);
}

$back.addEventListener('click', back);
document.addEventListener('keydown', (e) => {
  if (state.screen !== 'play' || positionAfter(state.history).verdict) return;
  if (e.key === 'y' || e.key === 'Y') answer('yes');
  if (e.key === 'n' || e.key === 'N') answer('no');
  if (e.key === 'Backspace' && !e.target.closest('input, textarea')) { e.preventDefault(); back(); }
});

paint(state, 'none');
