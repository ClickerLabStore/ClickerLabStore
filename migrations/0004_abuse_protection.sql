CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);
ALTER TABLE orders ADD COLUMN reservation_owner TEXT;
CREATE INDEX IF NOT EXISTS orders_reservation_owner ON orders(reservation_owner,status);
CREATE TRIGGER IF NOT EXISTS limit_unpaid_checkouts BEFORE INSERT ON orders
WHEN NEW.reservation_owner IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'Too many unpaid checkouts') WHERE
    (SELECT COUNT(*) FROM orders WHERE reservation_owner=NEW.reservation_owner
      AND status IN ('creating','open')) >= 2;
END;
