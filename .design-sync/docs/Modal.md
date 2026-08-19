---
category: Overlays
---

# Modal

A centered dialog with a backdrop, built on Ark UI.

Controlled: `open` plus `onClose`. It renders only the shell — you supply the whole body, including the heading and the action buttons.
It mounts lazily and unmounts on exit, so nothing renders while closed.
