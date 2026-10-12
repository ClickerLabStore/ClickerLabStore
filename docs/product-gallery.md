# Product photo galleries

All nine clicker detail pages and all five bundle detail variants use the shared `product-gallery.js` and `product-gallery.css`. Existing main photos, cropping, product selections, prices, and cart logic are preserved. Two thumbnail buttons let customers switch views; Left/Right and Home/End work when a thumbnail is focused.

Photo 2 shows a camera placeholder and “Photo 2 coming soon” until an actual second photo is available. Its filename is the existing main image filename with `-2.png` in place of the extension, for example `4-key-clicker-2.png`, `1-key-light-up-clicker-2.png`, or `trio-lab-2.png`. The ClickerLab Pack uses `clicker-lab-pack-2.png`, matching its main image filename. Uploading that image to the repository's root replaces the placeholder after publication and reload. A custom path can be supplied with `data-gallery-second` on the photo container.

The second image is requested only when that thumbnail is selected. A missing or failed second photo keeps the placeholder visible and does not affect purchases. Main photo fallback behavior remains in place.

Browser verification uses mocked inventory and second photos, with no payment/shipping calls. Serve the checkout locally, then run:

```sh
GALLERY_URL=http://127.0.0.1:8792 PLAYWRIGHT_MODULE=/workspace/.clickerlab-browser-tools/node_modules/playwright-core node tests/product-gallery.browser.cjs
```

Checks cover all 14 detail variants at desktop/mobile widths, missing second photos, keyboard switching, unchanged main images and product controls, layout overflow, and a successfully loaded second photo. Screenshot artifacts go to `/tmp`.

This feature requires review and approval before merge/deployment. No D1 migration or payment changes are needed.
