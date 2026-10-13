# verify-platform feature map

One file per user-facing feature; each names the drive.mjs flow that proves it.

| feature | flow | file |
|---|---|---|
| Landing page | `home` | [home.md](home.md) |
| Sign in | `login` | [login.md](login.md) |
| Marketplace | `marketplace` | [marketplace.md](marketplace.md) |
| Donate (card) | `donate-card` | [donate-card.md](donate-card.md) |
| Deploy smoke paths | `smoke-paths` | (http only; mirrors `.github/workflows/smoke.yml`) |

Not mapped yet (candidates): signup, register (npo onboarding steps 1–5), donate via bank/DAF/stocks/crypto, fundraisers, dashboard (needs a seeded signed-in user), form-embed widget on a third-party page.
