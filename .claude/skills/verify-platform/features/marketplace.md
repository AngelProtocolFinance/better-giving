# Marketplace

## Sub-features
- Lists published, active nonprofits (`npo_search`), with search and filters.

## How to get to it (user POV)
- `/marketplace`.

## Driving it with drive.mjs
- `node scripts/drive.mjs marketplace` → card "Verify Test Nonprofit" (from seed.sql) visible. Proof: `marketplace.png`.

## Gotchas
- An empty grid with 200 means the db read failed and the loader degraded — check `dev.log` for `Failed query`.
