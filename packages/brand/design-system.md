# Design tokens — what each one is for

Ledger for the palette in `src/colors.css`. Values live in the CSS; this file says
what to reach for and what has already been measured, so nobody rediscovers it.

Contrast figures are WCAG 2.x ratios measured on the **shipped hex** (the sRGB
round-trip of the `oklch()`), not on the raw oklch. AA body text needs 4.5:1;
large text (≥24px, or ≥18.66px bold) and meaningful non-text need 3:1.

**Two kinds of number live in this file and they age differently.** A **ratio**
is measured against a token value and only changes if that value changes — trust
it. A **call-site count** is a grep over `apps/platform/src` at the time of
writing and drifts with every commit; each one is labelled and carries the
command that produced it. Re-run it rather than quoting it.

## Two consumers, one palette

| | app | email |
| --- | --- | --- |
| file | `src/colors.css` | `src/colors.ts` |
| form | `:root` + `.dark`, real `oklch()` | flat hex, **light half only** |
| dark mode | yes | no — mail clients get the light values |
| `var()` / `color-mix()` | fine | **impossible** |

`src/colors.test.ts` parses `:root` and asserts `colors.ts` matches it key-for-key.
Two rules fall out of that test, and both are load-bearing:

- **A token defined as `var()` or `color-mix()` has no email twin, by rule.** The
  test only picks up literal `oklch(...)` declarations, so aliases
  (`--sidebar-fg`, `--primary-ring`, `--primary-border`, `--form-*`) are invisible
  to email. If email needs a color, author it as a literal `oklch()` in `:root`.
- **Adding a literal `oklch()` token to `:root` means adding its hex to
  `colors.ts` in the same commit**, or the build fails. The mirror is mechanically
  complete, not curated — that is why `chart_*` and `sidebar` are in it despite no
  email using them.

## Resting surfaces — what each one is for

Every token here is a **fill**, and its `-fg` is the only ink authored for it.
None of them carries brand hue: `--primary` is the brand action color and
`--accent` is the person-caused state (own section below).

| token | what it is |
| --- | --- |
| `--background` / `--fg` | the page itself — `#ffffff` light, slate-950 dark. `--input` is set to this same value in both themes on purpose; see "decisions that look like bugs" |
| `--card` / `--card-fg` | any panel, tile, table shell or row lifted off the page. **Identical to `--background` in light** (both `#ffffff`); the two only separate in dark (slate-900 on slate-950). So in light a card is read by its `--border`, not by its fill — which is why that border being 1.23:1 is a call worth knowing about |
| `--popover` / `--popover-fg` | transient layers only: menu, combobox and select lists, dialog, toast. Same value as `--card` in both themes; the separate name exists so a floating layer's fill can move without moving every panel |
| `--muted` / `--muted-fg` | the recessive band — table zebra, skeletons, the neutral half of a status pill, and the **disabled fill for every `.btn` variant**. `--muted-fg` is the app's general de-emphasised ink on *any* surface, not only on `--muted`; that is why it is in the fill-or-ink table below and the other `-fg`s are not |
| `--secondary` / `--secondary-fg` | second-tier action, plus chips and tags. The button does **not** rest on it: `.btn-secondary` rests on `--card` with a `--border`, takes `--secondary` on hover and a darker mix of it on active. So `--secondary` is a *state* fill for the button and a *resting* fill for chips — check which one you are in before assuming its ink |
| `--sidebar-*` (8 tokens) | the dashboard sidebar's own set, so the nav chrome can diverge from the page without touching app tokens. It currently does not: `--sidebar` is authored equal to `--background`, and the other seven are `var()` aliases of `--fg` / `--primary` / `--primary-fg` / `--accent` / `--accent-fg` / `--border` / `--ring`. One call site today (`bg-sidebar` in `layout/dashboard/sidebar/sidebar.tsx`). Being aliases, seven of the eight have no email twin by the rule above — `--sidebar` is the literal, so it is the one in `colors.ts` |

## Fill or ink — the distinction that causes the most drift

A token being *a color* does not make it *a text color*. Reaching for
`text-<token>` on a fill token is how both of this system's live contrast failures
got in.

