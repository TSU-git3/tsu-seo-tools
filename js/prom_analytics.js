// prom_analytics.js: read Prom cabinet analytics by day and per listing. Needs core.js. Run in a my.prom.ua tab (signed in).
// Read only. Usage:
//   TSU.promA.loadDays('2026-09-01', '2026-10-30')   -> starts; TSU.promA.status() to follow
//   TSU.promA.days                                    -> { 'YYYY-MM-DD': {orders, gmv, shows, clicks} }
//   await TSU.promA.products('2026-10-01', '2026-10-30', 'gmv:desc', 60) -> [{id, name, orders, gmv}]
(function () {
  const T = window.TSU;
  if (!T || !T.wait) throw new Error('load core.js first');
  T.version.promA = 1;
  const A = (T.promA = { days: {}, running: false, errors: [] });
  const BASE = '/cms_analytics/api/v1/product/';

  A.query = (extra) => {
    const p = new URLSearchParams();
    Object.entries(extra).forEach(([k, v]) => [].concat(v).forEach((x) => p.append(k, x)));
    ['company_sites', 'portal', 'bigl'].forEach((s) => p.append('sources', s));
    ['desktop', 'mobile', 'app'].forEach((s) => p.append('platforms', s));
    ['orders', 'gmv', 'viewsInCatalog', 'productViews'].forEach((m) => p.append('metrics', m));
    return p.toString();
  };
  A.get = async (path, extra) => {
    const r = await fetch(BASE + path + '?' + A.query(extra), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  };
  const val = (data, m) => {
    const x = data && data[m];
    return x == null ? 0 : typeof x === 'object' ? Number(x.sum || 0) : Number(x);
  };

  A.day = async (d) => {
    const j = await A.get('metric_counters', { dateStart: d, dateEnd: d });
    const data = j.data || j;
    return { orders: val(data, 'orders'), gmv: val(data, 'gmv'), shows: val(data, 'viewsInCatalog'), clicks: val(data, 'productViews') };
  };

  A.loadDays = (from, to, pauseMs = 250) => {
    if (A.running) return 'already running';
    const list = T.d ? T.d.range(from, to) : null;
    if (!list) return 'load dash.js for the date helpers';
    A.running = true;
    A.todo = list.length;
    A.done = 0;
    (async () => {
      for (const d of list) {
        try {
          A.days[d] = await A.day(d);
        } catch (e) {
          A.errors.push(d + ' ' + String(e).slice(0, 60));
        }
        A.done++;
        await T.wait(pauseMs);
      }
      A.running = false;
    })();
    return 'loading ' + list.length + ' days';
  };
  A.status = () => T.out({ done: A.done, of: A.todo, running: A.running, errors: A.errors.slice(0, 5) });

  // Per-listing totals for a period. The response rows carry id, name, orders, gmv, views.
  A.products = async (from, to, sort = 'gmv:desc', limit = 60) => {
    const j = await A.get('products_summary', { dateStart: from, dateEnd: to, sort, limit });
    const rows = Array.isArray(j.data) ? j.data : j.data && Array.isArray(j.data.rows) ? j.data.rows : [];
    return rows.map((r) => ({
      id: r.id || r.productId,
      name: r.name || r.productName || '',
      orders: Number(val(r, 'orders')),
      gmv: Number(val(r, 'gmv')),
      shows: Number(val(r, 'viewsInCatalog')),
      clicks: Number(val(r, 'productViews')),
    }));
  };
})();
