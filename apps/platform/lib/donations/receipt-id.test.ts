import { describe, expect, test } from "vitest";
import { tax_receipt_id } from "./receipt-id";

describe("tax_receipt_id", () => {
  test("the same donation always gets the same number", async () => {
    // the whole point: a resend — queue redelivery, support resend, a send
    // whose completion write did not land — must not hand the donor a second
    // number for one gift
    const a = await tax_receipt_id("don-1");
    const b = await tax_receipt_id("don-1");

    expect(a).toBe(b);
  });

  test("different donations get different numbers", async () => {
    const a = await tax_receipt_id("don-1");
    const b = await tax_receipt_id("don-2");

    expect(a).not.toBe(b);
  });

  test("reads as a uuid, which is what receipts already in donors' hands are", async () => {
    const id = await tax_receipt_id("don-1");

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test("is pinned — the derivation cannot drift without reissuing every number", async () => {
    // a lock, not a sample. the namespace and the hash are part of the input,
    // so changing either reissues every receipt number ever sent, and a donor
    // holding the old one would have nothing to reconcile it against. if this
    // fails, the change is wrong unless that reissue is the intent.
    expect(await tax_receipt_id("01JQZ8YQ2VJ8K9X0N3M4P5R6S7")).toBe(
      "a38b7b4b-5700-5598-9a81-cb1e25ab3be0"
    );
  });
});
