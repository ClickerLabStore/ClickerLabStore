-- Existing orders and quotes were created in test mode.
ALTER TABLE orders ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'test' CHECK(payment_mode IN ('test','live'));
ALTER TABLE shipping_quotes ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'test' CHECK(payment_mode IN ('test','live'));
