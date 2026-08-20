---
category: Form
---

# Field

The standard text field: label, optional sub-text, input, and error message in one block.

Renders its own `<label>` (with the required asterisk) and its own error paragraph — do not wrap it in another label.
Set `type="textarea"` to render a textarea instead of an input. `classes` accepts a string (applied to the input) or `{container, input, label, error}`.
Pass `error` as a string to turn on the destructive border and show the message; `tooltip` renders a muted hint under the input instead.