| token | fill | legible as text | on `--card`/`--background` | notes |
| --- | --- | --- | --- | --- |
| `--primary` | yes | **yes** | 5.49:1 | also the ink for text-only controls and `--ring` |
| `--success` | yes | **yes** | 5.06:1 | 4.62:1 on `--muted`, 4.58:1 on `--accent` — passes, no headroom. 4.41:1 on its own `success/10` tint — misses; see the pair rule |
| `--destructive` | yes | **on white only** | 4.52:1 | 4.12:1 on `--muted`, 4.09:1 on `--accent` — **fails** on tints |
| `--warning` | yes | **no, at any size** | 2.15:1 | fill only. Never `text-warning`. Use `--warning-subtle-fg` |
| `--fg` | no | yes | 17.85:1 | |
| `--muted-fg` | no | yes | 7.58:1 | 6.88:1 on `--muted` |
| `--*-fg` | no | yes | — | ink for its own paired surface, nowhere else |

Dark mode is more forgiving and inverts the `--warning` case: on `--card`,
`--primary` is 6.62:1, `--destructive` 6.45:1, `--success` 9.29:1, `--warning`
10.69:1, `--muted-fg` 6.96:1. **A warning color that works in dark says nothing
about light** — check the light value, it is always the tighter one.

Icons are Lucide. A *meaningful* icon (one carrying information no adjacent text
carries) needs 3:1, so `stroke-warning` on white at 2.15:1 does not qualify — give
it `--warning-subtle-fg`. A decorative icon beside a text label is exempt.

## The pair rule

**A tinted surface is authored as a token with its own `-fg`, and the two are
contrast-checked together.** A surface without its ink is half a token.

The anti-pattern it replaces is `bg-<token>/10 text-<token>` — an alpha tint of a
fill color, carrying that same fill color as text. The tint and the ink share a
hue and the tint barely moves off the page color, so the pair buys almost no
contrast over the ink on bare white and lands wherever that ink already was,
minus a little. **How badly it fails depends entirely on the ink**, so measure
before assuming, and measure before assuming it is fine:

| band | measured (light) | |
| --- | --- | --- |
| `bg-warning/10 text-warning` | **1.99:1** | illegible; the case that forced the pair |
| `bg-destructive/10 text-destructive` | **3.92:1** | fails body |
| `bg-success/10 text-success` | **4.41:1** | marginal miss — see the named gap |
| `bg-primary/10 text-primary` | 4.77:1 | passes |

Use an authored pair wherever one exists.

| pair | what it is |
| --- | --- |
| `--destructive-subtle` / `--destructive-subtle-fg` | error panel, banner, or row that carries error copy — not a filled control |
| `--warning-subtle` / `--warning-subtle-fg` | warning band, same shape |

Both bands also take neutral body copy: `--fg` is 15.57:1 on `--warning-subtle`
(light), 12.99:1 on `--destructive-subtle` (dark). Only the *warning-colored* copy
needs the `-fg`.

For a filled control, the pair is the fill and its own `-fg`
(`--warning` + `--warning-fg`, 6.97:1) — that is a different job from the band.

### The rule only closes when one element carries both

**A pair is safe when the surface and its ink are set on the same node**
(`bg-destructive-subtle text-destructive-subtle-fg`). That is the shape that
migrated cleanly. **Three other shapes could not take the swap, across five call
sites** — check for these before assuming a band is a one-line fix:

- **A child owns the ink** (three sites). `_app.donation-calculator/{table,result1,result2}.tsx`
  tint the container, while `usd.tsx` and each panel's own icon set
  `text-destructive` on the child. Inheritance does not rescue it: between two same-layer color utilities
  the winner is **stylesheet order, not attribute order**, so a
  `text-destructive-subtle-fg` container loses to the child's own utility. And the
  child cannot simply switch — `Usd` also renders on `--card`, where
  `--destructive` passes. Still failing at 3.91:1; needs a variant, not a swap.
- **The tint is an interaction state with two rungs** (one site).
  `hover:bg-destructive/10 active:bg-destructive/20`
  (`dashboard.subscriptions/route.tsx`). The pair covers hover only — see the
  named gap below.
