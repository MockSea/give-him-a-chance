// Enhance index -> deck navigation in this document. Direct deck loads still
// use their own HTML. No second navigation, snapshots, or scaled typography.
(() => {
  'use strict';
  const home = new URL('./', location.href).href;
  const root = document.documentElement;
  const index = document.querySelector('.index-page');
  const links = [...index.querySelectorAll('.panel .title a')];
  const routes = new Map(links.map((a) => [a.href, {}]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const meta = [...document.querySelectorAll('meta[name], meta[property]')];
  const original = { title: document.title, content: meta.map((m) => m.content) };
  let engine, pending = false, revision = 0, current = home, scroll = 0;
  let animations = [], preview, panel, app, skip;

  function script(src) {
    return new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = src;
      node.onload = () => { node.remove(); resolve(); };
      node.onerror = () => { node.remove(); reject(new Error(`Could not load ${src}`)); };
      document.head.append(node);
    });
  }

  // Intent-only HTML warming: no deck engine/data on the index's critical path.
  function warm(href) {
    const route = routes.get(href);
    if (!route.html) route.html = fetch(href).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${href}`);
      return r.text();
    }).catch((err) => { route.html = null; throw err; });
    return route.html;
  }

  async function prepare(href) {
    const route = routes.get(href);
    if (route.doc) return route;
    const html = await warm(href);
    engine ||= script(new URL('app.js', home).href).catch((err) => { engine = null; throw err; });
    await Promise.all([engine, script(new URL('deck.js', href).href), document.fonts.ready]);
    route.doc = new DOMParser().parseFromString(html, 'text/html');
    if (!route.doc.querySelector('#app')) throw new Error('Missing deck');
    // Engine links normally resolve relative to the deck document.
    const absolute = (link) => link && { ...link, href: new URL(link.href, href).href };
    route.deck = { ...window.DECK, INDEX: absolute(window.DECK.INDEX || { href: '../', text: 'all parts' }),
      NEXT: absolute(window.DECK.NEXT), SERIES: { ...window.DECK.SERIES, prev: absolute(window.DECK.SERIES?.prev) } };
    return route;
  }

  function cancelMotion() {
    animations.forEach((a) => a.cancel());
    animations = [];
    preview?.remove(); preview = null;
    panel?.classList.remove('departing'); panel = null;
    root.classList.remove('leaving');
    index.inert = false;
    if (app) app.inert = false;
  }

  function finish() {
    cancelMotion();
    index.hidden = true;
    index.removeAttribute('style');
    root.classList.remove('index');
    document.body.classList.remove('index');
    app.classList.remove('route-deck');
    app.style.removeProperty('clip-path');
    app.querySelector('.col').style.removeProperty('opacity');
    app.querySelector('h1')?.focus({ preventScroll: true });
  }

  function restoreIndex() {
    const previous = current;
    revision++;
    pending = false;
    cancelMotion();
    window.deckApp?.dispose();
    window.deckApp = null;
    window.DECK = null;
    app?.remove(); app = null;
    skip?.remove(); skip = null;
    current = home;
    root.removeAttribute('data-theme');
    root.classList.add('index');
    document.body.classList.add('index');
    index.hidden = false;
    index.removeAttribute('style');
    document.title = original.title;
    meta.forEach((m, i) => { m.content = original.content[i]; });
    window.scrollTo(0, scroll);
    links.find((a) => new URL(a.getAttribute('href'), home).href === previous)?.focus({ preventScroll: true });
  }

  function mount(route, href) {
    window.deckApp?.dispose();
    app?.remove(); skip?.remove();
    window.DECK = route.deck;
    root.dataset.theme = route.doc.documentElement.dataset.theme || '';
    document.title = route.doc.title;
    meta.forEach((m) => {
      const key = m.hasAttribute('name') ? 'name' : 'property';
      const replacement = route.doc.querySelector(`meta[${key}="${m.getAttribute(key)}"]`);
      if (replacement) m.content = replacement.content;
    });
    app = route.doc.querySelector('#app').cloneNode(true);
    app.classList.add('route-deck');
    skip = route.doc.querySelector('.skip').cloneNode(true);
    document.body.append(skip, app);
    window.deckApp = window.mountDeck();
    current = href;
  }

  async function open(a) {
    if (pending) return;
    pending = true;
    const ticket = ++revision;
    const href = a.href;
    try {
      const route = await prepare(href);
      if (ticket !== revision) return;
      scroll = window.scrollY;
      panel = a.closest('.panel');
      const r = panel.getBoundingClientRect();
      const radius = getComputedStyle(panel).borderRadius;
      preview = panel.cloneNode(true);
      preview.classList.add('departing-panel');
      // Keep the index typography context and the chosen part's own tokens.
      preview.dataset.theme = panel.dataset.theme || '';
      Object.assign(preview.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      preview.setAttribute('aria-hidden', 'true');
      preview.inert = true;
      index.style.cssText = `position:fixed;top:${-scroll}px;left:0;width:100%`;
      mount(route, href);
      history.pushState(null, '', href);
      if (reduced.matches) { finish(); pending = false; return; }
      root.classList.add('leaving');
      index.inert = app.inert = true;
      panel.classList.add('departing');
      document.body.append(preview);
      const inset = `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${radius})`;
      animations = [
        app.animate([{ clipPath: inset }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
          { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }),
        preview.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'both' }),
        app.querySelector('.col').animate([{ opacity: 0 }, { opacity: 1 }],
          { delay: 120, duration: 240, easing: 'ease-out', fill: 'both' }),
      ];
      await Promise.all(animations.map((a) => a.finished.catch(() => {})));
      if (ticket !== revision) return;
      finish();
      pending = false;
    } catch {
      if (ticket === revision) { restoreIndex(); location.assign(href); }
    }
  }

  links.forEach((a) => {
    for (const event of ['pointerenter', 'pointerdown', 'focus']) {
      a.addEventListener(event, () => { if (!navigator.connection?.saveData) warm(a.href).catch(() => {}); }, { passive: true });
    }
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      open(a);
    });
  });
  function address() {
    const url = new URL(location.href);
    url.hash = url.search = '';
    url.pathname = url.pathname.replace(/\/index\.html$/, '/');
    return url.href;
  }
  function reconcile() {
    const href = address();
    if (href === current) return; // fragment traversal keeps the current screen
    if (href === home) restoreIndex();
    else if (routes.get(href)?.doc) {
      revision++;
      pending = false;
      cancelMotion();
      mount(routes.get(href), href);
      finish();
    } else location.reload();
  }
  window.addEventListener('popstate', reconcile);
  window.addEventListener('pagehide', () => {
    revision++;
    pending = false;
    if (app) finish(); else cancelMotion();
  });
  window.addEventListener('pageshow', () => {
    if (address() !== current) reconcile();
    else if (app) finish(); else cancelMotion();
  });
})();
