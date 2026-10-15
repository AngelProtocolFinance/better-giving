# Sign in

## Sub-features
- Google OAuth button, email/password form, forgot password, sign-up link.
- Rejection of bad credentials (better-auth, db-backed).

## How to get to it (user POV)
- Header `Log In` on `/`. The drive clicks this.
- `/login`. The drive loads this directly, after the click.

Both entries are taken, so a pass verifies both. A run that only loaded `/login` would not verify the header click.

## Driving it with drive.mjs
- `node scripts/drive.mjs login`: from `/`, click the header link named `Log In`. If a cold dev server reloads and cancels that click, the drive retries the same click. It does not replace the click with `goto`. Then fill `input[name=email]` = verify-nobody@example.com, `input[name=password]` = wrong, click the button named **Log In** → text "Invalid email or password", URL stays `/login`.
- Then `GET /login` directly → 200 and the Google button is present again.
- Proof: `login-filled.png`, `login.png`, `login-direct.png`, each with a sibling `.aria.txt`.

## Gotchas
- A successful sign-in needs a seeded user + password hash; not covered yet. Google sign-in needs real OAuth creds — never drive it.
- The header control is a link. The submit control is a button. Both are named `Log In`.
