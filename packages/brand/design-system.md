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

## The palette is light-only

There is no dark theme. The product ships no theme toggle, never applies `.dark`
to any element, and has no `prefers-color-scheme` query anywhere — a dark half
would double the cost of every palette change for no user-visible benefit.

**This is a decision, not an oversight.** Don't derive a dark half because a
token "is missing one". Shipping dark mode is a product decision first; the
palette follows it, not the other way round. Everything below is measured on the
light values, and the light values are the only ones there are.

## Two consumers, one palette

| | app | email |
| --- | --- | --- |
| file | `src/colors.css` | `src/colors.ts` |
| form | `:root`, real `oklch()` | flat hex |
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
| `--background` / `--fg` | the page itself — `#ffffff`. `--input` is set to this same value on purpose; see "decisions that look like bugs" |
| `--card` / `--card-fg` | any panel, tile, table shell or row lifted off the page. **Identical to `--background`** (both `#ffffff`), so a card is read by its `--border`, not by its fill — which is why that border being 1.23:1 is a call worth knowing about |
| `--popover` / `--popover-fg` | transient layers only: menu, combobox and select lists, dialog, toast. Same value as `--card`; the separate name exists so a floating layer's fill can move without moving every panel |
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
| `--primary-deep` | yes | **no, by rule** | 11.27:1 | dark enough to be legible, but `--fg` is the app's dark ink and a second one is drift. Fill only — see its section |
| `--success` | yes | **yes** | 5.06:1 | 4.62:1 on `--muted`, 4.58:1 on `--accent` — passes, no headroom. 4.41:1 on its own `success/10` tint — misses, which is why `--success-subtle` has its own ink |
| `--success-subtle-fg` | no | yes | 5.70:1 | ink for `--success-subtle` (5.02:1). Unlike `--warning-subtle-fg` this is *not* the only legible green — `--success` is still the green ink on `--card`/`--background` |
| `--destructive` | yes | **on white only** | 4.52:1 | 4.12:1 on `--muted`, 4.09:1 on `--accent` — **fails** on tints |
| `--warning` | yes | **no, at any size** | 2.15:1 | fill only. Never `text-warning`. Use `--warning-subtle-fg` |
| `--fg` | no | yes | 17.85:1 | |
| `--muted-fg` | no | yes | 7.58:1 | 6.88:1 on `--muted` |
| `--*-fg` | no | yes | — | ink for its own paired surface, nowhere else |

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

| band | measured | |
| --- | --- | --- |
| `bg-warning/10 text-warning` | **1.99:1** | illegible; the case that forced the pair |
| `bg-destructive/10 text-destructive` | **3.92:1** | fails body |
| `bg-success/10 text-success` | **4.41:1** | marginal miss — replaced by `--success-subtle` / `-fg` |
| `bg-primary/10 text-primary` | 4.77:1 | passes |

Use an authored pair wherever one exists.

| pair | what it is |
| --- | --- |
| `--destructive-subtle` / `--destructive-subtle-fg` | error panel, banner, or row that carries error copy — not a filled control |
| `--warning-subtle` / `--warning-subtle-fg` | warning band, same shape |
| `--success-subtle` / `--success-subtle-fg` | success band, same shape — confirmation panel, `completed`/`active` status pill, badge |
| `--destructive-subtle-active` | **fill only.** The pressed rung of a control whose hover is `--destructive-subtle`; its ink stays `--destructive-subtle-fg` |

Both bands also take neutral body copy: `--fg` is 15.57:1 on `--warning-subtle`.
Only the *warning-colored* copy needs the `-fg`. (`--fg` on
`--destructive-subtle` has no recorded figure of its own — the only measurement
the ledger ever carried for that pairing was on the deleted dark set. The
surface is a near-white tint, so it is not a suspected failure, but it is
unmeasured; measure it before quoting a number.)

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
- **The pairing was never the alpha convention** (one site, now **fixed**).
  `bg-primary text-destructive` at **1.21:1** (`_app.marketplace_.$id/page-error.tsx`),
  whose link's `hover:text-primary` on that same parent was **1:1**. Worse than
  anything the alpha convention produced, and invisible to a sweep grepping for
  `destructive/`. Both now take `--primary-fg`, and the page is the precedent for
  the rule in "semantic hue on a `--primary` fill" below.

