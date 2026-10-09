---
category: Overlays
---

# Modal

A centered dialog with a backdrop, built on Ark UI.

Controlled: `open` plus `onClose`. It renders only the shell — you supply the whole body, including the heading and the action buttons.
It mounts lazily and unmounts on exit, so nothing renders while closed.

Pass `busy` while a submit is in flight: it holds the dialog open against Escape and outside clicks. Your own close and cancel buttons still close it, so disable them for the same span. Without `title`, the dialog is named by the first heading in its content, so start the body with one.
