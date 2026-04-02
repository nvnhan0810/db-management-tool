-- Fake DB Test seed (PostgreSQL)
-- Inserts 1,000,000 rows into each table using generate_series().
-- Note: first startup may take some minutes depending on disk.

BEGIN;

-- Users (1M)
INSERT INTO users (id, email, full_name, created_at)
SELECT
  gs AS id,
  'user' || gs || '@example.com' AS email,
  'User ' || gs AS full_name,
  now() - ((gs % 365) || ' days')::interval
FROM generate_series(1, 1000000) gs
ON CONFLICT (id) DO NOTHING;

-- Products (1M)
INSERT INTO products (id, sku, name, price_cents, created_at)
SELECT
  gs AS id,
  'SKU-' || lpad(gs::text, 7, '0') AS sku,
  'Product ' || gs AS name,
  ((gs % 100000) + 100) AS price_cents,
  now() - ((gs % 365) || ' days')::interval
FROM generate_series(1, 1000000) gs
ON CONFLICT (id) DO NOTHING;

-- Orders (1M) -> users
INSERT INTO orders (id, user_id, status, total_cents, created_at)
SELECT
  gs AS id,
  ((gs - 1) % 1000000) + 1 AS user_id,
  CASE (gs % 5)
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'paid'
    WHEN 2 THEN 'shipped'
    WHEN 3 THEN 'completed'
    ELSE 'canceled'
  END AS status,
  ((gs % 250000) + 500) AS total_cents,
  now() - ((gs % 90) || ' days')::interval
FROM generate_series(1, 1000000) gs
ON CONFLICT (id) DO NOTHING;

-- Order items (1M) -> orders + products
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price_cents, created_at)
SELECT
  gs AS id,
  ((gs - 1) % 1000000) + 1 AS order_id,
  ((gs * 7 - 1) % 1000000) + 1 AS product_id,
  ((gs % 5) + 1) AS quantity,
  (((gs * 13) % 100000) + 100) AS unit_price_cents,
  now() - ((gs % 90) || ' days')::interval
FROM generate_series(1, 1000000) gs
ON CONFLICT (id) DO NOTHING;

-- Payments (1M) -> orders
INSERT INTO payments (id, order_id, provider, amount_cents, status, created_at)
SELECT
  gs AS id,
  ((gs - 1) % 1000000) + 1 AS order_id,
  CASE (gs % 3)
    WHEN 0 THEN 'stripe'
    WHEN 1 THEN 'paypal'
    ELSE 'bank'
  END AS provider,
  ((gs % 250000) + 500) AS amount_cents,
  CASE (gs % 4)
    WHEN 0 THEN 'authorized'
    WHEN 1 THEN 'captured'
    WHEN 2 THEN 'refunded'
    ELSE 'failed'
  END AS status,
  now() - ((gs % 90) || ' days')::interval
FROM generate_series(1, 1000000) gs
ON CONFLICT (id) DO NOTHING;

COMMIT;

