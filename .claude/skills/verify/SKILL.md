---
name: verify
description: Typecheck and lint this repo before a commit. Written by /kru:setup from the sheet's `verify` line.
---

Run from the repo root: `pnpm lint && pnpm typecheck` (CI's `checks` job). Red → fix it before the commit; the commit waits.
