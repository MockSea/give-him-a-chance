// Sherita Janielle's whiteboard, transcribed. Wording is hers; question marks
// added where the board drops them. Each main question can carry one rescue
// question that runs when the main answer fails.
const CREDIT = Object.freeze({
  name: 'Sherita Janielle',
  handle: '@sheritajanielle',
  profile: 'https://www.instagram.com/sheritajanielle/',
  reel: 'https://www.instagram.com/reel/DeKs-qdvu4l/',
});

// `why` is what she says when he fails that step. `said: true` means her words
// from the reel transcript, near verbatim; otherwise it is a line built from
// the board for a step where she doesn't give a reason out loud.
// `roast` is Moxy's line for the same step, one picked at random per verdict.
const STEPS = Object.freeze([
  { q: 'Are you attracted to him?', pass: 'yes',
    why: { text: 'We want to be attracted.', said: true },
    roast: [
      'You can\'t manifest chemistry. You tried. We all saw.',
      '"He\'s nice on paper" is how you end up living on paper.',
      'Respectfully, he\'s a coworker now.',
    ] },
  { q: 'Is he the hottest man you have ever seen?', pass: 'no',
    why: { text: 'It’s going to lead you to heartbreak. He don’t have to be the hottest guy in the world, okay?', said: true },
    roast: [
      'That face has a waitlist and you\'re not first on it.',
      'Men that pretty already have a girlfriend. It\'s the mirror.',
      'He\'s already been told he\'s perfect. By several people. This week.',
    ] },
  { q: 'Did he plan the date?', pass: 'yes',
    rescue: { q: 'Did he ask for your input?', pass: 'yes' },
    why: { text: 'He just had you plan the whole thing? That’s going to go ahead and be a no for me, okay?', said: true },
    roast: [
      'You didn\'t go on a date. You ran an event.',
      'He showed up like a plus-one to his own date.',
      'Congrats on your new unpaid role as his travel agent.',
    ] },
  { q: 'Did he pay the check?', pass: 'yes',
    rescue: { q: 'Did he offer?', pass: 'yes' },
    why: { text: 'Some of you women, you have a problem with people paying for stuff. Fine. But he didn’t even offer.', said: false },
    roast: [
      'The check came and so did his sudden interest in his phone.',
      'He reached for his wallet the way people reach for the gym.',
      'Splitting is fine. Not seeing the check is a lifestyle.',
    ] },
  { q: 'Did he make you laugh?', pass: 'yes',
    rescue: { q: 'Was he nice to the wait staff?', pass: 'yes' },
    why: { text: 'Not making you laugh is okay. Not being nice to the waitstaff? That is a hard no.', said: true },
    roast: [
      'Boring and mean to the server. A two-for-one nobody ordered.',
      'How he treats the waiter is the trailer. The trailer was bad.',
      'He didn\'t make you laugh, but he did make the server sigh.',
    ] },
  { q: 'Is he employed?', pass: 'yes',
    rescue: { q: 'Did he just sell his tech company?', pass: 'yes' },
    why: { text: 'No job, and he did not just sell a tech company. That’s a no for me, okay?', said: false },
    roast: [
      '"Between opportunities" since the Obama administration.',
      'His startup is a podcast with zero episodes.',
      'The only thing he\'s acquired is your Netflix password.',
    ] },
  { q: 'Did he text you after the date?', pass: 'yes',
    rescue: { q: 'Did he call?', pass: 'yes' },
    why: { text: 'If he did neither of those, then it’s going to go ahead and be a no for me.', said: true },
    roast: [
      'He\'s not busy. His phone works. You know this.',
      'Radio silence isn\'t mysterious. It\'s information.',
      'He\'ll text in three weeks with "hey stranger". Don\'t.',
    ] },
  {
    q: 'Is he emotionally available?', pass: 'yes',
    rescue: {
      q: 'Is he in therapy?', pass: 'yes',
      note: 'If we get to this point and the therapy is what’s holding us up, we have to decide on ourselves.',
    },
    why: { text: 'Not emotionally available, and not in therapy about it. It’s going to go ahead and be a no.', said: false },
    roast: [
      'He\'s not a fixer-upper. He\'s a teardown.',
      'You\'d be his therapist, unpaid, with worse hours.',
      'His emotional range is "idk" to "lol".',
    ],
  },
]);

