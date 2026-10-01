import { describe, expect, it, vi } from "vitest";

vi.mock("$/pg/queries/api-key", () => ({
  api_key_get: vi.fn(),
  api_key_put: vi.fn(async () => "new-key"),
}));
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((d: object, msg: string) => ({ ...d, success: msg })),
}));

import { action } from "./api";

describe("generating an api key", () => {
  it("warns that existing zaps stop until reconnected and toggled", async () => {
    const res = await action({ params: { id: "11" } } as any);

    expect(res).toMatchObject({
      apiKey: "new-key",
      success: expect.stringMatching(/reconnect.*turn each zap off and on/i),
    });
  });
});
