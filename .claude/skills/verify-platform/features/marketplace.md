# Marketplace

## Sub-features
- Lists published, active nonprofits (`npo_search`), with search and filters.

## How to get to it (user POV)
- Footer `Marketplace` on `/`. The drive clicks this. The header nav does not link here, and the marketplace page's own footer is the minimal one, which has no Marketplace link.
- `/marketplace`. The drive loads this directly, after the click.

Both entries are taken, so a pass verifies both. A run that only loaded `/marketplace` would not verify the footer click.

## Driving it with drive.mjs
- `node scripts/drive.mjs marketplace`: from `/`, click the footer link named `Marketplace`. On a cold dev server, scrolling that link into view prefetches `/donate/1`, Vite reloads, and the click is cancelled. The drive retries the same click. It does not open `/marketplace` with `goto` instead. The seeded card "Verify Test Nonprofit" is visible.
- Then `GET /marketplace` directly → 200 and the same card.
- Proof: `marketplace.png`, `marketplace-direct.png`, each with a sibling `.aria.txt`.

## Gotchas
- An empty grid with 200 means the db read failed and the loader degraded — check `dev.log` for `Failed query`.
- A reload during the footer click is not a reason to drop the click. The retry is the same control.
