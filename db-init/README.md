## Fake DB test dataset (Docker)

This project ships an optional heavy dataset to test import/export, browsing, and performance.

### What you get

- **6 tables** with relationships:
  - `users`
  - `products`
  - `orders` → `users`
  - `order_items` → `orders`, `products`
  - `payments` → `orders`
  - `json_samples` — `payload` / `meta` as **JSON** (PostgreSQL **JSONB**) with a few seed rows in `03_json_samples_seed.sql`
- **1,000,000 rows per table** (except `json_samples`, which only has the small seed)

### Start

```bash
docker compose up -d
```

### Notes

- First init can take a while (disk + CPU).
- Data is persisted under `db-data/`.
- If you already started containers before adding init scripts, wipe volumes to re-init:

```bash
docker compose down
rm -rf db-data/mysql db-data/pgsql
docker compose up -d
```

