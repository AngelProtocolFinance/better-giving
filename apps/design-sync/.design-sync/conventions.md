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

### Buttons — use `Button`

`Button` is every button and every button-shaped link. It renders a `<button>`, a router link
(`to`), a nav link (`to` + `nav`), or a plain anchor (`href`), so one component covers all four:

```jsx
<Button variant="primary">Save changes</Button>
<Button variant="secondary" to="/fundraisers">Back</Button>
```

`variant` is required and the list is closed: `primary`, `secondary`, `ghost`, `outline`,
`destructive`, `success`, `warning` — plus `btn-form-primary`, a class the donation form alone
uses. Names borrowed from other systems (`btn-link`) have no rule and render as an unstyled
element. **`success` means approve or confirm and nothing else; `warning` means a real hazard.**
Neither is a way to make a row of actions look less grey — siblings of equal weight take the same
variant and rank by `primary` against `secondary`, never by hue.

`outline` is the one variant with no color of its own: it reads `currentColor`, so it is legible on
a `.surface-primary` band or any surface that declared its ink, and invisible on one that only set
a fill. Put it on a band, beside a `secondary`.

`size` is `sm`, `md` (the default — write nothing), `lg`, or `field`, which matches the height of a
form control standing beside it. `is_loading` gives the in-flight state, with `loading_text` for the
label it swaps in. `disabled` works on every form, including the link ones, where a `disabled`
attribute would do nothing. `icon` is the icon-only shape and **requires** `aria-label`.

The classes are still real and still the fallback when you compose a control by hand: `.btn` plus
one of `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-outline`, `.btn-destructive`,
`.btn-success`, `.btn-warning`, `.btn-form-primary`; `.pending` for in-flight; the sizes `.btn-sm`
(24px), bare `.btn` (36px), `.btn-lg` (52px), `.btn-field`; and `.btn-icon`, a **modifier** rather
than a fourth size — it squares the control on whichever tier it accompanies. Never write
`btn btn-md`: bare `.btn` is that tier, and `btn-md` exists only to step *down* responsively
(`btn-lg md:btn-md`).

The other real class names, for when you compose a control by hand rather than using a component:
`.field-input`, `.field-input-container`, `.field-err`, `.label`, `.label-floating`,
`.selector-btn`, `.selector-opt`, `.table`, and the utilities `.surface-primary`,
`.eyebrow`, `.section-heading`, `.section-body`, `.hero-heading`, `.article-heading`,
`.flex-center`, `.absolute-center`, `.overlay`.

### Empty states — use `EmptyState`

Where the content a screen is built around is not there, the block is `EmptyState`; inside a table
it is `EmptyRow`, which carries the `<td colSpan>` a `<tbody>` row requires. Never hand-roll either
— a `<p className="text-muted-fg">` or a bare `<td colSpan>` with a "no rows" sentence in it is the
spelling these replaced, and it drifted nineteen ways.

The default is one line of muted text: no icon, no heading. `heading` and `action` promote it to a
full treatment and are for the screens with a real next step, which are few.

The line is `No … yet` or `No … found`, never a bare noun and never a trailing period. `yet` means
the collection has never held anything; `found` means a filter or a search came back empty. They are
not interchangeable — "No donations found" to somebody who has never donated reads as a search that
failed.

`classes` is for margin. The component owns its padding.

### Form and dialog actions — use `Actions`

Where a form or a dialog ends — the submit and whatever sits beside it — the row is `Actions`. It is
the one name for that geometry; never hand-roll the row, and never hand-roll the dialog footer's
tinted strip.

**Cancel comes first.** Not convention: DOM order is also the stacked order below `sm` and the tab
order everywhere, so the control that undoes has to be the one a keyboard reaches first. Put the
submit last, always.

`align="split"` pushes the two apart, for a reset or a destructive sitting opposite the confirm so a
misclick beside the confirm lands on nothing. A cancel never takes it — a cancel belongs next to what
it cancels.

`band` is the dialog footer: a tinted, top-bordered strip, full-bleed to the dialog's edges. It is
the only place that strip is authored; never write `bg-muted border-t` on a footer row yourself.

The row stacks full-width below `sm` and puts its controls at the right edge above it. That geometry
is the row's — never write `flex`, `grid`, `gap-*`, `justify-*` or `items-*` beside it or into
`classes`, which is for margin. `modal-actions` was the old dialog-only name and no longer exists.

Where a `<Form>` element *is* the row, put `className="actions"` on the form rather than nesting a
`<div>` inside it that exists only to carry the class.

### Color is a closed token set

Tailwind v4 with **every default color removed** (`--color-*: initial`). Raw palette names —
`gray-500`, `red-600`, `slate-200` — do not exist and render as nothing. The only color utilities
are the semantic tokens:

| family | names |
| --- | --- |
| surfaces | `background`, `card`, `popover`, `muted`, `accent`, `secondary`, `sidebar` |
| brand / state | `primary`, `success`, `warning`, `destructive` |
| tinted band | `destructive-subtle` (+ its `-fg`) |
| ink | `fg` (the ink on `background` — there is no `background-fg`), `muted-fg`, and the `-fg` partner of every other surface above |
| lines | `border`, `input`, `ring` |

