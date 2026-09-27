import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IDonationSettled } from "@/donations";
import type { IMsg } from "@/queue";

const queue = vi.hoisted(() => ({
  enqueued: [] as IMsg[],
  dists: [] as { id: number }[],
}));
vi.mock("$/kit/queue", () => ({
  enqueue: vi.fn(async (...msgs: IMsg[]) => {
    queue.enqueued.push(...msgs);
  }),
  don_dist: vi.fn(async (ds: { id: number }[]) => {
    queue.dists.push(...ds);
  }),
}));

// the split's own arithmetic has its coverage; here it is the set it hands on
const split = vi.hoisted(() => ({ ids: [] as number[] }));
vi.mock("./partition-destinations", () => ({
  partition_destinations: async () => ({
    destinations: split.ids.map((id) => ({ id, sttl: { id: "sttl-1" } })),
  }),
}));

import { handle_don_sttl_dist } from "./handle-don-sttl-dist";

const don = (o: Partial<IDonationSettled> = {}) =>
  ({
    id: "don-1",
    to_id: "fund-1",
    to_name: "Climate Fund",
    to_type: "fund",
    to_members: ["10", "11", "12"],
    amount: { base: 100, tip: 0, fee_allowance: 0 },
    ...o,
  }) as IDonationSettled;

beforeEach(() => {
  queue.enqueued = [];
  queue.dists = [];
});

describe("handle_don_sttl_dist - a gift to a fund", () => {
  test("queues the receipt with the members the split pays", async () => {
    split.ids = [10, 12];

    await handle_don_sttl_dist(don());

    expect(queue.dists.map((d) => d.id)).toEqual([10, 12]);
    expect(queue.enqueued).toEqual([
      expect.objectContaining({
        id: "don-sttl-receipt",
        dedupe: "don.sttl-receipt_don-1",
        payload: expect.objectContaining({ id: "don-1", to_paid: [10, 12] }),
      }),
    ]);
  });

  test("with no funded member, still queues the receipt, paying nobody", async () => {
    split.ids = [];

    await handle_don_sttl_dist(don());

    // the receipt handler fails on an empty list, which is what surfaces a
    // fund gift nobody was paid from
    expect(queue.dists).toEqual([]);
    expect(queue.enqueued).toEqual([
      expect.objectContaining({
        id: "don-sttl-receipt",
        payload: expect.objectContaining({ to_paid: [] }),
      }),
    ]);
  });
});

test("a gift to a nonprofit queues no receipt: settlement already did", async () => {
  split.ids = [7];

  await handle_don_sttl_dist(
    don({ to_type: "npo", to_id: "7", to_members: [] })
  );

  expect(queue.dists.map((d) => d.id)).toEqual([7]);
  expect(queue.enqueued).toEqual([]);
});
