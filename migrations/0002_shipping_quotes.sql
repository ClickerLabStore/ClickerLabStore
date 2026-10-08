CREATE TABLE shipping_quotes (
  id TEXT PRIMARY KEY,
  address_json TEXT NOT NULL,
  rates_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
ALTER TABLE orders ADD COLUMN shipping_quote_id TEXT;
ALTER TABLE orders ADD COLUMN shipping_rate_id TEXT;
ALTER TABLE orders ADD COLUMN shipping_address_json TEXT;
ALTER TABLE orders ADD COLUMN shipping_service TEXT;
