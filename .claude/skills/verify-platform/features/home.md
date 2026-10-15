# Landing page

## Sub-features
- `/` renders server-side with the marketing hero and header nav.

## How to get to it (user POV)
- Open the site root. The drive loads `/` directly. That is the entry this flow verifies.

## Driving it with drive.mjs
- `node scripts/drive.mjs home` → `GET /` 200, page title "Fundraising Platform for Nonprofits - Better Giving", and the header link named `Log In` has an `href` whose path is `/login`. This flow does not click that link. The `login` flow does, and a pass here does not verify the click. Proof: `home.png` and `home.aria.txt`.

## Gotchas
- Root loader needs no db; a 500 here usually means a package `dist/` is missing (launch.sh builds them).
- Below 75rem the header hides `Log In` behind the menu button. The drive uses 1280×900 so the desktop link is the one whose href is read.
