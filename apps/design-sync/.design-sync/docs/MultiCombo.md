---
category: Selector
---

# MultiCombo

A multi-select with a searchable option list; selections show as removable chips, and the popup carries a select-all / deselect-all header plus `on_reset`.

Controlled through `values` (an array) and `on_change` — snake_case, unlike `Select`'s `onChange`.

The search box is always present: it is the control's only tab stop and what an external `ref` (react-hook-form's error focus) lands on.

`label` renders a top label and this owns the `Field.Root`; leave it off to nest inside the caller's own field.
