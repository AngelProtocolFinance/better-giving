---
category: Form
---

# Slider

One number picked by dragging a thumb along a track between `min` and `max`.

Controlled: `value` + `onValueChange(next)`, stepping by `step`. `label` names it (`hideLabel` keeps it for screen readers only, where text beside the slider already says it). The readout of the current value, tick labels and any tooltip are the caller's, beside the slider. `className` is for placement only.

Single thumb only. Not for a precise figure a donor types (that is `Input`).
