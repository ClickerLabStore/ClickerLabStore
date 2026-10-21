# Keycaps 12–19

The owner supplied these initial counts:

| Keycap | Stock |
| --- | ---: |
| 12 | 18 |
| 13 | 13 |
| 14 | 19 |
| 15 | 18 |
| 16 | 5 |
| 17 | 30 |
| 18 | 5 |
| 19 | 7 |

After owner approval, apply `0009_keycaps_12_through_19.sql` to D1 `clickerlab-store` and merge/deploy the matching application code. It inserts only absent rows; it never overwrites an existing count, including subsequent sales or reservations. Production activation requires this migration before deployment.

All nine product selectors, bundle customization, Build Your Own, and Click Rhythm support IDs 1–19. Server cart validation uses the same range. The browser requires the complete unique set of 19 nonnegative inventory rows before allowing cart additions. Existing repeated-keycap accounting, cart usage, checkout reservations, paid inventory deductions, and automatic labels retain their existing behavior. Reload any open store pages after deployment to get the expanded catalog.

Upload `keycap-12.png`, `keycap-13.png`, …, `keycap-19.png` at the repository root, or attach them in chat for incorporation. The original 1–11 photos are untouched. Missing new photos display `keycap-photo-coming-soon.svg`, keeping the keycap number and stock controls identifiable. Once the files are uploaded and published, reload the page to display them. All eight owner-uploaded PNGs are now included. Click Rhythm uses neutral edge colors sampled from those photos.

`keycap-framing.js` fills the square product picker and preview frames edge to edge with the new photos, using centered cover sizing. The game keeps measured subject framing suited to its compact keys. This does not edit the PNGs or change IDs, stock, or prices. Resize and image-source observers keep framing correct when a picker opens, a keycap changes, or the viewport changes. Clipping keeps photos out of labels and stock badges. Old photos and missing-photo placeholders retain their original framing. If a new photo is replaced with a different crop, update its bounds and `photoVersion` in that file, the game background colors, and the script URL versions. The current replacement set uses photo version `d068fb4`; every new keycap image is requested with this query version to refresh browser caches.

Validation: `node --test tests/*.test.mjs tests/*.test.cjs` covers new IDs, invalid ID 20, complete inventory validation, repeated selections across cart lines, exact initial counts, migration idempotence, reservation limits, and once-only payment deduction. `tests/keycap-catalog.browser.cjs` covers all products plus bundle, builder/cart, and game handoff at desktop/mobile widths, with mocked stock, one uploaded-image fixture, and missing-photo fixtures. It makes no payment or label purchases.
