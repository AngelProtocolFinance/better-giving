import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { KINDS, type Kind, msg } from "./registry";

// frozen for reg-updated, which embeds Date.now() in its dedupe key.
const FROZEN_MS = 1_700_000_000_000;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_MS);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("msg() — dedupe keys are wire-format and must not drift", () => {
  // per-row payload shape varies; rely on the test calling msg() to enforce
  // the shape, not the row tuple.
  const rows: Array<[Kind, Record<string, unknown>, string]> = [
    ["banking-approved", { npo_id: 42 }, "banking.approved_42"],
    ["banking-default", { npo_id: 42 }, "banking.default_42"],
    ["banking-new", { npo_id: 42 }, "banking.new_42"],
    ["banking-rejected", { npo_id: 42 }, "banking.rejected_42"],
    ["don-dist", { id: "d1", to_id: 7 }, "don.dist_d1_7"],
    ["don-sttl-dist", { id: "d2" }, "don.sttl-dist_d2"],
    ["don-sttl-receipt", { id: "d3" }, "don.sttl-receipt_d3"],
    [
      "fund-member-removed",
      { fund_id: "f1", creator_id: "u1" },
      "fund.removed_f1_u1",
    ],
    ["invite-email", { invitee: "x@y.z" }, "invite_x@y.z"],
    [
      "lock-tx-created",
      { npo_id: 9, date_created: "2026-01-02T03:04:05Z" },
      "lock_tx_9_2026-01-02T030405Z",
    ],
    ["reg-created", { id: "r1" }, "reg.created_r1"],
    ["reg-updated", { id: "r2" }, `reg.updated_r2_${FROZEN_MS}`],
    ["sub-deactivated", { id: "s1" }, "sub.deactivated_s1"],
    ["tip-received", { id: "t1" }, "tip_t1"],
  ];

  test.each(rows)("dedupe(%s)", (kind, payload, expected) => {
    // payloads in the table are minimal fixtures; cast to bypass per-row
    // shape narrowing — msg() runs its dedupe recipe on the raw object.
    const m = msg(kind, payload as never);
    expect(m.dedupe).toBe(expected);
    expect(m.id).toBe(kind);
  });

  test("rows cover every registered Kind", () => {
    const covered = new Set(rows.map(([k]) => k));
    for (const k of KINDS) expect(covered.has(k)).toBe(true);
    expect(covered.size).toBe(KINDS.length);
  });
});
