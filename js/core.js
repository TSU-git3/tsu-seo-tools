// core.js: shared helpers for the other scripts. Load first.
// Timer that keeps its pace in background tabs, compact output, page text helpers, JSON-LD reader.
(function () {
  const T = (window.TSU = window.TSU || {});
  T.version = Object.assign(T.version || {}, { core: 1 });

  let worker = null;
  const waiting = {};
  let seq = 0;
  function ensureWorker() {
    if (worker) return;
    const src = 'onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e) => {
      const done = waiting[e.data];
      delete waiting[e.data];
      if (done) done();
    };
  }
  // setTimeout is throttled to ~1/min in hidden tabs; a worker timer is not.
  T.wait = (ms) =>
    new Promise((resolve) => {
      ensureWorker();
      const id = ++seq;
      waiting[id] = resolve;
      worker.postMessage({ id, ms });
    });

  // Output for the browser tool: no = & % ? ; (they get blocked), cut to max characters.
  T.out = (x, max = 900) => {
    let s = typeof x === 'string' ? x : JSON.stringify(x);
    s = s.replace(/[=&%?;]/g, ' ');
    return s.length > max ? s.slice(0, max) + ' ...[' + s.length + ']' : s;
  };

  T.text = (el) => (el ? el.innerText || el.textContent || '' : '').replace(/\s+/g, ' ').trim();

  // Text of the page between two markers (e.g. a report's title and «Rows per page»).
  T.between = (start, end, max = 900, root = document.body) => {
    const t = T.text(root);
    const i = start ? t.indexOf(start) : 0;
    if (i < 0) return 'not found: ' + start;
    let j = end ? t.indexOf(end, i + (start || '').length) : -1;
    if (j < 0) j = Math.min(t.length, i + max);
    return T.out(t.slice(i, j), max);
  };

  // Click the first table row that contains the text (opens a drilldown in report tables).
  T.clickRow = (text) => {
    const row = [...document.querySelectorAll('[role=row],tr')].find((e) => (e.innerText || '').includes(text));
    if (!row) return 'row not found';
    row.click();
    return 'clicked';
  };

  T.parse = (html) => new DOMParser().parseFromString(html, 'text/html');

  // Every typed JSON-LD object on a parsed page, nested lists flattened.
  T.jsonld = (doc) => {
    const items = [];
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (o['@type']) items.push(o);
      ['@graph', 'itemListElement', 'item', 'mainEntity'].forEach((k) => o[k] && walk(o[k]));
    };
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        walk(JSON.parse(s.textContent));
      } catch (e) {
        items.push({ '@type': 'INVALID_JSON' });
      }
    });
    return items;
  };
  T.typeOf = (o) => [].concat(o['@type']).join('/');

  // Save a big result as a gzip download (needs the owner's OK for downloads).
  T.download = async (name, data) => {
    const blob = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
    const url = URL.createObjectURL(await new Response(blob).blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name + '.json.gz' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'download started: ' + name;
  };
})();