const YES_LINE = 'If this man has done all this, we are definitely giving him a chance, okay? I’m glad we sorted that out.';

const YES_ROASTS = Object.freeze([
  'Go. Text the group chat. Then put your phone down.',
  'Rare find. Do not mention the five-year plan on date two.',
  'He passed all eight. Check for a pulse, then a ring.',
]);

const ROASTER = 'Moxy';

const VERDICT = Object.freeze({ NO: "It's a NO for me", YES: 'Give him a chance' });
const FLY_MS = 420;
const SNAP_MS = 320;
const SETTLE_MS = 400;
const MAX_TILT = 16;
const TILT_DIVISOR = 18;
const FLICK_SPEED = 0.6; // px per ms
const FLICK_MIN_DX = 40;
const STAMP_FULL_AT = 90; // px of drag at which the stamp is fully inked

// State is replaced, never mutated. `history` is the list of answers given so
// far, in order; the screen is derived from it. `roast` is the line drawn for
// the current verdict, drawn once per result render.
const initialState = Object.freeze({ screen: 'start', history: Object.freeze([]), roast: null });
let state = initialState;
let animating = false;

const $app = document.getElementById('app');
const $deck = document.getElementById('deck');
const $back = document.getElementById('back');
const $no = document.getElementById('act-no');
const $yes = document.getElementById('act-yes');

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

function pickRoast(pos) {
  const set = pos.verdict === 'YES' ? YES_ROASTS : STEPS[pos.failedAt].roast;
  return set[Math.floor(Math.random() * set.length)];
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

const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>';
const ICON_RESTART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/></svg>';
const ICON_HEART = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/></svg>';

function creditLine() {
  return el('p', { class: 'credit', html:
    `Flowchart by <a href="${CREDIT.profile}" rel="noopener">${CREDIT.name} (${CREDIT.handle})</a>` +
    ` &middot; <a href="${CREDIT.reel}" rel="noopener">watch the reel</a>` +
    `<span class="byline">built by <a href="https://github.com/MockSea" rel="noopener">Moxy</a> 🖤</span>` });
}

function marksList(pos) {
  const step = pos.verdict ? STEPS.length : pos.step;
  const label = `Question ${Math.min(step + 1, STEPS.length)} of ${STEPS.length}`;
  return el('ol', { class: 'marks', 'aria-label': label }, STEPS.map((_, i) =>
    el('li', { class: i < step ? 'done' : i === step ? 'now' : '' })));
}

function renderStart() {
  return [
    el('h1', { class: 'title', html: 'Should you give this man <em>a chance?</em>' }),
    el('p', { class: 'lede' }, ['He’s cute. Allegedly. Let’s see if he survives Sherita’s flowchart.']),
    el('div', { class: 'spacer' }),
    el('p', { class: 'nudge', 'aria-hidden': 'true' }, ['swipe to start']),
    creditLine(),
    el('div', { class: 'stamp yes', 'aria-hidden': 'true' }, ['Yes']),
    el('div', { class: 'stamp no', 'aria-hidden': 'true' }, ['Nope']),
  ];
}

function renderQuestion(pos) {
  const q = questionAt(pos);
  const parts = [marksList(pos), el('div', { class: 'spacer top' }), el('h1', { class: 'q' }, [q.q])];
  parts.push(el('div', { class: 'spacer' }));
  parts.push(el('div', { class: 'stamp yes', 'aria-hidden': 'true' }, ['Yes']));
  parts.push(el('div', { class: 'stamp no', 'aria-hidden': 'true' }, ['Nope']));
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
    items.push(el('li', {}, [
      el('span', {}, [q.q]),
      el('span', { class: `a ${ok ? 'yes' : 'no'}` }, [answer === 'yes' ? 'Yes' : 'No']),
    ]));
    if (ok) { step += 1; phase = 'main'; }
    else if (phase === 'main' && main.rescue) phase = 'rescue';
    else break;
  }
  return el('ol', { class: 'tally', 'aria-label': 'Your answers' }, items);
}

function heartBurst() {
  const hearts = [];
  for (let i = 0; i < 8; i += 1) {
    hearts.push(el('span', { style: `--a: ${i * 45}deg; --d: ${i * 40}ms`, html: ICON_HEART }));
  }
  return el('div', { class: 'burst', 'aria-hidden': 'true' }, hearts);
}

