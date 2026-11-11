# tsu-seo-tools

Generic helper scripts for SEO checks on a Prom.ua shop: site crawl, structured-data reading, marketplace search positions, text checks for import files.

**This repo is public and holds code only.** Results, exports, query lists, IDs, prices, customer data and anything secret stay out; `tools/prepush_check.py` blocks a push that contains them. Everything shop-specific is passed to the scripts at run time.

## Browser scripts (`js/`)
Loaded in the browser by a fixed commit, with a SHA-256 check before anything runs (the line comes from `python3 tools/loader.py`). Load `core.js` first.

| File | What it does |
|---|---|
| `core.js` | Timer that keeps its pace in background tabs, compact tool output, page-text helpers, JSON-LD reader, gzip download |
| `crawl.js` | Sitemap reader + one-page-at-a-time crawl: status, redirects, title, meta, H1, canonical, robots, hreflang, JSON-LD, word count, images without alt, flags and summaries, in-text link check |
| `prom_search.js` | Prom marketplace search loop: positions of one company (paid slots apart from organic), top sellers, category picked by Prom |
| `dash.js` | Date and period maths for a dashboard: fake-order removal, last 30 / 14 days vs previous, Monday weeks, Search Console block, top sellers (no network) |
| `prom_analytics.js` | Prom cabinet analytics by day and per listing (signed-in cabinet tab) |
| `gsc.js` | Reads the daily table of a Search Console Performance report |
| `rozetka_seller.js` | Rozetka seller cabinet: orders by period and week, top items, rating, cards, new buyer questions (signed-in cabinet tab; the sign-in key never leaves the page) |

The scripts only read pages. Anything that changes data stays a separate, approved step.

## Python (`py/`, `tools/`)
- `py/text_checks.py`: Russian letters in UA fields and Ukrainian in RU fields, length limits, dropped words / numbers / model codes between two versions, broken HTML.
- `tools/prepush_check.py`: run before every push.
- `tools/loader.py`: prints the pinned loader for the current commit.

## Rules
1. Code only. No data files of any kind.
2. Run `python3 tools/prepush_check.py` before every push; fix what it finds instead of allowing it.
3. After a change, print a new loader and update it where the loader is kept; old commits keep working.
