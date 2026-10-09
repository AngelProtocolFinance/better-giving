---
category: Overlays
---

# Tooltip

A hover/focus tooltip with a positioned arrow.

`tip` must be wrapped in `TooltipContent`; `children` is a single element.

A `button`, `a` or `input` child is the trigger itself. Anything else (an icon, a span) is wrapped in a button named by its own text, or "More info" when it has none, and described by the tip's text. A component that renders its own button or link takes `trigger="child"` and must spread the props it is given onto that element.

Position a glyph with a wrapper outside the `Tooltip` (`<span className="absolute …"><Tooltip …><Icon /></Tooltip></span>`), never `absolute` on the glyph itself: the wrapping button then has no box, and loses its 24px hit area. Never put a wrapped child inside a link or button.

`Arrow` is retained as a no-op for older call sites — `Tooltip` draws the arrow itself now.

There is no `open` prop — the component owns its open state.
