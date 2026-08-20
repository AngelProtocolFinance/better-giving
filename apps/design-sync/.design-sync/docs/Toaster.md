---
category: Feedback
---

# Toaster

The global toast host, plus the `show_toast` function that pushes toasts from anywhere.

Mount `<Toaster />` once near the app root. Toasts are triggered imperatively via `show_toast`, not by rendering a component, so they work outside the React tree.
