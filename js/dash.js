// dash.js: pure date and period maths for a shop dashboard (no network). Needs core.js.
// Input days maps: { 'YYYY-MM-DD': {orders, gmv, shows, clicks} } (shop) and { 'YYYY-MM-DD': {clicks, impr, pos} } (Search Console).
(function () {
  const T = window.TSU;
  if (!T || !T.out) throw new Error('load core.js first');
  T.version.dash = 1;
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const D = (T.d = {
    add: (iso, n) => {
      const t = new Date(iso + 'T00:00:00Z');
      t.setUTCDate(t.getUTCDate() + n);
      return t.toISOString().slice(0, 10);
    },
    range: (a, b) => {
      const out = [];
      for (let x = a; x <= b; x = D.add(x, 1)) out.push(x);
      return out;
    },
    monday: (iso) => {
      const wd = new Date(iso + 'T00:00:00Z').getUTCDay();
      return D.add(iso, -((wd + 6) % 7));
    },
    // «11 Oct – 9 Nov 2026», «13 – 26 Oct»; year added when asked
    fmt: (a, b, year) => {
      const [ya, ma, da] = a.split('-').map(Number);
      const [yb, mb, db] = b.split('-').map(Number);
      const left = ma === mb && ya === yb ? String(da) : da + ' ' + M[ma - 1] + (ya !== yb ? ' ' + ya : '');
      return left + ' – ' + db + ' ' + M[mb - 1] + (year ? ' ' + yb : '');
    },
    today: (tz = 'Europe/Kyiv') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
  });

  const sum = (days, keys, from, to) => {
    const s = Object.fromEntries(keys.map((k) => [k, 0]));
    D.range(from, to).forEach((d) => days[d] && keys.forEach((k) => (s[k] += days[d][k] || 0)));
    return s;
  };

  // Subtract confirmed fakes: one order and its gmv on its date. Returns a new map.
  T.dash = {};
  T.dash.removeFakes = (days, fakes) => {
    const out = JSON.parse(JSON.stringify(days));
    (fakes || []).forEach((f) => {
      if (out[f.date]) {
        out[f.date].orders = Math.max(0, out[f.date].orders - 1);
        out[f.date].gmv = Math.max(0, out[f.date].gmv - f.gmv);
      }
    });
    return out;
  };

  // Days in the last n days (to end) with gmv >= minGmv and orders <= maxOrders, not on the fake list.
  T.dash.suspicious = (days, end, fakes, n = 3, minGmv = 15000, maxOrders = 2) => {
    const fakeDays = new Set((fakes || []).map((f) => f.date));
    return D.range(D.add(end, -(n - 1)), end)
      .filter((d) => days[d] && days[d].gmv >= minGmv && days[d].orders <= maxOrders && days[d].orders > 0 && !fakeDays.has(d))
      .map((d) => ({ date: d, orders: days[d].orders, gmv: Math.round(days[d].gmv) }));
  };

  // Last day with shop data = latest day with shows > 0 (analytics lag a day).
  T.dash.lastDay = (days) => Object.keys(days).filter((d) => days[d].shows > 0).sort().pop();

  T.dash.periods = (end) => ({
    last30: [D.add(end, -29), end],
    prev30: [D.add(end, -59), D.add(end, -30)],
    last14: [D.add(end, -13), end],
    prev14: [D.add(end, -27), D.add(end, -14)],
  });

  // KPI fields from cleaned shop days (orders, revenue, shows, clicks for the periods).
  T.dash.kpi = (days, end) => {
    const p = T.dash.periods(end);
    const k = ['orders', 'gmv', 'shows', 'clicks'];
    const a = sum(days, k, ...p.last30);
    const b = sum(days, k, ...p.prev30);
    const c = sum(days, k, ...p.last14);
    const e = sum(days, k, ...p.prev14);
    return {
      period: D.fmt(...p.last30, true),
      prevPeriod: D.fmt(...p.prev30, true),
      orders: a.orders,
      ordersPrev: b.orders,
      revenue: Math.round(a.gmv),
      revenuePrev: Math.round(b.gmv),
      shows: a.shows,
      showsPrev: b.shows,
      clicks: a.clicks,
      clicksPrev: b.clicks,
      last14: { period: D.fmt(...p.last14), orders: c.orders, revenue: Math.round(c.gmv), clicks: c.clicks, shows: c.shows },
      prev14: { period: D.fmt(...p.prev14), orders: e.orders, revenue: Math.round(e.gmv), clicks: e.clicks, shows: e.shows },
    };
  };

  // Search Console block: last 28 days with data vs the 28 before (position impression-weighted).
  T.dash.gsc = (g) => {
    const end = Object.keys(g).filter((d) => g[d].impr > 0).sort().pop();
    const agg = (a, b) => {
      let clicks = 0;
      let impr = 0;
      let w = 0;
      D.range(a, b).forEach((d) => {
        const x = g[d];
        if (!x) return;
        clicks += x.clicks;
        impr += x.impr;
        w += x.pos * x.impr;
      });
      return { clicks, impr, pos: impr ? Math.round((w / impr) * 10) / 10 : null };
    };
    const a = agg(D.add(end, -27), end);
    const b = agg(D.add(end, -55), D.add(end, -28));
    return { period: D.fmt(D.add(end, -27), end), clicks: a.clicks, impr: a.impr, pos: a.pos, prevClicks: b.clicks, prevImpr: b.impr, prevPos: b.pos };
  };

  // Last n Monday weeks up to end (shop days) with Search Console columns.
  T.dash.weekly = (days, g, end, n = 8) => {
    const first = D.add(D.monday(end), -7 * (n - 1));
    const weeks = [];
    for (let w = first; w <= end; w = D.add(w, 7)) {
      const span = D.range(w, D.add(w, 6));
      const shopDays = span.filter((d) => d <= end && days[d] && days[d].shows > 0);
      const gDays = span.filter((d) => g && g[d] && g[d].impr > 0);
      const s = sum(days, ['orders', 'gmv', 'shows', 'clicks'], w, D.add(w, 6) > end ? end : D.add(w, 6));
      let gc = 0;
      let gi = 0;
      let gw = 0;
      gDays.forEach((d) => {
        gc += g[d].clicks;
        gi += g[d].impr;
        gw += g[d].pos * g[d].impr;
      });
      weeks.push({
        week: w,
        days: shopDays.length,
        orders: s.orders,
        revenue: Math.round(s.gmv),
        shows: s.shows,
        clicks: s.clicks,
        gClicks: gc,
        gImpr: gi,
        gPos: gi ? Math.round((gw / gi) * 10) / 10 : null,
        gDays: gDays.length,
      });
    }
    return weeks;
  };

  // Top sellers: drop listings that make up a confirmed fake (1-order listings whose gmv adds up to the fake, ±1),
  // then the top n by gmv plus the top n by orders, without duplicates.
  T.dash.top = (rows, fakesInPeriod, n = 8) => {
    let left = rows.slice();
    const unmatched = [];
    (fakesInPeriod || []).forEach((f) => {
      const ones = left.filter((r) => r.orders === 1);
      let found = null;
      for (let i = 0; i < ones.length && !found; i++) {
        if (Math.abs(ones[i].gmv - f.gmv) <= 1) found = [ones[i]];
        for (let j = i + 1; j < ones.length && !found; j++) {
          if (Math.abs(ones[i].gmv + ones[j].gmv - f.gmv) <= 1) found = [ones[i], ones[j]];
          for (let k = j + 1; k < ones.length && !found; k++)
            if (Math.abs(ones[i].gmv + ones[j].gmv + ones[k].gmv - f.gmv) <= 1) found = [ones[i], ones[j], ones[k]];
        }
      }
      if (found) left = left.filter((r) => !found.includes(r));
      else unmatched.push(f.date);
    });
    const byG = left.slice().sort((a, b) => b.gmv - a.gmv).slice(0, n);
    const byQ = left.slice().sort((a, b) => b.orders - a.orders || b.gmv - a.gmv).slice(0, n);
    const top = [...new Map([...byG, ...byQ].map((r) => [r.id, r])).values()].map((r) => ({ id: r.id, name: r.name, qty: r.orders, gmv: Math.round(r.gmv) }));
    return { top, unmatched };
  };

  // Read a long JSON result in pieces through the browser tool.
  T.dash.piece = (obj, i, size = 900) => {
    const s = JSON.stringify(obj).replace(/[=&%?;]/g, ' ');
    return 'part ' + i + '/' + Math.ceil(s.length / size) + ' ' + s.slice(i * size, (i + 1) * size);
  };
})();
