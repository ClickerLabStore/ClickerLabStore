# WASD clickers

Owner confirmed $6.99 regular / $8.49 light-up and 50 shared WASD bases. Product IDs are `wasd-4-key-clicker` and `wasd-4-key-light-up-clicker`; pages have the same names plus `.html`. Both appear beside the existing 4-key items in the shop and are automatically indexed by search.

Four keycap slots correspond to W/A/S/D in that order, displayed W above A/S/D. The light-up version selects one color per key and consumes four lights from existing color stock. Both support Clicky/Creamy, all 19 keycaps, existing cart/Stripe pricing validation, product reviews and funnel measurement. Existing straight clickers, bundles and the builder's key-count options are unchanged.

`base:4` remains the key count. New `inventoryBase:5` identifies the distinct WASD shape; regular and light-up share those 50 bases without using straight 4-key stock (base ID 4). Client inventory checks group shared base usage across both products; server reservation and paid-order deduction use the same component ID. Migration `0012_wasd_base.sql` preserves existing base stocks and unpaid components while expanding the allowed base IDs. It initializes only the new shape's stock and recreates the existing reservation/fulfillment triggers with their light checks intact.

The two `wasd-4-key-*-placeholder.svg` images are clearly labeled layout illustrations, not product photos. Upload real images later and update the image sources in the shop and each product page/cart image. Existing product images are untouched.

Production deployment awaits owner approval. Apply migration 0012 to the production D1 database immediately before deploying normal `wrangler.jsonc --keep-vars`. Only the isolated preview database/Worker has been updated so far. The existing review preview Worker has checkout and label purchases disabled, independent test data, and no payment credentials.

Validation: actual SQLite migration and reservation tests cover preserved old orders, shared stock, shape separation, four-key validation, per-key lights, trusted prices and one-time paid deduction. Desktop/mobile browser tests cover real UI customization, search, placeholder loading, cart metadata and stock shared across the two models.
