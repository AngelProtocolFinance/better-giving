import { beforeEach, describe, expect, test, vi } from "vitest";

const send_alert = vi.hoisted(() => vi.fn(async () => {}));
const state = vi.hoisted(() => ({ on: true, date: "2026-10-16" }));
vi.mock("../env", async (io) => ({
  ...(await io<typeof import("../env")>()),
  stage: "test",
  get owed_deductions() {
    return state.on;
  },
}));
vi.mock("@/terms", async (io) => ({
  ...(await io<typeof import("@/terms")>()),
  get TERMS_EFFECTIVE() {
    return state.date;
  },
}));
vi.mock("../kit/discord", () => ({ aws_monitor: { send_alert } }));

// the once-only report is module state: each test takes a fresh module
const netting_on = async () => {
  const { owed_netting_on } = await import("./owed-run");
  return owed_netting_on;
};

beforeEach(() => {
  vi.resetModules();
  send_alert.mockClear();
  state.on = true;
  state.date = "2026-10-16";
});

describe("owed_netting_on", () => {
  test("is on with the switch on and the terms' date set", async () => {
    expect(await (await netting_on())()).toBe(true);
    expect(send_alert).not.toHaveBeenCalled();
  });

  test("is off with the switch off, date or no date", async () => {
    state.on = false;
    state.date = "";
    expect(await (await netting_on())()).toBe(false);
    expect(send_alert).not.toHaveBeenCalled();
  });

  test("with the switch on and no date, nets nothing and reports it once", async () => {
    state.date = "";
    const on = await netting_on();

    expect([await on(), await on()]).toEqual([false, false]);
    expect(send_alert).toHaveBeenCalledTimes(1);
    expect(send_alert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ERROR",
        title: "owed deductions on with no terms effective date",
      })
    );
  });
});
