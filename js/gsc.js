// gsc.js: read the daily table of a Search Console Performance report open in the tab. Needs core.js.
// Open the report with breakdown=date (and the metrics you need), wait for it to load, then:
//   TSU.gsc.dates() -> { 'YYYY-MM-DD': {clicks, impr, ctr, pos} }  (also kept in TSU.gsc.days)
(function () {
  const T = window.TSU;
  if (!T || !T.out) throw new Error('load core.js first');
  T.version.gsc = 1;
  const G = (T.gsc = { days: {} });
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const num = (s) => Number(String(s).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')) || 0;

  // Accepts «9 Nov 2026», «Nov 9, 2026», «09/11/2026» (day first), «2026-11-09».
  G.isoDate = (s) => {
    s = String(s).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return s;
    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,4})\.?\s+(\d{4})$/);
    if (m && MON[m[2].toLowerCase()]) return m[3] + '-' + String(MON[m[2].toLowerCase()]).padStart(2, '0') + '-' + m[1].padStart(2, '0');
    m = s.match(/^([A-Za-z]{3,4})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m && MON[m[1].toLowerCase()]) return m[3] + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0') + '-' + m[2].padStart(2, '0');
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  };

  // Columns are found by their header text, so the metric order doesn't matter.
  G.dates = () => {
    const table = [...document.querySelectorAll('table')].find((t) => /Date/i.test(t.innerText) && /Clicks|Impressions/i.test(t.innerText));
    if (!table) return 'no date table on the page';
    const heads = [...table.querySelectorAll('thead th, tr:first-child th')].map((th) => T.text(th).toLowerCase());
    const col = (re) => heads.findIndex((h) => re.test(h));
    const ci = { clicks: col(/click/), impr: col(/impression/), ctr: col(/ctr/), pos: col(/position/) };
    [...table.querySelectorAll('tbody tr')].forEach((tr) => {
      const cells = [...tr.querySelectorAll('td, th')].map((c) => T.text(c));
      const iso = G.isoDate(cells[0]);
      if (!iso) return;
      const pick = (k) => (ci[k] >= 0 ? num(cells[ci[k]]) : null);
      G.days[iso] = { clicks: pick('clicks'), impr: pick('impr'), ctr: pick('ctr'), pos: pick('pos') };
    });
    return G.days;
  };
  G.count = () => {
    const k = Object.keys(G.days).sort();
    return T.out({ days: k.length, first: k[0], last: k[k.length - 1] });
  };
})();
