# verify-platform feature map

One file per user-facing feature; each names the drive.mjs flow that proves it. A listed entry point the drive does not take is not verified: a click counts only when `entry.clicked` names it, and a direct load counts only when `entry.loaded` names that URL. Reaching the same screen the other way does not verify the path that was skipped.

| feature | flow | file |
|---|---|---|
| Landing page | `home` | [home.md](home.md) |
| Sign in | `login` | [login.md](login.md) |
| Marketplace | `marketplace` | [marketplace.md](marketplace.md) |
| Donate (card) | `donate-card` | [donate-card.md](donate-card.md) |
| Deploy smoke paths | `smoke-paths` | [smoke-paths.md](smoke-paths.md) |
| Agent nonprofit lookup | `agents-find` | [agents-find.md](agents-find.md) |

`scripts/doctor.sh` runs `drive.mjs --check-map` and fails when a `features/*.md` file (other than this index), a link to one from this file, and a `FLOWS` key in `drive.mjs` are not the same set.

Not mapped yet (candidates): signup, register (npo onboarding steps 1–5), donate via bank/DAF/stocks/crypto, fundraisers, dashboard (needs a seeded signed-in user), form-embed widget on a third-party page.