function renderResult(pos, s) {
  const isNo = pos.verdict === 'NO';
  const parts = [];
  const verdict = el('h1', { class: `verdict ${isNo ? 'no' : 'yes'}` }, [isNo ? VERDICT.NO : VERDICT.YES]);
  if (isNo) {
    parts.push(el('div', { class: 'slam' }, [verdict]));
    parts.push(whyBlock(STEPS[pos.failedAt].why));
  } else {
    parts.push(el('div', { class: 'slam' }, [heartBurst(), verdict]));
    parts.push(whyBlock({ text: YES_LINE, said: true }));
  }

  parts.push(el('p', { class: 'roast' }, [s.roast, ' ', el('cite', {}, [`— ${ROASTER}`])]));
  parts.push(tallyList(s.history));
  parts.push(el('button', { class: 'undo', type: 'button', onclick: back }, ['Change the last answer']));
  parts.push(el('div', { class: 'spacer' }));
  parts.push(creditLine());
  parts.push(el('div', { class: 'actions' }, [
    el('button', { class: 'btn', type: 'button', onclick: share }, [el('span', { html: ICON_SHARE }), 'Send it to the friend']),
    el('button', { class: 'btn quiet', type: 'button', onclick: restart }, [el('span', { html: ICON_RESTART }), 'Start over']),
  ]));
  return parts;
}

function whyBlock(why) {
  if (!why.said) return el('p', { class: 'quote plain' }, [why.text]);
  return el('blockquote', { class: 'quote' }, [
    why.text, ' ', el('cite', {}, [`— ${CREDIT.name.split(' ')[0]}, in the reel`]),
  ]);
}

function screenOf(s) {
  if (s.screen === 'start') return 'start';
  return positionAfter(s.history).verdict ? 'result' : 'question';
}

function cardFor(s) {
  const pos = positionAfter(s.history);
  const card = el('section', { class: 'card', id: 'card', tabindex: '-1', 'aria-live': 'polite' });
  if (s.screen === 'start') {
    card.classList.add('start');
    card.append(...renderStart());
    attachDrag(card);
  } else if (pos.verdict) {
    card.classList.add('result');
    card.append(...renderResult(pos, s));
  } else {
    card.classList.add('question');
    card.append(...renderQuestion(pos));
    attachDrag(card);
  }
  return card;
}

// `direction` says how the new card arrives: 'none' (first paint), 'deal'
// (next card is already sitting under the one that flew off), 'settle' (start
// of the deck), or 'back' (the previous card flies back in from the side its
// answer sent it; `from` is that answer).
function paint(next, direction, from) {
  const old = document.getElementById('card');
  const card = cardFor(next);
  const screen = screenOf(next);
  $app.dataset.screen = screen;
  $back.disabled = next.history.length === 0 || screen === 'start';
  $no.disabled = $yes.disabled = screen === 'result';
  $deck.style.setProperty('--p', 0);
  $deck.classList.remove('flying', 'snapping');

  old.replaceWith(card);
  const instant = reduceMotion.matches || direction === 'none' || direction === 'deal';
  if (!instant && direction === 'settle') {
    card.classList.add('settle');
    window.setTimeout(() => card.classList.remove('settle'), SETTLE_MS + 50);
  }
  if (!instant && direction === 'back') {
    card.classList.add(from === 'yes' ? 'from-right' : 'from-left');
    animating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.classList.add('returning');
      card.classList.remove('from-right', 'from-left');
      window.setTimeout(() => { card.classList.remove('returning'); animating = false; }, FLY_MS + 50);
    }));
  }
  focusCard(card);
}

