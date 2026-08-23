# design-sync notes — better-giving

Repo-specific gotchas for future syncs. Read this before re-running anything.

## Where this runs from — read first

Everything lives under **`apps/design-sync/`**, and every command in this file assumes that
as the working directory. The converter resolves `.design-sync/` against the **cwd** in ~15
places, and `PKG_DIR` by walking up from `cfg.entry` to the nearest named `package.json` — so
running from the repo root instead silently resolves a different tree.

```sh
cd apps/design-sync        # <- every command below, including /design-sync itself
```

The skill's own re-sync detection reads `.design-sync/config.json` **relative to the cwd**, so
a `/design-sync` started at the repo root finds no config, calls it a first-time import, and
creates a SECOND claude.ai/design project — orphaning
`2ae8b8b4-efb5-4845-9b62-4401e20f846a`. That is the one mistake this layout makes easy; there
is no marker at the repo root to catch it.

`--node-modules` stays `../../packages/ui/node_modules` (`lucide-react` and friends are real
dependencies of the package, and `workspaceRoot` still derives to the repo root from it).
`--out` goes to `ds-bundle/` inside this app, not the repo root.

## Shape

`shape: "package"`. There is no Storybook and no `*.stories.*` anywhere in the repo.

The "design system" is split across two packages:

- **`packages/brand`** — the token palette (`src/colors.css`, real `oklch()`, `:root` only —
  the palette is light-only, the `.dark` set was deleted 2026-08-19)
  and `design-system.md`, the token ledger. Read that ledger before touching color; it records
  measured contrast, the fill-vs-ink distinction, and several deliberate decisions that look
  like bugs.
- **`packages/ui`** (`@better-giving/ui`) — the components, under `src/components/`, plus the
  CSS layer (`src/styles/`). Source-only: no `dist/` for the TS exports, consumers transpile it.
  It does build one CSS artifact (`dist/styles.css`, gitignored) but this sync does **not**
  consume it — see Stylesheet.

