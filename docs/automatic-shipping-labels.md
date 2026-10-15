# Automatic USPS labels after payment

This feature purchases one label for each **new eligible checkout** after confirmed payment. It uses the original Shippo rate and customer address, USPS Ground Advantage, and the owner's fixed package for every order: 6 × 4 × 2 inches and 0.2 lb. Each live label charges the configured Shippo account. Stripe collects the customer's shipping charge; it does not pay Shippo directly. Printing and packing remain manual.

## Deployment

Review and obtain the owner's merge/deployment approval first. Apply `migrations/0008_shipping_labels.sql` to `clickerlab-store` **before** deploying the new Worker. The migration preserves all existing inventory and orders. It adds an opt-in column defaulting to zero and an initially empty private `shipping_labels` table. Existing paid orders and checkouts already in progress are deliberately excluded, including orders the owner might have labeled manually.

The Worker uses its existing secrets: `SHIPPO_API_TOKEN`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`, plus the existing `SHIP_FROM_ADDRESS` and `PAYMENT_MODE`. Shippo's token must match the store's live/test mode. A restricted Stripe key needs **Checkout Sessions: Read**, **Payment Intents: Read**, and **Charges: Read**, alongside the existing checkout creation permissions. Missing permissions prevent purchases and produce `preflight_unavailable`; they do not bypass payment checks.

Tracked `AUTO_PURCHASE_LABELS="true"` enables opt-in for checkouts created by the deployed code. Set this Worker variable to `false` to pause label processing and new enrollment. Deploy with `--keep-vars` to preserve remote secret bindings and other configuration. Re-enabling processes unfinished eligible jobs, so review any labels purchased manually while automation was paused before doing so. No additional customer-facing routes are introduced.

## What happens

1. Checkout records opt-in on the order. The existing signed Stripe webhook or checkout reconciliation verifies payment and commits the paid status and inventory deduction. A D1 trigger creates the label job in the same transaction. Unpaid, abandoned, failed, and rollback cases create no job.
2. The webhook schedules background processing with `waitUntil`; label errors do not change a confirmed payment or its successful webhook response. The existing 15-minute cron catches queued jobs, including paid orders recovered by reconciliation. Each label cron pass processes up to three jobs within a 25-second provider time budget.
3. Before purchase, the Worker retrieves Stripe's session with the expanded PaymentIntent/latest charge. Identity, references, live/test mode, item/shipping amounts, captured payment, no refunds/disputes, and the original delivery address must match. It retrieves the Shippo rate and original shipment to check mode, carrier, service, price, sender/destination, and package. Changed or unverifiable details stop the purchase.
4. A conditional D1 claim changes to `purchasing` **before** the only `POST /transactions/`. The request selects the original rate, `PDF_4x6`, asynchronous processing, and metadata `clickerlab:<order UUID>`. There is no automatic repricing, different service, or extra package purchase.
5. A successful response saves transaction ID, postage amount, PDF URL, tracking number, and provider tracking URL. Queued responses save the transaction ID; subsequent cron requests retrieve that transaction using **GET only**. Nothing marks the parcel shipped or claims the carrier received it.

## Printing and finding labels

In Cloudflare, open **Workers & Pages → D1 → clickerlab-store → Console**. This read-only query lists labels with their matching orders:

```sql
SELECT o.id AS order_id, o.payment_mode, l.state, l.review_reason,
       l.transaction_id, l.postage_amount, l.tracking_number,
       l.label_url, l.tracking_url
FROM shipping_labels l JOIN orders o ON o.id=l.order_id
ORDER BY l.updated_at DESC;
```

For a `success` row, open the `label_url` to download and print the 4×6 PDF. Keep label links private; the PDFs contain the customer's address. Provider-signed label URLs may expire; retrieve the existing Shippo transaction by ID to obtain its current label details rather than buying another label. The table is not exposed by `/api/order-status`, search, or static assets. No new seller email delivery is included in this feature.

## Failure handling and avoiding duplicate charges

`pending` / `preparing` is a pre-purchase stage: provider GET failures retry after 15 minutes, with at most five attempts before review. A preflight interrupted for over 10 minutes can safely be reclaimed using a new claim token. Concurrent workers cannot pass the same purchase claim.

`purchasing` means the single purchase request may have been sent. A timeout, malformed response, provider failure, persistence interruption, or stale purchase goes to `needs_review`. **It is never posted again automatically.** There is no assumption of Shippo supporting an idempotency header. This favors preventing a duplicate charge over blindly completing an uncertain purchase.

`waiting` has a known transaction ID and only polls that transaction. `success` is terminal. Provider errors, refunds, mismatches, incomplete labels, and unknown outcomes are held in `needs_review` with a safe reason code. Logs contain aggregate counts only, not addresses, label links, provider response bodies, or secrets.

For an uncertain result, inspect Shippo transactions using the saved transaction ID or `clickerlab:<order UUID>` metadata first. An interrupted write can mean Shippo has the label even though D1 has no transaction ID. Do not reset that job or buy another label until confirming whether the original purchase succeeded. Do not create a manual label while a job is `preparing`, `purchasing`, or `waiting`. For older excluded orders, manual labels remain the normal path. A refund issued after a label purchase does not automatically refund the label; request any eligible unused-label refund separately through Shippo.

## Validation

`node --test tests/*.test.mjs tests/*.test.cjs` executes the production queries and migrations against real SQLite with mocked Stripe/Shippo requests. Label coverage includes enrollment, signed webhook and missed-payment recovery, atomic inventory rollback, overlapping workers, duplicate events, refund/dispute/address/amount/mode checks, original rate and parcel validation, queued transaction retrieval, timeouts, malformed responses, lost persistence, stale claims, disabled automation, and private label access. No real label purchases or payment requests are used by the tests.

The Shippo transaction API payload and statuses follow the [official Shippo SDK transaction reference](https://github.com/goshippo/shippo-python-sdk/blob/main/docs/sdks/transactions/README.md). A production purchase has not been made during development; it will occur only for eligible future confirmed payments after approved deployment.