function focusCard(card) {
  const h = card.querySelector('h1');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---- swipe -----------------------------------------------------------------

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function thresholdFor(card) {
  return Math.min(0.38 * card.offsetWidth, 160);
}

function applyDrag(card, dx, dy) {
  const tilt = clamp(dx / TILT_DIVISOR, -MAX_TILT, MAX_TILT);
  card.style.transform = `translate(${dx}px, ${dy * 0.35}px) rotate(${tilt}deg)`;
  card.style.setProperty('--yes', clamp(dx / STAMP_FULL_AT, 0, 1));
  card.style.setProperty('--no', clamp(-dx / STAMP_FULL_AT, 0, 1));
  $deck.style.setProperty('--p', clamp(Math.abs(dx) / thresholdFor(card), 0, 1));
}

function attachDrag(card) {
  let drag = null;

  card.addEventListener('pointerdown', (e) => {
    if (animating || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('a, button')) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, samples: [[performance.now(), e.clientX]] };
    card.setPointerCapture(e.pointerId);
    card.classList.add('dragging');
    e.preventDefault();
  });

  card.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    drag.samples.push([performance.now(), e.clientX]);
    if (drag.samples.length > 6) drag.samples.shift();
    applyDrag(card, drag.dx, drag.dy);
  });

  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    card.classList.remove('dragging');
    const [t0, x0] = d.samples[0];
    const [t1, x1] = d.samples[d.samples.length - 1];
    const speed = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
    const flick = Math.abs(speed) > FLICK_SPEED && Math.abs(d.dx) > FLICK_MIN_DX && Math.sign(speed) === Math.sign(d.dx);
    if (Math.abs(d.dx) > thresholdFor(card) || flick) swipe(d.dx > 0 ? 'yes' : 'no', d.dy);
    else snapBack(card);
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

function snapBack(card) {
  card.classList.add('snapping');
  $deck.classList.add('snapping');
  card.style.transform = '';
  card.style.setProperty('--yes', 0);
  card.style.setProperty('--no', 0);
  $deck.style.setProperty('--p', 0);
  window.setTimeout(() => { card.classList.remove('snapping'); $deck.classList.remove('snapping'); }, SNAP_MS + 30);
}

// Answer the current question by sending the card off the matching side. Used
// by the drag release, the dock buttons and the keyboard alike. On the start
// card either direction deals the first question.
function swipe(value, dy = 0) {
  if (animating) return;
  const screen = screenOf(state);
  if (screen === 'result') return;
  const card = document.getElementById('card');
  const history = screen === 'start'
    ? Object.freeze([])
    : Object.freeze([...state.history, Object.freeze({ answer: value })]);
  const commit = () => setState({ screen: 'play', history }, 'deal');

  if (reduceMotion.matches) { commit(); return; }

  animating = true;
  const sign = value === 'yes' ? 1 : -1;
  const distance = Math.max(window.innerWidth, card.offsetWidth) * 1.4;
  card.classList.add('flying');
  $deck.classList.add('flying');
  card.style.transform = `translate(${sign * distance}px, ${dy}px) rotate(${sign * 28}deg)`;
  card.style.setProperty('--yes', value === 'yes' ? 1 : 0);
  card.style.setProperty('--no', value === 'no' ? 1 : 0);
  $deck.style.setProperty('--p', 1);
  window.setTimeout(() => { animating = false; commit(); }, FLY_MS);
}

// ---- actions ----------------------------------------------------------------

function setState(next, direction, from) {
  const pos = positionAfter(next.history);
  const roast = next.screen === 'play' && pos.verdict ? pickRoast(pos) : null;
  state = Object.freeze({ ...next, roast });
  paint(state, direction, from);
}

function back() {
  if (animating) return;
  if (state.history.length === 0) return;
  const undone = state.history[state.history.length - 1].answer;
  const history = Object.freeze(state.history.slice(0, -1));
  setState({ screen: 'play', history }, 'back', undone);
}

function restart() {
  if (animating) return;
  setState(initialState, 'settle');
}

function shareText() {
  const pos = positionAfter(state.history);
  const verdict = pos.verdict === 'NO' ? VERDICT.NO : VERDICT.YES;
  const where = pos.verdict === 'NO'
    ? `\n“${STEPS[pos.failedAt].why.text}”`
    : `\n“${YES_LINE}”`;
  const roast = state.roast ? `\n“${state.roast}” — ${ROASTER}` : '';
  return `Should you give this man a chance? I ran him through ${CREDIT.handle}'s flowchart.\n\nVerdict: ${verdict}${where}${roast}\n\n${location.href}`;
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
$no.addEventListener('click', () => swipe('no'));
$yes.addEventListener('click', () => swipe('yes'));
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Backspace' && state.screen !== 'play') return;
  if (e.key === 'Backspace' && !e.target.closest('input, textarea')) { e.preventDefault(); back(); return; }
  if (positionAfter(state.history).verdict) return;
  if (e.key === 'y' || e.key === 'Y') swipe('yes');
  if (e.key === 'n' || e.key === 'N') swipe('no');
});

paint(state, 'none');
