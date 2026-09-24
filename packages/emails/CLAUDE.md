# emails

React Email templates as a pure component library, workspace member `emails` (private). `src/` only — templates + shared components, no build tooling, no deploy.

- **platform** imports it via `workspace:*` — the package exports raw source (`exports: "./src/index.ts"`), so there's no build/`dist`; platform's compiler transpiles the `.tsx`. `src/index.ts` is the barrel (`export * as <name>` per template + `export type * from "./types"`).
- external deps are only `react` + `react-email` (the primitives). No `next`/`@react-email/ui` — that preview toolchain lives in the `emails-preview` member.
- **error copy**: a **quoted reason** — text relayed from elsewhere, a processor's error message or a reviewer's rejection reason — renders as `ErrorBand` (`src/components/error-band.tsx`), never bare coloured text. Inline emphasis on a number or phrase inside a sentence we wrote stays coloured text.
- **previewing templates** lives in the sibling `emails-preview` member (`pnpm dev:emails-preview`), which depends on this package and renders each template. See `emails-preview/CLAUDE.md`.

## Code Style

- casing: `snake_case` (vars/fns), `PascalCase` (components), `kebab-case` (filenames)
- component props: declare a named interface (`IFoo`)
