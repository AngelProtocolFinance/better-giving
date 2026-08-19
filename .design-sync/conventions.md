## Building with the Better Giving design system

This is the **shipped** system, imported from the production app (`apps/platform`), not an
idealized kit. Every component here is the real component: same props, same behavior.

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

The other real class names, for when you compose a control by hand rather than using a component:
`.field-input`, `.field-input-container`, `.field-err`, `.label`, `.label-floating`,
`.selector-btn`, `.selector-opt`, `.selector-opts`, `.table`, and the utilities `.surface-primary`,
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

Three things exist as tokens but have **no compiled utility**, because nothing in the app uses
them yet: `bg-warning-subtle`, `bg-chart-1…5`, and `border-primary-border` / `ring-primary-ring`.
Writing those class names produces no style. For a brand-filled panel that contains a control, use
the `surface-primary` utility, which rebinds `--ring` and `--border` to the accessible pair for you.

Dimmer text is `--muted-fg`, never `--fg` at reduced opacity.

### Type, shape, elevation

Quicksand Variable for everything, weights 400/500/600/700. Gochi Hand is the handwritten aside —
used four or five times in the entire product, never decoratively. App body and controls sit at
`text-sm`; micro-meta at `text-xs` and `text-2xs`. Tables use tabular figures.

Radius is tight and derived from a 4px basis: `rounded` (4px) for buttons, inputs, cards and
dialogs — buttons and inputs get it from their own recipe, so no `rounded*` class at the call
site — and `rounded-xs` for option lists. Nothing is a pill.

**Elevation barely exists.** A card is `bg-card` + `border` + `rounded` — never a shadow. Shadow
appears only on genuinely floating layers: toasts, tooltips, and select popups.

Focus is always a 2px `--ring` outline with `outline-offset: 2px`. Never `outline: none`.

### A constraint worth knowing

The stylesheet is compiled from the app's own source, so it contains the utilities the app
actually uses — a large, realistic vocabulary, but not every arbitrary step. `gap-4` and `p-6`
exist; `gap-7` and `p-11` do not. This matches the system's real spacing ladder (Tailwind's
0.25rem basis, steps 2/3/3.5/4/5–8), so staying on the common steps keeps you both styled and
on-system. If something renders unstyled, an off-ladder utility is the first thing to check.

Two sharper corollaries, both found the hard way while building the preview cards. The gaps are
not symmetric between axes — `h-16` is present but `w-16` is not, so `h-16 w-16` renders a
64px-tall box of whatever width the content happens to want. And **arbitrary values are compiled
on demand**, so `w-[36rem]` or `grid-cols-[9rem_auto]` has no rule unless the app already writes
that exact string; a few (`bottom-[2px]`) do exist for that reason. A missing utility is silent —
no error, just a layout that quietly ignores you — so prefer plain flex/gap and the common steps,
and reach for a bracket value only when the layout genuinely needs one.

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
      <Amount amount={1200} currency="usd" />
      <button className="btn btn-primary">Save changes</button>
    </div>
    <Confirmed>Bank account verified</Confirmed>
  </Group>
</DsProvider>
```