Use them as `bg-card`, `text-muted-fg`, `border-border`, and so on. **A fill token is not
automatically a text color.** `text-warning` is illegible at 2.15:1 — use `text-warning-subtle-fg`,
which is the warning ink on *every* surface. Never pair an alpha tint with its own ink
(`bg-destructive/10 text-destructive` measures 3.92:1); use the authored pair
`bg-destructive-subtle text-destructive-subtle-fg`, and set the surface and its ink **on the same
element** — a child's own color utility wins over an inherited one.

`success-subtle` (+ `-fg`) and `warning-subtle` (+ `-fg`) are authored pairs too. `chart-1…5` is
the data-viz ramp, and it compiles in every form you would reach for — `bg-`, `text-`, `border-`,
`fill-`, `stroke-` — so an inline SVG series and the legend swatch beside it name the same colour.
For a brand-filled panel that contains a control, use the `surface-primary` utility, which rebinds
`--ring` and `--border` to the accessible pair for you. That pair exists only as tokens
(`--primary-border`, `--primary-ring`) — there is deliberately no `border-primary-border` or
`ring-primary-ring` utility, so `surface-primary` is the way to reach it.

**On a `--primary` fill, state is never carried by hue.** Every semantic ink in the palette is
authored for light surfaces and collapses on primary (destructive 1.06:1, warning 1.04:1, success
1.08:1). Carry state there with weight, an icon and the words instead.

Dimmer text is `--muted-fg`, never `--fg` at reduced opacity.

### Type, shape, elevation

**One face: Quicksand Variable.** `--font-display` (headings `h1`–`h6` and numeric figures) and
`--font-body` (body copy, buttons, forms, tables, labels) are two roles that both resolve to it
today; the split is kept as the seam a second face would arrive through, not as a difference you
can see. Neither is named at a call site — `packages/ui` binds them to the elements, so an element
gets its face from what it is. Gochi Hand is the handwritten aside — six call sites in the whole
product, never decoratively. App body and controls sit at `text-sm`; micro-meta at `text-xs` and
`text-2xs`.

**The type ladders are closed**, the same way radius and color are. Sizes are `text-2xs`, `xs`,
`sm`, `base`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, `4.5xl`, `5xl`, `6xl` — `text-7xl` and above are
reset to `initial` and **fail to compile**. Weights are `font-normal`/`medium`/`semibold`/`bold`
only; `font-extrabold` and `font-black` fail to compile, because Quicksand's weight axis stops at
700 and they never rendered anyway. Leading is `none`/`tight`/`snug`/`normal`/`relaxed` (plus the
numeric `leading-<n>`); tracking is `tight`/`wide`/`wider`/`widest` plus the authored
`tracking-label` (0.12em, standalone uppercase labels) and `tracking-badge` (0.08em, uppercase text
in a padded chip). Arbitrary values are the gap the compiler does not close: `text-[11px]` still
compiles, so don't write one.

Aligned numbers are the `figures` utility. It sets the display family and `tabular-nums`, and
**both halves are inert under Quicksand** — the face ships no `tnum` feature and its digits are
proportional, so a money column does not line up and cannot be made to under this face; and the
display face equals the body face right now. The name exists so the fix is one line the day a face
with real tabular figures is adopted, rather than a 22-site sweep. Any figure a reader compares to
another — a money column, a total, a count, a date — takes it.

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
`max-w-3xl` on the text block, or `max-w-prose`, which brings its own 65-character measure.
Narrowing the page itself to make text readable pulls the headings and images in with it.

Two scrollers, both classes:

- `table-scroll` — the wrapper a wide table sits in. Goes on the element **around** the `<table>`,
  never on the table. A table's columns are the data and cannot reflow, so past a narrow viewport it
  scrolls sideways instead of pushing the whole page wider.
- `scrollbars` — the thin, themed scrollbar skin for anything else that scrolls: a popup list, a
  code block, a drawer. `table-scroll` already includes it.

Dialog size is a closed set too. `Modal` carries its own geometry through `size`: `panel` (448px),
`sm` (512px, the default), `md` (672px), `lg` (768px). Every tier centers itself, caps its height at
90dvh and scrolls its own overflow, so a tall dialog never puts its heading and its submit control
off-screen. Leave `classes` for surface and padding — a hand-spelled `fixed-center w-[90vw]
sm:max-w-lg` fights the tier, and an arbitrary width may not compile at all. `size="none"` opts out
entirely and exists for edge-anchored drawers; prefer a tier.

**Chrome is not part of the published system.** The marketing header, the app header, the footer and
the dashboard sidebar live in the app and are not exported here. Design the page, not the frame
around it — a screen starts below the header and ends above the footer.

### A constraint worth knowing

The stylesheet is compiled from real source — the components, these preview cards, and the app —
so it holds the utilities that code actually writes, which is a large and realistic vocabulary but
not every possible one. Tailwind v4 is just-in-time: a class nobody has written has no rule, and a
missing utility is **silent** — no error, just a layout that quietly ignores you.

The box ladder is guaranteed rather than incidental — it is listed in the build, so it does not
depend on which sizes the app happened to need. Every Tailwind step from `0` to `96` compiles for
`w-`, `h-`, `size-`, `min-w-`, `min-h-` and `max-w-`, and every step up to `24` for `gap-`, `p-`,
`m-` and their per-side and per-axis forms (`px-`, `mt-`, `gap-x-`, …).

What to watch: **arbitrary values are compiled on demand**, so `w-[36rem]` or `grid-cols-[9rem_auto]`
has no rule unless that exact string already appears in the source — a few (`bottom-[2px]`) exist
for that reason. Prefer plain flex/gap and the common steps, and reach for a
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
