# Component inventory and Stripe test Checkout

This branch adds base inventory, server-priced Stripe Checkout, and signed payment webhooks. It supports **test payments only**. Live sessions are rejected and expired. No production migration or deployment has been run for this change.

## Inventory model

Each clicker uses one base of its key count and that many selected keycaps. Standard and light-up 1-key clickers share base ID 1. Switch and light-color choices are stored with the order; they do not have separate stock in this version.

`bases.stock` and `keycaps.stock` count physical units. Creating/open Checkout orders reserve components. `/api/keycaps` returns available (physical minus reserved) stock for both arrays. A paid order deducts all components in one SQLite statement/trigger transaction. Duplicate events cannot repeat the transition. Expired sessions release holds without reducing physical stock. A cancelled browser return is not proof that the Stripe session has expired.

Do not manually reduce physical stock below open reservations. Preserve existing keycaps data. The owner confirmed 100 bases of each size. Shipping uses Shippo USPS Ground Advantage rates.

## Required secure configuration

On the **Cloudflare Worker clickerlabstore**, configure:

- Secret `STRIPE_SECRET_KEY`: Stripe sandbox/test secret API key. Never commit it.
- Secret `STRIPE_WEBHOOK_SECRET`: signing secret for the matching test webhook destination. This must be the actual secret in the Worker, since HMAC verification runs locally. A Codex proxy placeholder cannot be uploaded as this secret.
- Variable `STORE_URL`: `https://clickerlabstore.com`.
- Secret `SHIPPO_API_TOKEN`: Shippo test API token. Configure this on the Worker as well as in Codex if API testing from Codex is needed.
- Variable `SHIP_FROM_ADDRESS`: JSON containing `name`, `street1`, `city`, `state`, `zip`, and `country`. Use the confirmed San Marino address; it is saved as a suggested environment setting. No flat shipping amount is used.

A Codex `STRIPE_SECRET_KEY` binding for `api.stripe.com` was requested for API verification, but that does not install a Worker secret. Enter Worker secrets securely in Cloudflare settings or use authenticated `wrangler secret put` without logging values. Never paste credentials into chat. Configure the key and webhook secret for the same Stripe test environment.

In Stripe's test environment create a webhook destination for:
`https://clickerlabstore.com/api/stripe/webhook`
Subscribe to `checkout.session.completed` and `checkout.session.expired`. Copy its signing secret to the Worker secret above.

Shipping is quoted by Shippo for USPS Ground Advantage, charged at the carrier amount in USD with no markup. Every order uses the confirmed 0.2 lb, 6 × 4 × 2 inch parcel. The cart collects a US destination before Checkout. Server quotes expire after 15 minutes and the chosen rate is retrieved again before reservation. Only the server-saved quote determines the shipping price. The destination is attached to Stripe PaymentIntent shipping, rather than editable shipping-address collection in Checkout. This prevents changing the destination without obtaining a new price. Order destination and selected rate are saved in D1; destination is retained in browser session storage to restore Checkout after a page reload. Protect this customer data and establish retention policies before production use. This version does not calculate sales tax, use Stripe Tax, generate shipping labels, send custom order emails, or provide an order-management dashboard. Stripe PaymentIntent stores the shipping address; D1 stores component selections and the Checkout session ID for fulfillment lookup.

## Migration and deployment (require review/approval)

Run from `/workspace/ClickerLabStore`, using the existing checkout. Back up the production D1 database first. Apply both `migrations/0001_orders_and_bases.sql` and `migrations/0002_shipping_quotes.sql` in order through D1 migrations, the migration initializes each new base row with the confirmed 100 units. `INSERT OR IGNORE` preserves existing base stock on repeated application and does not replace keycap inventory. Existing snapshots that lack the `keycaps` table need that original table provisioned separately; this migration assumes it exists.

Local migration used:
```
XDG_CONFIG_HOME=/workspace/.clickerlab-runtime/config WRANGLER_SEND_METRICS=false /workspace/.clickerlab-tools/node_modules/.bin/wrangler d1 execute clickerlab-store --local --persist-to /workspace/.clickerlab-runtime/state --file migrations/0001_orders_and_bases.sql
```
Run the same file on production only after approval, or register it with `wrangler d1 migrations apply clickerlab-store --remote`. Then deploy the branch with `wrangler deploy`. Do not deploy a partial migration or enable Checkout before its webhook is configured.

## Validation

```
node --test tests/*.test.cjs tests/*.test.mjs
python3 tests/orders.test.py
```

Browser tests must also cover the five product pages, cart increases, shared 1-key bases, repeats, Checkout failure, cancellation and payment return. Local tests verify signed synthetic Stripe events and actual SQLite reservation/fulfillment triggers. An actual Stripe test transaction remains required before readiness is claimed: pay with Stripe's test card, verify the webhook returns 200, check base/keycap counts, replay the webhook to confirm no second deduction, and expire a second session to confirm reservation release. Confirm the final amount and US address restriction.

