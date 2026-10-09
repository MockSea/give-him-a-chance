// The series index. Tapping a panel opens that part.
//
// Where the browser has cross-document view transitions (style.css declares
// @view-transition), a plain navigation does the work: the panel and its mini
// card carry the same view-transition-names as the deck's shell and start
// card, so the browser morphs one into the other, and back again on Back.
//
// Elsewhere, this grows a sheet in the panel's colour over the page first,
// then navigates. The final URL is the deck's real URL either way, so deep
// links and the back button behave.
(() => {
  'use strict';

  const TAKEOVER_MS = 420;
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const STUCK_MS = 5000; // if we haven't left the page by then, the navigation didn't happen

  const native = 'PageRevealEvent' in window;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  let leaving = false;
  let stuckTimer = 0;

  // Back to rest: no sheet, taps live again. Runs on every pageshow, which
  // covers a return from the bfcache, where the page comes back exactly as
  // it was left, mid-takeover.
  function reset() {
    leaving = false;
    clearTimeout(stuckTimer);
    root.classList.remove('leaving');
    document.querySelectorAll('.takeover').forEach((n) => n.remove());
  }

  function arm() {
    leaving = true;
    root.classList.add('leaving');
    stuckTimer = setTimeout(reset, STUCK_MS);
  }

  function takeover(panel, href) {
    const r = panel.getBoundingClientRect();
    const look = getComputedStyle(panel);

    const sheet = document.createElement('div');
    sheet.className = 'takeover';
    sheet.style.background = look.backgroundColor;
    sheet.setAttribute('aria-hidden', 'true');

    const mini = panel.querySelector('.mini').cloneNode(true);
    mini.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    sheet.append(mini);
    document.body.append(sheet);

    const from = { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: look.borderRadius };
    const to = { top: '0px', left: '0px', width: `${window.innerWidth}px`, height: `${window.innerHeight}px`, borderRadius: '0px' };
    sheet.animate([from, to], { duration: TAKEOVER_MS, easing: EASE, fill: 'forwards' });
    mini.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TAKEOVER_MS * 0.6, easing: 'ease-out', fill: 'forwards' });

    setTimeout(() => location.assign(href), TAKEOVER_MS + 40);
  }

  function onTap(e) {
    // Leave modified clicks and non-primary buttons to the browser (new tab etc.)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (leaving) { e.preventDefault(); return; } // a second tap while the first is in flight
    arm();
    if (native || reduceMotion) return; // plain navigation; the browser (or nothing) animates it
    e.preventDefault();
    takeover(e.currentTarget.closest('.panel'), e.currentTarget.href);
  }

  document.querySelectorAll('.panel .title a').forEach((a) => a.addEventListener('click', onTap));
  window.addEventListener('pageshow', reset);
  window.addEventListener('pagehide', () => clearTimeout(stuckTimer));
})();
