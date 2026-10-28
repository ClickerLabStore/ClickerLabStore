-- Browser events are untrusted observations. Paid conversions come from orders.
ALTER TABLE orders ADD COLUMN analytics_session_id TEXT;
CREATE INDEX orders_analytics_session ON orders(analytics_session_id) WHERE analytics_session_id IS NOT NULL;
CREATE TABLE funnel_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event TEXT NOT NULL,
  page TEXT NOT NULL,
  product TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX funnel_events_date ON funnel_events(created_at);
CREATE INDEX funnel_events_session ON funnel_events(session_id,created_at);
CREATE TABLE store_diagnostics (
  kind TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
