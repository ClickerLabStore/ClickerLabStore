# Navbar search

`site-search.js` and `site-search.css` connect the existing search button on all 17 pages to a keyboard-accessible dialog. Results contain current product/bundle names, prices, photos, and links parsed from `/shop.html` and `/bundles.html`, plus Build Your Own, FAQ, About, and Click Rhythm. Update those listings when adding or repricing products; search needs no separate price catalog.

Listings load only when search opens. Queries filter in the browser and are not sent to a search provider. Text is inserted with `textContent` and links/images must use the site's origin. Search does not check stock, add items, or change payment behavior. Failed loading shows an explicit retry button rather than claiming no matches. Escape and the close button restore focus to the navbar button.

Run the browser check against the local static server:

```sh
SEARCH_URL=http://127.0.0.1:8793 PLAYWRIGHT_MODULE=/workspace/.clickerlab-browser-tools/node_modules/playwright-core node tests/site-search.browser.cjs
```

It covers desktop/mobile results, current prices, links, common query formats, keyboard controls, missing results, HTML-like input, failure/retry, navigation, layout, and opening search on every page with the icon. Inventory responses are mocked; no shipping or payment writes are made.
