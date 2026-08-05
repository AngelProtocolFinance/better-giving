/**
 * whether the gift behind a match event has gone back to the donor.
 *
 * the one place that decides it, because two signals say the same thing and
 * neither is sufficient alone. the event's `voided_at` is what every send gate
 * keys on — but a donation refunded before it ever entered the workflow has no
 * event row to carry the stamp, and the donor still sees the filing surface. so
 * the donation's own status is read alongside it.
 *
 * asking whether the money is still ours to be matched, not what stage the
 * event reached: a voided event keeps its stamps, and that it got as far as a
 * filed claim is the one thing about it still worth reading.
 */
export const is_gift_returned = (
  donation_status: string,
  voided_at?: string | null
) =>
  !!voided_at ||
  donation_status === "refunded" ||
  donation_status === "refunded_loss";
