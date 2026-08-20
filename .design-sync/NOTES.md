# design-sync notes — better-giving

Repo-specific gotchas for future syncs. Read this before re-running anything.

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

2. **`@types/react` had to be linked at the repo root.** `lib/dts.mjs` derives node_modules from
   the package dir and only walks *up* looking for `@types/react`; it never looks down into
   `apps/platform/node_modules`, where pnpm actually put it. Fix, once per clone:
   `mkdir -p node_modules/@types && ln -sfn ../../apps/platform/node_modules/@types/react node_modules/@types/react`
   Without it every emitted `.d.ts` body collapses to `any`/empty.
   (Still true after the extraction — the walk starts from the repo root, since `cfg.entry`
   puts `PKG_DIR` there.)

## Prop contracts are generated, not hand-written

`cfg.dtsPropsFor` holds all 41 bodies. They are NOT hand-authored — the converter's extractor
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

`cfg.extraFonts` points at the **fontsource packages**, not at the app's build output. They
resolve under `apps/platform/node_modules` and still do after the extraction: `packages/ui`
declares the `--font-quicksand`/`--font-gochi` tokens but depends on neither fontsource package,
so platform is the only place on disk they exist. `extraFonts` is bounded to the git workspace
root (not `PKG_DIR`), so pointing across a member is legal. A non-platform consumer of
`@better-giving/ui` gets the token and no font — worth closing if `apps/docs` adopts the system. The
compiled app CSS references `/assets/*.woff2` (absolute, root-relative) which resolve to nothing
on disk, so the converter dropped them as dead `@font-face` blocks and shipped zero font files.
The fontsource packages carry correct `@font-face` CSS with relative `./files/*.woff2`.
Quicksand Variable and Gochi Hand are the only two families the system uses.

## Stylesheet

`cfg.cssEntry` points at `.design-sync/.cache/styles.css`, compiled from
`.design-sync/styles-entry.css` (committed; the output is gitignored):

```sh
packages/ui/node_modules/.bin/tailwindcss -i .design-sync/styles-entry.css -o .design-sync/.cache/styles.css
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

Note `packages/ui` also builds its own `dist/styles.css` (`pnpm --filter @better-giving/ui
build`). This sync does **not** consume it — it covers only the package's own source, so it
carries neither the previews' layout utilities nor the app's vocabulary. It exists for tooling
that is bounded to the package directory.

Check a utility before authoring against it:
`python3 -c "css=open('.design-sync/.cache/styles.css').read(); print([c for c in ['w-16','h-20'] if c not in css])"`

## Playwright

Chromium is already cached at `~/Library/Caches/ms-playwright/` (builds 1217 and 1234).
The repo pins `playwright@1.59.1`, whose `browsers.json` pins chromium **1217** — so it matches
and **no download is needed**. The validator imports `playwright` relative to `.ds-sync/`, so
link it there once per clone:
`ln -sfn "$PWD/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright" .ds-sync/node_modules/playwright`

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

41 components, deliberately narrowed to the reusable primitives. App-specific machinery is
excluded on purpose: `csv-exporter`, `img-editor`, `donate-methods`, `donation/**`, `token-field`,
`youtube-player`, `referrals`, `bank-details`, `rich-text`, `chrome`, `header`, `footer`,
`goal-selector`, `fundraiser`, `video`. Widening scope means adding to BOTH `cfg.componentSrcMap`
and `.design-sync/entry.tsx`.

Note the repo has **no Button component** — buttons are raw `<button className="btn btn-primary">`.
That is a real property of the system, not a gap in the sync.

## Findings the repo may want to act on

Surfaced while validating `conventions.md` against the compiled stylesheet. These are **repo**
observations, not sync problems — recorded here rather than fixed.

- **Four palette tokens have no compiled Tailwind utility**, because no scanned source writes
  that utility form, and Tailwind v4 only emits what it sees:
  `bg-warning-subtle`, `bg-chart-1`…`bg-chart-5`, `border-primary-border`, `ring-primary-ring`.
  The tokens themselves are defined in `packages/brand/src/colors.css`. `bg-warning-subtle` is the
  notable one — `design-system.md` already flags `--warning-subtle`/`-fg` as "defined, zero call
  sites", and this confirms it end to end: a design written against that name renders unstyled.
  `--primary-ring`/`--primary-border` are reached only through the `surface-primary` utility,
  which rebinds `--ring`/`--border`, so their absence as standalone utilities is by design.
  `conventions.md` documents all four as unavailable.

- **`LoaderRing` painted nothing at all — fixed in this run.** `loader-ring.tsx` drew its ring
  with `bg-[conic-gradient(var(--tw-gradient-stops))] from-transparent to-<color>`. Under
  Tailwind v4 the compiled `--tw-gradient-stops` chain starts with `var(--tw-gradient-position)`,
  a property only the `bg-conic` / `bg-linear-*` / `bg-radial-*` utilities set, so without one
  the whole chain is guaranteed-invalid and `background-image` computes to `none`. The ring was
  therefore invisible everywhere it was used — `checkouts/loader.tsx`, `prompt/prompt-icon.tsx`,
  `admin.$id.programs/program.tsx` — not just in previews. A v3→v4 migration leftover. Fixed by
  replacing the arbitrary utility with `bg-conic`, which supplies the position itself; the
  client assets were then rebuilt (see Stylesheet) and `cfg.cssEntry` repointed.

- **Three props are declared but never forwarded.** `ErrorStatus` and `LoadingStatus` are typed
  `Omit<StatusProps, "icon">`, so their prop tables advertise `inline` and `gap`, but both
  implementations pass only `classes` to `Status`. `MultiCombo` declares `label` and the JSX
  drops it — real call sites render a separate `<Label>` above. The generated `.d.ts` is
  type-accurate, so the docs (`.design-sync/docs/`) carry the caveat instead; the repo fix is
  either to wire the props up or to delete them from the types.

- Everything else the header names verifies: all seven `.btn-*` variants, `.pending`,
  `.field-input`, `.field-input-container`, `.field-err`, `.label`, `.label-floating`, `.table`,
  `.selector-btn`, `.selector-opt`, `.selector-opts`, and the utilities `surface-primary`,
  `eyebrow`, `section-heading`, `section-body`, `hero-heading`, `article-heading`, `flex-center`,
  `absolute-center`, `overlay`, `check-field`, `checkbox`, `radio`, `date-input`.

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
  Check before authoring:
  `python3 -c "css=open('.design-sync/.cache/styles.css').read(); print([c for c in ['w-16','h-20'] if c not in css])"`

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
