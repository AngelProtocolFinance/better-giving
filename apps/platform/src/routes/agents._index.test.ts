import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create_quote: vi.fn(),
  donate: vi.fn(),
  donation_status: vi.fn(),
  find_nonprofit: vi.fn(),
}));

vi.mock("./agents/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("./agents/engine")>();
  return { ...original, ...mocks };
});

const { action, loader } = await import("./agents._index");

const post = (body: object) =>
  action({
    request: new Request("https://better.giving/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: {},
    context: {} as any,
  } as any) as Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/agents MCP endpoint", () => {
  test("GET serves Laira's hosted-checkout guide", async () => {
    const response = (await loader!({
      request: new Request("https://better.giving/agents"),
      params: {},
      context: {} as any,
    } as any)) as Response;

    expect(response.headers.get("content-type")).toContain("text/markdown");
    const text = await response.text();
    expect(text).toContain("Laira skill");
    expect(text).toContain("Stripe-hosted checkout link");
    expect(text).toContain("not_on_better_giving");
    expect(text).toContain("onboarding_url");
  });

  test("initialize advertises MCP tools", async () => {
    const response = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
      },
    });
  });

  test("tools/call returns structured tool output", async () => {
    mocks.find_nonprofit.mockResolvedValue({
      items: [{ id: 7, name: "ACME" }],
    });

    const response = await post({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "find_nonprofit", arguments: { query: "ACME" } },
    });

    await expect(response.json()).resolves.toMatchObject({
      id: 2,
      result: {
        structuredContent: { items: [{ id: 7, name: "ACME" }] },
      },
    });
    expect(mocks.find_nonprofit).toHaveBeenCalledWith(
      { query: "ACME" },
      expect.any(Request)
    );
  });
});
