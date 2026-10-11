-- Physical inventory confirmed by owner: 20 lights of each color.
CREATE TABLE lights(id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 5),name TEXT NOT NULL UNIQUE,stock INTEGER NOT NULL CHECK(stock>=0));
INSERT INTO lights VALUES (1,'White',20),(2,'Red',20),(3,'Blue',20),(4,'Yellow',20),(5,'Green',20);
DROP TRIGGER reserve_component;
DROP TRIGGER fulfill_order;
CREATE TABLE order_components_expanded (
 order_id TEXT NOT NULL REFERENCES orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('base','keycap','light')),
 component_id INTEGER NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),
 PRIMARY KEY(order_id,kind,component_id)
);
INSERT INTO order_components_expanded SELECT * FROM order_components;
DROP TABLE order_components;
ALTER TABLE order_components_expanded RENAME TO order_components;
-- Preserve existing unpaid light-up selections, including legacy single-color carts.
INSERT INTO order_components(order_id,kind,component_id,quantity)
SELECT o.id,'light',l.id,SUM(json_extract(item.value,'$.quantity'))
FROM orders o,json_each(o.cart_json) item,json_each(item.value,'$.options.keycaps') cap
JOIN lights l ON l.name=COALESCE(json_extract(item.value,'$.options.lightColors[' || cap.key || ']'),json_extract(item.value,'$.options.lightColor'))
WHERE o.status IN ('creating','open') AND json_extract(item.value,'$.productId') IN
 ('1-key-light-up-clicker','2-key-light-up-clicker','3-key-light-up-clicker','4-key-light-up-clicker')
GROUP BY o.id,l.id;
-- Fail the migration if existing unpaid selections exceed confirmed color stock.
CREATE TABLE light_migration_check(ok INTEGER CHECK(ok=1));
INSERT INTO light_migration_check SELECT 0 WHERE EXISTS(
 SELECT 1 FROM order_components c JOIN orders o ON o.id=c.order_id JOIN lights l ON c.component_id=l.id
 WHERE c.kind='light' AND o.status IN ('creating','open') GROUP BY l.id,l.stock HAVING SUM(c.quantity)>l.stock
);
DROP TABLE light_migration_check;
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

