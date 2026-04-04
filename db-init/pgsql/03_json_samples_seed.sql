-- Small JSON/JSONB test rows for json_samples (PostgreSQL)
-- Runs after schema + optional 02_* bulk seed. Safe to re-run.

INSERT INTO json_samples (name, payload, meta) VALUES
  (
    'user-preferences',
    '{"theme":"dark","notifications":true,"locale":"vi-VN","sidebar":{"width":280,"collapsed":false}}'::jsonb,
    '{"schemaVersion":1,"source":"seed"}'::jsonb
  ),
  (
    'product-attributes',
    '{"sku":"SKU-0000001","attrs":{"color":"blue","weightKg":1.25,"warrantyMonths":24},"tags":["electronics","sale"]}'::jsonb,
    NULL
  ),
  (
    'empty-object',
    '{}'::jsonb,
    '[]'::jsonb
  ),
  (
    'array-root',
    '["alpha","beta",{"nested":true},42,null]'::jsonb,
    '{"type":"list"}'::jsonb
  ),
  (
    'nested-order',
    '{"orderId":1001,"lines":[{"productId":3,"qty":2},{"productId":7,"qty":1}],"totals":{"sub":1999,"tax":160}}'::jsonb,
    NULL
  )
ON CONFLICT (name) DO NOTHING;
