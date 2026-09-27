import { describe, expect, test } from "vitest";
import { KINDS, type Kind, type MsgInput, msg } from "./registry";

describe("msg() — dedupe keys are wire-format and must not drift", () => {
  // per-row payload shape varies; rely on the test calling msg() to enforce
  // the shape, not the row tuple.
  const rows: Array<[Kind, Record<string, unknown>, string]> = [
    ["banking-approved", { npo_id: 42 }, "banking.approved_42"],
    ["banking-default", { npo_id: 42 }, "banking.default_42"],
    ["banking-new", { npo_id: 42 }, "banking.new_42"],
    ["banking-rejected", { npo_id: 42 }, "banking.rejected_42"],
    ["don-dist", { id: "d1", to_id: 7 }, "don.dist_d1_7"],
    ["don-match", { id: "d4" }, "don.match_d4"],
    ["don-match-chase", { id: "d4" }, "don.match-chase_d4"],
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
    [
      "reg-updated",
      { id: "r2", status: "02", updated_at: "2026-09-01T10:20:30.456Z" },
      "reg.updated_r2_02_2026-09-01T102030.456Z",
    ],
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

describe("reg-updated dedupe", () => {
  const row: MsgInput<"reg-updated"> = {
    id: "r2",
    status: "01",
    updated_at: "2026-09-01T10:20:30.456Z",
  };

  // a double-enqueued write of one row state is one message; a submitted (02)
  // delivery files a hubspot deal.
  test("is the same for the same row state", () => {
    expect(msg("reg-updated", { ...row }).dedupe).toBe(
      msg("reg-updated", { ...row }).dedupe
    );
  });

  test("differs after a new save", () => {
    const next = { ...row, updated_at: "2026-09-01T10:20:31.002Z" };
    expect(msg("reg-updated", next).dedupe).not.toBe(
      msg("reg-updated", row).dedupe
    );
  });

  test("differs on a status change", () => {
    const submitted: MsgInput<"reg-updated"> = { ...row, status: "02" };
    expect(msg("reg-updated", submitted).dedupe).not.toBe(
      msg("reg-updated", row).dedupe
    );
  });
});
