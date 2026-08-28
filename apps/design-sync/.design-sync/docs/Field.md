---
category: Form
---

# Field

The standard text field: label, optional sub-text, input, and error message in one block.

Renders its own `<label>` (with the required asterisk) and its own error paragraph — do not wrap it in another label.
Set `type="textarea"` to render a textarea instead of an input. `classes` accepts a string (applied to the input) or `{container, input, label, error}`.
Pass `error` as a string to turn on the destructive border and show the message; `tooltip` renders a muted hint under the input instead.
`autoComplete` is `"off"` unless you set it: most fields here hold somebody else's data — a nonprofit's details, a donation's recipient — which the browser must not prefill from the visitor's own saved values. Name a real token (`"email"`, `"street-address"`) on the fields that are the visitor's.
`type="email"`, `"url"` and `"tel"` render as `type="text"` with the matching `inputMode`. The keyboard is kept; the browser's own constraint is not, because it blocks submit in a native bubble the app can't see — nothing gets marked invalid, the error summary stays empty and focus never moves. The schema is what validates.