## Retry/reconciliation

The browser persists a Checkout attempt UUID with its exact cart, and the server reuses Stripe's idempotency key. Refreshing/retrying an unchanged cart reuses its session, preventing repeated reservations. A network timeout or failed D1 attachment after Stripe creation keeps stock held rather than risking an oversale. Retry the unchanged cart promptly; original session parameters are retained. Attempts older than 23 hours are blocked because Stripe can remove idempotency keys after 24 hours.

Monitor `orders` with status `creating`. If automatic retry cannot attach a session, find the session in Stripe using its metadata `order_id` or `client_reference_id` and the creation time. Attach it to the order before replaying payment events, or confirm it has expired/was never created before marking the order failed and releasing stock. **Never release an uncertain reservation solely because time passed.** Production operation needs this reconciliation until a background reconciliation service is added.

The return page checks webhook-updated order status; a success URL cannot deduct stock. It clears the cart only when the paid order's ID matches the saved attempt and the cart has not changed. If confirmation is delayed, the customer sees a pending message and can refresh the return page.

## Shipping validation still required

Shippo authentication was reported saved on the Cloudflare Worker, but the token is not available in the current Codex runtime. Cloudflare credential forwarding still returns error 6111, so Worker secret presence could not be independently verified. Stubbed tests verify API requests, rate selection, cents conversion, destination binding, expired quotes, tampering and provider failures. An actual Shippo test quote and Stripe test purchase have not yet run. Verify Shippo account has an active USPS carrier connection and provides Ground Advantage test rates. Do not substitute zero-cost or estimated shipping when rates fail. No shipping label is purchased by these endpoints.

## 9-key inventory migration

`0003_nine_key_base.sql` expands the base ID constraint to include 9 while preserving existing base stock, orders, component reservations, and fulfillment triggers. It initializes 100 9-key bases, as confirmed by the owner. The 9-key product uses one base ID 9 and nine selected keycaps, with the existing $14.99 price. Deploy the new client first (it tolerates the missing 9-key row and blocks only that product), then apply the migration. Old already-open browser tabs may need refreshing to load the versioned client that recognizes base ID 9. Stripe remains in test mode.

## Abuse protection

Apply `0004_abuse_protection.sql` before deploying the new Worker. It adds atomic request counters and an indexed reservation owner with a trigger allowing at most two creating/open orders per owner. Existing orders and inventory remain unchanged.

Shipping requests are limited to 6/minute per network address; Checkout to 10/minute. Global caps are 120 shipping and 60 Checkout requests/minute. These are fixed windows in D1, so boundaries can allow consecutive bursts. Cloudflare's trusted CF-Connecting-IP is HMAC-hashed using the webhook secret; raw addresses are not saved. Customers sharing a network share limits. Rotating the webhook secret changes owner identities. IPv6 address rotation and distributed traffic can evade per-address controls; the global cap limits provider calls but can also temporarily block legitimate traffic. These controls are a baseline, not a replacement for Cloudflare WAF or Turnstile.

Requests must be JSON and no more than 32 KiB. Cart checkout is limited to ten individual clickers, including clickers inside bundles. Retrying the same existing checkout does not create another reservation. The limit trigger also covers simultaneous requests. Provider requests occur only after rate checks, and new checkout rate revalidation only after the reservation-count precheck. Races rejected by the database return the generic inventory-changed message.

Stripe webhook requests are exempt from customer rate limits and retain signature validation. A scheduled job runs every 15 minutes to remove counters older than two hours and unused shipping quotes older than one day. Referenced quotes and order history are preserved. There is no automatic reconciliation of uncertain creating orders; never release those holds without verifying Stripe. Open sessions still rely on the expiration webhook to release reservations.

Local requests to protected routes must provide a fixture CF-Connecting-IP header, expected Origin and JSON Content-Type. Production Cloudflare supplies the address header. Missing identity/configuration/database protection fails closed. Verify migrations, normal quotes/Checkout, 429 handling, and scheduled cleanup after deployment; do not stress-test production providers.

## Light-color inventory

Apply `0005_light_inventory.sql` before deploying color-stock code. Owner confirmed 20 physical lights each: White (ID 1), Red (2), Blue (3), Yellow (4), Green (5). Each lit key consumes one unit; clicker quantity multiplies each selected color. Legacy single-color selections use that color on every key. Standard clickers and current bundles use no lights.

The migration preserves existing base/keycap components and adds light components to unpaid light-up orders. It fails rather than silently overselling if those existing selections exceed the confirmed stock. Existing paid orders are not retroactively deducted from the newly confirmed physical counts. The paid status transition deducts lights exactly once; expiry releases reservations without changing physical stock. A missing light inventory response blocks light-up additions while standard clickers remain usable during rollout.
