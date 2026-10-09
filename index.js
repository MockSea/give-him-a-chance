// One same-document router, shared by the index and directly loaded decks.
// Only boundaries and paper geometry resize; live typography never scales.
(() => {
  'use strict';
  const root = document.documentElement;
  const home = new URL('./', document.currentScript.src).href;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  history.scrollRestoration = 'manual';
  const full = 'inset(0px 0px 0px 0px round 0px)';
  const duration = 690, exitEnd = 120 / duration, moveEnd = 570 / duration;
  const timing = { duration, easing: 'linear', fill: 'both' };
  const materialEase = 'cubic-bezier(.4,0,.2,1)';
  let index, links, routes, original;
  let app = document.getElementById('app'), skip = document.querySelector('body > .skip');
  let current = app ? address() : home, scroll = 0, revision = 0, pending = false;
  let animations = [], extras = [], pausedLive = [], complete, motion;
  let engine = window.mountDeck ? Promise.resolve() : null;
  const meta = [...document.querySelectorAll('meta[name], meta[property]')];

  function address() {
    const url = new URL(location.href);
    url.hash = url.search = '';
    url.pathname = url.pathname.replace(/\/index\.html$/, '/');
    return url.href;
  }
  function script(src) {
    return new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = src;
      node.onload = () => { node.remove(); resolve(); };
      node.onerror = () => { node.remove(); reject(new Error(`Could not load ${src}`)); };
      document.head.append(node);
    });
  }
  const absoluteDeck = (deck, href) => {
    const absolute = (link) => link && { ...link, href: new URL(link.href, href).href };
    return { ...deck, INDEX: absolute(deck.INDEX || { href: '../', text: 'all parts' }),
      NEXT: absolute(deck.NEXT), SERIES: { ...deck.SERIES, prev: absolute(deck.SERIES?.prev) } };
  };
  function metadata(doc) {
    document.title = doc.title;
    meta.forEach((m) => {
      const key = m.hasAttribute('name') ? 'name' : 'property';
      const replacement = doc.querySelector(`meta[${key}="${m.getAttribute(key)}"]`);
      if (replacement) m.content = replacement.content;
    });
  }
  async function init() {
    index = document.querySelector('.index-page');
    let doc = document;
    if (!index) {
      const response = await fetch(home);
      if (!response.ok) throw new Error('Could not load index');
      doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      index = doc.querySelector('.index-page').cloneNode(true);
      index.hidden = true;
      // Imported relative links must keep their index meaning on direct loads.
      index.querySelectorAll('a[href]').forEach((a) => a.href = new URL(a.getAttribute('href'), home).href);
      document.body.append(index);
    }
    original = doc.cloneNode(true);
    links = [...index.querySelectorAll('.panel .title a')];
    routes = new Map(links.map((a) => [new URL(a.getAttribute('href'), home).href, {}]));
    if (app) {
      routes.set(current, { doc: document.cloneNode(true), deck: absoluteDeck(window.DECK, current) });
      app.dataset.theme = root.dataset.theme || 'pink';
    }
    links.forEach((a) => {
      for (const event of ['pointerenter', 'pointerdown', 'focus']) {
        a.addEventListener(event, () => {
          if (!navigator.connection?.saveData) warm(new URL(a.getAttribute('href'), home).href).catch(() => {});
        }, { passive: true });
      }
    });
  }
  function warm(href) {
    const route = routes.get(href);
    if (!route.html) route.html = fetch(href).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${href}`);
      return r.text();
    }).catch((err) => { route.html = null; throw err; });
    return route.html;
  }
  // Serialize script evaluation: deck.js exports through window.DECK, so two
  // history traversals during a fetch must never capture each other's data.
  let preparation = Promise.resolve();
  function prepare(href) {
    const job = preparation.then(async () => {
      const route = routes.get(href);
      if (route.doc) return route;
      const html = await warm(href);
      engine ||= script(new URL('app.js', home).href).catch((err) => { engine = null; throw err; });
      await engine;
      const activeDeck = window.DECK;
      const activeRoute = current;
      try {
        await script(new URL('deck.js', href).href);
        route.deck = absoluteDeck(window.DECK, href);
      } finally { window.DECK = current === activeRoute ? activeDeck : (routes.get(current)?.deck || null); }
      route.doc = new DOMParser().parseFromString(html, 'text/html');
      if (!route.doc.querySelector('#app')) { route.doc = null; throw new Error('Missing deck'); }
      return route;
    });
    preparation = job.catch(() => {});
    return job;
  }
  function cleanup() {
    animations.forEach((a) => a.cancel()); animations = [];
    extras.forEach((el) => el.remove()); extras = [];
    pausedLive.forEach((a) => a.play()); pausedLive = [];
    root.classList.remove('leaving');
    index.inert = false;
    if (app) {
      app.inert = false;
      app.removeAttribute('style');
      app.querySelector('.col').removeAttribute('style');
    }
    index.removeAttribute('style');
  }
  function settle() {
    const done = complete; complete = null; motion = null;
    cleanup();
    done?.();
    pending = false;
  }
  function restDeck() {
    index.hidden = true;
    root.dataset.theme = app.dataset.theme;
    root.classList.remove('index'); document.body.classList.remove('index');
    app.querySelector('h1')?.focus({ preventScroll: true });
  }
  function restIndex(from) {
    window.deckApp?.dispose(); window.deckApp = null; window.DECK = null;
    app?.remove(); app = null; skip?.remove(); skip = null;
    root.removeAttribute('data-theme');
    root.classList.add('index'); document.body.classList.add('index');
    index.hidden = false;
    metadata(original);
    window.scrollTo(0, scroll);
    links.find((a) => new URL(a.getAttribute('href'), home).href === from)?.focus({ preventScroll: true });
  }
  function mount(route, href) {
    window.deckApp?.dispose(); app?.remove(); skip?.remove();
    window.DECK = route.deck;
    root.dataset.theme = route.doc.documentElement.dataset.theme || 'pink';
    metadata(route.doc);
    app = route.doc.querySelector('#app').cloneNode(true);
    app.dataset.theme = root.dataset.theme;
    skip = route.doc.querySelector('body > .skip').cloneNode(true);
    document.body.append(skip, app);
    window.deckApp = window.mountDeck();
    current = href;
  }
  function animate(el, frames, options = timing) {
    const a = el.animate(frames, options); animations.push(a); return a;
  }
  function extra(el) { el.inert = true; el.setAttribute('aria-hidden', 'true'); extras.push(el); return el; }
  // Preserve layout dimensions and viewport offset before changing route classes,
  // scroll or theme. The snapshot is DOM, not a scaled screenshot.
  function snapshot(node) {
    const r = node.getBoundingClientRect();
    const copy = node.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    // Preserve the current pose of incidental CSS motion (e.g. the swipe
    // hint). Cloning must not restart it at an unrelated animation phase.
    const originals = [node, ...node.querySelectorAll('*')];
    const copies = [copy, ...copy.querySelectorAll('*')];
    node.getAnimations({ subtree: true }).forEach((animation) => {
      const target = animation.effect?.target;
      const clone = copies[originals.indexOf(target)];
      if (!clone) return;
      const style = getComputedStyle(target);
      for (const frame of animation.effect.getKeyframes()) {
        for (const key of Object.keys(frame)) {
          if (!['offset', 'computedOffset', 'easing', 'composite'].includes(key)) clone.style[key] = style[key];
        }
      }
    });
    // Theme-dependent custom properties are resolved where they are defined.
    // Pin the source shadow before the root switches from lilac to pink (or back).
    copy.style.setProperty('--card-shadow', getComputedStyle(node).getPropertyValue('--card-shadow'));
    originals.forEach((el, i) => {
      const style = getComputedStyle(el);
      // A DOM clone does not inherit :focus-visible. Preserve its painted pose.
      copies[i].style.outline = style.outline;
      copies[i].style.outlineOffset = style.outlineOffset;
      if (el.matches(':focus-visible')) copies[i].style.borderRadius = style.borderRadius;
    });
    copy.hidden = false;
    copy.dataset.theme = node.dataset.theme || 'pink';
    Object.assign(copy.style, {
      position: 'absolute', left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`, margin: '0',
    });
    const view = document.createElement('div');
    view.className = 'route-view';
    view.style.background = getComputedStyle(document.body).backgroundColor;
    view.append(copy);
    return view;
  }
  function material(el, from, to) {
    return animate(el, [
      { clipPath: from, offset: 0 },
      { clipPath: from, offset: exitEnd, easing: materialEase },
      { clipPath: to, offset: moveEnd },
      { clipPath: to, offset: 1 },
    ]);
  }
  function copyMotion(view, role) {
    // Select non-overlapping content roots: nested emphasis/links retain their
    // normal opacity, colour and wrapping. Paper and grounds remain opaque.
    view.querySelectorAll('.mini > *, .card > *, .dock, .masthead, .colophon').forEach((el) => {
      el.dataset.routeCopy = role;
      const opacity = getComputedStyle(el).opacity;
      animate(el, role === 'outgoing' ? [
        { opacity, offset: 0 }, { opacity: 0, offset: exitEnd }, { opacity: 0, offset: 1 },
      ] : [
        { opacity: 0, offset: 0 }, { opacity: 0, offset: moveEnd }, { opacity, offset: 1 },
      ]);
    });
  }
  function transition(source, destination, from, to) {
    const stage = extra(document.createElement('div'));
    stage.className = 'route-stage';
    document.body.append(stage);
    const returning = to === home;
    if (from === home || returning) {
      stage.dataset.kind = 'index';
      const indexView = returning ? destination : source;
      const deckView = returning ? source : destination;
      stage.append(indexView);
      const href = returning ? from : to;
      const selected = [...indexView.querySelectorAll('.panel')][[...routes.keys()].indexOf(href)];
      selected.dataset.routeSelected = 'true';
      const r = selected.getBoundingClientRect();
      const radius = getComputedStyle(selected).borderRadius;
      const surface = document.createElement('div');
      surface.className = 'route-surface';
      surface.style.background = getComputedStyle(selected).backgroundColor;
      const preview = document.createElement('div');
      preview.className = 'route-preview';
      const card = selected.cloneNode(true);
      card.dataset.theme = selected.dataset.theme || 'pink';
      card.style.setProperty('--card-shadow', getComputedStyle(selected).getPropertyValue('--card-shadow'));
      Object.assign(card.style, { position: 'absolute', left: `${r.left}px`, top: `${r.top}px`,
        width: `${r.width}px`, height: `${r.height}px`, margin: '0', backgroundColor: 'transparent' });
      // Paint the selected card once, avoiding doubled antialiased corners
      // at the source/return endpoint. Its layout slot still stays in place.
      selected.style.visibility = 'hidden';
      preview.append(card);
      surface.append(preview, deckView);
      stage.append(surface);
      const inset = `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${radius})`;
      const frames = (a, b) => returning ? [b, a] : [a, b];
      stage.dataset.returning = String(returning);
      // The selected colour covers its siblings. It never fades through them.
      material(surface, ...frames(inset, full));
      // Clips exchange only opaque material while all route copy is invisible.
      material(preview, ...frames(full, `inset(0px ${innerWidth}px 0px 0px)`));
      material(deckView, ...frames(`inset(0px 0px 0px ${innerWidth}px)`, full));
      copyMotion(preview, returning ? 'incoming' : 'outgoing');
      copyMotion(deckView, returning ? 'outgoing' : 'incoming');
      // Sibling/masthead copy also waits for the returning surface to land.
      copyMotion(indexView, returning ? 'incoming' : 'outgoing');
      // At the index endpoint use the original panel, with its single rounded
      // border, instead of stacking two antialiased versions of that edge.
      animate(surface, returning
        ? [{ visibility: 'visible', offset: 0 }, { visibility: 'visible', offset: moveEnd },
          { visibility: 'hidden', offset: moveEnd }, { visibility: 'hidden', offset: 1 }]
        : [{ visibility: 'hidden', offset: 0 }, { visibility: 'hidden', offset: exitEnd },
          { visibility: 'visible', offset: exitEnd }, { visibility: 'visible', offset: 1 }]);
      animate(selected, returning
        ? [{ visibility: 'hidden', offset: 0 }, { visibility: 'hidden', offset: moveEnd },
          { visibility: 'visible', offset: moveEnd }, { visibility: 'visible', offset: 1 }]
        : [{ visibility: 'visible', offset: 0 }, { visibility: 'visible', offset: exitEnd },
          { visibility: 'hidden', offset: exitEnd }, { visibility: 'hidden', offset: 1 }]);
    } else {
      stage.dataset.kind = 'swap';
      stage.append(source, destination);
      destination.classList.add('route-surface');
      const forward = [...routes.keys()].indexOf(to) > [...routes.keys()].indexOf(from);
      material(destination, forward ? `inset(0px 0px 0px ${innerWidth}px)` : `inset(0px ${innerWidth}px 0px 0px)`, full);
      copyMotion(source, 'outgoing');
      copyMotion(destination, 'incoming');
    }
  }
  async function navigate(href, push = false) {
    if (href === current) return;
    const ticket = ++revision;
    // Back during an index transition reverses its existing clock in place.
    // Do not jump to the completed deck merely to start a return animation.
    if (motion?.kind === 'index' && motion.from === href && !reduced.matches) {
      const old = motion;
      motion = { ...old, from: old.to, to: old.from };
      current = href;
      pending = true;
      complete = href === home ? () => restIndex(old.to) : () => { restDeck(); window.scrollTo(0, old.deckScroll); };
      metadata(href === home ? original : routes.get(href).doc);
      const time = animations[0].currentTime;
      const rate = -animations[0].playbackRate;
      animations.forEach((a) => { a.currentTime = time; a.playbackRate = rate; a.play(); });
      await Promise.all(animations.map((a) => a.finished.catch(() => {})));
      if (ticket === revision) settle();
      return;
    }
    // Finish any interrupted route before starting the latest history intent.
    settle(); pending = true;
    try {
      const route = href === home ? null : await prepare(href);
      await document.fonts.ready;
      if (ticket !== revision) return;
      const from = current;
      if (from === home) scroll = window.scrollY;
      const sourceScroll = window.scrollY;
      const source = reduced.matches ? null : snapshot(from === home ? index : app);
      if (href !== home) {
        mount(route, href);
        index.hidden = true;
        root.classList.remove('index'); document.body.classList.remove('index');
        window.scrollTo(0, 0);
      } else {
        current = home; metadata(original);
        app.style.display = 'none';
        root.removeAttribute('data-theme');
        root.classList.add('index'); document.body.classList.add('index');
        index.hidden = false;
        window.scrollTo(0, scroll);
        // Establish the destination focus pose before taking its snapshot.
        links.find((a) => new URL(a.getAttribute('href'), home).href === from)?.focus({ preventScroll: true });
      }
      if (push) history.pushState(null, '', href);
      complete = href === home ? () => restIndex(from) : restDeck;
      if (reduced.matches) { settle(); return; }
      const destinationNode = href === home ? index : app;
      pausedLive = destinationNode.getAnimations({ subtree: true }).filter((a) => a.playState === 'running');
      pausedLive.forEach((a) => a.pause());
      const destination = snapshot(destinationNode);
      transition(source, destination, from, href);
      // Every phase uses one clock, including rapid Back/Forward reversals.
      const startTime = document.timeline.currentTime;
      animations.forEach((a) => { if (a.playState !== 'paused') a.startTime = startTime; });
      // Live layout is already the destination layout. Cleanup only removes
      // snapshots, so the final sampled frame and the live frame agree.
      root.classList.add('leaving');
      index.inert = app.inert = true;
      motion = { from, to: href, deckScroll: from === home ? 0 : sourceScroll, kind: from === home || href === home ? 'index' : 'swap' };
      await Promise.all(animations.map((a) => a.finished.catch(() => {})));
      if (ticket === revision) settle();
    } catch {
      if (ticket === revision) { settle(); location.assign(href); }
    }
  }
  const ready = init();
  // Exposed readiness is also useful to QA; there is no extra history entry.
  window.routerReady = ready;
  Object.defineProperty(window, 'routeBusy', { get: () => pending });
  ready.catch(() => {});
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey ||
        a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    const href = new URL(a.getAttribute('href'), a.closest('.index-page') ? home : location.href).href;
    // Catch links even while a directly loaded deck is fetching its index.
    const known = routes ? routes.has(href) : a.matches('.next') || !!a.closest('.series');
    if (!a.closest('#app, .index-page') || (href !== home && !known)) return;
    e.preventDefault();
    if (pending) return;
    ready.then(() => { if (!pending) navigate(href, true); }).catch(() => location.assign(href));
  });
  window.addEventListener('popstate', () => {
    const href = address();
    ready.then(() => {
      // Invalidate a fetch even when Back returns to the still-visible route.
      if (href === current) { revision++; settle(); }
      else if (href === home || routes.has(href)) navigate(href);
      else location.reload();
    }).catch(() => location.reload());
  });
  window.addEventListener('pagehide', () => { revision++; if (index) settle(); });
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    revision++;
    ready.then(() => { settle(); if (address() !== current) navigate(address()); });
  });
  reduced.addEventListener('change', () => { if (reduced.matches && complete) { revision++; settle(); } });
})();