- **The pairing was never the alpha convention** (one site). `bg-primary text-destructive`
  at **1.21:1** (`_app.marketplace_.$id/page-error.tsx`), whose link's
  `hover:text-primary` on that same parent is **1:1**. Worse than anything the
  alpha convention produced, and invisible to a sweep grepping for `destructive/`.

**The generalisable line: a fill token and an ink token are only safe together if
someone measured *that* combination.** The closed token set prevents inventing a
color; it does nothing to prevent pairing two legitimate ones that were never
checked against each other. Every remaining contrast failure in the app is that
hole, not an invented value.

### Named gap: no pressed step for the subtle pairs

`--destructive-subtle` is a single surface. A control whose *hover* is the subtle
tint has no authored **pressed** rung — and the obvious fallback fails:
`--destructive-subtle-fg` on `destructive/20` measures **4.33:1**, under the floor.
Open gap in the system, not a defect at the call site. Not yet authored; the
decision has not been put to the user. Same gap will apply to `--warning-subtle`
the first time a control hovers into it.

### Named gap: no `--success-subtle` pair — but a weak case

Red and amber got authored pairs; green did not, so `bg-success/10 text-success`
is still live. **It is a marginal miss, not a collapse, and the ledger should not
imply parity with the other two.** `--success` renders `#007f4e`; the
`success/10` band over white renders `#e6f2ed`; the green on that band measures
**4.41:1** against a 4.5:1 floor. Compare `--destructive` on its tint at 3.92:1
and `text-warning` at 1.99:1 — those are the cases that forced a pair.
`--success` on `--card`/`--background` is 5.06:1 and passes.

Five sites, all carrying real text (counted, will drift):

- `routes/_app.resources/resource-card.tsx:7` — "guides" badge
- `routes/dashboard.funds/fund.tsx:29` — `completed` status
- `routes/admin.$id.funds/fund-item.tsx:36` — `completed` status
- `routes/admin.$id.forms/table.tsx:146` — active/inactive pill
- `routes/dashboard.forms/table.tsx:145` — active/inactive pill

The last two are the sharper argument for minting the pair: their *inactive*
branch is `bg-muted text-muted-fg`, which passes, so the two halves of one
control are held to different standards. Whether to mint
`--success-subtle`/`-fg` is the user's call, not a builder's.

The other `bg-<token>/10` family — `bg-primary/10 text-primary`, three sites —
is **not** an instance of the anti-pattern and needs no pair: all three are
icon-only badges (`routes/dashboard._index.tsx:80`,
`routes/unlock-us-donations/{scenarios,borders}.tsx`) with no text node, and the
combination measures 4.77:1 regardless.

### `--destructive-subtle` / `-fg`

5.04:1 ink on surface, 5.80:1 ink on `--card` (light); 5.74:1 and 7.52:1 (dark).
`--destructive` itself is 3.92:1 on the light subtle surface and **must never be
painted on it**.

### `--warning-subtle` / `-fg`

Warning takes the **pair** shape rather than a lone ink token, because the app
tints warning bands in several places and has no legible warning text color at
all (call-site counts live in one place — the Status table). Unlike
destructive — where `--destructive` is the ink on white and `-subtle-fg` only the
ink on the tint — `--warning` is legible nowhere, so **`--warning-subtle-fg` is
*the* warning ink everywhere**, including on `--card` and `--background`. One
value, one name; a second name for the same value would be a drift trap the test
cannot catch.

