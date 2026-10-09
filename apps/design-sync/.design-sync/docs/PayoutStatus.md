---
category: Feedback
---

# PayoutStatus

A status pill for a payout's lifecycle state.

Use in payout tables and detail panels so the same state always reads the same way.

`processing` reads "Processing" in the same warning tone as `pending`: both are in flight, and the palette has no separate in-progress pair. `refunded_loss` deliberately reads as "Settled".
