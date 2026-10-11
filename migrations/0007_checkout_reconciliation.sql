-- Rotate overdue checks so an unresolved order cannot starve later checkouts.
ALTER TABLE orders ADD COLUMN reconciliation_checked_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX orders_reconciliation ON orders(payment_mode,reconciliation_checked_at,created_at)
  WHERE status IN ('creating','open') AND paid_at IS NULL;
