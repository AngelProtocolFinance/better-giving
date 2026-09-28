import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const publish_mock = vi.hoisted(() => vi.fn());

vi.mock("$/env", () => ({ base_url: "https://bg.test", stage: "production" }));
vi.mock("$/kit/queue", () => ({
  client: { publishJSON: publish_mock },
  verify_qstash: vi.fn(),
}));
vi.mock("./notif", () => ({ index: vi.fn() }));

const { action } = await import("./route");

const deliver_at = async (iso: string) => {
  vi.setSystemTime(new Date(iso));
  const req = new Request("https://bg.test/api/cron/grants", {
    method: "POST",
  });
  return (await action({ request: req } as any)) as Response;
};

const published_dedupe_ids = () =>
  publish_mock.mock.calls.map(([opts]) => opts.deduplicationId);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  publish_mock.mockReset().mockResolvedValue({ messageId: "msg_1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("api.cron.grants publishes grants-execute", () => {
  test("once per schedule tick, keyed on stage and the tick's utc day", async () => {
    const res = await deliver_at("2026-09-27T00:00:04Z");

    expect(res.status).toBe(200);
    expect(publish_mock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://bg.test/api/cron/grants-execute",
        delay: 86400,
        deduplicationId: "grants.execute_production_2026-09-27",
      })
    );
  });

  test("a redelivered tick publishes the id the first delivery did", async () => {
    await deliver_at("2026-09-27T00:00:04Z");
    await deliver_at("2026-09-27T00:06:30Z");

    const [first, second] = published_dedupe_ids();
    expect(first).toEqual(expect.any(String));
    expect(second).toBe(first);
  });

  test("the next tick publishes a new id", async () => {
    await deliver_at("2026-09-27T00:00:04Z");
    await deliver_at("2026-09-30T00:00:04Z");

    const [first, next] = published_dedupe_ids();
    expect(next).not.toBe(first);
  });
});
