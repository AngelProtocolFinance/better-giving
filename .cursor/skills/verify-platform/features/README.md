# Platform verification map

This directory is the maintained source for verifying the visitor-facing behavior of `apps/platform`. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `scripts/launch.sh`. It boots a throwaway Postgres, migrates, seeds nonprofit `Verify Test Nonprofit`, and serves `http://127.0.0.1:4200`.
- Defaults: `VERIFY_STATE=/tmp/bg-verify-cursor`, `VERIFY_PG_DIR=/tmp/bg-verify-cursor-pg`, `VERIFY_PORT=4200`. One instance at a time. Do not drive an instance this run did not start.
- Run `scripts/doctor.sh` and require a live pid, `GET /` 200, local migrations, and a local `.env.verify`.
- Viewport for every drive is 1280×900 so the desktop header (shown from 75rem) is on screen.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names. Use a placeholder only where the control has no label.
- Treat every command as literal.
- Run browser actions through `node scripts/drive.mjs <feature>`.
- Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot (`*.aria.txt`) and a full-page screenshot.
- Record the feature id and entry point in `results.json`.
- `unreachable` is not `pass`. It requires the attempted route and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the visitor-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every visitor entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and uses labeled bullets that pair each visitor action with a command and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Landing page](./landing.md) covers the marketing home and the header sign-in link.
- [Sign in](./sign-in.md) covers the sign-in form and rejection of a wrong password.
- [Marketplace](./marketplace.md) covers the footer entry and the seeded nonprofit card.
- [Donate](./donate.md) covers amount, card method, donor info, the $100 summary, and card entry when test keys are present.
