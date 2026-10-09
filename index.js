// One same-document router, shared by the index and directly loaded decks.
// Only boundaries and paper geometry resize; live typography never scales.
(() => {
  'use strict';
  const root = document.documentElement;
  const home = new URL('./', document.currentScript.src).href;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  history.scrollRestoration = 'manual';
  const full = 'inset(0px 0px 0px 0px round 0px)';
  const timing = { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' };
  let index, links, routes, original;
  let app = document.getElementById('app'), skip = document.querySelector('body > .skip');
  let current = app ? address() : home, scroll = 0, revision = 0, pending = false;
  let animations = [], extras = [], panel, complete, motion;
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
    panel?.classList.remove('departing'); panel = null;
    root.classList.remove('leaving');
    index.inert = false;
    if (app) {
      app.inert = false;
      app.classList.remove('route-deck');
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
  const bounds = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  function indexMotion(href, returning, sourceRect) {
    index.hidden = false;
    root.classList.add('index'); document.body.classList.add('index');
    index.style.cssText = `position:fixed;top:${-scroll}px;left:0;width:100%`;
    panel = links.find((a) => new URL(a.getAttribute('href'), home).href === href).closest('.panel');
    const r = panel.getBoundingClientRect();
    const mini = panel.querySelector('.mini').getBoundingClientRect();
    const card = sourceRect || app.querySelector('#card').getBoundingClientRect();
    const inset = `inset(${r.top}px ${innerWidth - r.right}px ${app.getBoundingClientRect().height - r.bottom}px ${r.left}px round ${getComputedStyle(panel).borderRadius})`;
    const preview = extra(panel.cloneNode(true));
    preview.classList.add('departing-panel');
    preview.dataset.theme = panel.dataset.theme || 'pink';
    Object.assign(preview.style, bounds(r));
    panel.classList.add('departing');
    document.body.append(preview);
    const paper = extra(document.createElement('div'));
    paper.className = 'route-paper';
    app.prepend(paper);
    // Paper is a separate, always-opaque layer behind the two type treatments.
    // Resizing its box cannot scale text, and closes the former empty interval.
    animate(paper, returning ? [bounds(card), bounds(mini)] : [bounds(mini), bounds(card)]);
    // Avoid doubling the real card's shadow at either settled endpoint.
    animate(paper, [{ opacity: 0 }, { opacity: 1, offset: 100 / 420 },
      { opacity: 1, offset: 300 / 420 }, { opacity: 0 }], { duration: 420, fill: 'both' });
    animate(app, returning ? [{ clipPath: full }, { clipPath: inset }] : [{ clipPath: inset }, { clipPath: full }]);
    animate(preview, returning ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { delay: returning ? 300 : 0, duration: 100, fill: 'both' });
    animate(app.querySelector('.col'), returning ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
      { delay: returning ? 0 : 120, duration: returning ? 100 : 240, easing: 'ease-out', fill: 'both' });
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
      complete = href === home ? () => restIndex(old.to) : () => { restDeck(); window.scrollTo(0, old.sourceScroll); };
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
      const sourceRect = app?.querySelector('#card').getBoundingClientRect();
      const sourceScroll = window.scrollY;
      const sourceHeight = app?.getBoundingClientRect().height;
      let outgoing;
      if (app && href !== home && !reduced.matches) {
        outgoing = extra(app.cloneNode(true));
        outgoing.removeAttribute('id');
        outgoing.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        outgoing.classList.add('route-outgoing');
        Object.assign(outgoing.style, { top: `${-window.scrollY}px`, height: `${app.getBoundingClientRect().height}px` });
      }
      if (href !== home) { mount(route, href); window.scrollTo(0, 0); }
      else { current = home; metadata(original); }
      if (push) history.pushState(null, '', href);
      complete = href === home ? () => restIndex(from) : restDeck;
      if (reduced.matches) { settle(); return; }
      root.classList.add('leaving');
      index.inert = app.inert = true;
      app.classList.add('route-deck');
      motion = { from, to: href, sourceScroll, kind: from === home || href === home ? 'index' : 'swap' };
      if (from === home || href === home) {
        // A scrolled verdict must retain its viewport position on the way out.
        if (href === home) {
          Object.assign(app.style, { top: '0px', height: `${sourceHeight}px` });
          app.querySelector('.col').style.transform = `translateY(${-sourceScroll}px)`;
        }
        indexMotion(href === home ? from : href, href === home, sourceRect);
      } else {
        index.hidden = true;
        document.body.append(outgoing);
        const direction = [...routes.keys()].indexOf(href) > [...routes.keys()].indexOf(from) ? 1 : -1;
        // Clear the offscreen card shadow as well as its box at both ends.
        const distance = innerWidth + 64;
        animate(app, [{ backgroundColor: getComputedStyle(outgoing).backgroundColor }, { backgroundColor: getComputedStyle(app).backgroundColor }]);
        outgoing.style.background = 'transparent';
        animate(outgoing, [{ transform: 'translateX(0px)' }, { transform: `translateX(${-direction * distance}px)` }]);
        animate(app.querySelector('.col'), [{ transform: `translateX(${direction * distance}px)` }, { transform: 'translateX(0px)' }]);
      }
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
