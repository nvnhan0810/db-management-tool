-- Small JSON test rows for json_samples (MySQL 8)
-- Runs after schema + optional 02_* bulk seed. Safe to re-run.

INSERT IGNORE INTO json_samples (name, payload, meta) VALUES
  (
    'user-preferences',
    CAST('{"theme":"dark","notifications":true,"locale":"vi-VN","sidebar":{"width":280,"collapsed":false}}' AS JSON),
    CAST('{"schemaVersion":1,"source":"seed"}' AS JSON)
  ),
  (
    'product-attributes',
    CAST('{"sku":"SKU-0000001","attrs":{"color":"blue","weightKg":1.25,"warrantyMonths":24},"tags":["electronics","sale"]}' AS JSON),
    NULL
  ),
  (
    'empty-object',
    CAST('{}' AS JSON),
    CAST('[]' AS JSON)
  ),
  (
    'array-root',
    CAST('["alpha","beta",{"nested":true},42,null]' AS JSON),
    CAST('{"type":"list"}' AS JSON)
  ),
  (
    'nested-order',
    CAST('{"orderId":1001,"lines":[{"productId":3,"qty":2},{"productId":7,"qty":1}],"totals":{"sub":1999,"tax":160}}' AS JSON),
    NULL
  );
