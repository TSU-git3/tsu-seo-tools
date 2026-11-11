// prom_search.js: Prom.ua marketplace search positions, one query at a time. Needs core.js.
// Run in a prom.ua tab. Nothing shop-specific lives here: pass the company id and queries at run time.
// Usage:
//   TSU.promSearch.start(['query one', 'query two'], <companyId>, {pauseMs: 3500})
//   TSU.promSearch.status()
//   TSU.promSearch.summary(0)   -> 25 queries per page: [query, best organic position, our paid slots, total results]
//   TSU.promSearch.rows         -> full per-query records (keep in the page; read with summary/row)
(function () {
  const T = window.TSU;
  if (!T || !T.wait) throw new Error('load core.js first');
  T.version.promSearch = 1;
  const S = (T.promSearch = { rows: [], queue: [], running: false, done: 0 });

  // window.ApolloCacheState = {...}; the script continues after the object, so plain JSON.parse fails.
  S.apollo = (html) => {
    let i = html.indexOf('window.ApolloCacheState');
    if (i < 0) return null;
    i = html.indexOf('{', i);
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < html.length; j++) {
      const c = html[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return JSON.parse(html.slice(i, j + 1));
    }
    return null;
  };

  // Only the listing part is read; the cache also holds the signed-in user's details, which are never touched.
  S.parse = (html, companyId) => {
    const cache = (S.apollo(html) || {})._FAST_CACHE;
    if (!cache) return { error: 'no cache' };
    const key = Object.keys(cache).find((k) => k.startsWith('SearchListingQuery'));
    const page = key && cache[key].result && cache[key].result.listing && cache[key].result.listing.page;
    if (!page) return { error: 'no listing' };
    const items = (page.products || []).map((x, i) => ({
      pos: i + 1,
      paid: /premium_adv/.test((x.advert && x.advert.source) || ''),
      company: x.product.company_id,
      id: x.product.id,
      ready: (x.product.catalogPresence || {}).value === 'presence_for_sure',
      reviews: (x.product.productOpinionCounters || {}).count || 0,
      price: x.product.price,
      category: x.product.categoryId,
    }));
    let org = 0;
    items.forEach((x) => (x.org = x.paid ? null : ++org));
    const ours = items.filter((x) => x.company === companyId);
    return {
      total: page.total,
      onPage: items.length,
      paidSlots: items.filter((x) => x.paid).length,
      ours: ours.map(({ id, pos, org, paid, ready, reviews, price }) => ({ id, pos, org, paid, ready, reviews, price })),
      bestOrg: (ours.find((x) => !x.paid) || {}).org || null,
      topCompanies: items.filter((x) => !x.paid).slice(0, 5).map((x) => x.company),
      category: ((page.topHitsCategory || {}).path || []).map((c) => c.caption).join(' > '),
    };
  };

  S.start = (queries, companyId, opts = {}) => {
    if (S.running) return 'already running';
    if (!companyId) return 'pass the company id';
    S.opts = Object.assign({ pauseMs: 3500, lang: 'ua' }, opts);
    S.queue = queries.slice();
    S.rows = [];
    S.done = 0;
    S.running = true;
    S.started = Date.now();
    (async () => {
      while (S.queue.length && S.running) {
        const q = S.queue.shift();
        try {
          const html = await (await fetch('/' + S.opts.lang + '/search?search_term=' + encodeURIComponent(q))).text();
          S.rows.push(Object.assign({ q }, S.parse(html, companyId)));
        } catch (e) {
          S.rows.push({ q, error: String(e).slice(0, 80) });
        }
        S.done++;
        await T.wait(S.opts.pauseMs);
      }
      S.running = false;
    })();
    return 'started ' + queries.length;
  };
  S.stop = () => ((S.running = false), 'stopping');
  S.status = () => T.out({ done: S.done, left: S.queue.length, running: S.running, min: Math.round((Date.now() - (S.started || Date.now())) / 60000) });
  S.summary = (page = 0, n = 25) =>
    T.out(
      S.rows.slice(page * n, page * n + n).map((r) => [r.q, r.error ? 'ERR' : r.bestOrg, r.ours ? r.ours.filter((x) => x.paid).length : 0, r.total]),
      1800
    );
  S.row = (i) => T.out(S.rows[i], 1200);
})();
