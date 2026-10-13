# Landing page

## Sub-features
- `/` renders server-side with the marketing hero and header nav.

## How to get to it (user POV)
- Open the site root.

## Driving it with drive.mjs
- `node scripts/drive.mjs home` → `GET /` 200, page title "Fundraising Platform for Nonprofits - Better Giving", header link to `/login` — both asserted, either mismatch fails the flow. Proof: `home.png`.

## Gotchas
- Root loader needs no db; a 500 here usually means a package `dist/` is missing (launch.sh builds them).
