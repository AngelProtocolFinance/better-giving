/**
 * the namespace the receipt number is derived under.
 *
 * it is part of the input, so it must never change: a different namespace over
 * the same donation is a different number, and a donor holding the old receipt
 * would have no way to reconcile it against the new one.
 */
const NS = "better.giving/tax-receipt/";

/**
 * the tax receipt number for a donation.
 *
 * derived, not minted. a receipt is a document a donor files, and the number
 * on it has to survive being sent twice — a queue redelivery, a support resend
 * from the donation page, a send whose completion write did not land. minting
 * one per send hands the donor two numbers for one gift and no way to tell
 * which is the real one, which is worse than the duplicate itself.
 *
 * the donation id is the identity of the gift and already unique, so the whole
 * derivation is a hash of it. uuid v5's shape is stamped on the result — same
 * algorithm, same layout — because that is what the field has always carried
 * and receipts already in donors' hands look like that.
 *
 * async only because the hash is: `crypto.subtle` has no sync form.
 */
export async function tax_receipt_id(donation_id: string): Promise<string> {
  const input = new TextEncoder().encode(NS + donation_id);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));

  // uuid v5 takes the first 16 bytes of the hash and overwrites the version
  // nibble and the variant bits — the two markers that make a uuid parse as
  // one. the remaining 122 bits are the hash's.
  const b = digest.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;

  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
