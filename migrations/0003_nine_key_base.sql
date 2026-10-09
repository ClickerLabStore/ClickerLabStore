-- Expand base IDs without changing existing stock, orders, or reservations.
DROP TRIGGER reserve_component;
DROP TRIGGER fulfill_order;
CREATE TABLE bases_expanded (
  id INTEGER PRIMARY KEY CHECK(id IN (1,2,3,4,9)),
  name TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0)
);
INSERT INTO bases_expanded SELECT id,name,stock FROM bases;
DROP TABLE bases;
ALTER TABLE bases_expanded RENAME TO bases;
INSERT INTO bases(id,name,stock) VALUES (9,'9-Key Base',100);
CREATE TRIGGER IF NOT EXISTS reserve_component BEFORE INSERT ON order_components BEGIN
  SELECT RAISE(ABORT,'Invalid reservation')
    WHERE (SELECT status FROM orders WHERE id=NEW.order_id) IS NOT 'creating';
  SELECT RAISE(ABORT,'Insufficient inventory')
    WHERE NEW.kind='base' AND NEW.quantity > COALESCE((SELECT stock FROM bases WHERE id=NEW.component_id),0) -
      COALESCE((SELECT SUM(c.quantity) FROM order_components c JOIN orders o ON o.id=c.order_id
        WHERE c.kind='base' AND c.component_id=NEW.component_id AND o.status IN ('creating','open')),0);
  SELECT RAISE(ABORT,'Insufficient inventory')
    WHERE NEW.kind='keycap' AND NEW.quantity > COALESCE((SELECT stock FROM keycaps WHERE id=NEW.component_id),0) -
      COALESCE((SELECT SUM(c.quantity) FROM order_components c JOIN orders o ON o.id=c.order_id
        WHERE c.kind='keycap' AND c.component_id=NEW.component_id AND o.status IN ('creating','open')),0);
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

