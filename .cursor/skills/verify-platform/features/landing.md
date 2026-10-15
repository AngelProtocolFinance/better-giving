# Landing page

The marketing home is the first screen a visitor sees. It identifies the product and offers a header link to sign in.

## Sub-features

- `landing-open` renders `/` with the product title.
- `landing-signin` exposes a header link whose destination is `/login`.

## How to get to it (user POV)

- Open the site root.

## Driving it with drive.mjs

Preconditions:

- The app is healthy at `http://127.0.0.1:4200`.
- `scripts/doctor.sh` reports the dev-server pid, `GET /` 200, and the local database.
- Viewport is 1280×900.

- **Open home.** Open `/`. Run `node scripts/drive.mjs landing`. The response is 200 and the document title is `Fundraising Platform for Nonprofits - Better Giving`.
- **Sign-in link.** Find the header link named `Log In`. Its `href` path is `/login`.
- **Proof.** Run `node scripts/drive.mjs landing`. `landing-result.png` and `landing-result.aria.txt` show the page title and a link named `Log In`.

## Gotchas

- A 500 on `/` with an empty database usually means a workspace package `dist/` is missing. `launch.sh` builds `packages/*` before serving.
- Below 75rem the header hides `Log In` behind the menu button. The drive uses 1280×900 so the desktop link is the one asserted.
- The root loader does not read the database. A database failure is not what a red home page means.
