---
category: Form
---

# Toggle

A switch for a boolean setting, with its label as children.

Controlled: pass `value` and `onChange(next: boolean)`. Use for settings that apply immediately; use `CheckField` inside a form that is submitted.

The switch is sized by the text it sits in: its height is one line (`1lh`) of the font size on `classes.container`, its width twice that, so `text-sm` there gives a 40×20 switch and the default `text-base` 48×24. Put the text size on `container`, not `label`, or the switch and its label size apart. For a fixed size, set `--toggle-h` and/or `--toggle-w` on `container` (e.g. `[--toggle-w:3.5rem] [--toggle-h:2rem]`); the thumb stays round and evenly inset at any size.
