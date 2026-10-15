# Marketplace

Marketplace lists published nonprofits so a visitor can open one and donate. The verification seed publishes one organization.

## Sub-features

- `market-open` opens the list from the footer.
- `market-seed` shows the seeded nonprofit by name.

## How to get to it (user POV)

- Choose `Marketplace` in the footer.
- Open `/marketplace` directly.

## Driving it with drive.mjs

Preconditions:

- The app is healthy at `http://127.0.0.1:4200`.
- The seed row `Verify Test Nonprofit` (`registration_number` `VERIFY-0001`) is published and active.
- `scripts/doctor.sh` reports migrations applied on the local database.

- **Footer entry.** From `/`, choose `Marketplace` in the footer. Run `node scripts/drive.mjs marketplace`. The URL path becomes `/marketplace`.
- **Seeded card.** A heading named `Verify Test Nonprofit` is visible. That heading is the seeded row, so an empty 200 page is a failure.
- **Proof.** `marketplace-result.png` and `marketplace-result.aria.txt` show the heading `Verify Test Nonprofit`.
- **Direct URL.** Opening `/marketplace` is a second entry point. This drive does not take it. Do not mark it verified from the footer path.

## Gotchas

- An empty grid with status 200 means the list query failed and the loader degraded. Read `dev.log` in the state directory for `Failed query` before changing the drive.
- The header nav does not link to Marketplace. The footer link is the entry on `/`.
