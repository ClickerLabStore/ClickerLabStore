CREATE TABLE product_reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(typeof(rating)='integer' AND rating BETWEEN 1 AND 5),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 40),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=1500),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  moderation_reason TEXT CHECK(moderation_reason IN ('spam','abuse','personal_information','unrelated')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(order_id,product_id),
  CHECK((status='published' AND moderation_reason IS NULL) OR (status='hidden' AND moderation_reason IS NOT NULL))
);
CREATE INDEX product_reviews_public ON product_reviews(product_id,status,created_at DESC,id);
CREATE TRIGGER verify_review_purchase BEFORE INSERT ON product_reviews BEGIN
  SELECT RAISE(ABORT,'Paid purchase required') WHERE
    NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='paid' AND paid_at IS NOT NULL);
  SELECT RAISE(ABORT,'Purchased product required') WHERE NOT EXISTS(
    SELECT 1 FROM orders o,json_each(o.cart_json) line WHERE o.id=NEW.order_id AND
      (json_extract(line.value,'$.productId')=NEW.product_id OR EXISTS(
        SELECT 1 FROM json_each(line.value,'$.options.clickers') component
          WHERE json_extract(component.value,'$.productId')=NEW.product_id))
  );
END;
