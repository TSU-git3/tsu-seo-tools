// crawl.js: crawl same-site pages one at a time and collect SEO fields. Needs core.js.
// Usage (in a tab on the site being crawled):
//   urls = await TSU.crawl.fromSitemap('/sitemap.xml', /\/ua\//)
//   TSU.crawl.start(urls, {pauseMs: 2000, bodySel: '.b-user-content', thinWords: 50, descPattern: /some text/})
//   TSU.crawl.status()          -> progress
//   TSU.crawl.summary()         -> counts per flag + a few example paths
//   TSU.crawl.list('thin', 0)   -> paths for one flag, 40 at a time
//   TSU.crawl.checkLinks()      -> status of in-text links that were not crawled (after start() finished)
(function () {
  const T = window.TSU;
  if (!T || !T.wait) throw new Error('load core.js first');
  T.version.crawl = 1;
  const C = (T.crawl = { rows: [], queue: [], running: false, done: 0, errors: 0, links: {} });

  C.fromSitemap = async (url, filter) => {
    const urls = [];
    const seen = new Set();
    const read = async (u) => {
      if (seen.has(u)) return;
      seen.add(u);
      const xml = new DOMParser().parseFromString(await (await fetch(u)).text(), 'application/xml');
      for (const s of [...xml.querySelectorAll('sitemap > loc')].map((n) => n.textContent.trim())) {
        await T.wait(500);
        await read(s);
      }
      xml.querySelectorAll('url > loc').forEach((n) => urls.push(n.textContent.trim()));
    };
    await read(url);
    return filter ? urls.filter((u) => filter.test(u)) : urls;
  };

  C.page = async (url) => {
    const o = C.opts;
    const r = { url };
    try {
      const res = await fetch(url, { redirect: 'follow' });
      r.status = res.status;
      r.final = res.url !== new URL(url, location.href).href ? res.url : '';
      const d = T.parse(await res.text());
      const meta = (n) => ((d.querySelector('meta[name="' + n + '"]') || {}).content || '').trim();
      r.title = ((d.querySelector('title') || {}).textContent || '').trim();
      r.desc = meta('description');
      r.robots = meta('robots');
      r.h1 = [...d.querySelectorAll('h1')].map((h) => T.text(h)).filter(Boolean);
      r.canonical = (d.querySelector('link[rel=canonical]') || {}).href || '';
      r.hreflang = [...d.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => l.hreflang + ' ' + l.href);
      const body = o.bodySel ? d.querySelector(o.bodySel) : null;
      r.words = body ? T.text(body).split(' ').filter((w) => /\p{L}/u.test(w)).length : null;
      r.imgNoAlt = [...d.querySelectorAll('img')].filter((i) => !(i.getAttribute('alt') || '').trim()).length;
      const ld = T.jsonld(d);
      r.ld = [...new Set(ld.map(T.typeOf))];
      const p = ld.find((x) => T.typeOf(x).includes('Product'));
      if (p) {
        const offer = [].concat(p.offers || [])[0] || {};
        const brand = p.brand && typeof p.brand === 'object' ? p.brand.name || '' : p.brand || '';
        r.product = {
          brand,
          sku: p.sku || '',
          gtin: p.gtin || p.gtin13 || p.gtin12 || p.gtin8 || '',
          rating: !!p.aggregateRating,
          avail: String(offer.availability || '').split('/').pop(),
        };
      }
      r.links = body ? [...body.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => h.startsWith(location.origin)) : [];
    } catch (e) {
      r.status = 'error';
      r.error = String(e).slice(0, 80);
      C.errors++;
    }
    return r;
  };

  C.start = (urls, opts = {}) => {
    if (C.running) return 'already running';
    C.opts = Object.assign({ pauseMs: 2000, bodySel: '.b-user-content', thinWords: 50, descPattern: null }, opts);
    C.queue = urls.slice();
    C.rows = [];
    C.done = 0;
    C.errors = 0;
    C.running = true;
    C.started = Date.now();
    (async () => {
      while (C.queue.length && C.running) {
        C.rows.push(await C.page(C.queue.shift()));
        C.done++;
        await T.wait(C.opts.pauseMs);
      }
      C.running = false;
    })();
    return 'started ' + urls.length;
  };
  C.stop = () => ((C.running = false), 'stopping');
  C.status = () =>
    T.out({ done: C.done, left: C.queue.length, errors: C.errors, running: C.running, min: Math.round((Date.now() - (C.started || Date.now())) / 60000) });

  const path = (u) => {
    try {
      return new URL(u).pathname;
    } catch (e) {
      return u;
    }
  };
  const isUa = (u) => /\/ua\//.test(path(u)) || path(u) === '/ua';
  const heads = (r) => (r.title || '') + ' ' + (r.h1 || []).join(' ');

  C.flags = {
    notOk: (r) => r.status !== 200,
    redirected: (r) => !!r.final,
    noTitle: (r) => r.status === 200 && !r.title,
    noDesc: (r) => r.status === 200 && !r.desc,
    h1NotOne: (r) => r.status === 200 && r.h1 && r.h1.length !== 1,
    canonicalElsewhere: (r) => r.canonical && r.canonical.split('#')[0] !== (r.final || new URL(r.url, location.href).href),
    noindex: (r) => /noindex/i.test(r.robots || ''),
    thin: (r) => r.words !== null && r.words < C.opts.thinWords,
    ukrLettersOnRu: (r) => !isUa(r.url) && /[іїєґІЇЄҐ]/.test(heads(r)),
    rusLettersOnUa: (r) => isUa(r.url) && /[ыэъёЫЭЪЁ]/.test(heads(r)),
    imgNoAlt: (r) => r.imgNoAlt > 0,
    productNoBrand: (r) => r.product && !r.product.brand,
    productNoGtin: (r) => r.product && !r.product.gtin,
    descPattern: (r) => !!(C.opts.descPattern && C.opts.descPattern.test(r.desc || '')),
    noJsonLd: (r) => r.status === 200 && (!r.ld || !r.ld.length),
  };

  C.dupTitles = () => {
    const by = {};
    C.rows.forEach((r) => r.title && (by[r.title] = (by[r.title] || []).concat(path(r.url))));
    return Object.values(by).filter((v) => v.length > 1);
  };

  C.summary = (examples = 3) => {
    const s = { pages: C.rows.length, status: {}, ld: {} };
    C.rows.forEach((r) => {
      s.status[r.status] = (s.status[r.status] || 0) + 1;
      (r.ld || []).forEach((t) => (s.ld[t] = (s.ld[t] || 0) + 1));
    });
    Object.entries(C.flags).forEach(([k, f]) => {
      const hit = C.rows.filter(f);
      if (hit.length) s[k] = [hit.length].concat(hit.slice(0, examples).map((r) => path(r.url).slice(0, 48)));
    });
    const d = C.dupTitles();
    if (d.length) s.dupTitles = d.length;
    s.imgNoAltTotal = C.rows.reduce((a, r) => a + (r.imgNoAlt || 0), 0);
    return T.out(s, 1400);
  };

  C.list = (flag, page = 0, n = 40) => {
    const rows = flag === 'dupTitles' ? C.dupTitles().flat().map((p) => ({ url: p })) : C.rows.filter(C.flags[flag]);
    return T.out({ flag, total: rows.length, page, paths: rows.slice(page * n, page * n + n).map((r) => path(r.url)) }, 1800);
  };

  C.row = (i, keys) => T.out(keys ? keys.reduce((o, k) => ((o[k] = C.rows[i][k]), o), {}) : C.rows[i], 1200);

  C.checkLinks = (pauseMs = 2000) => {
    const crawled = new Set(C.rows.map((r) => new URL(r.url, location.href).href));
    const todo = [...new Set(C.rows.flatMap((r) => r.links || []))].filter((h) => !crawled.has(h.split('#')[0]));
    C.links = {};
    (async () => {
      for (const h of todo) {
        try {
          C.links[h] = (await fetch(h, { method: 'HEAD', redirect: 'follow' })).status;
        } catch (e) {
          C.links[h] = 'error';
        }
        await T.wait(pauseMs);
      }
    })();
    return 'checking ' + todo.length + ' links';
  };
  C.badLinks = () => {
    const bad = Object.entries(C.links).filter(([, s]) => s !== 200);
    const from = (h) => C.rows.filter((r) => (r.links || []).includes(h)).map((r) => path(r.url));
    return T.out({ checked: Object.keys(C.links).length, bad: bad.map(([h, s]) => [path(h), s, from(h).slice(0, 3)]) }, 1800);
  };
})();
