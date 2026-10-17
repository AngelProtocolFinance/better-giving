# Connector allow

A signed-in member allows a chat to connect to a nonprofit they administer. The seeded member belongs to `Verify Test Nonprofit` only. `Verify Other Nonprofit` has no membership.

## Sub-features
- Email and password sign-in for the seeded member.
- Picker limited to that member's nonprofits.
- Allow sends the browser back with `iss`, `state`, and `code`.

## How to get to it (user POV)
- `/login`. The drive loads this directly and submits the form. It does not click the header `Log In` link, so a pass does not verify that link.
- `/admin/connector/allow?state=verify-state-1`. The drive loads this directly after sign-in.

Both loads are taken. Reaching the picker another way would not verify them.

## Driving it with drive.mjs
- `node scripts/drive.mjs connector-allow` loads `GET /login` directly. It fills `input[name=email]` (or the email placeholder) with `verify-member@example.com` and the password field with the fixture password `scripts/seed-member.mjs` hashes, then clicks the button named `Log In` (exact). It waits until the URL leaves `/login`.
- Then `GET /admin/connector/allow?state=verify-state-1` directly. `Verify Test Nonprofit` is visible and `Verify Other Nonprofit` is not. Proof of the picker: `connector-allow.png` and `connector-allow.aria.txt`.
- Click `Allow`. The app answers 303 and the browser lands on `/marketplace` on the same origin. The query has `iss` equal to `http://127.0.0.1:<port>`, `state=verify-state-1`, and a non-empty `code`. The drive records that the code is present and does not record its value. Proof after landing: `connector-allow-landed.png` and `connector-allow-landed.aria.txt`.

## Gotchas
- `scripts/seed-member.mjs` runs after `seed.sql` and inserts the member plus `Verify Other Nonprofit`. `CONNECTOR_RETURN_URL` in `.env.verify` keeps the 303 on this server. The drive does not set `VERCEL_ENV`.
- A pass does not click Deny and does not follow a path this file does not list.
