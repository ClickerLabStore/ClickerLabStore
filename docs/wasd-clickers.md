# WASD clickers

Owner confirmed $6.99 regular / $8.49 light-up and 50 shared WASD bases. Product IDs are `wasd-4-key-clicker` and `wasd-4-key-light-up-clicker`; pages have the same names plus `.html`. Both appear beside the existing 4-key items in the shop and are automatically indexed by search.

Four keycap slots correspond to W/A/S/D in that order, displayed W above A/S/D. The light-up version selects one color per key and consumes four lights from existing color stock. Both support Clicky/Creamy, all 19 keycaps, existing cart/Stripe pricing validation, product reviews and funnel measurement. Existing straight clickers, bundles and the builder's key-count options are unchanged.

`base:4` remains the key count. New `inventoryBase:5` identifies the distinct WASD shape; regular and light-up share those 50 bases without using straight 4-key stock (base ID 4). Client inventory checks group shared base usage across both products; server reservation and paid-order deduction use the same component ID. Migration `0012_wasd_base.sql` preserves existing base stocks and unpaid components while expanding the allowed base IDs. It initializes only the new shape's stock and recreates the existing reservation/fulfillment triggers with their light checks intact.

Product photography now uses `WASD.png` then `WASD-top.png` for the regular version. The light-up gallery uses `WASD-light-dark.png` as the main image, then `WASD-light.png`, `WASD-light-dark-top.png` and `WASD-light-top.png`. Shop/search/cart use the corresponding main photo, including existing saved carts. Original placeholder SVGs remain available as unused assets.

Products and migration 0012 are live in production. Photo changes need no additional database migration. Deploy normal `wrangler.jsonc --keep-vars`. The existing review preview Worker has checkout and label purchases disabled, independent test data, and no payment credentials.

Validation: actual SQLite migration and reservation tests cover preserved old orders, shared stock, shape separation, four-key validation, per-key lights, trusted prices and one-time paid deduction. Desktop/mobile browser tests cover real UI customization, search, placeholder loading, cart metadata and stock shared across the two models.