Light `--warning-subtle-fg` (#995600) clears 4.5:1 on every light surface in the
palette: 5.70:1 on white/`--card`/`--background`, 5.20:1 on `--muted`, 5.16:1 on
`--accent`, 4.97:1 on `--warning-subtle`, 4.89:1 on `--secondary` (the tightest).
Dark (#fcc959): 11.59:1 on `--card`, 13.10:1 on `--background`, 8.62:1 on
`--warning-subtle`, ~7.9:1 on `--accent` (the tightest).

## `--accent` is not hover-only

In this system `--accent` is **both** the person-caused-state surface (hover fill,
selected row — `.btn-ghost:hover`, `.selector-opt[data-selected]`) **and** the
alternating resting band on the marketing pages, ~14 sites. That second job
constrains its value: a resting band carries de-emphasised body copy, so
`--muted-fg` on `--accent` must clear 4.5:1. In dark that forced L 0.33 (4.76:1);
at L 0.4 it was 3.58:1 and failing. Do not brighten `--accent` toward a pure hover
tint without re-checking `--muted-fg` on it.

`--accent` carries no brand hue as a resting fill beyond that tint. Brand action
color is `--primary`.

## Decisions that look like bugs

Recorded so they are not "fixed" by someone reading them as oversights.

- **`--border` is deliberately below 3:1.** 1.23:1 on `--card` in light, 1.72:1 in
  dark — under WCAG 1.4.11 for a control boundary. This is a call to keep the light
  look; **the focus ring carries control identification instead**. It compounds
  with `--input`, which is the page color in both themes (`#ffffff` light,
  slate-950 dark) — a field is identified by its boundary, not its fill, and that
  boundary is intentionally faint. Change one and re-check the other.
- **`--destructive` is not darkened to clear tints.** At L 0.541 it would clear all
  three surfaces (5.62 white / 5.13 muted / 5.09 accent), but moving it is a
  system-wide change across 40+ call sites. The tinted case is served by
  `--destructive-subtle` instead.
- **`--ring` equals `--primary`**, so a flush ring on a `--primary` fill is 1.00:1.
  Two mitigations, both intentional: `outline-offset: 2px` on every `.btn`, and the
  `surface-primary` utility, which rebinds `--ring`/`--border` to
  `--primary-ring`/`--primary-border` (5.48:1 / 4.07:1 on `--primary`) for anything
  drawn on a brand-filled panel. Use `surface-primary`, not bare `bg-primary`,
  whenever the fill contains a control.
- **`--form-primary` / `--form-secondary` are tenant values**, set at runtime from
  `don.config.accent_primary` on `#donation-container`. Their contrast **cannot be
  guaranteed** — `.btn-form-primary` pairs an arbitrary tenant color with
  `--primary-fg`. They default to `--primary`/`--secondary`. Do not treat them as
  brand tokens and do not use them outside the donation form.
- **`--chart-1…5` are stock shadcn defaults**, not brand-derived. Light `--chart-5`
  (#fe9a00) is near-identical to `--warning` (#f59e09), so a chart swatch and a
  warning badge read the same on one page. Fine inside a chart, a hazard next to
  one.

## Trust the hex, or trust the oklch?

Some inline `/* #hex */` comments are **provenance** — the brand hex the `oklch()`
was converted *from* — not what the `oklch()` renders. Where they disagree, the
`oklch()` is the value and `colors.ts` holds what it actually renders:

| token | comment says | actually renders |
| --- | --- | --- |
| `--primary` | `#1e6dab` | `#1d6dab` |
| `--warning` | `#f59e0b` | `#f59e09` |

Sub-perceptual, but it has already misled a contrast measurement once. **For math,
use `colors.ts`.** For "what brand color is this", the comment.

## State ladder

One convention, applied in `apps/platform/src/styles/components.css`:

| state | value |
| --- | --- |
| hover | `color-mix(in oklch, var(--X) 90%, black)` |
| active | `color-mix(in oklch, var(--X) 85%, black)` |
| disabled / pending | `--muted` fill, `--muted-fg` ink |
| focus | `outline: 2px solid var(--ring)`, `outline-offset: 2px` — same for every variant |

Derived at use-site, not named tokens. `--radius` is the one radius system;
`--radius-xs…3xl` are computed from it in `index.css`. Don't author parallel values.

## Named gap: color that lives outside this file

The ledger's authority rests on the palette being the only place a color is
declared. Two pre-existing holes in that, both recorded rather than fixed:

- **`--color-peach` (`#fde3d8`) and `--color-lilac` (`#eae2fc`) are declared in
  `apps/platform/src/index.css`**, in the app's own `@theme` block, not here.
  They are real decorative tokens — peach and lilac fill the marketing gradient
  washes on `referral-program`, `simplify-fundraising-maximize-impact` and
  `the-smart-move-…`, and lilac tints the `templates` badge in
  `_app.resources/resource-card.tsx`. Each has **no role entry, no `.dark`
  value, and no email twin**, and `colors.test.ts` cannot see them. Either they
  are system tokens and belong in `colors.css` with a dark value, or they are
  marketing-only decoration and should say so where they are declared. Not
  decided; the user's call. (`--color-black`/`--color-white` in the same block
  are literal neutrals, not this problem.)
- **Raw hex still leaks into arbitrary Tailwind classes**, which
  `apps/platform/CLAUDE.md` forbids outright: **10 distinct hex literals across
  8 lines in 6 files** — `content/benefits/index.ts:14`,
  `pages/admin/media/video-preview.tsx:27`,
  `routes/admin.$id.donations.edit-alloc/slider.tsx:72,74`,
  `routes/admin.$id.integrations/route.tsx:12`,
  `routes/_app.resources/resource-card.tsx:6`,
  `routes/unlock-us-donations/hero.tsx:11,20`. Counted, will drift:
  `rg -n '#[0-9a-fA-F]{3,6}\]' apps/platform/src`. This is a **conformance** gap,
  not a legibility one — `#6b21a8` on `lilac/40` measures 7.99:1.

  One of them is a genuine question the palette has never answered:
  `text-[#FF4F00]` is **Zapier's brand orange**, and a third-party mark's color
  is not ours to re-derive into oklch. The system has no policy for that. Until
  it does, treat a third-party brand color as the one legitimate exception —
  and even then it should be a named token declared next to the component that
  owns it, with a comment saying whose brand it is, not an inline arbitrary
  value indistinguishable from a builder inventing a shade.

## Status

| token | status |
| --- | --- |
| the shadcn semantic set, `--success`, `--warning`, `--sidebar-*`, `--chart-*` | live |
| `--primary-ring`, `--primary-border`, `--form-*` | live |
| `--destructive-subtle` / `-fg` | **live, partially adopted** — two call sites, both the `inactive` state of `FundStatus` (`components/fundraiser/fund-status.tsx`): `routes/dashboard.funds/fund.tsx` and `routes/admin.$id.funds/fund-item.tsx`. Five other sites in three shapes could not take the swap — see "the rule only closes when one element carries both" |
| `--warning-subtle` / `-fg` | **defined, zero call sites** — nothing in `apps/platform/src` references either name; only the `@theme inline` mapping in `src/index.css` does. The unmigrated warning surface is large, not small (figures below) |
| `--success-subtle` / `-fg` | **not authored** — named gap, see above |
| pressed rung for the subtle pairs | **not authored** — named gap, see above. Still accurate: the only two-rung tint in the app (`dashboard.subscriptions/route.tsx`) is still on `destructive/10` → `/20` |
| `--color-peach`, `--color-lilac` | **live, but outside this palette** — named gap, see above |

Warning's call sites are a separate ticket, and they are the bulk of the
remaining work in this system. **Counted, not measured — these drift with every
commit; re-run the commands before quoting them.** As of this writing, in
`apps/platform/src`:

| pattern | occurrences | files |
| --- | --- | --- |
| `text-warning` (excluding `text-warning-fg`) | 36 | 25 |
| `bg-warning/10` | 9 | 8 |
| `stroke-warning` / `fill-warning` | 4 | 4 |

```sh
# from repo root. the ([^-]|$) guard keeps text-warning-fg out — that one is
# the legitimate ink for a --warning fill, not an anti-pattern instance.
rg -c --no-ignore-vcs 'text-warning($|[^-])' apps/platform/src
rg -c 'bg-warning/10' apps/platform/src
rg -c 'stroke-warning($|[^-])|fill-warning($|[^-])' apps/platform/src
```

Every one of the 36 `text-warning` uses is illegible at 2.15:1, and the 4
`stroke-warning` icons fail the 3:1 non-text floor wherever the icon is
meaningful. The `bg-warning/10` bands sit in
`platform.donations.$donation_id.refund/route.tsx`,
`admin.$id.edit-profile/form.tsx`, `pages/admin/shared/{transfer,deposit,withdraw}-form/panel.tsx`,
`_app.fundraisers.$fund_id_.edit/publish-banner.tsx`, `_app.zapier-integration/route.tsx`
and `platform.investments.rebalance/form/field-cell.tsx` — eight files, nine lines.