**Everything moved out of `apps/platform` on 2026-08-20** (PR #109). Before that the components
lived in the app, which is why several notes below describe app-shaped workarounds; where one is
now obsolete it says so rather than being deleted.

## Why there is a hand-written entry (`.design-sync/entry.tsx`)

`packages/ui` now has a real barrel (`src/index.ts`), but this file stays, for two reasons
that survive the extraction:

- **`DsProvider`.** Components that call `useNavigate`/`NavLink` (`Prompt`, `Breadcrumbs`) throw
  outside a router, so previews mount through a `MemoryRouter` the package has no business
  shipping.
- **The `Arrow`/`Content` collision.** `tooltip.tsx` and `hover-card.tsx` both export those two
  names, which is exactly why the package publishes them as separate entry points
  (`@better-giving/ui/tooltip`, `/hover-card`) rather than through the flat barrel. This file
  re-exports them as `TooltipContent` / `HoverCardContent`.

So `.design-sync/entry.tsx` is the explicit export surface: one named export per published
component, plus `DsProvider`. **Its import paths mirror `cfg.componentSrcMap` — regenerate the
two together**, and always point at the implementation FILE, never the directory barrel.

**The surface is not only components.** Two lowercase exports ride along because the component
they belong to is unusable without them, and `cfg.componentSrcMap` has no slot for a non-component:
`masks` (the `{format, unmask}` presets — `MaskedInput`'s `mask` is required and has no default)
and `show_toast` (the imperative half of `Toaster`; toasts are pushed into a module-scope manager,
never rendered, so `Toaster` alone is a mount point that can never display anything). Both are
public API of `packages/ui` — the barrel exports them — and both are lowercase, which is what
keeps the converter from mistaking them for components. **When a component's API has a half that
isn't a React element, check it is on this surface**: a design can only reach `window.BetterGiving`,
so an unexported half is a documented call that does nothing. `show_toast` was exactly that until
2026-08-21 (below).

The previews import the package by name (`from "@better-giving/ui"`); the converter resolves
that bare specifier to this entry.

## Converter bugs worked around (not repo problems)

1. **`cfg.tsconfig` is deliberately UNSET.** The converter's `tsconfigPathsPlugin`
   (`lib/bundle.mjs`) strips comments with `/\/\*[\s\S]*?\*\//g`, which also matches the `/*`
   inside `"#/*": ["src/*"]` and swallows the whole `paths` map up to the next `*/` (supplied by
   `"**/*"` in `include`). The plugin then returns `null` and every alias fails to resolve.
   It is not needed anyway, and since the extraction it is not even close to needed:
   **`packages/ui` declares no `paths` and its source uses no aliases at all** — every import
   inside the package is relative or a real dependency. The alias resolution this flag used to
   be about was `apps/platform`'s `#/`, `@/`, `$/`, and no file this sync bundles uses them any
   more. Do NOT "fix" this by setting `cfg.tsconfig`.

2. **`@types/react` used to need a symlink at the repo root — it no longer does.**
   `lib/dts.mjs` derives node_modules from the package dir and only walks *up* looking for
   `@types/react`. With `cfg.entry` at the repo root, `PKG_DIR` was the repo root and the walk
   found nothing, so every emitted `.d.ts` body collapsed to `any`/empty and a hand-made
   symlink was the fix. Since the move `PKG_DIR` is `apps/design-sync`, which **declares
   `@types/react` itself** — the walk finds it one level up, per clone, with no manual step.
   Same for `playwright` and the old `.ds-sync/node_modules/playwright` link (see Playwright).
   Any leftover `node_modules/@types/react` symlink at the repo root is inert; delete it.

## Typecheck the previews — the cheapest way to catch a stale one

The previews are compiled by esbuild, which does **not** typecheck. A preview that passes a prop
the component no longer has therefore builds, renders, and silently shows less than it should —
`Amount` spent a whole sync rendering a currency label with no number, and the render check
called it clean because the root wasn't empty.

This used to be a throwaway tsconfig pasted out of this file. It is now a **real project**:
`apps/design-sync/tsconfig.json` + a `typecheck` script, so

```sh
pnpm --filter design-sync typecheck
```

checks every preview and `entry.tsx` against the real `@better-giving/ui` source. It runs in
CI (the `checks` job's `turbo run typecheck` picks it up from the package's own script) and on
commit (lefthook `type-check-design-sync`). The two errors the ad-hoc config used to produce
are both gone: `lucide-react` is a declared dependency of this app, and `*.svg` has an ambient
declaration in `types/assets.d.ts`.

Run it **before grading** — it takes seconds and it is the only check that sees a prop the
component dropped. Verified to bite: reinstating `<Amount amount={1200} …>` fails with
`TS2322 ... not assignable to type 'IntrinsicAttributes & IAmount'`.

## `extract-props.mjs` is broken for this repo since the extraction

It now returns a body of just `/** ...plus the standard props inherited from … */` for **every**
component — the declaration-site filter apparently treats `packages/ui`'s own files as external, so
every own-prop is filtered out. Its output is strictly worse than what `cfg.dtsPropsFor` already
holds.

**Do not paste `.cache/props.json` over `cfg.dtsPropsFor`** (the pre-existing rule, now absolute).
`dtsPropsFor` is hand-maintained: when a component's props change, hand-edit that entry. This is
load-bearing — the `<Name>Props` body IS the contract the design agent codes against, and a stale
one makes it misuse the component everywhere. `Amount` and `FileDropzone` were both stale on this
sync and were corrected by hand.

## How the prop contracts were originally generated

`cfg.dtsPropsFor` holds all 40 bodies. They are NOT hand-authored — the converter's extractor
only reads `.d.ts`, and platform ships none, so every body degraded to `[key: string]: unknown`.

`.ds-sync/extract-props.mjs` regenerates them from the real source types via ts-morph:

```sh
node .ds-sync/extract-props.mjs      # writes .design-sync/.cache/props.json
# then merge that file into cfg.dtsPropsFor
```

It does three things that matter: filters props by **declaration site** (own API vs the ~218
attributes inherited from `ComponentProps<"input">`, which are folded into one summary line),
substitutes generic type parameters with their constraints (`Select<T extends string>` → `string`),
and expands platform-local aliases (`Classes`, `FileSpec`) structurally, since those names do not
exist in the emitted `.d.ts`. **Re-run it whenever a component's props change.**
~19 props across the set still land on `unknown`; that is the accepted residue.

## Fonts

`cfg.extraFonts` points at **`../../packages/ui/src/styles/fonts.css`** — the design system's
own `@font-face` layer, one entry for both families.

It used to point at two fontsource packages, and before that reached across into
`apps/platform/node_modules` — the only place on disk they existed, since `packages/ui`
declared the `--font-display`/`--font-body`/`--font-gochi` tokens but depended on none of the
fontsource packages. This app then declared all three itself to stop pointing across a member.
All of that is gone: `packages/ui` self-hosts both faces beside the tokens that
name them (committed `.woff2` in `packages/ui/src/styles/fonts/`, cut by that dir's
`generate.sh` so Quicksand keeps its `zero` feature — see `packages/brand/design-system.md` →
"The faces"). This app no longer declares any font dependency of its own.

Two things about that path still matter. `extraFonts` is bounded to the **git workspace root**
rather than `PKG_DIR`, which is what makes the `../../` form legal. And the converter needs
`@font-face` CSS whose `url()`s resolve **relative to the CSS file** — `fonts.css` uses
`./fonts/*.woff2`, which does, exactly as the fontsource packages' `./files/*.woff2` did. The
compiled app CSS is still no use for this: it references `/assets/*.woff2` (absolute,
root-relative) which resolve to nothing on disk, so the converter drops those as dead
`@font-face` blocks.

Quicksand Variable and Gochi Hand are the only two families the system uses — `--font-display`
and `--font-body` are two roles resolving to the one Quicksand face, so this is two families in
one file, not three. Keep it in step with `--font-*` in `packages/ui/src/styles/theme.css`: a
face swap that misses `fonts.css` makes every preview render in a family the system no longer
has.

## Stylesheet

`cfg.cssEntry` points at `.design-sync/.cache/styles.css`, compiled from
`.design-sync/styles-entry.css` (committed; the output is gitignored):

```sh
pnpm --filter design-sync styles
```

**Rebuild it whenever a component, a preview, or the app writes a utility that wasn't there
before** — Tailwind v4 is JIT, so this stylesheet *is* the vocabulary the design project has.
A utility no scanned file writes does not exist, and a design authored against it renders
unstyled with no error. The entry scans three scopes and the file itself says why: the package's
components (via `packages/ui/src/styles/index.css`, which carries its own `@source ".."`), the
preview files, and `apps/platform/src` — the last so the published vocabulary stays continuous
with what the app actually writes. Dropping the app scope costs ~65 utilities the previews
alone need, `flex-col` and `gap-4` among them.

**This replaced the old app-build entry on 2026-08-20**, and two landmines went with it:

- it used to point at `apps/platform/build/client/assets/index-<hash>.css`, a **content-hashed**
  filename that moved on every app build — a stale value meant `! cssEntry: … not found —
  skipped` and every preview rendering unstyled.
- refreshing it meant building platform, and **`pnpm build` for platform runs `drizzle-kit
  migrate` against a real database** in `postbuild` (`issues/build-runs-migrations-against-a-live-db.md`).
  The safe invocation was `pnpm --filter platform exec react-router build`, which skips the npm
  lifecycle hook.

Neither applies now: nothing in this sync needs an app build, and the path is stable.

**The move narrowed the vocabulary by 12 utilities, and that was a latent accident closing.**
`@import "tailwindcss"` auto-detects sources from the entry file up to the nearest project root.
With the entry at `<repo root>/.design-sync/` there was no `package.json` between it and the git
root, so Tailwind was quietly scanning the **whole repo** — `apps/docs`, `packages/emails`,
`apps/blog` included — on top of the three declared `@source` scopes. `apps/design-sync/package.json`
now stops that walk, so the build is exactly the three scopes the entry names. What was lost:
`antialiased`, `collapse`, `cursor-nwse-resize`, `h-3`, `invert`, `m-0`, `max-w-150`, `outline-0`,
`outline-2`, `scroll-mt-16`, `transition-opacity`, `w-12` — none used by `packages/ui` or by any
preview. Verified byte-identical to an absolute-path reference build, so the relative `@source`
paths resolve to the intended dirs.

### The docs were writing the stylesheet

Found 2026-08-22. `@import "tailwindcss"` auto-detects sources from the entry file up to the
nearest `package.json` — `apps/design-sync/` — and scans **everything** under it, markdown
included. `NOTES.md` and `conventions.md` both live in that root, so any valid utility name quoted
in their prose minted a real rule in the published stylesheet.

That is worse than it sounds, in three ways:

- **It made the vocabulary depend on the prose.** 20 utilities were reaching the design project
  with no call site in any component, preview or app file. Among them the twelve this file records
  as *deliberately lost* in the 2026-08-20 narrowing (`antialiased`, `w-12`, `outline-2`, …) —
  the note recording the loss is what put them back — plus `bg-[conic-gradient(…)]` from the
  `LoaderRing` write-up, and `bg-destructive/10` from the header's own don't-do-this example.
- **It was asymmetric, which is the silent-miss trap.** `bg-chart-1` and `bg-chart-5` compiled
  because the prose spelled them; `bg-chart-2` did not, because `…` elides. A design following
  the header got a working swatch or an invisible one depending on the index.
- **It made verification circular.** Every "checked it against the compiled stylesheet" pass in
  this file was partly self-fulfilling for any name the header mentions — the check reads a
  stylesheet the checked document helped write. The `w-16`/`h-20` snippet under
  *Preview-authoring gotchas* was the pure case: it could never report a miss, because writing
  the check minted both classes.

Fixed with `@source not "../**/*.md"` in `styles-entry.css`, which drops the 20. What the header
genuinely promises is then listed back explicitly with `@source inline(...)` rather than left to
whichever names the app happened to write:

- `rounded-none` — the radius ladder names it as one of the two escapes it still allows.
- `{bg,text,border,fill,stroke}-chart-{1..5}` — `theme.css:75-79` maps `--color-chart-*`, so these
  are registered Tailwind colours; nothing in the app writes a utility form because its charts
  reach the tokens as `var(--chart-N)` in recharts props.
- the numeric box ladder (`w-`/`h-`/`size-`/`min-w-`/`min-h-`/`max-w-` to 96, `gap-`/`p-`/`m-`
  and their per-side and per-axis forms to 24). The header claimed "the standard w/h steps" were
  safe and that was false in both directions — `w-16` and `h-20` absent, `w-20` and `h-16`
  present. +17KB on a 207KB sheet.

**So: naming a class in this file or in `conventions.md` no longer makes it real.** Verify a claim
against the build, and if the build disagrees, fix one of the two — do not assume the doc is right
because the class is in the stylesheet.

The general shape of this is worth knowing: **the published vocabulary is only what these three
scopes happen to write**, so a design that reaches for a reasonable utility nobody has used yet
renders unstyled. The previews scope is the deliberate escape hatch — write the utility in a
preview and it exists. A safelist (`@source inline(…)`) would be the real fix and is not one this
file should decide.

Note `packages/ui` also builds its own `dist/styles.css` (`pnpm --filter @better-giving/ui
build`). This sync does **not** consume it — it covers only the package's own source, so it
carries neither the previews' layout utilities nor the app's vocabulary. It exists for tooling
that is bounded to the package directory.

Check a utility before authoring against it:
`python3 -c "css=open('.design-sync/.cache/styles.css').read(); print([c for c in ['w-16','h-20'] if c not in css])"`

## Playwright

Chromium is already cached at `~/Library/Caches/ms-playwright/` (builds 1217 and 1234).
The repo pins `playwright@1.59.1`, whose `browsers.json` pins chromium **1217** — so it matches
and **no download is needed**. The validator imports `playwright` relative to `.ds-sync/`, which the skill now stages at
`apps/design-sync/.ds-sync/` — node resolution walks up into `apps/design-sync/node_modules`,
where this app **declares `playwright` itself**. The old per-clone
`ln -sfn ... .ds-sync/node_modules/playwright` is no longer needed.

## Validator warnings (triaged)

`package-validate.mjs` ends on one standing `[TOKENS_MISSING]` warning naming six custom
properties: `--transform-origin`, `--marquee-duration`, `--marquee-delay`, `--marquee-loop-count`,
`--marquee-translate`, `--gutter`. All six are injected at runtime, never declared in a
stylesheet — the first five come from Ark UI's positioning/marquee machines, and `--gutter` is an
inline style on `pages/registration/progress-indicator.tsx:54`. This is the case the warning
itself calls expected; there is nothing to set `cfg.tokensPkg` to.

`[GRID_OVERFLOW]` fired for nine components on the first pass and is cleared by
`cfg.overrides` — `cardMode: "column"` for the wide-but-in-flow ones (`Copier`, `ExtLink`,
`Target`, `VerifiedIcon`, `ContentLoader`, `LoadText`, `LoaderRing`, `PayoutStatus`) and
`cardMode: "single"` for the ones that paint outside their cell (`Modal`, `Tooltip`, `HoverCard`,
`Prompt`, `Toaster`). Note the validator's remediation text names `preview-rebuild.mjs`, which
this bundled copy of the converter does not ship — a full `package-build.mjs` run does the job.

## Known render warns (triaged as legitimate — not new problems)

- `[TOKENS_MISSING]` for `--transform-origin`, `--marquee-duration`, `--marquee-delay`,
  `--marquee-loop-count`, `--marquee-translate`, `--gutter`. All six are set at runtime by Ark UI
  state machines (positioning, marquee), never declared in a stylesheet. Expected.

## Scope

43 components, deliberately narrowed to the reusable primitives. App-specific machinery is
excluded on purpose: `csv-exporter`, `img-editor`, `donate-methods`, `donation/**`, `token-field`,
`youtube-player`, `referrals`, `bank-details`, `rich-text`, `chrome`, `header`, `footer`,
`goal-selector`, `fundraiser`, `video`. Widening scope means adding to BOTH `cfg.componentSrcMap`
and `.design-sync/entry.tsx`.

`Button` was added 2026-08-23 and is the 41st; `EmptyState` and `EmptyRow` followed the same day as the 42nd and 43rd. Until then this file recorded that the repo had no
button component and that this was a property of the system rather than a gap in the sync — which
was true when written, and had the effect that every design produced on the canvas hand-spelled
`<button className="btn btn-primary">`. It now covers all four elements a button can be
(`<button>`, `Link`, `NavLink`, `<a>`), so `conventions.md` points designs at the component and
keeps the classes as the hand-composition fallback.

## Findings the repo may want to act on

Surfaced while validating `conventions.md` against the compiled stylesheet. These are **repo**
observations, not sync problems — recorded here rather than fixed.

- **Four palette tokens appeared to have no compiled utility** — superseded 2026-08-22. The
  finding was an artifact of the measurement: this file is inside the Tailwind scan root, so the
  sentence naming `bg-chart-1`…`bg-chart-5` minted rules for the two forms it spelled literally.
  See *The docs were writing the stylesheet* under Stylesheet. The chart ramp and `rounded-none`
  are now listed explicitly and compile in every form; `--primary-ring`/`--primary-border` are
  still reached only through `surface-primary`, which is by design and is what the header says.

- **`LoaderRing` painted nothing at all — fixed in this run.** `loader-ring.tsx` drew its ring
  with `bg-[conic-gradient(var(--tw-gradient-stops))] from-transparent to-<color>`. Under
  Tailwind v4 the compiled `--tw-gradient-stops` chain starts with `var(--tw-gradient-position)`,
  a property only the `bg-conic` / `bg-linear-*` / `bg-radial-*` utilities set, so without one
  the whole chain is guaranteed-invalid and `background-image` computes to `none`. The ring was
  therefore invisible everywhere it was used — `checkouts/loader.tsx`, `prompt/prompt-icon.tsx`,
  `admin.$id.programs/program.tsx` — not just in previews. A v3→v4 migration leftover. Fixed by
  replacing the arbitrary utility with `bg-conic`, which supplies the position itself; the
  client assets were then rebuilt (see Stylesheet) and `cfg.cssEntry` repointed.

- **Two props were declared but never forwarded — fixed 2026-08-22.** `ErrorStatus` and
  `LoadingStatus` are typed `Omit<StatusProps, "icon">`, so their published prop tables advertised
  `inline` and `gap`, but both implementations passed only `classes` through to `Status`. Both now
  rest-spread, which is the part that stops it recurring: the type is derived, so forwarding by
  name silently drops whatever `StatusProps` gains next. No call site passed either prop, so no
  render changed. (`MultiCombo`'s `label` was listed here too and is **not** a defect — it is
  forwarded at `components/select/multi-combo.tsx:70`.)

- Everything the header names verifies against the build — and since 2026-08-22 that check is
  finally honest, because the doc no longer mints what it names. Verified this way: the seven
  `.btn-*` variants, `.pending`, the three size steps and `btn-icon`, `.field-input`,
  `.field-input-container`, `.field-err`, `.label`, `.label-floating`, `.table`, `.selector-btn`,
  `.selector-opt`, `page`, `table-scroll`, `scrollbars`, `rounded`/`rounded-full`/`rounded-none`,
  `max-w-3xl`, `max-w-prose`, all three `-subtle` pairs, all 25 `chart-*` forms, and the utilities
  `surface-primary`, `eyebrow`, `section-heading`, `section-body`, `hero-heading`,
  `article-heading`, `flex-center`, `absolute-center`, `overlay`. The must-fail set is absent as
  intended: `rounded-sm`/`-md`/`-lg`/`-xl`/`-xs`, `btn-outline`, `btn-link`, raw palette names.

## Preview-authoring gotchas (from the fan-out)

- **The capture harness pins the clock to 2024-05-15** (`page.clock.setFixedTime` in
  `.ds-sync/package-capture.mjs`). Date components that clamp against "today" — `DateField` with
  `minToday`/`maxToday`, and `DateRangeField`, whose `maxToday` defaults to true — silently clamp
  their value segment-by-segment to that date. It looks like a wrong card, not an error. Preview
  dates for those two components are chosen to respect the fixed clock, which is why they don't
  carry the brand's usual `Nov 14, 2025` sample. Bump the fixed time if you need current dates;
  don't remove it (it's there for determinism).

- **`.field-err` is `text-align: right`** (`packages/ui/src/styles/components.css`). On a
  component whose root has no intrinsic width — `Toggle` is `grid grid-cols-[auto_1fr]` — the
  error message flies to the far edge, detached from its control. Previews constrain the width
  (`classes={{ container: "w-80" }}`). Controls that stretch are unaffected.

- **Components with no intrinsic size render invisible** unless the preview gives them one:
  `ContentLoader`, `LoaderRing`, `ImagePlaceholder`. Always wrap with explicit height/width.

- **There is no network in the capture environment** — a remote image `src` never loads. Use an
  inline SVG data URI.

- `lucide-react` resolves fine inside previews via `--node-modules packages/ui/node_modules`
  (it is a real dependency of the package). That is the `--node-modules` value every command in
  this file assumes since the extraction.

- `.design-sync/entry.tsx` also exports `masks` (the `{format, unmask}` presets for
  `MaskedInput`), added because `mask` is a required prop with no default and the presets were
  otherwise unreachable from a design.

- **Only utilities some scanned file writes exist**, because `cfg.cssEntry` is a JIT Tailwind
  build (see Stylesheet) and nothing re-scans at upload time. Since 2026-08-20 the scan covers
  the previews themselves, so a utility you author into a preview now compiles — which was not
  true when the entry was the app's build output. It still does **not** cover a utility invented
  on claude.ai/design that nothing in this repo writes. Gaps are not symmetric between axes
  (`h-16` present, `w-16` absent → `h-16 w-16` renders a 64px-tall box of whatever width the
  content wants) and a missing utility is silent: no error, just a layout that ignores you.
  The numeric box ladder is now guaranteed by `@source inline(...)` (see *The docs were writing
  the stylesheet*), so sizing and spacing no longer need this check. Everything else still does:
  `python3 -c "css=open('.design-sync/.cache/styles.css').read(); print([c for c in ['columns-3','backdrop-blur-lg'] if '.'+c not in css])"`
  — and note the check only became truthful once markdown left the scan scope; before that,
  writing a class name into this file is what made it exist.

- **Previews may compose `platform` components with each other and may import third-party
  packages.** `Group.tsx` renders `Field` and `Select` inside its panel; `Input.tsx` imports
  `lucide-react` directly. What a preview must NOT import is `react-router` — that bundles a
  second copy which doesn't share context with `DsProvider`'s `MemoryRouter`. Components that
  use router links internally (`Breadcrumbs`) are fine; only preview-authored imports are unsafe.

- **Overlays need to be opened synthetically.** `Modal` takes a real `open` prop, but neither
  `Tooltip` nor `HoverCard` does: `Tooltip` holds `useState(false)` and passes it to Ark as a
  *controlled* value (so `defaultOpen` is unreachable too) and `HoverCard` passes nothing. From
  a `useEffect` on a wrapper: click `[data-scope="tooltip"][data-part="trigger"]`, and dispatch
  a `pointerover` `PointerEvent` with `pointerType:"mouse"` on
  `[data-scope="hover-card"][data-part="trigger"]`. Don't query by ref-on-child — Ark's
  `asChild` clones the child and overwrites its ref.

- **`Toaster` needs its toast deferred by a tick.** Toasts are pushed imperatively into a
  module-scope manager, and a component that calls `show_toast` from an effect while sitting
  inside `<Toaster>`'s children runs *before* `ArkToaster` subscribes — the toast is created
  and never picked up, leaving a zero-height group and an empty card. A `setTimeout(…, 0)`
  around the create fixes it. Note also that `createToaster` is configured `overlap: true`, so
  a second simultaneous toast stacks *behind* the first rather than tiling; a "stacked" cell
  reads as a clipping bug and was dropped rather than shipped.

- **`fixed` inside a card resolves against the story root, not the viewport.** The harness's
  cell establishes a containing block, so `fixed bottom-4 right-4` lands wherever that box is
  rather than at the page corner. Compose around it (a narrower panel beside the toast) instead
  of fighting it — and give overlay components `cfg.overrides.<Name> = {"cardMode": "single"}`
  so the product's grid card doesn't stack three backdrops on top of each other.

## Component behaviours a preview (or a design) has to know

Collected across the fan-out; each was hit at least once while authoring.

- **`classes` is `string | object` on most controls** (`components/form/types.ts` + `helpers/
  unpack.ts`): a bare string becomes `classes.container`. `Copier`'s object is
  `{container, icon}` and its `size` is `number | {copy, check}` — the app passes both `size`
  and `classes.icon`. `Group` is the odd one out: it takes `className`, not `classes`.
- **`Label`'s `required` is tri-state and that is its variant axis**: `true` → destructive `*`,
  `false` → muted `(optional)`, `undefined` → nothing. Same on `Field`, `UrlInput`, `MaskedInput`.
- `UrlInput` paints a literal `https://` behind an absolutely-positioned input, so values must
  omit the scheme or it double-prefixes. `MaskedInput`'s `disabled` sets only `aria-disabled` —
  `.field-input` keys off that, so the muted state still renders.
- `Increments` doesn't own its rows: `field(idx)` hands back a render slot and the caller must
  return **exactly two subgrid cells** (amount, description), each `grid grid-rows-subgrid
  row-span-2`. Deviating collapses the parent grid.
- `DateRangeField`'s value is a **spread of two arrays**, not a fixed-length pair — an empty
  start with a filled end renders the end date in the start slot.
- `FileDropzone` treats `value === "loading"` as disabled internally, so its loading and
  disabled states differ only by the spinner.
- `Separator` has no width of its own — it is a `flex` `<p>` whose `::before`/`::after` rules
  are each `w-full`, so a multi-word label gets squeezed onto two lines unless wrapped in
  `whitespace-nowrap`. The app only ever passes `OR`, so it never hit this.
- `ExtLink` ships **zero** styling — `<a target="_blank" rel="noopener noreferrer">` and nothing
  else. An unstyled render is honest, but every real call site passes `className`.
- `Target` renders `null` for `target === null`, a computed goal `<= 0`, or a `NaN` progress —
  pass raw whole-dollar numbers and let `to_usd` format. `target="smart"` doubles from $100
  until it clears progress, so the bar is never less than half full in that variant.
- `Image` falls back to `ImagePlaceholder` when there's no `src` and it isn't loading, or on
  `onError` — unless the caller supplies its own `onError`, which suppresses the fallback.
  `ImagePlaceholder` has no intrinsic size and its glyph is `w-1/2 h-1/2`, so always give it both
  dimensions.
- `Breadcrumbs`' active-crumb style is only reachable by pointing a crumb at `/`, since
  `DsProvider`'s `MemoryRouter` sits there.
- `CurrencySelector` derives disabled from the query state — a literal `QueryState`
  (`{data, is_loading, is_fetching, is_error}`; `is_query()` needs both boolean keys present)
  renders all three of its visibly distinct states.
- `PayoutStatus` deliberately collapses `refunded_loss` into the success "Settled" chip, and its
  `fallback` config is unreachable for the six declared union members.
- `Combo`'s `btn_disp` is required on the trigger variant; real call sites fill it with a country
  flag emoji and fall back to `DrawerIcon`, which puts the chevron on the *left*. Real behaviour,
  but the one pattern here a design agent might imitate unhelpfully.

## States no still capture can reach

Recorded so a future sync doesn't re-litigate them: focus / focus-visible rings on every input,
hover and `data-highlighted` option rows, drag-over on `FileDropzone`, `:user-invalid`,
`MaskedInput`'s caret restoration, `Copier`'s 700ms `text-success` check, `VerifiedIcon`'s
hover tooltip, `DrawerIcon`'s rotation transition (its endpoints are both shown), and the open
option popups on `Combo`/`MultiCombo`/`CurrencySelector` (Ark `lazyMount` + `unmountOnExit`,
portalled through `use_dialog_container` — the closed control carries the component's identity
anyway).

## Preview scope decisions

- No source file read during the fan-out contained anything shaped like an instruction to an
  agent — all comments were ordinary implementation notes.
- `Tooltip`/`HoverCard` each export a `Content` wrapper that `tip` must be wrapped in. They
  collide in one barrel, so `entry.tsx` re-exports them as `TooltipContent` / `HoverCardContent`.
  Their `Arrow` exports are documented no-ops and stay unexported.
- Component-level `.svg` imports resolve (`STORY_LOADERS` maps svg to dataurl), so
  `Target.Text`'s icon renders even though `entry.tsx` avoids asset barrels.

## `extract-props.mjs` no longer beats the config for the selector trio

The combobox unification moved `classes`, `options` and the `Opt<T>` accessors into
`components/select/types.ts` (`FieldProps`, `Source<T>`, `StaticSource<T>`). The extractor
expands only the aliases it knows by name, so for `Combo`, `MultiCombo` and `Select` it now
emits `classes?: unknown` / `options?: unknown` — worse than what `cfg.dtsPropsFor` already
held. It also collapses their unconstrained `T` to `string` and drops `| undefined` off
`value`.

**So do not paste `.cache/props.json` over `cfg.dtsPropsFor` wholesale.** Diff it, take the
prop *sets* (that is what the extractor is still right about), and hand-check the three
selector bodies against `types.ts` and each component's local `Classes` alias:

- `Combo` — `FieldProps` minus `classes`, plus a local `Classes` that adds `input?`.
  `options: Source<T>` has **three** arms: `readonly T[]`, `{items, loading?, error?}`, and
  `{search: (q, signal) => Promise<readonly T[]>}`.
- `MultiCombo` — full `FieldProps` + `Opt<T>`; `options: StaticSource<T>` only.
- `Select` — `FieldProps` minus `classes`/`popup_vars`; its `Classes` renames `control` to
  `button`. `value` is `T | undefined`, not `T`.

## Scope change, 2026-08-20 — the ui extraction

The design system moved out of `apps/platform` into **`packages/ui`** (`@better-giving/ui`),
landed on PR #109 alongside the coherence work. What changed in this directory:

- `cfg.pkg` `platform` → `@better-giving/ui`; `cfg.srcDir` and all 40 `componentSrcMap` entries
  `apps/platform/src/…` → `packages/ui/src/…`.
- `cfg.cssEntry` off the app's hashed build output entirely — see Stylesheet.
- `entry.tsx`'s 41 imports repointed; the 40 preview files import `"@better-giving/ui"` where
  they used to import `"platform"`.
- `--node-modules` is now `packages/ui/node_modules`.
- One stale preview class fixed: `Amount.tsx` carried `rounded-xs`, which the coherence work
  deliberately made **uncompilable** (the radius ladder is reset to `initial` so only `rounded`
  survives). It was silently unstyled; it is `rounded` now. This is the closed ladder doing its
  job — a preview is just another call site.
- `--form-primary`/`--form-secondary` moved from `apps/platform/src/index.css` into
  `packages/ui/src/styles/theme.css`. The package's own `btn-form-primary`, `form-*` color
  utilities and `LoaderRing` reference them, so a package that doesn't define them renders those
  surfaces with an unset var in any host that isn't platform — which the validator caught here as
  two extra `[TOKENS_MISSING]` entries. Platform's compiled CSS is byte-identical across the move
  (same content hash), and the per-embed override at `#donation-container` is untouched.

## Scope change, 2026-08-20 — the combobox unification

`CurrencySelector` is gone from the repo — the unification replaced it with `Combo`, so this
sync deleted it remotely. `Combo` and `MultiCombo` also moved group: `components/selector/` →
`components/select/`. `Select` stayed at `components/selector/`. The remote still carried the
old paths, which is why the re-sync produced deletes as well as writes.

`Combo`'s published contract had been stale since before the unification — it was missing
`popup_width`, `indicator`, `allow_custom` and the async options arm entirely.

## Scope change, 2026-08-21 — `show_toast` reaches the export surface

Validating `conventions.md` against the build turned up a name that did not resolve.
`conventions.md` tells the design agent toasts "are pushed imperatively with `show_toast(...)`",
but `entry.tsx` exported only `Toaster`, so `window.BetterGiving.show_toast` was **undefined**. A
design following the documented call mounted `<Toaster>` and then nothing ever appeared — silent,
and invisible to every mechanical gate: the bundle built, the card rendered, validate exited 0.
The card only rendered because `Toaster.tsx` reached around the surface into the source module,
which a design cannot do.

Fixed by exporting it (see *Why there is a hand-written entry*) rather than by deleting the line
from `conventions.md` — `show_toast` is already public API of `packages/ui`, and a `Toaster` with
no way to push a toast is not worth publishing. `Toaster.tsx` now imports both halves from
`"@better-giving/ui"` like every other preview, so the card exercises the same path a design takes.

**The general shape:** a component whose API has a non-element half (an imperative function, a
preset object, a hook) has a half `cfg.componentSrcMap` cannot carry, so it reaches the design only
if `entry.tsx` names it. Nothing checks this — the gap is only visible by reading `conventions.md`
against the bundle's export list, which is the validation pass the skill runs before upload.

## Scope change, 2026-08-22 — the layout vocabulary

`conventions.md` gained a *Page shape and scrollers* section: `page` (the one page width — width
curve plus gutter, placed per band and never hoisted), `table-scroll` (the wrapper a wide table
sits in) and `scrollbars` (the thin themed skin). Reading measure is documented as a cap on the
text column one level in, not as a second page width.

**Nothing was added to `cfg.componentSrcMap` or `entry.tsx`, and that is correct.** These are CSS
utilities, not components — the repo chose utilities over a `<Container size={…}>` precisely
because a runtime-composed class compiles to nothing under JIT. A utility reaches the design
project through the **stylesheet**, and it is already there: `apps/platform/src` is one of the
three scanned scopes and writes `page` 137 times, `table-scroll` 42. Verified in the rebuilt
`.cache/styles.css`.

The consequence is a dependency worth naming: these three exist in the published vocabulary
**because the app writes them**, not because anything here declares them. If a future change ever
moved the page shape out of `apps/platform/src`, the class would vanish from the design project
silently — the same failure mode as any other JIT gap, one level up. A `@source inline(…)`
safelist in `styles-entry.css` would pin them; not doing it yet, because the app-scope dependency
is what every other utility in this bundle already has.

Chrome stays unpublished, and `conventions.md` now says so out loud — a design starts below the
header and ends above the footer.

## Scope change, 2026-08-22 — the modal size set (#111)

`Modal` gained a `size` prop: a closed geometry set (`packages/ui/src/helpers/modal-box.ts`) of
`panel` 448 / `sm` 512 (the default) / `md` 672 / `lg` 768, each one centering itself, capping its
height at `90dvh` and scrolling its own overflow, plus `"none"` for the dashboard's edge-anchored
drawer. Three things followed in this sync:

- **`cfg.dtsPropsFor.Modal` was hand-updated.** This is the drift the risks list warns about, caught
  by diffing `packages/ui/src/components/` since the last synced sha. Nothing failed — the preview
  rendered and validate exited 0 the whole time; only the published contract would have been wrong.
- **`previews/Modal.tsx` was rewritten off the retired idiom.** It hand-spelled
  `fixed-center … w-full sm:max-w-md rounded` on every cell, which is exactly what #111 replaced. A
  preview is imitated by the design agent, so a stale one teaches the retired spelling to every
  design. `classes` now carries surface and padding only; `size` carries the geometry. The three
  cells still grade `good`, and the tier axis is visible in the sheet (`panel` cells narrower than
  the default-`sm` one).
- **`modal_box` / `ModalSize` were deliberately NOT added to the export surface.** They are exported
  from `@better-giving/ui/helpers`, but a design reaches the tiers through the `size` prop, so
  nothing callable is missing — unlike the `masks` / `show_toast` cases. If a future component ever
  takes a *class string* from `modal_box` rather than a tier name, that changes.

`conventions.md` gained a matching paragraph under *Page shape and scrollers* — dialog size is a
closed set the same way radius and page width are, and without it the agent hand-spells the
geometry (and an arbitrary width may not compile at all).

## conventions.md drift found 2026-08-22 — `prose`

The validation pass against the fresh build caught one name that does not exist: the header told the
agent to cap reading measure with the `prose` class, and the compiled stylesheet has only
`.max-w-prose` — there is no typography plugin anywhere in `styles-entry.css` or
`packages/ui/src/styles/`. A design following that line renders an uncapped paragraph, silently.
Corrected to `max-w-prose`. Everything else the header names verified — but read that with the
next two sections in hand: this pass ran while the docs were still minting utilities, so the color
half of it was circular (the header named `chart-1…5`, and naming it is what made it compile), and
the ladder half was measured against whatever the app happened to write. The button, field,
selector, table, utility and page classes are the part of that all-clear that stands on its own.

**Run this pass every sync.** It is cheap (grep the header's names against `ds-bundle/_ds_bundle.css`
and the `components/<group>/<Name>/` tree) and it is the only thing that catches a header that has
quietly stopped being true.

## conventions.md drift found 2026-08-22 (second pass) — the color set

With the docs no longer writing the stylesheet (previous section), the header could finally be
measured honestly, and the color section turned out to promise three things the build did not have:

- **`text-card-fg`, `text-sidebar-fg`** — the ink row promises "the `-fg` partner of every surface
  above". `text-popover-fg` compiled and `text-card-fg` did not, for no reason other than a preview
  happening to write the one and not the other.
- **`border-input`** — the lines row names `border`, `input`, `ring`; only `border-border` and
  `outline-ring` had rules.
- **`background-fg`** — promised by that same "every surface" phrasing and **not a token at all**.
  `--color-background`'s ink is plain `--color-fg`; there is no `--color-background-fg` in
  `theme.css`. This one is fixed in the prose, not the build.

Fixed the first two the same way the chart ramp and the box ladder were: an `@source inline(...)`
in `styles-entry.css` listing the semantic set across `bg-`/`text-`/`border-`/`ring-`. Every name in
that list is a registered `--color-*` token in `packages/ui/src/styles/theme.css`, so this adds no
vocabulary the system didn't already mean to have — it only stops the published set from depending
on which tokens the app source happened to reach for. +82 rules, none removed.

**`border-primary-border` and `ring-primary-ring` were deliberately NOT safelisted.** They are
registered tokens, but the design decision is that `surface-primary` rebinds `--ring`/`--border`
for you, and the header used to describe the two utilities as something you could reach for
directly. Reworded instead: the pair exists as tokens, has no utility, and `surface-primary` is
the way. Closing the escape beats widening it.

## Checking the header is now one command

`.design-sync/check-conventions.mjs` (committed) replaces the hand-rolled grep the previous two
sections describe:

```sh
cd apps/design-sync && node .design-sync/check-conventions.mjs   # exits non-zero on a broken promise
```

It holds the header's enumerated claims as data — the surface/ink/lines sets, the chart ramp, both
ladders, the button and utility class lists, the radius trio — plus a `MUST_BE_ABSENT` list for the
names the header says do **not** exist (`rounded-lg`, `btn-outline`, `border-primary-border`, …), so
a fix in one direction can't quietly break the other. It also checks every backticked or JSX-tagged
component name against the `components/` tree and the bundle's export list.

Two things about it that matter:

- **The claim lists are the contract, not a scrape of the prose.** Rewriting a promise in
  `conventions.md` without editing the corresponding list in the script means the script keeps
  verifying the old promise. Change both in the same commit.
- **Tailwind escapes `.` `/` `[` `]` `:` `%` `@` `(` `)` in the emitted selector** — `p-1.5` lands
  as `.p-1\.5`. A naive grep for `.p-1.5` finds nothing and reports a false miss on every
  fractional step; the script's `has()` accounts for it. The first draft of it did not, and claimed
  98 missing utilities that were all present.

## The converter's own deps live in `.ds-sync/node_modules`

`esbuild`, `ts-morph` and `@types/react` are installed **inside the staged `.ds-sync/`**, isolated
from the repo's workspace (this app declares only `playwright` and `@types/react` itself). The
re-sync instruction says to re-copy the staged scripts with `cp -r`; **do not `rm -rf .ds-sync`
first** — that takes the installed deps with it and the driver dies on
`Cannot find package 'esbuild'` before it prints anything useful. If it does get wiped:

```sh
cd apps/design-sync/.ds-sync
echo '{"name":"ds-sync-deps","private":true}' > package.json
pnpm i --ignore-workspace esbuild ts-morph @types/react
```

`--ignore-workspace` because `.ds-sync/` is not a workspace member. pnpm blocks postinstall scripts
by default and esbuild needs its own, so add `"pnpm": {"onlyBuiltDependencies": ["esbuild"]}` to
that `package.json` — but add it *alongside* the dependencies, not by rewriting the file, or the
next install removes all three packages.

## Re-sync risks — the watch-list for the next run

What can silently go stale or wrong, in rough order of how expensive it is to miss:

- **Running `/design-sync` from the repo root instead of `apps/design-sync`.** The skill looks for
  `.design-sync/config.json` relative to the cwd; not finding one, it treats the run as a first-time
  import and creates a second project. Nothing warns. See *Where this runs from*.
- **`cfg.dtsPropsFor` drifting from the source.** Hand-maintained, and the extractor can no longer
  regenerate it (above). Nothing fails loudly when it rots — the previews still render and validate
  still exits 0; only the published contract is wrong. On every re-sync, diff the changed
  components' props against their entries. To find which components changed since the last sync:
  `git diff <last-sync-sha> HEAD -- packages/ui/src/components/`.
- **Previews compiling but passing dead props.** Same silence — but now caught mechanically by
  `pnpm --filter design-sync typecheck`, in CI and on commit.
- **A documented API half that is not on the export surface.** `show_toast` was this until
  2026-08-21 (above) and nothing mechanical caught it. Whenever `conventions.md` or a `docs/*.md`
  names something callable, confirm it is in the bundle's export list — that check is the whole
  defence.
- ~~**`FileDropzone` is ahead of what was published.**~~ **Shipped 2026-08-21.** The rework (link
  moved out of the `role="button"` drop area, file name instead of the raw url, the four machine
  states rendering as their own text, a polite `role="status"` region) reached the project in that
  sync — `FileDropzone.prompt.md` was the single changed artifact. `dtsPropsFor` never drifted:
  props are unchanged apart from `dropzone_name`, which was already in the config.
  Worth keeping as a worked example, because the sync's own partitions did **not** flag it:
  verification keys off the authored preview `.tsx` + config, so FileDropzone read as `unchanged`
  and skipped re-grading, while the upload partition (sourceHashes) correctly shipped it. A
  component rework with an untouched preview is invisible to the verification partition **by
  design** — check the upload partition, not the verification one, to answer "did my change ship?"
- **The stylesheet is a JIT build with three source scopes** (`packages/ui/src`, `.design-sync/previews`,
  `apps/platform/src`). Narrowing any of them silently removes utilities from the published
  vocabulary — and the auto-detected scope is now bounded by `apps/design-sync/package.json`, so
  the whole-repo overspill is gone (see Stylesheet).
- **`.cache/styles.css` is gitignored**, so a fresh clone has no `cssEntry` until it is compiled.
  `pnpm --filter design-sync styles`. A missing one is loud (`! cssEntry: … not found — skipped`).
- **`conventions.md` naming something the build doesn't have.** `prose` was this on 2026-08-22,
  then the color set was (both above). The header is trusted verbatim by the design agent, and a
  name with no rule fails silently. Now mechanical: `node .design-sync/check-conventions.mjs` after
  every build whose stylesheet or header moved, before uploading. Its claim lists are hand-
  maintained, so a reworded promise needs the script edited in the same commit.
- **Node is pinned to 24 (`.nvmrc`, `engines`) but the converter runs fine on newer.** This sync ran
  on Node 26.7.0; pnpm prints an `Unsupported engine` warning for every member and nothing else
  happens. Not worth chasing, but don't read those warnings as a sync problem.
- **The capture harness pins the clock to 2024-05-15.** Date previews are authored around it.
