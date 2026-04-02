-- Fake DB Test seed (MySQL 8)
-- Generates numbers 1..1,000,000 using cross-join digits into a TEMP table.
-- This avoids `WITH RECURSIVE ... INSERT` syntax incompatibilities during init.

-- Build a 1..1,000,000 sequence once (session-scoped)
DROP TEMPORARY TABLE IF EXISTS seq_1m;
CREATE TEMPORARY TABLE seq_1m (
  n INT NOT NULL PRIMARY KEY
) ENGINE=InnoDB;

INSERT IGNORE INTO seq_1m (n)
SELECT
  (d0.n
   + d1.n * 10
   + d2.n * 100
   + d3.n * 1000
   + d4.n * 10000
   + d5.n * 100000) + 1 AS n
FROM
  (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
   UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d0
  CROSS JOIN
  (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
   UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d1
  CROSS JOIN
  (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
   UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d2
  CROSS JOIN
  (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
   UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d3
  CROSS JOIN
  (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
   UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d4
  CROSS JOIN
  (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
   UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d5;

INSERT IGNORE INTO products (id, sku, name, price_cents, created_at)
SELECT
  s.n,
  CONCAT('SKU-', LPAD(s.n, 7, '0')),
  CONCAT('Product ', s.n),
  (s.n % 100000) + 100,
  NOW() - INTERVAL (s.n % 365) DAY
FROM seq_1m s;

INSERT IGNORE INTO orders (id, user_id, status, total_cents, created_at)
SELECT
  s.n,
  ((s.n - 1) % 1000000) + 1,
  ELT((s.n % 5) + 1, 'pending', 'paid', 'shipped', 'completed', 'canceled'),
  (s.n % 250000) + 500,
  NOW() - INTERVAL (s.n % 90) DAY
FROM seq_1m s;

INSERT IGNORE INTO order_items (id, order_id, product_id, quantity, unit_price_cents, created_at)
SELECT
  s.n,
  ((s.n - 1) % 1000000) + 1,
  ((s.n * 7 - 1) % 1000000) + 1,
  (s.n % 5) + 1,
  ((s.n * 13) % 100000) + 100,
  NOW() - INTERVAL (s.n % 90) DAY
FROM seq_1m s;

INSERT IGNORE INTO payments (id, order_id, provider, amount_cents, status, created_at)
SELECT
  s.n,
  ((s.n - 1) % 1000000) + 1,
  ELT((s.n % 3) + 1, 'stripe', 'paypal', 'bank'),
  (s.n % 250000) + 500,
  ELT((s.n % 4) + 1, 'authorized', 'captured', 'refunded', 'failed'),
  NOW() - INTERVAL (s.n % 90) DAY
FROM seq_1m s;