**The generalisable line: a fill token and an ink token are only safe together if
someone measured *that* combination.** The closed token set prevents inventing a
color; it does nothing to prevent pairing two legitimate ones that were never
checked against each other. Every remaining contrast failure in the app is that
hole, not an invented value.

### `--destructive-subtle-active` — the pressed rung for a subtle band

A control whose *hover* is the subtle tint has an authored **pressed** rung.
Both obvious fallbacks fail, which is why it takes a token rather than a
use-site derivation:

- `destructive/20` — the alpha step actually shipped at
  `routes/dashboard.subscriptions/route.tsx:90` — measures **3.36:1** with the
  ink it carries, and **4.33:1** even with `--destructive-subtle-fg` on it.
- the app's own ladder, `color-mix(in oklch, var(--X) 85%, black)`, is written
  for a **filled** control whose ink is white. On a near-white band the ink is
  dark, so mixing toward black moves the surface *toward* its own ink and the
  pair fails faster than the alpha step did.

So the rung deepens the tint **with its own ink**:
`color-mix(in oklch, var(--destructive-subtle) 94%, var(--destructive-subtle-fg))`.
6% is close to all the headroom the pair has — the ink sits at 5.04:1 on the
resting band against a 4.5:1 floor, so a deeper press would mean re-authoring the
ink, not the rung. **Measured: `--destructive-subtle-fg` is 4.65:1 on
`--destructive-subtle-active`, against a 4.5:1 floor.**

Authored as `color-mix()`, so by the rule above it has **no email twin** — a
pressed state is app-only and email never needs it.

`--warning-subtle` and `--success-subtle` have **no pressed rung yet** and no
control hovers into either. When one does, mint it by the same rule (94% surface
/ 6% its own `-fg`) as a named token here — a builder applying the rule at a call
site is still inventing a value.

### `--success-subtle` / `-fg` — minted, and why the case was still weak

