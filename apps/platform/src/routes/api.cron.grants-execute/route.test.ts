import { beforeEach, describe, expect, test, vi } from "vitest";

const execute_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/queue", () => ({ verify_qstash: vi.fn() }));
vi.mock("../api.cron.grants/handler", () => ({ index: execute_mock }));

const { action } = await import("./route");

const deliver = async () => {
  const req = new Request("https://bg.test/api/cron/grants-execute", {
    method: "POST",
  });
  return (await action({ request: req } as any)) as Response;
};

beforeEach(() => {
  execute_mock.mockReset();
});

describe("api.cron.grants-execute answers qstash with the run's outcome", () => {
  test("a failed run answers 500, so qstash records the failure", async () => {
    execute_mock.mockResolvedValue({
      statusCode: 500,
      body: "Something went wrong",
    });

    const res = await deliver();

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Something went wrong");
  });

  test("a completed run answers 200", async () => {
    execute_mock.mockResolvedValue({
      statusCode: 200,
      body: "Done processing grants",
    });

    const res = await deliver();

    expect(res.status).toBe(200);
  });
});
