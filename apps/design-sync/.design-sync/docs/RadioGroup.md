---
category: Form
---

# RadioGroup

One choice out of a short, always-visible set of options.

`items` are the options; `label` names the group (`hideLabel` keeps it for screen readers only, where a heading above already says it). The look is closed: `variant="radio"` is a dot beside each label, for plain settings lists; `variant="tile"` is a bordered card per option that fills and shows a check when chosen, and can carry an `icon` and a muted `description` line. `columns={2}` sets tiles side by side from `sm` up. An option can be `disabled`.

Uncontrolled with `defaultValue`, or controlled with `value` + `onValueChange(next)`. Arrow keys move the choice. `className` is for placement only.

Not for switching panels of one screen (that is `Tabs`), nor for a long list (that is `Select` or `Combo`).
