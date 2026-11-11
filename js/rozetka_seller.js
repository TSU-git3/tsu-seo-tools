// rozetka_seller.js: read Rozetka seller-cabinet figures. Needs core.js (and dash.js for build()).
// Run in a seller.rozetka.com.ua tab where the owner is signed in. Read only.
// The cabinet's own sign-in key is read from the page's storage and used only for these requests;
// it is never returned, printed or stored anywhere else.
//   await TSU.rz.loadOrders(75)  -> orders of the last 75 days in TSU.rz.orders (compact)
//   await TSU.rz.extras()        -> {rating, cards, questionsOpen}
//   TSU.rz.build(endDay)         -> dashboard fields for the same periods as the shop KPI
(function () {
  const T = window.TSU;
  if (!T || !T.wait) throw new Error('load core.js first');
  T.version.rz = 1;
  const R = (T.rz = { orders: [], errors: [] });
  const API = 'https://cabinet-seller.rozetka.com.ua/';
  const key = () => JSON.parse(localStorage.getItem('authData') || '{}').access_token; // prepush:allow (property name, the value is never output)

  R.get = async (path) => {
    const k = key();
    if (!k) throw new Error('not signed in');
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + k } }); // prepush:allow (header name, the value is never output)
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const j = await r.json();
    return j.content || j;
  };

  // Day = created[0:10] (cabinet times are Kyiv time). Status 49 = repeat order (duplicate), dropped.
  R.loadOrders = async (maxDays = 75, pauseMs = 400) => {
    const oldest = T.d ? T.d.add(T.d.today(), -maxDays) : null;
    R.orders = [];
    for (let page = 1; page < 60; page++) {
      const c = await R.get('orders/search?types=1&sort=-id&page=' + page + '&pageSize=100&expand=purchases,status_data');
      const list = c.orders || [];
      list.forEach((o) => {
        if (o.status === 49) return;
        R.orders.push({
          id: o.id,
          day: String(o.created).slice(0, 10),
          status: o.status,
          group: o.status_group,
          statusName: (o.status_data && o.status_data.name) || '',
          amount: Number(o.amount_with_discount != null ? o.amount_with_discount : o.amount) || 0,
          items: (o.purchases || []).map((p) => ({ name: p.item_name, qty: Number(p.quantity) || 0, cost: Number(p.cost) || 0, article: (p.item && p.item.article) || '' })),
        });
      });
      const last = list[list.length - 1];
      if (!last || (oldest && String(last.created).slice(0, 10) < oldest)) break;
      await T.wait(pauseMs);
    }
    return 'orders ' + R.orders.length;
  };

  R.extras = async () => {
    const rating = await R.get('markets/seller-rating');
    const counts = await R.get('v1/goods/counts');
    const q = await R.get('item-comments/counts');
    R.ex = {
      rating: { stars: rating.stars, marks: rating.mark_all_cnt },
      cards: {
        onSale: counts.active_items.tabs.items_on_sale_tab,
        notOnSale: counts.active_items.tabs.items_not_on_sale_tab,
        archive: counts.inactive_items.tabs.items_archive,
        hidden: counts.inactive_items.tabs.items_hidden,
      },
      questionsOpen: q.unread_question,
    };
    return R.ex;
  };

  // Periods as in the shop KPI (needs dash.js). group 2 = completed, 3 = refused / not paid / cancelled, 1 = in progress.
  R.build = (end, n = 8) => {
    const D = T.d;
    const p = T.dash.periods(end);
    const inP = (o, [a, b]) => o.day >= a && o.day <= b;
    const live = (o) => o.group !== 3;
    const agg = (span) => {
      const os = R.orders.filter((o) => inP(o, span));
      return { orders: os.length, revenue: Math.round(os.filter(live).reduce((s, o) => s + o.amount, 0)), os };
    };
    const a = agg(p.last30);
    const b = agg(p.prev30);
    const c = agg(p.last14);
    const e = agg(p.prev14);
    const weeks = [];
    for (let w = D.add(D.monday(end), -7 * (n - 1)); w <= end; w = D.add(w, 7)) {
      const to = D.add(w, 6) > end ? end : D.add(w, 6);
      const x = agg([w, to]);
      weeks.push({ week: w, orders: x.orders, revenue: x.revenue, days: D.range(w, to).length });
    }
    const per = {};
    a.os.filter(live).forEach((o) =>
      o.items.forEach((it) => {
        const k = it.article || it.name;
        per[k] = per[k] || { name: it.name, qty: 0, gmv: 0 };
        per[k].qty += it.qty;
        per[k].gmv += it.cost; // sum of purchase cost, as the dashboard has always counted it
      })
    );
    const all = Object.values(per);
    const byG = all.slice().sort((x, y) => y.gmv - x.gmv).slice(0, 8);
    const byQ = all.slice().sort((x, y) => y.qty - x.qty || y.gmv - x.gmv).slice(0, 8);
    const top = [...new Set([...byG, ...byQ])].map((x) => ({ name: x.name, qty: x.qty, gmv: Math.round(x.gmv) }));
    return {
      period: D.fmt(...p.last30, true),
      prevPeriod: D.fmt(...p.prev30, true),
      orders: a.orders,
      ordersPrev: b.orders,
      done: a.os.filter((o) => o.group === 2).length,
      failed: a.os.filter((o) => o.group === 3).length,
      inProgress: a.os.filter((o) => o.group === 1).length,
      revenue: a.revenue,
      revenuePrev: b.revenue,
      last14: { period: D.fmt(...p.last14), orders: c.orders, revenue: c.revenue },
      prev14: { period: D.fmt(...p.prev14), orders: e.orders, revenue: e.revenue },
      weeks,
      top,
    };
  };

  // Orders created since a day (for the shared-stock check): compact, cancelled ones left out.
  R.since = (day) =>
    R.orders.filter((o) => o.day >= day && o.group !== 3).map((o) => ({ id: o.id, day: o.day, status: o.statusName, items: o.items.map((i) => [i.article, i.name.slice(0, 50), i.qty]) }));

  // marks30 from a log {'YYYY-MM-DD': count}: today's count minus the count logged closest to 30 days ago.
  R.marks30 = (log, today, count) => {
    const target = T.d.add(today, -30);
    const older = Object.keys(log || {}).filter((d) => d <= today).sort((x, y) => Math.abs(new Date(x) - new Date(target)) - Math.abs(new Date(y) - new Date(target)));
    const base = older.find((d) => d < today);
    return base ? count - log[base] : 0;
  };
})();
