# Shopping funnel and conversion audit

## Findings checked October 27, 2026 (Pacific time)

- Production D1 contains 2 paid live orders and 5 expired live orders. The owner confirmed both paid orders were their own tests. Expired checkouts do not establish payment failures; they can be abandoned sessions.
- Cloudflare Web Analytics query window: October 1 00:00 UTC to October 28 00:00 UTC. Adaptive sampled estimates are approximately 2,000–2,100 page loads and 610 visits. These are not a count of distinct people; sampled results can vary across queries. The owner's 2,430 figure may use another window/metric. Do not divide paid orders by page loads and call it visitor conversion.
- Approximate page loads: home 910, shop 430, bundles 200, builder 90, standard 1-key detail 80, rhythm game 80, FAQ 70. Individual page totals are not ordered journeys or unique visitors. The existing tool cannot reconstruct past cart activity.
- Estimated visits: desktop 520, mobile 90; direct/unknown source 560, Google 40, Stripe return 10. Missing referrer is not proof of bot traffic or proof of a source such as TikTok. Desktop-heavy/direct traffic alone does not identify owner visits.
- Live health, shop, product and inventory requests succeed. Keycaps 3 and 11 are unavailable; the rest of the 19-keycap catalog was available during the check.
- Stripe reports charges enabled, payouts enabled, and account details submitted. No new checkout, payment, refund, inventory reservation or label purchase was created for this audit.
- Initial quotes using the store's own sender address as the destination failed with generic HTTP 502. A distinct destination in Cupertino produced a live quote successfully; Chicago also quoted successfully ($6.61 USPS Ground Advantage). This does not establish a sitewide shipping outage. Saving sanitized server diagnostics will help distinguish provider authorization, mode, missing-rate, timeout and other failures. Direct Shippo API requests and streaming Worker logs were blocked from this execution environment, so no specific upstream reason has been confirmed.
- Desktop and mobile browser checks used synthetic shipping/payment responses. They verified cart additions, opening shipping on a blocked checkout, a failed quote, successful retry, and redirect to a simulated Stripe page. They do not prove a fresh live payment succeeds.

## New measurement

`funnel.js` submits same-origin event batches to `/api/funnel`: canonical page view, successful cart addition, cart opening, requested/successful/failed shipping quote, checkout blocked for missing quote, requested checkout, checkout error, and Stripe redirect.

A random per-tab session identifier expires after 30 minutes of inactivity. Do Not Track and Global Privacy Control stop collection, as do private review pages and checkout-return URLs. There are no third-party tracking scripts added. No form values, cart contents, keycaps, names, emails, addresses, query strings, private review credentials, referrer URLs or raw network addresses are stored in `funnel_events`. The existing abuse limiter uses its existing HMAC of the network address for short-lived counters. The optional session ID is attached to new orders to count actual paid live orders in the private report; this is pseudonymous measurement, not a claim of irreversible anonymity. Event rows and order session associations are removed after 30 days by the existing 15-minute scheduled task. The FAQ explains this measurement. Privacy signals do not change existing Cloudflare Web Analytics; its settings are managed separately.

The endpoint validates UUIDs, event types, public page IDs and catalog product IDs, deduplicates event IDs, bounds batches to 10, and uses existing JSON/body/origin/rate protections. It cannot record a client-submitted purchase. Invalid or failed analytics requests do not interrupt the shopping UI. Reports use only paid live database orders as payment proof. All browser event counts remain susceptible to blockers, bots, spoofed events, dropped requests and separate tabs; they do not prove a visitor's identity. Steps are deduplicated per session, not presented as a strict sequential funnel.

## Private owner report

No customer-facing report endpoint exists. With Cloudflare D1 read credentials in the environment:

```
python scripts/funnel-report.py --days 30 --output /tmp/clickerlab-funnel-report.md
```

This produces per-step event/session counts, popular pages, actual paid conversions within measured sessions, common page transitions, and the latest sanitized quote error. Nothing personal is printed. `scripts/`, `tests/`, migrations and this document are excluded from public static assets. Do not paste API tokens into chat or commit them.

The report can only measure visits after activation. Allow several days of real traffic, then compare product visits, cart additions, shipping success and Stripe redirects. Separate owner tests when interpreting purchases. If shipping errors recur, use the diagnostic code before changing credentials. Changing products/prices based on page-load totals alone would be premature.

## Activation

Prepared on `review/conversion-funnel`; owner approval to merge/deploy is pending. Apply only migration `0011_conversion_funnel.sql` to production before deploying the code. It adds the optional order association, empty event tables/indexes and a tiny diagnostic table; it does not seed data or alter order statuses, prices, stock, payment or label settings. No fake purchase is needed for launch verification. Check `/api/funnel` refuses GET/cross-origin submissions and never publicly exposes the private report. Preview mode discards events and disables payments, shipping purchases, webhooks and cron; do not activate preview flags on production.
