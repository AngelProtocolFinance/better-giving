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

`vercel.json`: `framework: nextjs`, `buildCommand` runs `build` **then `cp -a .react-email/.next ./.next`**. The `@vercel/next` preset always locates the Next build at `<rootDir>/.next` (= `apps/emails-preview/.next`) and **ignores `outputDirectory`** — react-email's `email build` puts the real build in `.react-email/.next`, so without the copy the preset ENOENTs on its own `.next/routes-manifest-deterministic.json` at the root. Copy **only `.next`** (scoped, `cp -a` to preserve every emitted artifact incl. the deterministic manifest) — copying `.react-email/.` wholesale clobbers pnpm's symlinked `node_modules/react`. No `outputDirectory` (a no-op under the Next preset); if a stale dashboard Output Directory override exists, clear it to auto. No `installCommand` — Vercel auto-detects pnpm and installs at the workspace root, which creates the `emails` `workspace:*` symlink. (react-email's official doc recommends `outputDirectory: .react-email/.next` with no copy; that's stale against the current `@vercel/next` builder — it fails.)

`buildCommand` is prefixed `npm_config_include=dev` on purpose: `email build` generates the `.react-email` app (package name `ui`) whose own build script needs `cross-env` (a devDependency), and react-email installs that app during the build **with npm** (its `-p/--packageManager` defaults to `npm`; we don't pass `-p`). vercel sets `NODE_ENV=production`, so npm omits devDeps and `cross-env` goes missing (`cross-env: command not found`) — `npm_config_include=dev` (npm's key, overrides the production omit) forces devDeps back in. note: it's an npm knob, not pnpm's — pnpm only runs the outer `build` script.

## Coding style

Follows the same conventions as the `emails` package — see `packages/emails/CLAUDE.md` (snake_case vars/functions, PascalCase components, kebab-case files, lowercase comments for code-readers).