The band that keeps `bg-<token>/10 text-<token>` out of the success case.
Values: surface `oklch(0.954 0.019 163)` (the same L/C the
destructive band uses, at green's hue), ink `oklch(0.484 0.14 163)` — `--success`
darkened until it clears the tint with the same headroom red has. **Measured: 5.02:1
ink on `--success-subtle`, 5.70:1 on `--card`/`--background`, 5.21:1 on
`--muted`, 5.16:1 on `--accent`, 4.90:1 on `--secondary`; `--fg` on the band is
15.71:1, so it also takes neutral body copy.**

Authored as literal `oklch()`, matching the other two bands, so it mirrors into
`colors.ts` and is available to email. That is a deliberate cost: nothing in
`packages/emails` uses it today, but a success band is exactly the shape a
receipt or confirmation mail reaches for, and the `var()`/`color-mix()` form
would foreclose it.

`--success` stays the green ink on `--card`/`--background` (5.06:1). Unlike
warning — where `--warning-subtle-fg` is *the* warning ink everywhere — green has
two legible inks for two surfaces. Check which one you are on.

**The case for minting was marginal, not a collapse, and the ledger should not
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

The last two were the sharper argument: their *inactive* branch is
`bg-muted text-muted-fg`, which passes, so the two halves of one control were
held to different standards. Three ternaries in
`_app.donation-calculator/{table,result1,result2}.tsx` show the same asymmetry
the other way — an error branch with an authored band beside a success branch
without one. All five sites are now a swap to
`bg-success-subtle text-success-subtle-fg`, **on the same node** (see the rule
above — a child that owns the ink does not take the swap).

The other `bg-<token>/10` family — `bg-primary/10 text-primary`, three sites —
is **not** an instance of the anti-pattern and needs no pair: all three are
icon-only badges (`routes/dashboard._index.tsx:80`,
`routes/unlock-us-donations/{scenarios,borders}.tsx`) with no text node, and the
combination measures 4.77:1 regardless.

### Semantic hue on a `--primary` fill — the rule, and why no token closes it

Ratios below are WCAG 2.x, measured on the shipped hex in `colors.ts` — not on the `/* source: */` provenance comments, which is the
trap the "trust the hex or the oklch" section warns about.

Every semantic ink in this palette is authored **dark, for light surfaces**. On
`--primary` (`#1d6dab`, relative luminance 0.1414) they all land within a hair of
the fill's own luminance and vanish:

| ink on a `--primary` fill | measured | |
| --- | --- | --- |
| `--destructive-subtle-fg` | **1.06:1** | invisible |
| `--warning-subtle-fg` | **1.04:1** | invisible. An earlier revision of this file recorded `~2.59:1` here — wrong, and close enough to `--warning` the *fill* (2.55:1) that that is probably what got measured |
| `--success` | **1.08:1** | invisible — and **live**, at `components/footer/newsletter-form.tsx:42` (the green `Check` beside the success message) |
| `--warning` | **2.55:1** | the shipped `text-warning` at `newsletter-form.tsx:37,48` |
| `--destructive` | 1.21:1 | was live at `_app.marketplace_.$id/page-error.tsx`; fixed |
| `--primary-fg` | **5.49:1** | the only legible ink on this fill |

**There is no token for this, and minting one would not close the gap.** An "error ink
legible on `--primary`" fixes one row of that table and leaves a green check at
1.08:1 inside the same `<form>` — the two branches of one control held to
different standards again. Closing the *class* with tokens means a parallel
semantic palette for a single fill: three measured pairs plus their state rungs,
spent on a surface whose entire language is monochrome-on-blue. It is also a name
the drift guard cannot police — a `color-mix()` off `--primary-fg` has no email
twin, and a literal `oklch()` would force a hex into `colors.ts` that no email
will ever use.

**The rule: on a `--primary` fill, state is carried by weight, an icon and the
words — never by hue.** Semantic copy takes `--primary-fg`; error vs. success is
`font-medium` plus a Lucide glyph, not a color. This is not a contrast dodge —
WCAG 1.4.1 forbids color as the *sole* carrier of meaning anyway, so a brand fill
just removes the crutch earlier than a white page does.

The precedent is shipped. `routes/_app.marketplace_.$id/page-error.tsx` is the
app's most severe error on this fill — a whole-page load failure — and it carries
`text-primary-fg` with a `TriangleAlert` and no red at all. **Nothing quieter
than that page may be louder than it**, which is what rules out the other
candidate fix: giving a footer newsletter validation message its own
`bg-destructive-subtle` node is legible (5.04:1 internal, 4.76:1 against the
footer) but puts a pale-pink chip announcing "invalid email" above a full-screen
failure in the severity order. Severity is set by the message, not by the surface
it happens to land on.

An **authored band on its own node** remains the right shape where the message is
genuinely a panel rather than a line of annotation — the band is self-contained
and measures the same 5.04:1 over any fill. That is a decision about the
message's weight, not a workaround for the hue.

`routes/_landing.fund-management/grow-places.tsx:40` is the third site and was
never a warning: amber on a statistic (`~11%`) inside a brand-filled card, used
as emphasis. It takes `--primary-fg`, like every sibling in that card.

Anything with a **control** in it takes `surface-primary`, not bare `bg-primary`
(see "decisions that look like bugs" — and the open item below, where the footer
does not).

### `--primary-fg` alpha steps are an unmeasured ladder

The same hole this file names elsewhere — *a fill and an ink are only safe
together if someone measured that combination* — applies to a token mixed with
its **own** fill. `components/footer/` runs an alpha ladder on `--primary-fg`
that nobody checked; two rungs fail. Composited over `--primary` and measured:

| rung | over `--primary` | |
| --- | --- | --- |
| `text-primary-fg` | 5.49:1 | passes |
| `text-primary-fg/90` | 4.77:1 | passes — the nav/social links (`footer.tsx:33,161,171`) |
| `text-primary-fg/80` | **4.14:1** | **fails** body — the success message, `newsletter-form.tsx:41` |
| `text-primary-fg/60` | **3.04:1** | **fails** body — the legal links, `footer.tsx:179` |
| `text-primary-fg/50` | 2.56:1 | the input placeholder, `newsletter-form.tsx:23`. Placeholders are not required content, but this is not a usable one |
| `border-primary-fg/20` | 1.48:1 | the field boundary, `newsletter-form.tsx:23`. `--primary-border` exists for exactly this job at 4.07:1 |

**`/90` is the floor for body copy on `--primary`.** Below it the ladder is
decorative only. This is not an authored scale and should not become one by
accretion: a rung that carries text is a value someone has to measure.

### `--destructive-subtle` / `-fg`

5.04:1 ink on surface, 5.80:1 ink on `--card`. `--destructive` itself is 3.92:1
on the subtle surface and **must never be painted on it**.

### `--warning-subtle` / `-fg`

Warning takes the **pair** shape rather than a lone ink token, because the app
tints warning bands in several places and has no legible warning text color at
all (call-site counts live in one place — the Status table). Unlike
destructive — where `--destructive` is the ink on white and `-subtle-fg` only the
ink on the tint — `--warning` is legible nowhere, so **`--warning-subtle-fg` is
*the* warning ink everywhere**, including on `--card` and `--background`. One
value, one name; a second name for the same value would be a drift trap the test
cannot catch.

`--warning-subtle-fg` (#995600) clears 4.5:1 on every surface in the palette:
5.70:1 on white/`--card`/`--background`, 5.20:1 on `--muted`, 5.16:1 on
`--accent`, 4.97:1 on `--warning-subtle`, 4.89:1 on `--secondary` (the tightest).

### `--primary-deep` — the dark brand ground, and the scrim

`oklch(0.349 0.072 247.3)`, rendering `#163d5e` — a darker, less saturated
sibling of `--primary` at the same brand hue.

It closes a hole `--primary` genuinely could not fill. `--primary` is a *control*
color tuned for white ink at 5.49:1 — enough for a button, not enough for a
full-bleed hero that puts body copy over a photograph. `--primary-deep` carries
white at **11.27:1**, and that headroom is the entire point: it is what lets a
translucent scrim still clear AA over an image whose pixels you do not control.

**The 70% scrim opacity is a measured floor, not a taste value.** Over the
worst case a photo can present — a pure-white region — a `primary-deep/70` scrim
composites to a surface where `--color-white` measures **4.67:1**. At 65% the
same stack is **4.07:1** and fails. Do not thin the scrim without re-measuring.

Two consequences of that number:

- **Text on the scrim takes full `--color-white`, never an alpha rung.**
  `text-white/90` over the same worst case is **4.14:1** — a fail. The
  `--primary-fg` alpha-ladder section below says the same thing about a
  `--primary` fill; this is that hole again, one surface over.
- Over the **opaque** token (the desktop gradient's solid end, the section fill)
  white is 11.27:1 and `white/90` is 9.46:1, so both are fine there. The failure
  is specific to the translucent branch, which is the mobile one.

`border-white/40` on the deep fill measures **3.15:1** — it clears WCAG 1.4.11
for a control boundary, which is worth recording because `--border` deliberately
does not (see "decisions that look like bugs"). It is the outline CTA on the
`unlock-us-donations` hero; leave it alone.

**There is no `--primary-deep-fg`.** Its ink is `--primary-fg` (`#ffffff`),
already in the palette; a second name for the same value is the drift trap the
`--warning-subtle-fg` section names, and the test cannot catch it.

**Not named `--primary-dark`.** In a palette that deleted its `.dark` set on
purpose, a `-dark` suffix reads as "the dark-mode primary" to the next person.
`-deep` says depth, which is what it is.

Authored as a literal `oklch()`, so it mirrors into `colors.ts` and the drift
guard sees it. That is a cost — no email uses it and a hero scrim is not an email
shape — accepted because the alternative is authoring the one token in the file
that the guard cannot police.

The shipped value it replaces was `#1a3c5e`, hardcoded five times in
`routes/unlock-us-donations/hero.tsx`. The token snaps its hue from 250.6° to the
brand's 247.3° and keeps L and C; at C 0.072 that shift is sub-perceptual, and it
makes the value derivable from `--primary` rather than pasted.

## `--accent` is not hover-only

In this system `--accent` is **both** the person-caused-state surface (hover fill,
selected row — `.btn-ghost:hover`, `.selector-opt[data-selected]`) **and** the
alternating resting band on the marketing pages, ~14 sites. That second job
constrains its value: a resting band carries de-emphasised body copy, so
`--muted-fg` on `--accent` must clear 4.5:1. The constraint bound hardest on the
deleted dark set, where it forced a value; in light `--accent` sits at
essentially the same lightness as `--muted`, where `--muted-fg` measures 6.88:1.
Do not move `--accent` toward a pure hover tint without re-measuring `--muted-fg`
on it.

`--accent` carries no brand hue as a resting fill beyond that tint. Brand action
color is `--primary`.

## Decisions that look like bugs

Recorded so they are not "fixed" by someone reading them as oversights.

- **`--border` is deliberately below 3:1.** 1.23:1 on `--card` — under WCAG 1.4.11
  for a control boundary. This is a call to keep the light look; **the focus ring
  carries control identification instead**. It compounds with `--input`, which is
  the page color (`#ffffff`) — a field is identified by its boundary, not its
  fill, and that boundary is intentionally faint. Change one and re-check the
  other.
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
- **`--chart-1…5` are stock shadcn defaults**, not brand-derived. `--chart-5`
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

## Button size scale

Three sizes, authored in `apps/platform/src/styles/components.css`. Every value
is on the 4px ladder (`--spacing: 0.25rem`).

| name | py | px | font-size | min-height |
| --- | --- | --- | --- | --- |
| `btn-sm` | 4px | 12px | `--text-xs` | 24px |
| `btn` (default) | 8px | 24px | `--text-sm` | 36px |
| `btn-lg` | 12px | 32px | `--text-lg` | 52px |

Four rules travel with it:

- **Bare `.btn` is the md tier.** The plurality case writes no size class.
  `btn-md` is a name only so a button can step *down* responsively
  (`btn-lg md:btn-md`); never write `btn btn-md`.
- **`px` belongs to the tier, `width` belongs to the caller.** Never put `px-*`
  on a button. A button that needs to be wider takes `w-full` inside a wrapper
  the caller sizes, or `w-fit`/`inline-flex`. If two buttons in one tier carry
  different `px`, one of them is spelling width as padding.
- **The button radius is `var(--radius)` (4px), not `--radius-sm`.** See the
  decision below.
- **A square icon-only button is `btn-icon`, a modifier, not a fourth tier.** It
  composes with all three sizes; see below.
- **`btn-sm` is pinned at 24×24.** Measured, not assumed: `py-1` (8px) plus the
  `text-xs` line box (0.75rem × `calc(1 / 0.75)` = exactly 16px) is **24.0px** —
  it clears **WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA, 24×24 CSS px** with
  zero natural headroom. (2.5.8 is 2.2, not 2.1; 2.1's target criterion is 2.5.5,
  AAA, 44×44.) So the size carries an explicit `min-block-size`/`min-inline-size`
  of 24px — the pin is what guarantees the floor, not the arithmetic. The tier is
  deliberately *not* inflated past 24px; it clears, and growing it would be a
  look change made on an accessibility pretext.

### `btn-icon` — the square icon-only shape

Every tier above is padded for a text label, so without this an icon-only
button inherits the tier's `padding-inline` and renders as a wide rectangle
around a 16px glyph — 40×24 at `btn-sm`.

**It is a modifier, not a fourth size**, and that is the whole decision. Being
icon-only is a property of the *content*, not of the tier: an icon button still
belongs to a size — the two live sites are `btn-sm` beside a `field-input`, and a
hero could want `btn-lg`. A fourth tier would pin one height and make the other
two unreachable. So `btn-icon` composes: `btn-sm btn-icon`, `btn btn-icon`,
`btn-lg btn-icon`.

It works by zeroing `padding-inline` and setting the inline size to the tier's
own height, which each tier now publishes as `--btn-size`:

| composition | rendered | glyph | inset each side |
| --- | --- | --- | --- |
| `btn-sm btn-icon` | **24 × 24** | 16px | 4px |
| `btn btn-icon` (md) | **36 × 36** | 20px | 8px |
| `btn-lg btn-icon` | **52 × 52** | 24px | 14px |

Three rules travel with it:

- **24×24 is the floor and the target, not a step toward 44.** `btn-sm btn-icon`
  meets **SC 2.5.8 Target Size (Minimum), AA, 24×24 CSS px** exactly, with the
  same zero headroom the tier already had. (2.5.8 is WCAG **2.2**; 2.1 has no AA
  target criterion at all — its 2.5.5 is AAA at 44×44 and is **not** a goal here.
  Two AAA-only findings are parked in `IDEAS.md` for the same reason.) The
  fix *narrows* the two live buttons from 40px to 24px wide; that is still
  conformant. Wanting a roomier hit area is a look decision — step the call site
  up to `btn btn-icon` (36×36); do not inflate `btn-sm`.
- **An accessible name is mandatory.** `btn-icon` removes the only text node, so
  the button has no name without `aria-label` (or an `sr-only` span). Both live
  sites already carry one and the toggle correctly swaps it ("Show API Key" /
  "Hide API Key"). A `btn-icon` with no label is a broken control, not a styling
  detail.
- **Radius is inherited, and stays one radius.** `.btn` already sets
  `var(--radius)`; `btn-icon` sets no radius of its own. A round icon button
  would be a second radius system and is a system change, not a call-site class.

`btn-icon` is the one place a size utility sets `inline-size`, against the
"`px` belongs to the tier, `width` belongs to the caller" rule above. Deliberate:
here the width is not a layout choice, it is the shape of the control — a square
button that a caller can stretch is not a square button.

### Why buttons are `var(--radius)` and not `--radius-sm`

Recorded because the recipe, the shipped call sites and `.design-sync/conventions.md`
each carried a different answer. Figures drift — re-count before quoting:

| call site writes | n | compiles to |
| --- | --- | --- |
| bare `rounded` | 111 | a **hardcoded** `0.25rem` |
| `rounded-sm` | 6 | `var(--radius-sm)` = 2.4px — restates the recipe |
| nothing | ~176 | `var(--radius-sm)` = 2.4px |

```sh
rg -c '\bbtn\b[^"'"'"'\n]*\brounded("| )' apps/platform/src
rg -c '\bbtn\b[^"'"'"'\n]*\brounded-sm\b' apps/platform/src
rg -c 'rounded-lg' apps/platform/src   # 0 — there is no rounded-lg in the app
```

Every site with a deliberate opinion chose 4px, and bare `rounded` is a **drift
trap worth knowing about**: in Tailwind 4.3.1 the radius family is one functional
utility keyed on `--radius`, whose namespace default lives in the *deprecated*
`@theme default inline reference` block (`tailwindcss/theme.css:508`) and is
inlined as a literal. This repo's `--radius` is declared in plain `:root` in
`colors.css`, which Tailwind never reads — so the two agree at 0.25rem only by
coincidence. Move `--radius` and the recipe follows while all 111 call sites stay
pinned at 4px.

`var(--radius)` is also the only **integer** step in the ladder (xs 1.6 / sm 2.4 /
md 3.2 / lg 4.0 px), and `.btn-secondary` draws a 1px `--border` that is
deliberately faint at 1.23:1 — a fractional radius on a faint border is where an
uneven corner shows.

**Consequence, not yet decided:** `.field-input` and `.field-input-container`
stay at `--radius-sm`, so a button and the input beside it stop matching.
`.design-sync/conventions.md:77` ("`rounded-sm` for buttons and inputs") is wrong
on the value but right that the two should share one; moving the fields to
`var(--radius)` is the companion fix and is the user's call.

## Two color layers, and the line between them

Not every color in the app lives in this file, and the answer is not "everything
moves here". There are **two declared layers**, and
the rule is that a color belongs to exactly one of them and is named in it.

| layer | file | what belongs | email twin |
| --- | --- | --- | --- |
| **semantic palette** | `packages/brand/src/colors.css` | every color that carries meaning or ink — surfaces, states, brand, chrome | yes, by the guard |
| **decorative marketing washes** | `apps/platform/src/index.css` `@theme` | flat pastel grounds behind marketing copy, carrying `--fg` and nothing else | no, and deliberately |

The semantic set is closed and greppable precisely because it is small. Pouring
five pastel page-washes into it would dilute the vocabulary that makes *"is this
value in the system"* answerable, and would force an email twin onto five values
no email will ever render. So the decorative layer stays where it is — **but it
is a declared layer with a stated rule, not an accident.**

### The decorative layer

Five named tokens, all flat marketing grounds. Measured with `--fg`, which is the
only ink any of them carries:

| token | value | `--fg` on it | where |
| --- | --- | --- | --- |
| `--color-peach` | `#fde3d8` | 14.58:1 | gradient washes, 3 marketing routes |
| `--color-lilac` | `#eae2fc` | 14.26:1 | gradient washes; benefits card rotation |
| `--color-mint` | `#EDFCE2` | 16.68:1 | benefits card rotation |
| `--color-cream` | `#FCF6E2` | 16.51:1 | benefits card rotation |
| `--color-sky` | `#EDF2FE` | 15.92:1 | benefits card rotation |

Three rules, and they are what make this a decision instead of a leak:

- **Named by hue, never by role.** `peach`, not `--surface-3`. A role name would
  imply the semantic set can reach for it.
- **Marketing surfaces only. Never product UI.** A dashboard, form, table or
  badge takes the semantic set. This is the rule that decides the `templates`
  badge in `_app.resources/resource-card.tsx`, which was reaching for `lilac/40`
  with an invented purple ink — it takes `bg-muted text-muted-fg` (6.88:1)
  instead, alongside its two siblings which already use authored pairs.
- **`--fg` is the only ink they carry, and it is measured above.** A decorative
  wash that needs a *second* ink has stopped being decorative; that is a mint
  request against the semantic palette, not a new pastel.

`--color-black` / `--color-white` in the same block are literal neutrals, not
part of this layer.

### Third-party brand color — the policy

**Permitted, narrowly.** A vendor's color is not ours to re-derive into oklch,
and it must never enter `colors.css`, which is *our* identity.

**Where it is permitted:** inside the vendor's own mark — a logo or wordmark
asset (an inline SVG's `fill`, an `<img>`). There it is a logotype, and WCAG
1.4.3 exempts text that is part of a logo or brand name from contrast entirely.
Declare it as a named constant beside the component that owns the mark, with a
comment naming the brand.

**Where it is not:** on our own text, chrome, borders or icons. The moment a
vendor hue lands on an `<h4>` in our layout it is our text, styled by us, and
1.4.3 does not apply. That is exactly the shipped case —
`routes/admin.$id.integrations/route.tsx:12` paints the heading "Zapier" in
`#FF4F00`, which measures **3.30:1** on `--card` at `text-xl font-semibold`.
20px at weight 600 is not WCAG "large text" (that is 24px, or 18.66px **bold**),
so the floor is 4.5:1 and it **fails**. The heading takes plain `--fg`; if a
Zapier brand presence is wanted there, it is a logo, and sourcing the official
mark is a `graphic-designer` job.

`#FFA500` at `pages/admin/media/video-preview.tsx:27` is **not** a vendor mark
despite looking like one — it is plain CSS `orange` on a "featured" star. No
exception; see the Status table.

### Raw hex still leaking into class strings

`apps/platform/CLAUDE.md` forbids it outright. Beware a sweep scoped smaller than
the problem: matching arbitrary Tailwind classes alone misses literals in inline
`style={}`, SVG `fill=`/`stroke=` attributes and chart color maps. Figures drift —
re-count before quoting:

```sh
rg -n '#[0-9a-fA-F]{3,6}\]' apps/platform/src        # arbitrary classes only
rg -n '#[0-9a-fA-F]{3,8}\b' apps/platform/src --glob '*.ts*'   # the real surface
```

The wider sweep is dominated by two clusters that are **their own ticket, not
this one**: the `donation-calculator-export` PDF palette (a full 60-swatch
parallel scale in `styles.ts`, for a renderer that cannot read CSS at all — the
same shape as the email twin, and it may want the same treatment), and
per-ticker/per-asset chart color maps duplicated across four files
(`pages/platform-admin/investments/common.ts`, `admin.$id.dashboard/loaded.tsx`,
`admin.$id.investments/route.tsx`, `routes/platform.investments/route.tsx`) while
`--chart-1…5` exists and is unused by them.

Closing the hole for good means a lint rule rejecting arbitrary color values in
class strings, with an allowlist for vendor marks. Without it this recurs — the
rule has been in `CLAUDE.md` the whole time these were written.

### The allocation slider — a refusal, and why it was the easy one

`routes/admin.$id.donations.edit-alloc/slider.tsx` reads as a three-value unnamed
scale. **It is five**: two in class strings plus `#F9FBFA` and `#96C82D`, both
inside an inline `backgroundImage` template string, which a class-scoped sweep
cannot see.

**No mint.** The control's own legend already names all three segments in system
tokens — the rows above it render `HandCoins` in `--muted-fg`, `PiggyBank` in
`--warning` and `Sprout` in `--success`. The track was improvising a parallel
`muted` / `amber` / `green` beside the legend keying it. Minting three more would
be the parallel-semantic-palette this file refuses elsewhere, spent on one
control.

| segment | was | takes |
| --- | --- | --- |
| grant (cash) | `#F9FBFA` | `--muted` |
| savings (liq) | `#F5C828` | `--warning` |
| investment (lock) | `#96C82D` | `--success` |
| disabled | `#f5e09d` / `#bdcc9d` | `--muted`, per the app-wide disabled convention |

All three are documented **fills**, which is the only role used here — no ink
lands on the track.

Adjacent-segment contrast **improves** at every boundary: grant↔savings goes
1.52:1 → **1.96:1**, savings↔investment 1.24:1 → **2.36:1**. Both remain under
3:1, and that is fine rather than overlooked: WCAG 1.4.11 binds a graphic
*required to understand the content*, and each segment's value is already printed
as text in the legend directly above, so the bands are redundant. A thumb sits on
each boundary besides.

**One real bug falls out.** The disabled track color has never rendered:
`group-aria-disabled/slider:bg-[#f5e09d]` sets `background-color` on the same
element whose inline `backgroundImage` paints an opaque gradient from 0% to 100%,
and `background-image` composites over `background-color`. The disabled range
dims, the track does not. The fix is to omit the inline gradient when disabled so
the flat `--muted` fill shows — which is also what makes the disabled state match
the thumbs, both of which already go `--muted-fg`.

Unrelated to the literals, and **not** fixed here: thumb 1 is `bg-card` with a
`--border` hairline, so at 1.23:1 it is a control identified by an edge the
"decisions that look like bugs" entry deliberately keeps faint. On a draggable
thumb that call is sharper than on a panel. Recorded, not decided.

## Adoption

Every token in `colors.css` is live and carries call sites in `apps/platform/src`;
none is defined-but-unused. The palette is the whole contract — a name that ships
here is a name the app paints with.

Counts of call sites are deliberately absent from this file. They decay on every
commit, and a stale number here reads as authority. When a figure is needed, take
it from the repo:

```sh
# from repo root
rg -c 'bg-warning-subtle|text-warning-subtle-fg' apps/platform/src
```

`text-warning` remains legitimate for a **fill or a glyph**, never for text: it is
2.15:1 on the page and fails at any size. Text on a warning surface takes
`--warning-subtle` + `--warning-subtle-fg`; an icon that carries meaning on its
own still owes the 3:1 non-text floor, which `--warning` does not clear against
white either.
