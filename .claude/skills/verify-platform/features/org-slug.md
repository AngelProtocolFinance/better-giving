# Organization slug

## Sub-features
- An npo admin sets an org slug once, under Manage → Organization.
- After a reload the slug is disabled, with the note that changing it would make links that depend on it stale.
- `/donate/<slug>` and `/marketplace/<slug>` both render that nonprofit.

## How to get to it (user POV)
- Sign in at `/login?redirect=/admin/<id>/dashboard` as the seeded npo admin, then click the sidebar link `Organization` in the Manage group. The drive takes this click.
- `/donate/<slug>` and `/marketplace/<slug>` after the slug is set. The drive loads both directly.

## Driving it with drive.mjs
- `node scripts/drive.mjs org-slug`: open the login page with the admin redirect, submit the seeded admin, click `Organization`, set `verify-test` on the nonprofit that has no slug, reload, and read the disabled field and the set-once note.
- Then `GET /donate/verify-test` and `GET /marketplace/verify-test`. Both show "Verify Test Nonprofit".
- Proof: `org-slug.png` and the later shots, each with a sibling `.aria.txt`.

## Gotchas
- The published fixture nonprofit starts without a slug. A database left over from an earlier run of this flow already has `verify-test` set, and the field is then disabled before the flow can set it. `scripts/run.sh` starts from a clean database.
- Its registration number is `VERIFY0001`. The organization form rejects a hyphen, so a save never reaches the slug.
- The sidebar link is in the desktop sidebar (`max-md:hidden`). The drive viewport is 1280×900, so the link is on screen.
- A cold dev server can reload this page while Vite finishes optimizing dependencies. That reload clears a slug typed into the previous document, and Save stays disabled. The drive waits until the legal name is filled, then sets the slug, and repeats that fill after a reload when Save never enables.
