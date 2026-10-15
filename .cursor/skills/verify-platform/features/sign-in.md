# Sign in

Sign in lets a visitor start a session with Google or with email and password. A wrong password is refused on the same page.

## Sub-features

- `signin-open` opens the form from the header.
- `signin-choices` shows Google and email/password.
- `signin-reject` refuses a password that matches no account and stays on `/login`.

## How to get to it (user POV)

- Choose `Log In` in the site header.
- Open `/login` directly.

## Driving it with drive.mjs

Preconditions:

- The app is healthy at `http://127.0.0.1:4200`.
- No account exists for `verify-nobody@example.com`.
- `scripts/doctor.sh` reports the local database, because the refusal is checked against it.

- **Header entry.** From `/`, choose `Log In`. Run `node scripts/drive.mjs sign-in`. The URL path becomes `/login`.
- **Choices.** The page shows a button named `Continue with Google`, a textbox with placeholder `Email address`, and a textbox with placeholder `Password`.
- **Wrong password.** Enter `verify-nobody@example.com` and `Wrong-password-123!`, then choose `Log In`. The URL path stays `/login` and the text `Invalid email or password` is visible. Proof: `sign-in-filled.png` (action) and `sign-in-result.png` plus `sign-in-result.aria.txt` (result).
- **Direct URL.** Opening `/login` is a second entry point. This drive does not take it. Do not mark it verified from the header path.

## Gotchas

- Do not choose `Continue with Google`. That starts a real OAuth redirect and is not covered.
- A successful sign-in needs a seeded user with a password hash. This map does not seed one. Missing that user is not a reason to treat a wrong-password refusal as a completed sign-in.
- Five wrong passwords for one address in five minutes return `Too many sign-in attempts. Try again in a few minutes.` That is the rate limit, not the bad-credential result. Use a fresh database or a new address.
- The email and password controls have placeholders and no labels. Locate them by placeholder.
