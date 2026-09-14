---
category: Content
---

# Tabs

An underlined tab row switching between panels of one screen.

`items` are the triggers; `children` are one `TabPanel value=…` per item. The trigger look is closed: `size` (`sm` for a tab set nested inside a card or a dense admin view, `md` otherwise) and `stretch` (triggers share the row's full width) are the only variants. A label may lead with a small icon.

Uncontrolled with `defaultValue`, or controlled with `value` + `onValueChange(next)`. `TabPanel` is unstyled — put the gap below the tab row on the panels.

Not for a donor choosing a payment method: that is a filled, stacked selector of its own, not a tab row.
