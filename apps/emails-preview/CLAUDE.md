# emails-preview

React Email preview site, workspace member `emails-preview` (private, app). Renders the `emails` package's templates for local preview + QA; deployed as its own Vercel project (Root Directory = `apps/emails-preview`), independent of platform.

- **`emails/`** — one preview entry per template. Each imports the template's barrel namespace from the sibling package and default-exports the rendered node:
  ```tsx
  import { banking } from "emails";
  const { node } = banking.template({ /* sample props */ });
  export default () => node;
  ```
  filenames don't always match the template name (e.g. `endow-admin-new.tsx` renders `admin_endow_admin_new`); the import is the source of truth.
- depends on `emails` via `workspace:*` — add a preview entry here when a template is added there.
- the `next`/`@react-email/ui`/`react-dom` deps are the `email dev`/`email build` toolchain; the `emails` package itself stays free of them.

## Commands

- `pnpm dev:emails-preview` (root) or `pnpm --filter emails-preview dev` — preview server on port 3001.
- `build` (`email build --dir emails`) — static build; participates in the root `turbo run build` and is run by `vercel.json` on deploy.

## Deploy

`vercel.json`: `framework: nextjs`, `buildCommand: npm_config_include=dev pnpm run build`, `outputDirectory: .react-email/.next` — react-email's official recipe, no copy step. `email build` generates a full Next app into `.react-email/` and builds it to `.react-email/.next`. No `installCommand` — Vercel auto-detects pnpm and installs at the workspace root, which creates the `emails` `workspace:*` symlink.

**Requires `react-email >= 6.9.0`.** Under Next 16 (Turbopack default), react-email `< 6.9.0` hard-set the generated `next.config.mjs`'s `outputFileTracingRoot`/`turbopack.root` to the `.react-email` dir; `@vercel/next` re-roots traces at the Vercel project root, so every traced path was off by the `.react-email/` prefix and the deploy ENOENTed on `/vercel/path0/.next/routes-manifest-deterministic.json` (a builder artifact, not a copyable `next build` output — no `cp`/`outputDirectory` incantation fixed it). Upstream bug [resend/react-email#3557](https://github.com/resend/react-email/issues/3557); fixed by [#3576](https://github.com/resend/react-email/pull/3576) (shipped in 6.9.0 — `getTracingRootDir()` now resolves the workspace root). Keep `react-email` + `@react-email/ui` pinned in lockstep at a `>= 6.9.0` version; re-verify a deploy on every bump.

`buildCommand` is prefixed `npm_config_include=dev` on purpose: `email build` generates the `.react-email` app (package name `ui`) whose own build script needs `cross-env` (a devDependency), and react-email installs that app during the build **with npm** (its `-p/--packageManager` defaults to `npm`; we don't pass `-p`). vercel sets `NODE_ENV=production`, so npm omits devDeps and `cross-env` goes missing (`cross-env: command not found`) — `npm_config_include=dev` (npm's key, overrides the production omit) forces devDeps back in. note: it's an npm knob, not pnpm's — pnpm only runs the outer `build` script.

## Coding style

Follows the same conventions as the `emails` package — see `packages/emails/CLAUDE.md` (snake_case vars/functions, PascalCase components, kebab-case files, lowercase comments for code-readers).
