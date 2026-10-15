-- Opt in at checkout creation, never retroactively purchasing labels for old orders.
ALTER TABLE orders ADD COLUMN auto_label_eligible INTEGER NOT NULL DEFAULT 0
  CHECK(auto_label_eligible IN (0,1));

CREATE TABLE shipping_labels (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','preparing','purchasing','waiting','success','needs_review')),
  claim_token TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  transaction_id TEXT UNIQUE,
  rate_id TEXT,
  postage_amount INTEGER,
  label_url TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  review_reason TEXT
);
CREATE INDEX shipping_labels_queue ON shipping_labels(state,next_attempt_at,updated_at);

-- Enqueue and inventory deduction commit with the same confirmed paid transition.
-- Both the signed webhook and checkout reconciliation use that transition.
CREATE TRIGGER enqueue_shipping_label AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status='open' AND NEW.auto_label_eligible=1 BEGIN
  INSERT OR IGNORE INTO shipping_labels(order_id,updated_at)
    VALUES (NEW.id,COALESCE(NEW.paid_at,CAST(strftime('%s','now') AS INTEGER)));
END;
