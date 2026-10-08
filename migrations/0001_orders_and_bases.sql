-- Existing keycaps inventory is preserved. Enter real base stock before enabling Checkout.
CREATE TABLE IF NOT EXISTS bases (
  id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0)
);
INSERT OR IGNORE INTO bases(id, name, stock) VALUES
 (1, '1-Key Base', 0), (2, '2-Key Base', 0), (3, '3-Key Base', 0), (4, '4-Key Base', 0);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('creating','open','paid','expired','failed')),
  session_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  shipping_amount INTEGER NOT NULL,
  shipping_countries TEXT NOT NULL,
  cart_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE TABLE IF NOT EXISTS order_components (
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK(kind IN ('base','keycap')),
  component_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  PRIMARY KEY(order_id,kind,component_id)
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE TRIGGER IF NOT EXISTS reserve_component BEFORE INSERT ON order_components BEGIN
  SELECT CASE WHEN (SELECT status FROM orders WHERE id=NEW.order_id) IS NOT 'creating'
    THEN RAISE(ABORT,'Invalid reservation') END;
  SELECT CASE WHEN NEW.quantity > COALESCE(
    CASE NEW.kind WHEN 'base' THEN (SELECT stock FROM bases WHERE id=NEW.component_id)
    ELSE (SELECT stock FROM keycaps WHERE id=NEW.component_id) END, 0) -
    COALESCE((SELECT SUM(c.quantity) FROM order_components c JOIN orders o ON o.id=c.order_id
      WHERE c.kind=NEW.kind AND c.component_id=NEW.component_id AND o.status IN ('creating','open')),0)
    THEN RAISE(ABORT,'Insufficient inventory') END;
END;
-- One status transition atomically deducts all physical components, once.
CREATE TRIGGER IF NOT EXISTS fulfill_order AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status='open' BEGIN
  UPDATE bases SET stock=stock-COALESCE((SELECT quantity FROM order_components
    WHERE order_id=NEW.id AND kind='base' AND component_id=bases.id),0)
    WHERE id IN (SELECT component_id FROM order_components WHERE order_id=NEW.id AND kind='base');
  UPDATE keycaps SET stock=stock-COALESCE((SELECT quantity FROM order_components
    WHERE order_id=NEW.id AND kind='keycap' AND component_id=keycaps.id),0)
    WHERE id IN (SELECT component_id FROM order_components WHERE order_id=NEW.id AND kind='keycap');
END;

CREATE TRIGGER IF NOT EXISTS nonnegative_keycap_stock BEFORE UPDATE OF stock ON keycaps
WHEN NEW.stock < 0 BEGIN SELECT RAISE(ABORT,'Negative keycap stock'); END;
