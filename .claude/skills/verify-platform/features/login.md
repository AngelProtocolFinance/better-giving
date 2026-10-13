# Sign in

## Sub-features
- Google OAuth button, email/password form, forgot password, sign-up link.
- Rejection of bad credentials (better-auth, db-backed).

## How to get to it (user POV)
- Header "Log in" link, or `/login`.

## Driving it with drive.mjs
- `node scripts/drive.mjs login`: fill `input[name=email]` = verify-nobody@example.com, `input[name=password]` = wrong, click **Log In** → text "Invalid email or password" under the password field, URL stays `/login`. Proof: `login-filled.png`, `login.png`.

## Gotchas
- A successful sign-in needs a seeded user + password hash; not covered yet. Google sign-in needs real OAuth creds — never drive it.
