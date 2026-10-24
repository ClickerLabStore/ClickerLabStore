# Verified-purchase reviews

All nine clicker detail pages and bundle detail pages show review counts, average ratings, dated reviews, and a verified-purchase badge. The review form accepts 1–5 stars, a public name/nickname (40 characters), and optional feedback (1,500 characters). Names and feedback are rendered as text, never HTML. Customer email, delivery address, order ID, and checkout session are excluded from public responses.

## Verification and publishing policy

A private review link grants access only to a confirmed `paid` order in the active payment mode, with a recorded payment timestamp. The existing Stripe webhook/reconciliation is the authority for that paid status; review requests cannot alter an order, stock, shipping, or payment. Bundle buyers may review the purchased bundle and its included clickers. Product names and allowed IDs come from the server catalog, not submitted client values.

Review links contain an HMAC signed with a dedicated `REVIEWS_SIGNING_SECRET`, bound to the order ID, checkout session, and payment mode. The link credential is kept in the URL fragment, exchanged only through JSON POST requests, and is not included in asset requests or referrer headers. A checkout session from the confirmed payment return can be exchanged for this link. The payment confirmation shows a private review link and suggests returning after trying the product. The latest review credential can be retained in that buyer's browser so they can return to the form. Buyers should keep their link private; possession of the link is the access proof, not an independent identity check.

There is one review per order/product; updates preserve the original review ID/date and never add another vote. All ratings, including one-star feedback, publish under the same rules. No incentives or fabricated production reviews are included. Verification establishes a purchase, not the truth of every opinion. A legitimate negative review should not be removed because the buyer received a refund.

Owner moderation is available through the private D1 `product_reviews` table. A hidden review must have one of the stated reasons: `spam`, `abuse`, `personal_information`, or `unrelated`. Ratings are not a moderation reason. A buyer's edit does not automatically republish a hidden review; the owner must recheck the stated reason. There is no publicly exposed moderation endpoint. Submissions reject links/email addresses, enforce same-origin JSON/body-size checks and the existing per-IP HMAC rate limits, and use parameterized SQL. A D1 trigger also rejects insertion for unpaid or unrelated purchases.

## Isolated preview

Preview: `https://clickerlabstore-reviews-preview.rogerg35.workers.dev/1-key-clicker.html#reviews`.

The separate Worker `clickerlabstore-reviews-preview` uses D1 `clickerlab-reviews-preview-c57255`. All example orders/reviews are synthetic, clearly labeled as demo data, and stored only there. `REVIEWS_PREVIEW=true` disables checkout, shipping-rate purchases/payment webhooks, and scheduled jobs. `AUTO_PURCHASE_LABELS=false` provides an additional safeguard, and this Worker has **no Stripe payment key or Shippo API token**. It has separate signing/rate-limit secrets. The live Worker and production D1 schema are unchanged by preview publishing.

The preview's static HTML/CSS/JS is bundled by `tests/build-reviews-preview.mjs` into a directory outside the public checkout. It uses the existing public PNG/WAV URLs read-only; only allowlisted filenames can be fetched, with no customer headers or credentials forwarded. This avoids the environment's authentication problem with Cloudflare's separate asset-upload JWT endpoint. Refresh that bundle before redeploying preview changes. Preview configuration lives in `/workspace/.clickerlab-runtime/reviews-preview/remote.jsonc`; no secrets are stored in it or committed. Cloudflare's management API confirms the deployment and isolated bindings. This execution environment blocks direct `workers.dev` requests; end-to-end browser checks use the local Worker with real local D1 queries.

`tests/reviews-preview-seed.sql` is **preview-only**, excluded from static assets, and must never be applied to production. The preview displays a persistent demo banner and `noindex` headers, and every sample review has a demo label. Use **Try a demo review** on a product to test the private link, star selection, publication, and editing. Test submissions only change the preview database.

## Production activation (requires owner approval)

1. Apply **only** `0010_verified_reviews.sql` to production `clickerlab-store`. It creates the empty review table/index/trigger and does not seed reviews or modify orders/inventory.
2. Generate a fresh random secret with at least 32 bytes of entropy and securely save it as `REVIEWS_SIGNING_SECRET` on Worker `clickerlabstore`. Do not reuse the preview key, print it, or commit it. Keep it stable: rotating it invalidates existing private links.
3. Confirm `REVIEWS_PREVIEW` and `REVIEWS_DEMO_ORDER_ID` are absent on production. Do not copy the preview config, synthetic data, test mode, or disabled-label setting into production.
4. Merge and deploy the normal `wrangler.jsonc` with `--keep-vars`. Review APIs use the existing trusted paid orders. The production list starts empty and accumulates actual buyer submissions.
5. Verify a real buyer's existing paid checkout-session link privately, without creating or charging another order. Check public responses contain only review fields and that low ratings publish and edits do not add votes. Never paste a real customer's private link in public documentation/chat.

This step supplies the review link on the confirmed payment-return page. **Automatic email invitations after delivery are not included**; that would require an email-delivery integration and a reliable delivery-status signal. Customer photos and a seller moderation dashboard are also outside this change.

## Tests

`node --test tests/*.test.mjs tests/*.test.cjs` includes actual SQLite/migration checks for access control, HMAC forgery, purchased-product membership, mode isolation, input validation, one-vote editing, negative feedback, pagination, private-field exclusion, moderation rules, origin/body limits, rate limits, and disabled preview payments.

`REVIEWS_URL=http://127.0.0.1:8794 PLAYWRIGHT_MODULE=/workspace/.clickerlab-browser-tools/node_modules/playwright-core node tests/reviews.browser.cjs` runs against the local Worker and seeded isolated D1. It covers desktop/mobile publication, edits and reloads, blocked anonymous access, low ratings, XSS-safe text, demo labeling, and bundle pages. Screenshots go to `/tmp`.
