import { beforeEach, describe, expect, test, vi } from "vitest";

const pending = vi.hoisted(() => ({ current: [] as any[] }));
const wise = vi.hoisted(() => ({
  v2_account: vi.fn(),
  quote: vi.fn(),
  transfer: vi.fn(),
  fund_transfer: vi.fn(),
}));
const transaction = vi.hoisted(() => vi.fn());
const payout_put = vi.hoisted(() => vi.fn());

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
vi.mock("$/env", () => ({ stage: "test", wise: { profile_id: "1" } }));
vi.mock("$/kit/discord", () => ({ aws_monitor: { send_alert: vi.fn() } }));
vi.mock("$/kit/wise", () => ({ wise }));
vi.mock("$/pg/db", () => ({ db: { transaction } }));
vi.mock("$/pg/queries/referrer", () => ({
  commissions_all_by_status: async () => pending.current,
  commission_update_status: vi.fn(),
  referrer_payout_put: payout_put,
}));
vi.mock("./helpers", () => ({
  get_referrer: async (id: string) => ({
    id,
    name: "Ref",
    email: "ref@example.com",
    pay_id: 42,
    pay_min: 10,
  }),
}));

const { index } = await import("./handler");

const commission = (donation_id: string, amount: number) => ({
  donation_id,
  amount,
  referrer_user: "REF-1",
  status: "pending",
});

const transfer_refs = () =>
  wise.transfer.mock.calls.map(([t]) => t.customerTransactionId);

beforeEach(() => {
  wise.v2_account.mockReset().mockResolvedValue({ currency: "USD" });
  wise.quote.mockReset().mockResolvedValue({ id: "q-1" });
  wise.transfer.mockReset().mockResolvedValue({ id: 555 });
  wise.fund_transfer.mockReset().mockResolvedValue({ status: "COMPLETED" });
  transaction.mockReset();
  payout_put.mockReset();
});

describe("commissions cron", () => {
  test("a re-run over a set whose paid-marking failed reuses wise's idempotency key", async () => {
    pending.current = [commission("d-2", 30), commission("d-1", 25)];
    transaction.mockRejectedValueOnce(new Error("connection lost"));
    await index();

    // the next run reads the same set, in another order
    pending.current = [commission("d-1", 25), commission("d-2", 30)];
    transaction.mockResolvedValueOnce(undefined);
    await index();

    const [first, second] = transfer_refs();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(second).toBe(first);
  });

  test("a different commission set gets a different key", async () => {
    pending.current = [commission("d-1", 25), commission("d-2", 30)];
    transaction.mockResolvedValue(undefined);
    await index();
    pending.current = [commission("d-1", 25), commission("d-3", 30)];
    await index();

    const [first, second] = transfer_refs();
    expect(second).not.toBe(first);
  });

  test("the failed run's error row and the paid run's row keep distinct ids", async () => {
    pending.current = [commission("d-1", 25), commission("d-2", 30)];
    transaction.mockRejectedValueOnce(new Error("connection lost"));
    await index();
    transaction.mockImplementationOnce(async (fn) => fn("tx"));
    await index();

    const ids = payout_put.mock.calls.map(([, p]) => p.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
