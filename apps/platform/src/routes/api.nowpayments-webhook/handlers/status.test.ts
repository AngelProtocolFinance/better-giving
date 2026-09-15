import { describe, expect, it } from "vitest";
import type { TStatus } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { transition } from "./status";

const ORDER = { repeat: false };
const REPEAT = { repeat: true };

const ipn = (payment_status: NP.Payment.Status, payment_id = 7) => ({
  payment_status,
  payment_id,
});
const row = (status: TStatus, sttl_id?: string) => ({ status, sttl_id });

describe("transition on the order row", () => {
  it.each([
    ["waiting", "record"],
    ["confirming", "confirm"],
    ["expired", "expire"],
    ["failed", "fail"],
  ] as const)("%s on an open row takes %s", (status, op) => {
    expect(transition(row("confirmed"), ipn(status), ORDER).op).toBe(op);
  });

  it.each([
    "settled",
    "failed",
    "expired",
    "refunded",
    "refunded_loss",
    "cancelled",
  ] as const)("confirming, expired and failed never move a %s row", (prior) => {
    for (const s of ["waiting", "confirming", "expired", "failed"] as const) {
      expect(transition(row(prior), ipn(s), ORDER).op).toBe("ignore");
    }
  });

  it.each([
    "confirmed",
    "sending",
  ] as const)("%s is acknowledged without a write", (status) => {
    expect(transition(row("intent"), ipn(status), ORDER).op).toBe("ignore");
  });

  it("ignores a status outside the documented set", () => {
    const status = "on_hold" as NP.Payment.Status;
    expect(transition(row("intent"), ipn(status), ORDER).op).toBe("ignore");
  });

  it.each([
    ["finished", "confirmed", { op: "settle", late: false }],
    ["partially_paid", "intent", { op: "settle", late: false }],
    ["finished", "failed", { op: "settle", late: true }],
    ["partially_paid", "expired", { op: "settle", late: true }],
  ] as const)("%s on a %s row settles", (status, prior, action) => {
    expect(transition(row(prior), ipn(status), ORDER)).toEqual(action);
  });

  it("names a settle by this payment a duplicate, by another a refusal", () => {
    expect(transition(row("settled", "7"), ipn("finished"), ORDER).op).toBe(
      "duplicate"
    );
    expect(transition(row("settled", "8"), ipn("finished"), ORDER).op).toBe(
      "refuse"
    );
  });

  it("ignores a settle this payment made before the refund, refuses any other on a closed row", () => {
    expect(transition(row("refunded", "7"), ipn("finished"), ORDER).op).toBe(
      "ignore"
    );
    expect(transition(row("refunded"), ipn("finished"), ORDER).op).toBe(
      "refuse"
    );
    expect(transition(row("cancelled"), ipn("finished"), ORDER).op).toBe(
      "refuse"
    );
  });

  it.each([
    ["settled", { op: "refund", was_settled: true }],
    ["confirmed", { op: "refund", was_settled: false }],
    ["failed", { op: "refund", was_settled: false }],
  ] as const)("refunded on a %s row refunds", (prior, action) => {
    expect(transition(row(prior), ipn("refunded"), ORDER)).toEqual(action);
  });

  it.each([
    "refunded",
    "refunded_loss",
    "cancelled",
  ] as const)("refunded never overwrites a %s row", (prior) => {
    expect(transition(row(prior), ipn("refunded"), ORDER).op).toBe("ignore");
  });
});

describe("transition on a repeated deposit", () => {
  it("settles one with no clone yet", () => {
    expect(transition(null, ipn("partially_paid"), REPEAT)).toEqual({
      op: "settle",
      late: false,
    });
  });

  it("names a redelivery onto its settled clone a duplicate", () => {
    expect(transition(row("settled", "7"), ipn("finished"), REPEAT).op).toBe(
      "duplicate"
    );
  });

  it.each([
    "failed",
    "expired",
  ] as const)("alerts on %s without a write", (status) => {
    expect(transition(null, ipn(status), REPEAT)).toMatchObject({
      op: "ignore",
      alert: true,
    });
  });

  it.each([
    "waiting",
    "confirming",
  ] as const)("ignores %s silently", (status) => {
    const action = transition(null, ipn(status), REPEAT);
    expect(action.op).toBe("ignore");
    expect(action).not.toHaveProperty("alert");
  });

  it("refunds its clone, or nothing when none settled", () => {
    expect(transition(row("settled", "7"), ipn("refunded"), REPEAT)).toEqual({
      op: "refund",
      was_settled: true,
    });
    expect(transition(null, ipn("refunded"), REPEAT).op).toBe("ignore");
  });
});
