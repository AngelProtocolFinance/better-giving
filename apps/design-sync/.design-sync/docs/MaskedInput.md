---
category: Form
---

# MaskedInput

An input whose value is formatted as the user types, driven by a `mask`.

`mask` is `{format, unmask}` — `format` renders the display string, `unmask` recovers the raw digits. Use for EIN, phone, and account numbers.
It is fully controlled: pass `value` and `onChange`, which receives the UNMASKED string.
