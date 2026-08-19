---
category: Selector
---

# Combo

A single-select combobox with type-ahead filtering.

`options` takes either a plain array or a caller-owned query (`{ items, loading, error }`) — a query that is loading or has failed shuts the control, so a half-filled list is never presented as the answer.

`adornment` draws the thing in the control — a country flag on the `start` side, the drawer chevron or a spinner on the `end`. `render` draws an option row. `item_key` / `item_text` tell the module how to read a non-string option type; string options need neither.

`clearable` adds the X that empties the field. It emits `on_change(undefined)`, so the caller decides what empty means.
