# Component inventory and Stripe test Checkout

This branch adds base inventory, server-priced Stripe Checkout, and signed payment webhooks. It supports **test payments only**. Live sessions are rejected and expired. No production migration or deployment has been run for this change.

## Inventory model

Each clicker uses one base of its key count and that many selected keycaps. Standard and light-up 1-key clickers share base ID 1. Switch and light-color choices are stored with the order; they do not have separate stock in this version.

`bases.stock` and `keycaps.stock` count physical units. Creating/open Checkout orders reserve components. `/api/keycaps` returns available (physical minus reserved) stock for both arrays. A paid order deducts all components in one SQLite statement/trigger transaction. Duplicate events cannot repeat the transition. Expired sessions release holds without reducing physical stock. A cancelled browser return is not proof that the Stripe session has expired.

Do not manually reduce physical stock below open reservations. Preserve existing keycaps data. Real base counts and shipping charges still require confirmation.

## Required secure configuration

On the **Cloudflare Worker clickerlabstore**, configure:

- Secret `STRIPE_SECRET_KEY`: Stripe sandbox/test secret API key. Never commit it.
- Secret `STRIPE_WEBHOOK_SECRET`: signing secret for the matching test webhook destination. This must be the actual secret in the Worker, since HMAC verification runs locally. A Codex proxy placeholder cannot be uploaded as this secret.
- Variable `STORE_URL`: `https://clickerlabstore.com`.
- Variable `SHIPPING_COUNTRIES`: `US`.
- Variable `SHIPPING_AMOUNT_CENTS`: confirmed nonnegative integer shipping charge. `0` means free shipping. Do not set a guessed value.

A Codex `STRIPE_SECRET_KEY` binding for `api.stripe.com` was requested for API verification, but that does not install a Worker secret. Enter Worker secrets securely in Cloudflare settings or use authenticated `wrangler secret put` without logging values. Never paste credentials into chat. Configure the key and webhook secret for the same Stripe test environment.

In Stripe's test environment create a webhook destination for:
`https://clickerlabstore.com/api/stripe/webhook`
Subscribe to `checkout.session.completed` and `checkout.session.expired`. Copy its signing secret to the Worker secret above.

Shipping is one fixed charge per order. This version does not calculate sales tax, use Stripe Tax, generate shipping labels, send custom order emails, or provide an order-management dashboard. Stripe stores the shipping address; D1 stores component selections and the Checkout session ID for fulfillment lookup.

## Migration and deployment (require review/approval)

Run from `/workspace/ClickerLabStore`, using the existing checkout. Back up the production D1 database first. Apply `migrations/0001_orders_and_bases.sql` through D1 migrations, then set the four base stocks to the user's confirmed counts. Migration defaults are deliberately zero and do not replace keycap inventory. Existing snapshots that lack the `keycaps` table need that original table provisioned separately; this migration assumes it exists.

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
