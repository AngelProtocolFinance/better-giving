## Building with the Better Giving design system

This is the **shipped** system, published as `@better-giving/ui` and consumed by the production
app, not an idealized kit. Every component here is the real component: same props, same behavior.

### Setup

Components come from `window.BetterGiving`. Two of them read router context — `Breadcrumbs` and
`Prompt` — and throw outside one, so wrap anything containing them in the exported `DsProvider`:

```jsx
const { DsProvider, Group, Field, Amount } = window.BetterGiving;

<DsProvider>
  <Group title="Payout details">…</Group>
</DsProvider>
```

Everything else renders standalone. Mount `<Toaster />` once near the root if you use toasts;
they are pushed imperatively with `show_toast(...)`, not by rendering a component.

### There is no Button component — buttons are classes

The system deliberately ships no `Button`. A button is a raw element carrying `.btn` plus exactly
one variant:

```jsx
<button className="btn btn-primary">Save changes</button>
<a className="btn btn-secondary" href="/fundraisers">Back</a>
```

Variants: `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-destructive`, `btn-success`,
`btn-warning`, and `btn-form-primary` (donation form only). That list is closed — names borrowed
from other systems (`btn-outline`, `btn-link`) have no rule and render as an unstyled element.
Add `.pending` for the in-flight state. Disabled travels on `disabled` for `<button>` and `aria-disabled` for `<a>`.

Size is a separate, three-step axis: `btn-sm` (28px), bare `btn` (36px, the default — write no size
class), `btn-lg` (48px). Icon-only is a **modifier**, not a fourth size: `btn-icon` zeroes the
horizontal padding and squares the control on whichever tier it accompanies — `btn-sm btn-icon`,
`btn btn-icon`, `btn-lg btn-icon`. Always give an icon-only button an `aria-label`.

The other real class names, for when you compose a control by hand rather than using a component:
`.field-input`, `.field-input-container`, `.field-err`, `.label`, `.label-floating`,
`.selector-btn`, `.selector-opt`, `.table`, and the utilities `.surface-primary`,
`.eyebrow`, `.section-heading`, `.section-body`, `.hero-heading`, `.article-heading`,
`.flex-center`, `.absolute-center`, `.overlay`.

### Color is a closed token set

Tailwind v4 with **every default color removed** (`--color-*: initial`). Raw palette names —
`gray-500`, `red-600`, `slate-200` — do not exist and render as nothing. The only color utilities
are the semantic tokens:

| family | names |
| --- | --- |
| surfaces | `background`, `card`, `popover`, `muted`, `accent`, `secondary`, `sidebar` |
| brand / state | `primary`, `success`, `warning`, `destructive` |
| tinted band | `destructive-subtle` (+ its `-fg`) |
| ink | `fg`, `muted-fg`, and the `-fg` partner of every surface above |
| lines | `border`, `input`, `ring` |

Use them as `bg-card`, `text-muted-fg`, `border-border`, and so on. **A fill token is not
automatically a text color.** `text-warning` is illegible at 2.15:1 — use `text-warning-subtle-fg`,
which is the warning ink on *every* surface. Never pair an alpha tint with its own ink
(`bg-destructive/10 text-destructive` measures 3.92:1); use the authored pair
`bg-destructive-subtle text-destructive-subtle-fg`, and set the surface and its ink **on the same
element** — a child's own color utility wins over an inherited one.

`success-subtle` (+ `-fg`) and `warning-subtle` (+ `-fg`) are authored pairs too, and `chart-1…5`
exist for data viz. For a brand-filled panel that contains a control, use the `surface-primary`
utility, which rebinds `--ring` and `--border` to the accessible pair for you rather than making you
reach for `border-primary-border` / `ring-primary-ring` directly.

**On a `--primary` fill, state is never carried by hue.** Every semantic ink in the palette is
authored for light surfaces and collapses on primary (destructive 1.06:1, warning 1.04:1, success
1.08:1). Carry state there with weight, an icon and the words instead.

Dimmer text is `--muted-fg`, never `--fg` at reduced opacity.

### Type, shape, elevation

Quicksand Variable for everything, weights 400/500/600/700. Gochi Hand is the handwritten aside —
used four or five times in the entire product, never decoratively. App body and controls sit at
`text-sm`; micro-meta at `text-xs` and `text-2xs`. Tables use tabular figures.

