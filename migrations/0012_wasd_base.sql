-- Preserve all existing bases, reservations and fulfillment rules.
DROP TRIGGER reserve_component;
DROP TRIGGER fulfill_order;
CREATE TABLE bases_with_wasd (
 id INTEGER PRIMARY KEY CHECK(id IN (1,2,3,4,5,9)),
 name TEXT NOT NULL,
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0)
);
INSERT INTO bases_with_wasd SELECT id,name,stock FROM bases;
DROP TABLE bases;
ALTER TABLE bases_with_wasd RENAME TO bases;
-- Owner confirmed 50 WASD bases, shared by regular and light-up models.
INSERT INTO bases(id,name,stock) VALUES (5,'WASD 4-Key Base',50);
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
  SELECT RAISE(ABORT,'Insufficient light inventory')
    WHERE NEW.kind='light' AND NEW.quantity > COALESCE((SELECT stock FROM lights WHERE id=NEW.component_id),0) -
      COALESCE((SELECT SUM(c.quantity) FROM order_components c JOIN orders o ON o.id=c.order_id
        WHERE c.kind='light' AND c.component_id=NEW.component_id AND o.status IN ('creating','open')),0);
END;
CREATE TRIGGER IF NOT EXISTS fulfill_order AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status='open' BEGIN
  UPDATE bases SET stock=stock-COALESCE((SELECT quantity FROM order_components
    WHERE order_id=NEW.id AND kind='base' AND component_id=bases.id),0)
    WHERE id IN (SELECT component_id FROM order_components WHERE order_id=NEW.id AND kind='base');
  UPDATE keycaps SET stock=stock-COALESCE((SELECT quantity FROM order_components
    WHERE order_id=NEW.id AND kind='keycap' AND component_id=keycaps.id),0)
    WHERE id IN (SELECT component_id FROM order_components WHERE order_id=NEW.id AND kind='keycap');
  UPDATE lights SET stock=stock-COALESCE((SELECT quantity FROM order_components
    WHERE order_id=NEW.id AND kind='light' AND component_id=lights.id),0)
    WHERE id IN (SELECT component_id FROM order_components WHERE order_id=NEW.id AND kind='light');
END;

