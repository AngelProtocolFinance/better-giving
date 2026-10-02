import { expect, test, vi } from "vitest";

// npo_public is pure; the module's db handle is never touched
vi.mock("../db", () => ({ db: {} }));

import { getTableColumns } from "drizzle-orm";
import { npos } from "../schema/npo";
import { type INpo, NPO_PUBLIC_KEYS, npo_public } from "./npo";

// every npos column plus the derived keys, each set to a non-undefined value
const full_row = (): INpo => {
  const row: Record<string, unknown> = {};
  for (const k of Object.keys(getTableColumns(npos))) row[k] = `v_${k}`;
  delete row.target_number;
  delete row.target_smart;
  row.target = "smart";
  row.contributions_total = 1;
  row.contributions_count = 1;
  return row as INpo;
};

test("returns exactly the allow-listed keys", () => {
  const out = npo_public(full_row());
  expect(Object.keys(out).sort()).toEqual([...NPO_PUBLIC_KEYS].sort());
});

test("a column not on the allow-list does not pass through", () => {
  const row = { ...full_row(), new_internal_col: "secret" } as INpo;
  expect(npo_public(row)).not.toHaveProperty("new_internal_col");
});

test("balances, payout, referral and tax-form columns stay private", () => {
  const out = npo_public(full_row());
  for (const k of [
    "liq",
    "cash",
    "lock_units",
    "payout_minimum",
    "allocation",
    "w_form",
    "referral_id",
    "referrer_user",
    "referrer_npo",
    "referrer_expiry",
  ]) {
    expect(out).not.toHaveProperty(k);
  }
});