Radius is one value and the ladder is **closed**: `rounded` is the only corner name, everywhere —
buttons, inputs, cards, dialogs, option lists. Buttons and inputs get it from their own recipe, so
no `rounded*` class at the call site. `rounded-sm`, `-md`, `-lg`, `-xl`, `-xs` are reset to
`initial` and **fail to compile** — writing one produces no rule at all, which is deliberate: it is
how the single radius stays single. `rounded-full` and `rounded-none` still work. Nothing is a pill.

**Elevation barely exists.** A card is `bg-card` + `border` + `rounded` — never a shadow. Shadow
appears only on genuinely floating layers: toasts, tooltips, and select popups.

Focus is always a 2px `--ring` outline with `outline-offset: 2px`. Never `outline: none`.

### Page shape and scrollers

There is **one page width**, and it is a class: `page`. It carries the width curve and the side
gutter and nothing else — no background, no vertical rhythm. The curve is full-bleed on a phone or
tablet, capped at 80rem from 1280px up, and 96rem on a large monitor, so a page widens with the
window rather than freezing at one size.

Put `page` on **each band**, never on a wrapper around several. A band that paints a full-bleed fill
(`bg-accent`, a border, a colored section) is the outer element and holds the padding-block; the
`page` inside it holds the width and the gutter. Two things follow: the outer band must not carry
its own `px-*` — two gutters stack — and a page that alternates full-bleed sections with contained
ones simply repeats `page` on each. That is how every section on a page lines up on the same left
edge, chrome included.

**Reading measure is not a page width.** A long paragraph is capped one level *inside* the page —
`max-w-3xl` on the text block, or the `prose` class, which brings its own 65-character measure.
Narrowing the page itself to make text readable pulls the headings and images in with it.

Two scrollers, both classes:

- `table-scroll` — the wrapper a wide table sits in. Goes on the element **around** the `<table>`,
  never on the table. A table's columns are the data and cannot reflow, so past a narrow viewport it
  scrolls sideways instead of pushing the whole page wider.
- `scrollbars` — the thin, themed scrollbar skin for anything else that scrolls: a popup list, a
  code block, a drawer. `table-scroll` already includes it.

**Chrome is not part of the published system.** The marketing header, the app header, the footer and
the dashboard sidebar live in the app and are not exported here. Design the page, not the frame
around it — a screen starts below the header and ends above the footer.

### A constraint worth knowing

The stylesheet is compiled from real source — the components, these preview cards, and the app —
so it holds the utilities that code actually writes, which is a large and realistic vocabulary but
not every possible one. Tailwind v4 is just-in-time: a class nobody has written has no rule, and a
missing utility is **silent** — no error, just a layout that quietly ignores you.

The common ladder is safe (Tailwind's 0.25rem basis: `gap-1`…`gap-8`, `p-2`…`p-8`, the standard
`w-*`/`h-*` steps). What to watch: **arbitrary values are compiled on demand**, so `w-[36rem]` or
`grid-cols-[9rem_auto]` has no rule unless that exact string already appears in the source — a few
(`bottom-[2px]`) exist for that reason. Prefer plain flex/gap and the common steps, and reach for a
bracket value only when the layout genuinely needs one. If something renders unstyled, an
off-ladder or arbitrary utility is the first thing to check.

### Where the truth is

Read `styles.css` and the files it imports for the actual token values and component recipes, and
each component's `<Name>.prompt.md` for its props and intended use. Those beat this summary.

### Voice

Sentence case everywhere. Money always concrete (`$1,200.00`); dates as `Nov 14, 2025`. Errors are
direct and non-apologetic — "Must be 9 digits", never "Oops!" and never an exclamation mark.
Requiredness is stated: `*` when required, the literal `(optional)` when optional. **No emoji.**

### Example

```jsx
const { DsProvider, Group, Field, Select, Amount, Confirmed } = window.BetterGiving;

<DsProvider>
  <Group title="Payout details" description="Where we send your funds">
    <Field name="account" label="Account holder" required defaultValue="Rainforest Trust" />
    <Select
      label="Payout currency"
      value={currency}
      onChange={setCurrency}
      options={["USD", "GBP", "EUR"]}
      option_disp={(o) => o}
      placeholder="Select a currency"
    />
    <div className="flex items-center justify-between border-t pt-4">
      <Amount value="1,200.00" currency="usd" />
      <button className="btn btn-primary">Save changes</button>
    </div>
    <Confirmed>Bank account verified</Confirmed>
  </Group>
</DsProvider>
```
