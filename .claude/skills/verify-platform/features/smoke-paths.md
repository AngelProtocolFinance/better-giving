# Deploy smoke paths

The paths `.github/workflows/smoke.yml` requests after a deploy also answer locally. This flow is HTTP only: it does not open a document in the browser and it does not click.

## Sub-features
- `GET /`, `GET /api/currencies`, and `GET /form-embed.js` each return a status below 400.

## How to get to it (user POV)
- These are direct requests, not clicks. The drive issues each one with `page.request.get`.

## Driving it with drive.mjs
- `node scripts/drive.mjs smoke-paths` records the status of `/`, `/api/currencies`, and `/form-embed.js`. A status of 400 or above fails the flow.
- No screenshot and no ARIA snapshot: nothing is rendered. Proof is `smoke-paths.log` and the `loaded` list in `results.json`.

## Gotchas
- `/api/currencies` reads the seeded USD rates. An empty rate table is a 500, not an empty 200.
- `/form-embed.js` is a static asset. A 404 here is the dev server, not the database.
