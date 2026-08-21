---
category: Overlays
---

# Tooltip

A hover/focus tooltip with a positioned arrow.

`tip` must be wrapped in `TooltipContent`; `children` must be a single element that can take a ref.
`Arrow` is retained as a no-op for older call sites — `Tooltip` draws the arrow itself now.

There is no `open` prop — the component owns its open state.
